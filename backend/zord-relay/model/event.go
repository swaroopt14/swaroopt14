package model

import (
	"encoding/json"
	"time"
)

// OutboxEvent is the normalized event model that works across all upstream
// service schemas. Field mapping is handled in the outbox client per service.
type OutboxEvent struct {
	// --- Identity ---
	EventID    string `json:"event_id"`    // PK from upstream outbox
	EnvelopeID string `json:"envelope_id"` // logical grouping ID
	TraceID    string `json:"trace_id"`
	TenantID   string `json:"tenant_id"`
	ObjectRef  string `json:"object_ref"`
	Source     string `json:"source"`

	// --- Routing ---
	Topic          string `json:"topic"`           // Kafka topic; may come from outbox row or config
	EventType      string `json:"event_type"`      // e.g. intent.created.v1
	IdempotencyKey string `json:"idempotency_key"` // for consumer deduplication

	// --- Aggregate (Service 2 specifics, optional for Service 1) ---
	AggregateType string `json:"aggregate_type,omitempty"`
	AggregateID   string `json:"aggregate_id,omitempty"`
	ContractID    string `json:"contract_id,omitempty"`

	// --- Schema / versioning ---
	SchemaVersion string `json:"schema_version,omitempty"`

	// --- Payload ---
	Payload     json.RawMessage `json:"payload"`
	PayloadHash []byte          `json:"payload_hash"`

	// --- Lease ---
	LeaseID    string     `json:"lease_id"`
	LeasedBy   string     `json:"leased_by"`
	LeaseUntil *time.Time `json:"lease_until,omitempty"`

	// --- Retry state ---
	RetryCount  int        `json:"retry_count"`
	NextRetryAt *time.Time `json:"next_retry_at,omitempty"`

	// --- Timestamps ---
	CreatedAt time.Time  `json:"created_at"`
	SentAt    *time.Time `json:"sent_at,omitempty"`

	// --- Status ---
	Status  string  `json:"status"`
	BatchID *string `json:"batchid,omitempty"`
}

// LeaseResponse is what the upstream /lease endpoint returns.
type LeaseResponse struct {
	LeaseID    string        `json:"lease_id"`
	LeaseUntil *time.Time    `json:"lease_until,omitempty"`
	Events     []OutboxEvent `json:"events"`
}

// AckRequest is sent to /ack.
type AckRequest struct {
	LeaseID  string   `json:"lease_id"`
	EventIDs []string `json:"event_ids"`
}

// NackRequest is sent to /nack.
// FailureReason is stored for observability; upstream uses it to set failure_reason_code.
type NackRequest struct {
	LeaseID       string   `json:"lease_id"`
	EventIDs      []string `json:"event_ids"`
	FailureReason string   `json:"failure_reason,omitempty"`
}

// AckNackResponse is returned by /ack and /nack.
type AckNackResponse struct {
	Updated int64 `json:"updated"`
}

// DLQMessage is published to the DLQ Kafka topics.
// Both publish-failure DLQ and poison-event DLQ use this envelope.
type DLQMessage struct {
	// Original event — may be nil for extreme corruption cases.
	Event *OutboxEvent `json:"event,omitempty"`

	// Error details.
	Error       string `json:"error"`
	ReasonCode  string `json:"reason_code"` // see ReasonCode* constants
	ServiceName string `json:"service_name"`

	// Retry metadata.
	AttemptsCount  int       `json:"attempts_count"`
	LastAttemptAt  time.Time `json:"last_attempt_at"`
	FirstAttemptAt time.Time `json:"first_attempt_at"`

	// Relay instance that gave up.
	RelayInstanceID string `json:"relay_instance_id"`
}

// ReasonCode constants — used in DLQMessage.ReasonCode.
const (
	// Publish failure DLQ reason codes.
	ReasonCodeKafkaTimeout     = "KAFKA_TIMEOUT"
	ReasonCodeKafkaBrokerError = "KAFKA_BROKER_ERROR"
	ReasonCodeKafkaMaxRetries  = "KAFKA_MAX_RETRIES_EXCEEDED"

	// Poison event DLQ reason codes.
	ReasonCodeInvalidPayload       = "INVALID_PAYLOAD"
	ReasonCodeSchemaViolation      = "SCHEMA_VIOLATION"
	ReasonCodeMessageTooLarge      = "MESSAGE_TOO_LARGE"
	ReasonCodeMissingRequiredField = "MISSING_REQUIRED_FIELD"
)

// PublishResult carries the outcome of a single Kafka publish attempt.
type PublishResult struct {
	EventID  string
	Err      error
	IsPoison bool // true = don't retry, go straight to poison DLQ
}
