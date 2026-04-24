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

	// -------- TOKENIZE RESULT CONSUMER --------
	resultTopic := "pii.tokenize.result"
	canonSvc := &services.SettlementCanonicalizeService{}

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
				log.Printf("Received tokenize result for observation=%s", event.IdempotencyKey)
				_, err = canonSvc.ProcessTokenizeResult(ctx, &event)
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
