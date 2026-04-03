package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type OutboxEvent struct {
	EventID       string    `json:"event_id" db:"event_id"`
	EnvelopeID    string    `json:"envelope_id" db:"envelope_id"`
	TraceID       string    `json:"trace_id" db:"trace_id"`
	TenantID      string    `json:"tenant_id" db:"tenant_id"`
	ContractID    string    `json:"contract_id,omitempty" db:"contract_id"`
	AggregateType string    `json:"aggregate_type" db:"aggregate_type"`
	AggregateID   uuid.UUID `json:"aggregate_id" db:"aggregate_id"`
	EventType     string    `json:"event_type" db:"event_type"`

	SchemaVersion string          `json:"schema_version" db:"schema_version"`
	Amount        decimal.Decimal `json:"amount" db:"amount"`
	Currency      string          `json:"currency" db:"currency"`

	RetryCount  int             `json:"retry_count" db:"retry_count"`
	NextRetryAt *time.Time      `json:"next_attempt_at,omitempty" db:"next_attempt_at"`
	Payload     json.RawMessage `json:"payload" db:"payload"`
	Status      string          `json:"status" db:"status"`
	CreatedAt   time.Time       `json:"created_at" db:"created_at"`
	LeaseID     string          `json:"lease_id,omitempty" db:"lease_id"`
	LeasedBy    string          `json:"leased_by,omitempty" db:"leased_by"`
	LeaseUntil  *time.Time      `json:"lease_until,omitempty" db:"lease_until"`
	PayloadHash []byte
}
