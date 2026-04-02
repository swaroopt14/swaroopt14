package main

import (
	"context"
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
	"zord-outcome-engine/routes"
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
	topic := os.Getenv("KAFKA_TOPIC")
	if strings.TrimSpace(topic) == "" {
		// Default to the relay's dispatch event stream topic so that
		// dispatch_index is populated even if KAFKA_TOPIC is not set.
		topic = "z.dispatch.events.v1"
	}
	groupID := "intent-engine-group"
	err = kafka.StartConsumer(
		ctx,
		brokers,
		groupID,
		topic,
		handlers.HandleDispatchEvent,
	)
	if err != nil {
		log.Fatalf("Kafka consumer failed: %v", err)
	}
	log.Println("Kafka consumer started")
	// brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")
	// producer, err := kafka.NewProducer(brokers)
	// if err != nil {
	// 	log.Fatal("Kafka producer creation failure: ", err)
	// }

	// defer producer.Close()

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

	// Start background workers (backfill scheduler + poll worker).
	//services.StartBackfillScheduler(ctx)
	//services.StartPollWorker(ctx)

	h := &handlers.Handler{ //need to add h
		S3store: s3store,
		//Kafka:   producer,
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
