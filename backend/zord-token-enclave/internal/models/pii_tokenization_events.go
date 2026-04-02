package models

import "time"

/*
Intent Engine → Token Enclave
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

	Canonical map[string]interface{} `json:"canonical"`
}

/*
Token Enclave → Intent Engine
*/

type TokenizeResultEvent struct {
	EventType  string `json:"event_type"`
	TraceID    string `json:"trace_id"`
	EnvelopeID string `json:"envelope_id"`
	TenantID   string `json:"tenant_id"`
	ObjectRef  string `json:"object_ref"`

	Tokens map[string]string `json:"tokens"`

	Canonical map[string]interface{} `json:"canonical"`
}
