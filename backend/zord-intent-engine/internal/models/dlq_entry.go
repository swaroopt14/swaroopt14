package models

import "time"

type DLQEntry struct {
	DLQID      string `json:"dlq_id"`
	TenantID   string `json:"tenant_id"`
	EnvelopeID string `json:"envelope_id"`

	Stage       string `json:"stage"`
	ReasonCode  string `json:"reason_code"`
	ErrorDetail string `json:"error_detail"`
	Replayable  bool   `json:"replayable"`

	CreatedAt time.Time `json:"created_at"`
}
