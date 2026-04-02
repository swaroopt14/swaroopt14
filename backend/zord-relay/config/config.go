package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all runtime configuration for zord-relay.
// Every field is sourced from environment variables with documented defaults.
// Missing required fields cause a fatal log at startup.
type Config struct {
	// Service identity
	ServiceName string

	// Database
	DatabaseURL    string
	DBMaxOpenConns int
	DBMaxIdleConns int

	// Kafka
	KafkaBrokers           []string
	DispatchEventsTopic    string
	PublishFailureDLQTopic string
	PoisonEventDLQTopic    string

	// Service 2 outbox lease
	IntentEngineBaseURL string
	LeaseTTLSeconds     int
	LeaseInstanceID     string // unique ID for this relay instance (pod name / hostname)

	// Dispatch loop
	DispatchWorkerCount  int
	DispatchBatchSize    int
	DispatchPollInterval time.Duration

	// Relay (Kafka publish) loop
	RelayWorkerCount  int
	RelayBatchSize    int
	RelayPollInterval time.Duration

	// Retry budget (mirrors Service 2 outbox config)
	MaxAttempts int
	MaxAge      time.Duration

	// PSP
	PSPBaseURL          string
	PSPTimeoutSecs      int
	TokenEnclaveBaseURL string // empty = use stub client
}

func Load() *Config {
	cfg := &Config{
		ServiceName: getEnv("SERVICE_NAME", "zord-relay"),

		DatabaseURL:    requireEnv("DATABASE_URL"),
		DBMaxOpenConns: mustInt("DB_MAX_OPEN_CONNS", 30),
		DBMaxIdleConns: mustInt("DB_MAX_IDLE_CONNS", 10),

		KafkaBrokers:           splitCSV(requireEnv("KAFKA_BROKERS")),
		DispatchEventsTopic:    getEnv("KAFKA_DISPATCH_EVENTS_TOPIC", "z.dispatch.events.v1"),
		PublishFailureDLQTopic: getEnv("KAFKA_PUBLISH_FAILURE_DLQ_TOPIC", "z.dispatch.dlq.publish.v1"),
		PoisonEventDLQTopic:    getEnv("KAFKA_POISON_EVENT_DLQ_TOPIC", "z.dispatch.dlq.poison.v1"),

		IntentEngineBaseURL: requireEnv("INTENT_ENGINE_BASE_URL"),
		LeaseTTLSeconds:     mustInt("LEASE_TTL_SECONDS", 120),
		LeaseInstanceID:     leaseInstanceID(),

		DispatchWorkerCount:  mustInt("DISPATCH_WORKER_COUNT", 20),
		DispatchBatchSize:    mustInt("DISPATCH_BATCH_SIZE", 20),
		DispatchPollInterval: mustDuration("DISPATCH_POLL_INTERVAL", 1*time.Second),

		RelayWorkerCount:  mustInt("RELAY_WORKER_COUNT", 10),
		RelayBatchSize:    mustInt("RELAY_BATCH_SIZE", 50),
		RelayPollInterval: mustDuration("RELAY_POLL_INTERVAL", 500*time.Millisecond),

		MaxAttempts: mustInt("MAX_ATTEMPTS", 7),
		MaxAge:      mustDuration("MAX_AGE", 8*time.Hour),

		PSPBaseURL:          requireEnv("PSP_BASE_URL"),
		PSPTimeoutSecs:      mustInt("PSP_TIMEOUT_SECONDS", 30),
		TokenEnclaveBaseURL: getEnv("TOKEN_ENCLAVE_BASE_URL", ""), // empty = use stub
	}

	cfg.validate()
	return cfg
}

func (c *Config) validate() {
	// DispatchBatchSize should be >= DispatchWorkerCount to keep workers fed.
	// If smaller, workers will idle unnecessarily.
	if c.DispatchBatchSize < c.DispatchWorkerCount {
		log.Printf("WARN: DISPATCH_BATCH_SIZE (%d) < DISPATCH_WORKER_COUNT (%d) — some workers will idle", c.DispatchBatchSize, c.DispatchWorkerCount)
	}

	// DB connections must be enough for all workers plus the relay loop.
	needed := c.DispatchWorkerCount + c.RelayWorkerCount + 5
	if c.DBMaxOpenConns < needed {
		log.Fatalf("DB_MAX_OPEN_CONNS (%d) must be >= DISPATCH_WORKER_COUNT + RELAY_WORKER_COUNT + 5 = %d", c.DBMaxOpenConns, needed)
	}

	if c.LeaseTTLSeconds < c.PSPTimeoutSecs*2 {
		log.Printf("WARN: LEASE_TTL_SECONDS (%d) is less than 2x PSP_TIMEOUT_SECONDS (%d) — risk of lease expiry during PSP call", c.LeaseTTLSeconds, c.PSPTimeoutSecs)
	}
}

func requireEnv(key string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		log.Fatalf("required env var %s is not set", key)
	}
	return v
}

func getEnv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func mustInt(key string, def int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		log.Fatalf("invalid value for %s: %q — must be a positive integer", key, raw)
	}
	return n
}

func mustDuration(key string, def time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return def
	}
	d, err := time.ParseDuration(raw)
	if err != nil || d <= 0 {
		log.Fatalf("invalid value for %s: %q — must be a Go duration (e.g. 1s, 500ms)", key, raw)
	}
	return d
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// leaseInstanceID returns a unique identity for this relay instance.
// Uses POD_NAME if running in Kubernetes, otherwise falls back to hostname.
// This is stored in Service 2's outbox as leased_by so operators can see
// which instance holds which lease during an incident.
func leaseInstanceID() string {
	if pod := strings.TrimSpace(os.Getenv("POD_NAME")); pod != "" {
		return pod
	}
	host, err := os.Hostname()
	if err != nil {
		return fmt.Sprintf("relay-%d", os.Getpid())
	}
	return host
}
