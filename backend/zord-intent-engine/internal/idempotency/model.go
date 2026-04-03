package idempotency

import "encoding/json"

type Status string

const (
	StatusInProgress Status = "IN_PROGRESS"
	StatusAccepted   Status = "ACCEPTED"
	StatusRejected   Status = "REJECTED"
	StatusDLQ        Status = "DLQ"
)

type Record struct {
	TenantID          string
	IdempotencyKey    string
	FirstEnvelopeID   string
	CanonicalIntentID *string

	Status           Status
	ResponseSnapshot json.RawMessage
}
