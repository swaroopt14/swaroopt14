package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"zord-relay/config"
	"zord-relay/db"
	"zord-relay/kafka"
	"zord-relay/psp"
	"zord-relay/services"
	"zord-relay/tracing"
	"zord-relay/utils"

	"go.uber.org/zap"
)

func main() {
	utils.InitLogger("zord-relay")
	defer utils.SyncLogger()

	cleanupTracing := tracing.Init("zord-relay")
	defer cleanupTracing()

	cfg := config.Load()

	utils.Logger.Info("starting zord-relay",
		zap.String("instance_id", cfg.LeaseInstanceID),
		zap.Int("dispatch_workers", cfg.DispatchWorkerCount),
		zap.Int("relay_workers", cfg.RelayWorkerCount),
	)

	// Database connection pool.
	// Pool size is validated in config.Load() to be large enough
	// for all workers across both loops.
	dbConn := db.Connect(cfg.DatabaseURL, cfg.DBMaxOpenConns, cfg.DBMaxIdleConns)
	defer dbConn.Close()

	// Kafka producer — shared by the relay loop only.
	// The dispatch loop never publishes directly to Kafka.
	producer := kafka.NewProducer(cfg.KafkaBrokers)
	defer producer.Close()

	// Repositories.
	dispatchRepo := services.NewDispatchRepo(dbConn)
	outboxRepo := services.NewRelayOutboxRepo(dbConn)

	// Service 2 outbox lease client.
	intentClient := services.NewIntentClient(
		cfg.IntentEngineBaseURL,
		cfg.LeaseInstanceID,
		10, // HTTP timeout seconds — separate from PSP timeout
	)

	// PSP client — demo stub, replace with real implementation.
	pspClient := psp.NewDemoClient(cfg.PSPBaseURL, cfg.PSPTimeoutSecs)

	// Token client — automatically selects stub vs real based on TOKEN_ENCLAVE_BASE_URL.
	// Stub is safe for local development against the demo PSP.
	// Real client is required before connecting to any actual PSP in staging/production.
	var tokenClient services.TokenClient
	if cfg.TokenEnclaveBaseURL != "" {
		utils.Logger.Info("token_client: using real Service 3 HTTP client",
			zap.String("base_url", cfg.TokenEnclaveBaseURL),
		)
		tokenClient = services.NewHTTPTokenClient(cfg.TokenEnclaveBaseURL, 10)
	} else {
		utils.Logger.Warn("token_client: using stub — PII will NOT be real. Do not use in production.")
		tokenClient = services.NewStubTokenClient()
	}

	// Dispatch loop — polls Service 2 outbox, runs 5-step lifecycle per event.
	dispatchLoop := services.NewDispatchLoop(
		dbConn,
		intentClient,
		outboxRepo,
		dispatchRepo,
		pspClient,
		tokenClient,
		&services.DispatchLoopConfig{
			WorkerCount:  cfg.DispatchWorkerCount,
			BatchSize:    cfg.DispatchBatchSize,
			PollInterval: cfg.DispatchPollInterval,
			LeaseTTLSecs: cfg.LeaseTTLSeconds,
			// ConnectorID and CorridorID are defaults — overridden per-event
			// by the connector_id and corridor_id fields in the outbox payload.
			ConnectorID: "00000000-0000-0000-0000-000000000000",
			CorridorID:  "IMPS",
		},
	)

	// Relay loop — reads relay_outbox and publishes to Kafka.
	// Completely independent of the dispatch loop.
	relayLoop := services.NewRelayLoop(
		outboxRepo,
		producer,
		&services.RelayLoopConfig{
			WorkerCount:            cfg.RelayWorkerCount,
			BatchSize:              cfg.RelayBatchSize,
			PollInterval:           cfg.RelayPollInterval,
			DispatchEventsTopic:    cfg.DispatchEventsTopic,
			PublishFailureDLQTopic: cfg.PublishFailureDLQTopic,
			PoisonEventDLQTopic:    cfg.PoisonEventDLQTopic,
		},
	)

	// WaitGroup tracks all background goroutines.
	// On shutdown: cancel ctx → loops drain in-flight work → wg.Wait().
	var wg sync.WaitGroup

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	dispatchLoop.Start(ctx, &wg)
	relayLoop.Start(ctx, &wg)

	// Health check server — lightweight, separate port.
	healthMux := http.NewServeMux()
	healthMux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"service": cfg.ServiceName,
			"status":  "healthy",
			"time":    time.Now().UTC(),
		})
	})
	healthPort := "8082"
	if p := os.Getenv("HEALTH_PORT"); p != "" {
		healthPort = p
	}
	healthServer := &http.Server{
		Addr:    ":" + healthPort,
		Handler: healthMux,
	}
	go func() {
		utils.Logger.Info("health server listening", zap.String("port", healthPort))
		if err := healthServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			utils.Logger.Error("health server error", zap.Error(err))
		}
	}()

	utils.Logger.Info("zord-relay started",
		zap.String("instance_id", cfg.LeaseInstanceID),
	)

	// Block until SIGINT or SIGTERM.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	utils.Logger.Info("shutdown signal received — draining in-flight work")

	// Cancel context — signals all loops to stop accepting new work.
	cancel()

	// Wait for all in-flight dispatches and relay publishes to complete.
	// This is the key difference from the old code: we do not kill mid-dispatch.
	doneCh := make(chan struct{})
	go func() {
		wg.Wait()
		close(doneCh)
	}()

	select {
	case <-doneCh:
		utils.Logger.Info("all workers drained cleanly")
	case <-time.After(30 * time.Second):
		utils.Logger.Warn("shutdown timeout — some in-flight work may be incomplete")
	}

	// Shutdown health server.
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	if err := healthServer.Shutdown(shutdownCtx); err != nil {
		utils.Logger.Error("health server shutdown error", zap.Error(err))
	}

	utils.Logger.Info("zord-relay stopped")
}
