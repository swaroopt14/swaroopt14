package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/services"
	"zord-intent-engine/internal/validator"
	"zord-intent-engine/internal/vault"
	"zord-intent-engine/kafka"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"zord-intent-engine/config"
	"zord-intent-engine/db"
	"zord-intent-engine/internal/handlers"

	"zord-intent-engine/internal/persistence"

	//"zord-intent-engine/internal/pii"

	"zord-intent-engine/storage"
	"zord-intent-engine/tracing"
)

func main() {
	// -------- INIT --------
	cleanup := tracing.InitTracing("zord-intent-engine")
	defer cleanup()

	config.InitDB()
	if err := db.CreateTables(); err != nil {
		log.Fatal("failed to create tables:", err)
	}

	cfg := config.LoadConfig()

	err := vault.InitVaultKey(cfg.VaultKey)
	if err != nil {
		log.Fatal("failed to initialize vault key:", err)
	}

	ctx := context.Background()
	brokers := strings.Split(os.Getenv("KAFKA_BROKERS"), ",")
	topic := os.Getenv("KAFKA_TOPIC")
	groupID := "intent-engine-group"

	resultTopic := "pii.tokenize.result"

	// -------- Repositories --------
	dlqRepo := persistence.NewDLQRepo(db.DB)
	intentRepo := persistence.NewPaymentIntentRepo(db.DB)
	intentQueryRepo := persistence.NewIntentQueryRepo(db.DB)
	outboxPullRepo := persistence.NewOutboxPullRepo(db.DB)

	// -------- Validator --------
	intentValidator := validator.NewValidator(dlqRepo)

	// -------- PII Tokenizer --------
	//tokenizer, err := pii.NewTokenizer(os.Getenv("PII_TOKEN_SECRET"))
	// if err != nil {
	// 	log.Fatal("failed to init PII tokenizer:", err)
	// }

	// -------- Intent Service --------
	//------Initializing s3
	s3store, err := storage.NewS3Store(ctx, os.Getenv("S3_BUCKET"), os.Getenv("AWS_REGION"))
	if err != nil {
		log.Fatal(err)
	}

	producer, err := kafka.NewProducer(brokers)
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}

	tokenizeQueue := services.NewKafkaTokenizeQueue(producer)
	intentService := services.NewIntentService(
		intentValidator,
		intentRepo,
		s3store,
		tokenizeQueue,
	)

	// -------- DLQ HTTP (READ-ONLY) --------
	dlqHandler := handlers.NewDLQHandler(dlqRepo)
	intentHandler := handlers.NewIntentHandler(intentQueryRepo)
	outboxHandler := handlers.NewOutboxHandler(outboxPullRepo)

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)

		response := map[string]interface{}{
			"service": "zord-intent-engine",
			"status":  "healthy",
			"time":    time.Now().UTC(),
		}

		if err := json.NewEncoder(w).Encode(response); err != nil {
			http.Error(w, "failed to encode health response", http.StatusInternalServerError)
		}
	})

	mux.HandleFunc("/v1/dlq", dlqHandler.List)
	mux.HandleFunc("/v1/dlq/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/dlq" || r.URL.Path == "/v1/dlq/" {
			dlqHandler.List(w, r)
		} else {
			dlqHandler.GetByID(w, r) // NEW: /v1/dlq/{dlq_id}
		}
	})
	mux.HandleFunc("/v1/intents/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/intents" || r.URL.Path == "/v1/intents/" {
			intentHandler.List(w, r)
		} else {
			intentHandler.GetByID(w, r)
		}
	})
	mux.HandleFunc("/v1/intents", intentHandler.List)
	mux.HandleFunc("/internal/outbox/lease", outboxHandler.Lease)
	mux.HandleFunc("/internal/outbox/ack", outboxHandler.Ack)
	mux.HandleFunc("/api/prod/intents/batches", intentHandler.ListBatchesSidebar)
	mux.HandleFunc("/internal/outbox/nack", outboxHandler.Nack)

	handler := func(msg []byte) error {
		var event models.Event
		err := json.Unmarshal(msg, &event)
		if err != nil {
			log.Printf("Invalid Kafka event payload: %v", err)
			return err
		}

		canonical, dlq, err := intentService.ProcessIncomingIntent(ctx, &event)
		if err != nil {
			log.Printf("System error processing intent: %v\n", err)
			return err // Return error to Kafka consumer so it doesn't MarkMessage
		}

		if dlq != nil {
			log.Printf("⚠️ Intent rejected [tenant=%s envelope=%s reason=%s]", event.TenantID, event.EnvelopeID, dlq.ReasonCode)
			if dlq.DLQID == "" {
				if dlq.TenantID == "" {
					dlq.TenantID = event.TenantID.String()
				}
				if dlq.EnvelopeID == "" {
					dlq.EnvelopeID = event.EnvelopeID.String()
				}
				if dlq.ClientBatchRef == "" && event.BatchID != nil {
					dlq.ClientBatchRef = *event.BatchID
				}

				_, err := dlqRepo.Save(ctx, *dlq)
				if err != nil {
					log.Printf("Failed to save DLQ entry: %v", err)
				}
			}
			return nil // Reject is a terminal state, return nil so message is marked
		}

		if canonical == nil {
			log.Printf("Tokenization queued for async processing [envelope=%s]", event.EnvelopeID)
		} else {
			log.Printf("Intent processed successfully [intent_id=%s envelope=%s]", canonical.IntentID, event.EnvelopeID)
		}

		return nil
	}

	resultHandler := func(msg []byte) error {

		var event models.TokenizeResultEvent

		err := json.Unmarshal(msg, &event)
		if err != nil {
			log.Printf("Invalid tokenize result event: %v", err)
			return err
		}

		log.Printf("Received tokenize result for envelope=%s", event.EnvelopeID)

		_, err = intentService.ProcessTokenizeResult(ctx, &event)
		if err != nil {
			log.Printf("Failed to process tokenize result: %v", err)
			return err
		}

		return nil
	}
	err = kafka.StartConsumer(
		ctx,
		brokers,
		groupID,
		topic,
		handler,
	)
	if err != nil {
		log.Fatalf("Kafka consumer failed: %v", err)
	}
	log.Println("Kafka consumer started")

	// -------- TOKENIZE RESULT CONSUMER --------

	go func() {
		err := kafka.StartConsumer(
			ctx,
			brokers,
			"intent-engine-tokenize-result-group",
			resultTopic,
			resultHandler,
		)
		if err != nil {
			log.Fatalf("Kafka tokenize result consumer failed: %v", err)
		}
		log.Println("Kafka tokenize result consumer started")
	}()

	// -------- HTTP SERVER --------
	log.Println("Intent Engine (Service-2) running on :8083")
	server := &http.Server{
		Addr:    ":8083",
		Handler: otelhttp.NewHandler(mux, "http"),
	}
	log.Fatal(server.ListenAndServe())
}
