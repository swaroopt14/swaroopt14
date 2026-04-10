package config

// What is a "package"?
// Every Go file starts with "package X"
// Files in the same folder must have the same package name
// Other files import this package to use it:
//   import "github.com/zord/zord-intelligence/config"
//   cfg := config.Load()

import (
	"log"
	"os"
)

// Config holds every setting zord-intelligence needs to run.
//
// Think of this like application.properties in Spring Boot.
// Every value here comes from the .env file.
// Nobody else in the codebase calls os.Getenv() — only this file does.
type Config struct {

	// ── Server ──────────────────────────────────────────────────
	HTTPPort    string // which port the HTTP server listens on. e.g. "8087"
	Environment string // "development" or "production"

	// ── Database ────────────────────────────────────────────────
	DatabaseURL string // full postgres connection string

	// ── Kafka ───────────────────────────────────────────────────
	KafkaBrokers string // e.g. "localhost:9092"
	KafkaGroupID string // consumer group name for this service

	// ── Kafka Input Topics (ZPI reads FROM these) ────────────────
	// Published by Service 2, 4, 5, 6
	TopicIntentCreated     string // canonical.intent.created       ← Service 2
	TopicDispatchCreated   string // dispatch.attempt.created        ← Service 4
	TopicOutcomeNormalized string // outcome.event.normalized        ← Service 5
	TopicFinalityCert      string // finality.certificate.issued     ← Service 5
	TopicFinalContract     string // final.contract.updated          ← Service 5/6
	TopicEvidenceReady     string // evidence.pack.ready             ← Service 6
	TopicDLQ               string // dlq.event                       ← any service
	// TopicStatementMatch is the new topic emitted by Service 5 after each
	// statement reconciliation pass. Requires Service 5 upgrade.
	TopicStatementMatch     string // statement.match.event            ← Service 5 (NEW)
	TopicCorridorHealthTick string // corridor.health.tick             ← operational heartbeat
	TopicSLATimerTick       string // sla.timer.tick                   ← operational heartbeat

	// ── NEW INPUT TOPICS ( Grade A Attachment Intelligence Mode) ────
	//
	// These 5 topics are the new upstream inputs from the pivoted spec.
	// They are consumed in Grade A mode (attachment-based intelligence).
	// In Grade B mode (dispatch/control), all original topics above are also used.
	//
	// All use getWithDefault so:
	//   - Service runs immediately without these set (no crash)
	//   - If topic is empty string, consumer.go skips wiring it
	//   - Production sets real values via environment variables

	TopicSettlementCreated string // canonical.settlement.created    ← Service 5B
	// Emitted when Service 5B parses a settlement file line.
	// ZPI uses to track settlement observations and feed leakage calculation.

	TopicAttachmentDecision string // attachment.decision.created     ← Service 5C
	// Emitted when Service 5C makes a match/ambiguous/unresolved decision.
	// MOST IMPORTANT new topic for leakage and ambiguity intelligence.

	TopicVarianceRecord string // variance.record.created         ← Service 5C
	// Emitted when Service 5C detects amount/date mismatch between
	// intent and settlement. Feeds leakage amount calculation directly.

	TopicBatchSummary string // batch.summary.updated           ← Service 5C
	// Emitted when batch-level aggregate state changes.
	// Feeds batch_contracts table and Pattern intelligence layer.

	TopicGovernanceDecision string // governance.decision.created     ← Service 6
	// Emitted when Service 6 creates a governance record for a payment.
	// Feeds defensibility score (governance coverage component).

	// ── Kafka Output Topics (ZPI publishes TO these) ──────────────
	// ONLY for actuation — triggering other services
	// KPI data does NOT go to Kafka. It goes to DB → REST API → frontend
	TopicActuationRetry      string // → Service 4 (retry a payout)
	TopicActuationEvidence   string // → Service 6 (generate evidence pack)
	TopicActuationAlert      string // → Notification service (ops alert)
	TopicActuationBatchPatch string // → Client-facing API (batch patch request) NEW Phase 2
}

