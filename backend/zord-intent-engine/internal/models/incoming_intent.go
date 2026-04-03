package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type IncomingIntent struct {
	TraceID          uuid.UUID `json:"trace_id" db:"trace_id"`
	EnvelopeID       uuid.UUID `json:"envelope_id" db:"envelope_id"`
	TenantID         uuid.UUID `json:"tenant_id" db:"tenant_id"`
	Source           string    `json:"source" db:"source"`
	SourceSystem     string    `json:"source_system" db:"source_system"`
	IdempotencyKey   string    `json:"idempotency_key" db:"idempotency_key"`
	PayloadHash      []byte    `json:"payload_hash" db:"payload_hash"`
	ObjectRef        string    `json:"object_ref" db:"object_ref"`
	ParseStatus      string    `json:"parse_status" db:"parse_status"`
	SignatureStatus  *string   `json:"signature_status,omitempty" db:"signature_status"`
	AmountValue      string    `json:"amount_value" db:"amount_value"`
	AmountCurrency   string    `json:"amount_currency" db:"amount_currency"`
	ReceivedAt       time.Time `json:"received_at" db:"received_at"`
	Payload          json.RawMessage
	EncryptedPayload []byte `json:"encrypted_payload,omitempty" db:"encrypted_payload"`
}

type ParsedIncomingIntent struct {
	SchemaVersion  string         `json:"schema_version"`
	IntentType     string         `json:"intent_type"`
	AccountNumber  string         `json:"account_number"`
	Amount         Amount         `json:"amount"`
	Beneficiary    Beneficiary    `json:"beneficiary"`
	Remitter       Remitter       `json:"remitter,omitempty"`
	Constraints    map[string]any `json:"constraints,omitempty"`
	PurposeCode    string         `json:"purpose_code"`
	IdempotencyKey string         `json:"idempotency_key"`
}

// type IncomingIntent struct {
// 	SchemaVersion  string         `json:"schema_version"`
// 	IntentType     string         `json:"intent_type"`
// 	AccountNumber  string         `json:"account_number"`
// 	Amount         Amount         `json:"amount"`
// 	Beneficiary    Beneficiary    `json:"beneficiary"`
// 	Remitter       map[string]any `json:"remitter,omitempty"`
// 	Constraints    map[string]any `json:"constraints,omitempty"`
// 	PurposeCode    string         `json:"purpose_code"`
// 	IdempotencyKey string         `json:"idempotency_key"`
// }

/* ---------- Nested Types ---------- */

type Amount struct {
	Value    string `json:"value"`
	Currency string `json:"currency"`
}

type Beneficiary struct {
	Instrument Instrument `json:"instrument"`
	Name       string     `json:"name,omitempty"`
	Country    string     `json:"country,omitempty"`
}
type Remitter struct {
	Phone string `json:"phone,omitempty"`
	Email string `json:"email,omitempty"`
}

type Instrument struct {
	Kind string `json:"kind"`

	// BANK
	IFSC string `json:"ifsc,omitempty"`

	// UPI
	VPA string `json:"vpa,omitempty"`
}
