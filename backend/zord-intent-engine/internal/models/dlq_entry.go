package models

import (
	"encoding/json"
	"time"
)

// DLQ status values
const (
	DLQStatusManualReview = "NEEDS_MANUAL_REVIEW"
	DLQStatusTerminal     = "DLQ_TERMINAL"
)

type DLQEntry struct {
	DLQID      string `json:"dlq_id"`
	TenantID   string `json:"tenant_id"`
	EnvelopeID string `json:"envelope_id"`

	Stage          string `json:"stage"`
	ReasonCode     string `json:"reason_code"`
	ErrorDetail    string `json:"error_detail"`
	DLQStatus      string `json:"dlq_status"`
	Replayable     bool   `json:"replayable"`
	ClientBatchRef string `json:"client_batch_ref"`
	BatchID        string `json:"batch_id,omitempty"`
	SourceRowNum   *int   `json:"source_row_num,omitempty"`

	// NEW — populated only when DLQStatus = NEEDS_MANUAL_REVIEW
	IntentContext json.RawMessage `json:"intent_context,omitempty"` // beneficiary_name, amount, idempotency_key
	TraceID       string          `json:"trace_id,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}
