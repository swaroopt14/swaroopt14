package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/zord/zord-intelligence/config"
	"github.com/zord/zord-intelligence/db"
	"github.com/zord/zord-intelligence/internal/handlers"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
	"github.com/zord/zord-intelligence/internal/worker"
	kafkapkg "github.com/zord/zord-intelligence/kafka"
)

func main() {
	// ── Step 1: Load .env file ─────────────────────────────────────────────
	// godotenv reads the .env file and sets environment variables.
	// If .env doesn't exist (production uses real env vars), that's fine — ignore error.
	if err := godotenv.Load(); err != nil {
		log.Println("main: no .env file found — using system environment variables")
	}

	// ── Step 2: Load config ────────────────────────────────────────────────
	// Reads all environment variables into one Config struct.
	// Crashes immediately if a required variable is missing (fail fast).
	cfg := config.Load()
	log.Printf("main: config loaded (env=%s port=%s)", cfg.Environment, cfg.HTTPPort)

	// Ensure ALL required topics exist before consumers join the group.
	// This avoids the "group is stable but has 0 assigned partitions" issue
	// when input topics are missing at startup.
	requiredTopics := []string{
		// Input topics (consumed by zord-intelligence)
		cfg.TopicIntentCreated,
		cfg.TopicDispatchCreated,
		cfg.TopicOutcomeNormalized,
		cfg.TopicFinalityCert,
		cfg.TopicFinalContract,
		cfg.TopicEvidenceReady,
		cfg.TopicDLQ,
		cfg.TopicStatementMatch,
		cfg.TopicCorridorHealthTick,
		cfg.TopicSLATimerTick,

		// Output topics (published by outbox worker)
		cfg.TopicActuationAlert,
		cfg.TopicActuationRetry,
		cfg.TopicActuationEvidence,
	}

	if err := ensureTopicsWithRetry(cfg.KafkaBrokers, requiredTopics, 10, 2*time.Second); err != nil {
		log.Fatalf("main: kafka topic ensure failed after retries: %v", err)
	}

	// ── Step 3: Connect to PostgreSQL ──────────────────────────────────────
	// Opens a connection pool. Crashes if DB is unreachable.
	pool := db.Connect(cfg)
	defer pool.Close() // close the pool when main() exits (service shutdown)

	// ── Step 4: Create repositories ───────────────────────────────────────
	// Repos need the pool — created first before services.
	projRepo := persistence.NewProjectionRepo(pool)
	policyRepo := persistence.NewPolicyRepo(pool)
	actionRepo := persistence.NewActionContractRepo(pool)
	outboxRepo := persistence.NewOutboxRepo(pool)
	slaRepo := persistence.NewSLATimerRepo(pool)

	// ── Step 5: Create services ────────────────────────────────────────────
	// Services need repos. But there is a circular dependency:
	//   projectionService needs policyService
	//   policyService needs actionService
	//   actionService needs repos (no dependency on other services)
	//
	// Solution: create in reverse order.
	// actionService first (no service dependencies)
	// policyService second (needs actionService)
	// projectionService last (needs policyService)

	actionService := services.NewActionService(actionRepo, outboxRepo, pool)

	policyService := services.NewPolicyService(policyRepo, projRepo, actionService)

	projectionService := services.NewProjectionService(projRepo, policyService, slaRepo)
	corridorHealthIngestionHandler := handlers.NewCorridorHealthHandler(projRepo)
	slaTimerIngestionHandler := handlers.NewSLATimerHandler(projRepo)
	kafkaIngestionHandler := handlers.NewKafkaIngestionHandler(
		projectionService,
		corridorHealthIngestionHandler,
		slaTimerIngestionHandler,
	)

	// ── Step 6: Create Kafka producer ──────────────────────────────────────
	// Producer is used by the outbox worker to send actuation events.
	producer := kafkapkg.NewProducer(cfg.KafkaBrokers)
	defer func() {
		if err := producer.Close(); err != nil {
			log.Printf("main: producer close error: %v", err)
		}
	}()

	// ── Step 7: Create background workers ─────────────────────────────────
	outboxWorker := worker.NewOutboxWorker(outboxRepo, producer, cfg)
	// projectionService is passed so sla_worker can call HandleSLATimerBreached
	// when a deadline is missed — this updates the tenant.sla_breach_rate projection.
	// Without this, the /sla-breach endpoint always shows 0 even during real breaches.
	slaWorker := worker.NewSLAWorker(slaRepo, actionService, projectionService)

	// PolicyCronWorker evaluates all cron-triggered policies every 5 minutes.
	// It scans projection_state for active tenant+corridor pairs and calls
	// policyService.EvaluateForCron for each one.
	// Without this worker, cron policies (P_SLA_BREACH_RISK, P_PENDING_BACKLOG_AGING,
	// P_EVIDENCE_MISSING, P_SLA_BREACH_RATE_HIGH) would NEVER fire, even if enabled.
	cronWorker := worker.NewPolicyCronWorker(projRepo, policyService)

	// ── Step 8: Create HTTP handlers ──────────────────────────────────────
	// Handlers need repos (not services — handlers only read data).
	healthHandler := handlers.NewHealthHandler()
	kpiHandler := handlers.NewKPIHandler(projRepo)
	policyHandler := handlers.NewPolicyHandler(policyRepo)
	actionHandler := handlers.NewActionHandler(actionRepo)

	// ── Step 9: Build the HTTP router ─────────────────────────────────────
	// Wires all URL routes to the right handlers.
	router := handlers.NewRouter(healthHandler, kpiHandler, policyHandler, actionHandler)

	// ── Step 10: Create the HTTP server ───────────────────────────────────
	// We create the server struct manually so we can call Shutdown() later.
	// If we used http.ListenAndServe() directly, we couldn't shut it down gracefully.
	server := &http.Server{
		Addr:         ":" + cfg.HTTPPort,
		Handler:      router,
		ReadTimeout:  15 * time.Second, // max time to read a full request
		WriteTimeout: 30 * time.Second, // max time to write a full response
		IdleTimeout:  60 * time.Second, // max time to keep idle connections open
	}

	// ── Step 11: Create a cancellable context ─────────────────────────────
	// This context is passed to all goroutines (workers, consumers).
	// When we call cancel(), all goroutines stop via ctx.Done().
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel() // ensure cancel is always called when main() exits

	// ── Step 12: Start background workers ─────────────────────────────────
	// Each worker runs in its own goroutine.
	// They will run until ctx is cancelled (service shutdown).
	go outboxWorker.Start(ctx)
	go slaWorker.Start(ctx)
	go cronWorker.Start(ctx)
	log.Println("main: background workers started (outbox + sla + policy-cron)")

	// ── Step 13: Start Kafka consumers ────────────────────────────────────
	// Starts 8 goroutines, one per input topic.
	// projectionService implements the EventHandler interface — receives all events.
	kafkapkg.StartConsumers(ctx, cfg, kafkaIngestionHandler)
	log.Println("main: kafka consumers started")

	// ── Step 14: Start HTTP server ────────────────────────────────────────
	// Run the HTTP server in a goroutine so main() can continue to the
	// shutdown logic below. ListenAndServe blocks until the server stops.
	serverErrors := make(chan error, 1)
	go func() {
		log.Printf("main: HTTP server listening on :%s", cfg.HTTPPort)
		// ListenAndServe returns when Shutdown() is called
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErrors <- err
		}
	}()

	// ── Step 15: Wait for shutdown signal ─────────────────────────────────
	// make(chan os.Signal, 1) creates a buffered channel for OS signals.
	// We block here until one of these arrives:
	//   - Ctrl+C in development (SIGINT)
	//   - kubectl delete pod in Kubernetes (SIGTERM)
	//   - Server error (e.g. port already in use)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// select blocks until one of the cases fires
	select {
	case sig := <-quit:
		log.Printf("main: received signal %s — starting graceful shutdown", sig)
	case err := <-serverErrors:
		log.Printf("main: server error — %v", err)
	}

	// ── Step 16: Graceful shutdown ────────────────────────────────────────
	// Order matters:
	//   1. Cancel context → stops workers and Kafka consumers
	//   2. Shut down HTTP server → waits for in-flight requests to finish
	//   3. defer pool.Close() runs automatically (step 3 above)
	//   4. defer producer.Close() runs automatically (step 6 above)

	// Step 16a: Cancel context — signals all goroutines to stop
	log.Println("main: cancelling context (stopping workers and consumers)")
	cancel()

	// Step 16b: Give the HTTP server up to 30 seconds to finish in-flight requests
	// After 30 seconds, it force-closes remaining connections
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	log.Println("main: shutting down HTTP server (waiting up to 30s for in-flight requests)")
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("main: HTTP server forced shutdown: %v", err)
	}

	// Give workers a moment to finish their current batch
	time.Sleep(2 * time.Second)

	log.Println("main: shutdown complete")
	fmt.Println("zord-intelligence stopped cleanly")
}

// ensureTopicsWithRetry retries topic creation while Kafka is still booting.
// Running consumers before required topics exist can lead to a stable group
// with no assigned partitions, so we treat this as a startup prerequisite.
func ensureTopicsWithRetry(
	brokers string,
	topics []string,
	maxAttempts int,
	delay time.Duration,
) error {
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if err := kafkapkg.EnsureTopics(brokers, topics); err == nil {
			log.Printf("main: kafka topics ensured (%d configured)", len(topics))
			return nil
		} else {
			lastErr = err
			log.Printf("main: ensure topics attempt %d/%d failed: %v", attempt, maxAttempts, err)
		}

		if attempt < maxAttempts {
			time.Sleep(delay)
		}
	}

	return fmt.Errorf("ensure topics failed after %d attempts: %w", maxAttempts, lastErr)
}
