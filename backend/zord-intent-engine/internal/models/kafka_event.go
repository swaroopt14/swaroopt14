package models

import (
	// "encoding/json"
	"time"

	"github.com/google/uuid"
)

type Event struct {
	EventID        string    `json:"event_id"`
	TraceID        uuid.UUID `json:"trace_id"`
	EnvelopeID     uuid.UUID `json:"envelope_id"`
	TenantID       uuid.UUID `json:"tenant_id"`
	ObjectRef      string    `json:"object_ref"`
	ReceivedAt     time.Time `json:"created_at"`
	Source         string    `json:"source"`
	SourceSystem   string    `json:"source_system"`
	IdempotencyKey string    `json:"idempotency_key"`
	Payload        []byte    `json:"payload"`
	PayloadHash    []byte    `json:"payload_hash"`
	BatchID        *string   `json:"batchid,omitempty"`
}
