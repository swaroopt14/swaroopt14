package models

import "time"

type IngressEnvelope struct {
	EnvelopeID string
	TenantID   string

	Source         string
	SourceSystem   string
	IdempotencyKey string

	PayloadHash string
	ObjectRef   string

	ParseStatus     string
	SignatureStatus string

	ReceivedAt time.Time
}
