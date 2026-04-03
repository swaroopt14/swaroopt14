package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
	"zord-evidence/config"
	"zord-evidence/db"
	"zord-evidence/handlers"
	"zord-evidence/kafka"
	"zord-evidence/repositories"
	"zord-evidence/routes"
	"zord-evidence/services"
	"zord-evidence/storage"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config load failed: %v", err)
	}

	database, err := db.Connect(cfg.PostgresDSN)
	if err != nil {
		log.Fatalf("db connection failed: %v", err)
	}
	ctx := context.Background()
	if err := db.EnsureTables(ctx, database); err != nil {
		log.Fatalf("ensure tables failed: %v", err)
	}

	signer, err := services.NewSigner(cfg.SigningPrivateKey)
	if err != nil {
		log.Fatalf("signer init failed: %v", err)
	}

	archiveCrypto, err := services.NewArchiveCrypto(cfg.ArchiveEncryptKey)
	if err != nil {
		log.Fatalf("archive encryption init failed: %v", err)
	}

	var s3store storage.S3Store
	if strings.TrimSpace(cfg.S3Bucket) != "" && strings.TrimSpace(cfg.S3Region) != "" {
		s3store, err = storage.NewAWSStore(ctx, cfg.S3Region, cfg.S3Bucket)
		if err != nil {
			log.Fatalf("aws s3 store init failed: %v", err)
		}
	} else {
		log.Printf("S3 config not provided, using in-memory S3 adapter for local/dev only")
		s3store = storage.NewInMemoryS3Store("local-evidence")
	}

	repo := repositories.NewEvidenceRepository(database)
	evidenceSvc := services.NewEvidenceService(repo, s3store, signer, archiveCrypto, cfg.ArchivePrefix, cfg.ReplayCompareStrict)
	h := handlers.NewEvidenceHandler(evidenceSvc)

	if err := kafka.StartConsumer(ctx, cfg.KafkaBrokers, cfg.KafkaConsumerGroup, cfg.KafkaTopic, func(_ context.Context, key string, payload []byte) error {
		_ = key
		_ = payload
		// Intentionally lightweight in v1: consume topic for future enrichment hooks.
		return nil
	}); err != nil {
		log.Fatalf("kafka consumer failed: %v", err)
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	routes.Register(r, h)

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%s", cfg.HTTPPort),
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("starting zord-evidence on :%s", cfg.HTTPPort)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}
