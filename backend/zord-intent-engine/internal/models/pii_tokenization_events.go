package models

import "time"

/*
STEP 8 EVENT
Intent Engine → Token Enclave

Request tokenization of PII fields
*/

type TokenizeRequestEvent struct {
	EventType      string    `json:"event_type"`
	TraceID        string    `json:"trace_id"`
	EnvelopeID     string    `json:"envelope_id"`
	TenantID       string    `json:"tenant_id"`
	ObjectRef      string    `json:"object_ref"`
	IdempotencyKey string    `json:"idempotency_key"`
	Source         string    `json:"source"`
	ReceivedAt     time.Time `json:"received_at"`

	Canonical ParsedIncomingIntent `json:"canonical"`
}

/*
STEP 8.5 EVENT
Token Enclave → Intent Engine

Return generated tokens
*/

type TokenizeResultEvent struct {
	EventType  string `json:"event_type"`
	TraceID    string `json:"trace_id"`
	EnvelopeID string `json:"envelope_id"`
	TenantID   string `json:"tenant_id"`
	ObjectRef  string `json:"object_ref"`

	Tokens map[string]string `json:"tokens"`

	Canonical ParsedIncomingIntent `json:"canonical"`
}
