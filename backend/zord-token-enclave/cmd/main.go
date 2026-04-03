package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"

	"zord-token-enclave/internal/config"
	"zord-token-enclave/internal/db"
	"zord-token-enclave/internal/handlers"
	"zord-token-enclave/internal/keymanager"
	"zord-token-enclave/internal/models"
	"zord-token-enclave/internal/repository"
	"zord-token-enclave/internal/services"
	"zord-token-enclave/kafka"
	"zord-token-enclave/tracing"
)

func main() {
	cleanup := tracing.InitTracing("zord-token-enclave")
	defer cleanup()

	cfg := config.Load()

	// ---------------- DB SETUP ----------------
	// ---------------- DB SETUP ----------------
	database, err := sql.Open("postgres", cfg.DBURL)
	if err != nil {
		log.Fatal("❌ Failed to connect DB:", err)
	}

	if err := database.Ping(); err != nil {
		log.Fatal("❌ DB not reachable:", err)
	}

	if err := db.CreateTables(database); err != nil {
		log.Fatal("❌ Failed to create tables:", err)
	}

	// ---------------- REPO + KEY MANAGER ----------------
	tokenRepo := repository.NewTokenRepository(database)
	keyManager := keymanager.NewKeyManager(tokenRepo)

	// ---------------- SERVICE ----------------
	tokenSvc := services.NewTokenService(tokenRepo, keyManager)

	// ---------------- MIGRATION WORKER ----------------
	go func() {
		for {
			log.Println("🔁 Starting key migration cycle...")

			// ⚠️ For now hardcoded tenant (can extend later)
			err := tokenSvc.MigrateKeys(context.Background(), "tenant_1")
			if err != nil {
				log.Println("❌ Migration error:", err)
			} else {
				log.Println("✅ Migration cycle completed")
			}

			time.Sleep(1 * time.Minute)
		}
	}()

	go func() {
		for {
			log.Println("🔐 Checking if key rotation needed...")

			err := tokenSvc.AutoRotateKeys(context.Background())
			if err != nil {
				log.Println("❌ Auto-rotation error:", err)
			}

			time.Sleep(10 * time.Minute) // configurable
		}
	}()

	// ---------------- KAFKA SETUP ----------------
	ctx := context.Background()

	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")

	producer, err := kafka.NewProducer(brokers)
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}

	tokenizeLogic := func(ctx context.Context, event models.TokenizeRequestEvent) error {

		canonical := event.Canonical

		pii := map[string]string{}

		// account number
		if v, ok := canonical["account_number"].(string); ok {
			pii["account_number"] = v
		}

		// beneficiary
		if beneficiary, ok := canonical["beneficiary"].(map[string]interface{}); ok {

			if name, ok := beneficiary["name"].(string); ok {
				pii["name"] = name
			}

			if instrument, ok := beneficiary["instrument"].(map[string]interface{}); ok {

				if ifsc, ok := instrument["ifsc"].(string); ok {
					pii["ifsc"] = ifsc
				}

				if vpa, ok := instrument["vpa"].(string); ok {
					pii["vpa"] = vpa
				}
			}
		}

		// remitter
		if remitter, ok := canonical["remitter"].(map[string]interface{}); ok {

			if phone, ok := remitter["phone"].(string); ok {
				pii["phone"] = phone
			}

			if email, ok := remitter["email"].(string); ok {
				pii["email"] = email
			}
		}

		tokens, err := tokenSvc.TokenizePII(
			ctx,
			event.TenantID,
			event.TraceID,
			pii,
		)
		if err != nil {
			return err
		}

		result := models.TokenizeResultEvent{
			EventType:  "PII_TOKENIZE_RESULT",
			TraceID:    event.TraceID,
			EnvelopeID: event.EnvelopeID,
			TenantID:   event.TenantID,
			ObjectRef:  event.ObjectRef,
			Tokens:     tokens,
			Canonical:  canonical,
		}

		return producer.Publish(
			ctx,
			"pii.tokenize.result",
			event.EnvelopeID,
			result,
		)
	}

	handler := kafka.BuildTokenizeHandler(ctx, tokenizeLogic)

	go func() {
		err := kafka.StartConsumer(
			ctx,
			brokers,
			"token-enclave-group",
			"pii.tokenize.request",
			handler,
		)
		if err != nil {
			log.Fatalf("Tokenize consumer failed: %v", err)
		}
	}()

	// ---------------- HTTP HANDLERS ----------------
	tokenHandler := handlers.NewTokenHandler(tokenSvc)
	detokenizeHandler := handlers.NewDetokenizeHandler(tokenSvc)

	// ---------------- ROUTER ----------------
	r := gin.New()
	r.Use(
		gin.Recovery(),
		otelgin.Middleware("zord-token-enclave"),
	)

	// health
	r.GET("/v1/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// APIs
	r.POST("/v1/tokenize", tokenHandler.Tokenize)
	r.POST("/v1/detokenize", detokenizeHandler.Detokenize)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8087"
	}

	log.Println("🔐 Zord Token Enclave running on :" + port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("❌ Server failed:", err)
	}
}
