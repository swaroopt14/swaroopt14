package model

import (
	"encoding/json"
	"time"
)

// OutboxEvent is a single row returned by Service 2's lease API.
// Field names match the outbox table column names exactly.
// amount and currency are top-level columns on the outbox table —
// they are NOT inside the payload JSONB.
type OutboxEvent struct {
	ID            string           `json:"event_id"`       // outbox.event_id (UUID PK)
	EnvelopeID    string           `json:"envelope_id"`    // outbox.envelope_id
	TraceID       string           `json:"trace_id"`       // outbox.trace_id
	TenantID      string           `json:"tenant_id"`      // outbox.tenant_id
	ContractID    string           `json:"contract_id"`    // outbox.contract_id
	AggregateType string           `json:"aggregate_type"` // always "intent"
	AggregateID   string           `json:"aggregate_id"`   // outbox.aggregate_id = intent_id
	EventType     string           `json:"event_type"`     // e.g. "intent.created.v1"
	SchemaVersion string           `json:"schema_version"`
	// Amount is a top-level outbox table column (NUMERIC type in Postgres).
	// Stored as json.Number to handle both "30000" and 30000 from the JSON serializer.
	Amount        json.Number      `json:"amount"`
	Currency      string           `json:"currency"` // e.g. "INR"
	RetryCount    int              `json:"retry_count"`
	NextRetryAt   *time.Time       `json:"next_attempt_at,omitempty"`
	Payload       json.RawMessage  `json:"payload"` // JSONB — the intent body with tokens
	Status        string           `json:"status"`
	CreatedAt     time.Time        `json:"created_at"`
	LeaseID       string           `json:"lease_id,omitempty"`
	LeasedBy      string           `json:"leased_by,omitempty"`
	LeaseUntil    *time.Time       `json:"lease_until,omitempty"`
}

// OutboxPayload is the JSONB payload column from Service 2's outbox table.
// This is the canonicalized intent body. It contains token IDs, never plaintext.
// Field names match exactly what Service 2 writes — confirmed from live DB.
type OutboxPayload struct {
	IntentID      string           `json:"intent_id"`
	EnvelopeID    string           `json:"envelope_id"`
	TenantID      string           `json:"tenant_id"`
	TraceID       string           `json:"trace_id"`
	IntentType    string           `json:"intent_type"`    // "PAYOUT"
	SchemaVersion string           `json:"schema_version"` // "intent.request.v1"
	CreatedAt     time.Time        `json:"created_at"`
	IdempotencyKey string          `json:"idempotency_key"`
	Status        string           `json:"status"` // "CREATED"

	// PIITokens holds token IDs for all sensitive fields.
	// Each is a UUID referencing a record in Service 3's token_map table.
	// Resolved by Service 3 just-in-time before the PSP call.
	PIITokens OutboxPIITokens `json:"pii_tokens"`

	// Beneficiary holds routing metadata and token references.
	Beneficiary OutboxBeneficiary `json:"beneficiary"`

	// BeneficiaryType is the instrument kind at the top level.
	BeneficiaryType string `json:"beneficiary_type"` // "BANK" or "UPI"

	// Constraints carries execution rules from the tenant.
	Constraints OutboxConstraints `json:"constraints"`
}

// OutboxPIITokens holds token IDs for all sensitive fields.
// These are UUIDs — not account numbers, not names.
// Never log, store, or pass these values outside of the detokenize call.
type OutboxPIITokens struct {
	AccountNumber string `json:"account_number"` // token ID → resolves to account number
	Name          string `json:"name"`           // token ID → resolves to beneficiary name
	IFSC          string `json:"ifsc"`           // token ID → resolves to IFSC code
	VPA           string `json:"vpa"`            // token ID → resolves to UPI VPA (optional)
	Email         string `json:"email"`          // token ID → resolves to email (optional)
	Phone         string `json:"phone"`          // token ID → resolves to phone (optional)
}

// OutboxBeneficiary holds routing metadata and nested token references.
type OutboxBeneficiary struct {
	NameToken   string           `json:"name_token"` // mirrors pii_tokens.name
	Country     string           `json:"country"`
	Instrument  OutboxInstrument `json:"instrument"`
}

// OutboxInstrument describes the payment instrument.
type OutboxInstrument struct {
	Kind      string `json:"kind"`       // "BANK" or "UPI"
	IFSCToken string `json:"ifsc_token"` // mirrors pii_tokens.ifsc
	VPAToken  string `json:"vpa_token"`  // mirrors pii_tokens.vpa
}

// OutboxConstraints carries tenant-defined execution rules.
type OutboxConstraints struct {
	ExecutionWindow string `json:"execution_window"` // e.g. "T+1"
}

// ResolvedBeneficiary holds plaintext PII values after detokenization.
// This struct exists only in memory during Step 4 (PSP call).
// It MUST NEVER be logged, stored, or included in any event payload.
// Use Zero() in a defer immediately after the struct is populated.
type ResolvedBeneficiary struct {
	AccountNumber string
	Name          string
	IFSC          string
}

// Zero clears all plaintext fields from memory.
// Always call via defer immediately after populating this struct:
//
//	rb := &model.ResolvedBeneficiary{...}
//	defer rb.Zero()
func (r *ResolvedBeneficiary) Zero() {
	r.AccountNumber = ""
	r.Name = ""
	r.IFSC = ""
}
