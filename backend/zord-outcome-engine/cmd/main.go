package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"zord-outcome-engine/config"
	"zord-outcome-engine/db"
	"zord-outcome-engine/handlers"
	"zord-outcome-engine/kafka"
	"zord-outcome-engine/models"
	"zord-outcome-engine/routes"
	"zord-outcome-engine/services"
	"zord-outcome-engine/storage"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	gin.SetMode(gin.ReleaseMode)
	server := gin.New()
	server.Use(gin.Recovery())
	ctx := context.Background()
	config.InitDB()
	if db.DB == nil {
		log.Fatal("DB is nil after InitDB")
	}

	if err := db.EnsureTables(ctx); err != nil {
		log.Fatal("Failed to ensure DB tables: ", err)
	}
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found")
	}

	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")

	producer, err := kafka.NewProducer(brokers)
	if err != nil {
		log.Fatalf("Kafka producer creation failure: %v", err)
	}
	defer producer.Close()

	dispatchTopic := os.Getenv("KAFKA_TOPIC")
	if strings.TrimSpace(dispatchTopic) == "" {
		// Default to the relay's dispatch event stream topic so that
		// dispatch_index is populated even if KAFKA_TOPIC is not set.
		dispatchTopic = "payments.dispatch.events.v1"
	}
	intentTopic := os.Getenv("KAFKA_INTENT_TOPIC")
	if strings.TrimSpace(intentTopic) == "" {
		intentTopic = "payments.intent.events.v1"
	}

	// -------- TOKENIZE RESULT CONSUMER --------
	resultTopic := os.Getenv("KAFKA_TOPIC_PII_TOKENIZE_RESULT")
	if resultTopic == "" {
		resultTopic = "pii.tokenize.result"
	}

	tokenizeQueue := services.NewKafkaTokenizeQueue(producer)
	canonSvc := &services.SettlementCanonicalizeService{
		TokenizeQueue: tokenizeQueue,
	}
	groupID := "outcome-engine-dispatch-group"
	intentGroupID := "outcome-engine-intent-group"

	// Tokenize result consumer — runs in its own goroutine.
	go func() {
		err := kafka.StartConsumer(
			ctx,
			brokers,
			"outcome-engine-tokenize-result-group",
			resultTopic,
			func(msg []byte) error {
				var event models.TokenizeResultEvent
				if err := json.Unmarshal(msg, &event); err != nil {
					log.Printf("Invalid tokenize result event: %v", err)
					return err
				}
				log.Printf("Received tokenize result for envelope=%s", event.EnvelopeID)
				_, err := canonSvc.ProcessTokenizeResult(ctx, &event)
				if err != nil {
					log.Printf("Failed to process tokenize result: %v", err)
					return err
				}
				return nil
			},
		)
		if err != nil {
			log.Printf("Kafka tokenize result consumer failed: %v", err)
		}
	}()

	// Dispatch consumer — runs in its own goroutine.
	go func() {
		err := kafka.StartConsumer(ctx, brokers, groupID, dispatchTopic, handlers.HandleDispatchEvent)
		if err != nil {
			log.Fatalf("Dispatch Kafka consumer failed: %v", err)
		}
	}()

	// Intent consumer — runs in its own goroutine.
	go func() {
		err := kafka.StartConsumer(ctx, brokers, intentGroupID, intentTopic, handlers.HandleIntentEvent)
		if err != nil {
			log.Fatalf("Intent Kafka consumer failed: %v", err)
		}
	}()

	log.Printf("Kafka consumers started dispatch_topic=%s intent_topic=%s tokenization_topic=%s", dispatchTopic, intentTopic, resultTopic)

	bucket := os.Getenv("S3_BUCKET")
	region := os.Getenv("AWS_REGION")

	if bucket == "" || region == "" {
		log.Fatal("S3_BUCKET or S3_REGION not set in environment")
	}

	s3store, err := storage.NewS3Store(context.Background(), bucket, region)
	if err != nil {
		log.Fatal("Failed to init S3", err)
	}
	cfg := config.LoadConfig()
	if err := storage.InitEncryptionKey(cfg.VaultKey); err != nil {
		log.Fatal("Failed to init encryption key: ", err)
	}

	h := &handlers.Handler{
		S3store: s3store,
		Kafka:   producer,
	}
	routes.Routes(server, h)
	routes.AttachmentRoutes(server, h)

	// ── Relay outbox routes (outcome_outbox → zord-relay → Kafka) ─────────
	outboxRepo := storage.NewOutboxPullRepo(db.DB)
	outboxHandler := handlers.NewOutboxHandler(outboxRepo)
	routes.OutboxRoutes(server, outboxHandler)

	log.Println("Starting Zord Outcome Engine service on port 8081 with observability enabled")

	srv := &http.Server{
		Addr:              ":8081",
		Handler:           server,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal("Server failed to start:", err)
	}
}
