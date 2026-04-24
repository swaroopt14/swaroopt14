package models

import "time"

type TokenizeRequestEvent struct {
	EventType      string    `json:"event_type"`
	TraceID        string    `json:"trace_id"`
	EnvelopeID     string    `json:"envelope_id"`
	TenantID       string    `json:"tenant_id"`
	ObjectRef      string    `json:"object_ref"`
	IdempotencyKey string    `json:"idempotency_key"`
	Source         string    `json:"source"`
	ReceivedAt     time.Time `json:"received_at"`

	Canonical CanonicalSettlementObservation `json:"canonical"`
}

type TokenizeResultEvent struct {
	EventType  string `json:"event_type"`
	TraceID    string `json:"trace_id"`
	EnvelopeID string `json:"envelope_id"`
	TenantID       string `json:"tenant_id"`
	ObjectRef      string `json:"object_ref"`
	IdempotencyKey string `json:"idempotency_key"`

	Tokens map[string]string `json:"tokens"`

	Canonical CanonicalSettlementObservation `json:"canonical"`
}