// Load reads all environment variables and returns a filled Config struct.
//
// Call this once in main.go:
//
//	cfg := config.Load()
//
// If a required variable is missing, the service crashes immediately.
// This is intentional — "fail fast" is safer than running with broken config.
func Load() *Config {
	return &Config{

		// ── Server ──────────────────────────────────────────────
		HTTPPort:    getRequired("HTTP_PORT"),
		Environment: getWithDefault("ENVIRONMENT", "development"),

		// ── Database ────────────────────────────────────────────
		DatabaseURL: getRequired("DATABASE_URL"),

		// ── Kafka ───────────────────────────────────────────────
		KafkaBrokers: getRequired("KAFKA_BROKERS"),
		KafkaGroupID: getWithDefault("KAFKA_GROUP_ID", "zord-intelligence-group"),

		// ── Kafka Input Topics ───────────────────────────────────
		TopicIntentCreated:      getWithDefault("TOPIC_INTENT_CREATED", "canonical.intent.created"),
		TopicDispatchCreated:    getWithDefault("TOPIC_DISPATCH_CREATED", "dispatch.attempt.created"),
		TopicOutcomeNormalized:  getWithDefault("TOPIC_OUTCOME_NORMALIZED", "outcome.event.normalized"),
		TopicFinalityCert:       getWithDefault("TOPIC_FINALITY_CERT", "finality.certificate.issued"),
		TopicFinalContract:      getWithDefault("TOPIC_FINAL_CONTRACT", "final.contract.updated"),
		TopicEvidenceReady:      getWithDefault("TOPIC_EVIDENCE_READY", "evidence.pack.ready"),
		TopicDLQ:                getWithDefault("TOPIC_DLQ", "dlq.event"),
		TopicStatementMatch:     getWithDefault("TOPIC_STATEMENT_MATCH", "statement.match.event"),
		TopicCorridorHealthTick: getWithDefault("TOPIC_CORRIDOR_HEALTH_TICK", "corridor.health.tick"),
		TopicSLATimerTick:       getWithDefault("TOPIC_SLA_TIMER_TICK", "sla.timer.tick"),

		// ── NEW INPUT TOPICS ( Grade A) ─────────────────────────────
		// All use getWithDefault so the service starts cleanly even when
		// upstream services have not deployed these topics yet.
		// consumer.go skips any topic whose config value is empty string.
		TopicSettlementCreated:  getWithDefault("TOPIC_SETTLEMENT_CREATED", "canonical.settlement.created"),
		TopicAttachmentDecision: getWithDefault("TOPIC_ATTACHMENT_DECISION", "attachment.decision.created"),
		TopicVarianceRecord:     getWithDefault("TOPIC_VARIANCE_RECORD", "variance.record.created"),
		TopicBatchSummary:       getWithDefault("TOPIC_BATCH_SUMMARY", "batch.summary.updated"),
		TopicGovernanceDecision: getWithDefault("TOPIC_GOVERNANCE_DECISION", "governance.decision.created"),

		// ── Kafka Output Topics ──────────────────────────────────────
		TopicActuationRetry:      getWithDefault("TOPIC_ACTUATION_RETRY", "zpi.actuation.retry"),
		TopicActuationEvidence:   getWithDefault("TOPIC_ACTUATION_EVIDENCE", "zpi.actuation.evidence"),
		TopicActuationAlert:      getWithDefault("TOPIC_ACTUATION_ALERT", "zpi.actuation.alert"),
		TopicActuationBatchPatch: getWithDefault("TOPIC_ACTUATION_BATCH_PATCH", "zpi.actuation.batch_patch"),
	}
}

// ── Helper functions ─────────────────────────────────────────────────────────
// These are private (lowercase first letter = only usable inside this package)

// getRequired reads an env var. Crashes if it is not set.
// Use this for things that MUST be set: DATABASE_URL, KAFKA_BROKERS
func getRequired(key string) string {
	value := os.Getenv(key)
	if value == "" {
		// log.Fatalf prints the message and immediately stops the program
		// This is the "fail fast" pattern — better to crash loudly than run broken
		log.Fatalf("FATAL: required environment variable %q is not set", key)
	}
	return value
}

// getWithDefault reads an env var. Returns defaultVal if not set.
// Use this for things that have sensible defaults: HTTP_PORT, topic names
func getWithDefault(key, defaultVal string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultVal
	}
	return value
}
