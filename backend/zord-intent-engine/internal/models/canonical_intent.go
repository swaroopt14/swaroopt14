package models

import (
	"encoding/json"
	"time"

	"github.com/shopspring/decimal"
)

type CanonicalIntent struct {
	IntentID   string `json:"intent_id"`
	EnvelopeID string `json:"envelope_id"`
	TenantID   string `json:"tenant_id"`
	ContractID string `json:"contract_id,omitempty" db:"contract_id"`

	// ✅ ADD THESE
	TraceID        string `json:"trace_id" db:"trace_id"`
	IdempotencyKey string `json:"idempotency_key" db:"idempotency_key"`
	SalientHash    string `json:"salient_hash" db:"salient_hash"`

	IntentType       string `json:"intent_type"`
	CanonicalVersion string `json:"canonical_version"`
	SchemaVersion    string `json:"schema_version"`

	Amount     decimal.Decimal `json:"amount"`
	Currency   string          `json:"currency"`
	DeadlineAt *time.Time      `json:"deadline_at,omitempty"`

	Constraints json.RawMessage `json:"constraints,omitempty"`

	BeneficiaryType string          `json:"beneficiary_type"`
	PIITokens       json.RawMessage `json:"pii_tokens,omitempty"`
	Beneficiary     json.RawMessage `json:"beneficiary,omitempty"`

	Status          string   `json:"status"`
	ConfidenceScore *float64 `json:"confidence_score,omitempty"`

	CreatedAt time.Time `json:"created_at"`

	// 🆕 WORM fields
	CanonicalSnapshotRef  string `db:"canonical_snapshot_ref" json:"canonical_snapshot_ref,omitempty"`
	NIRSnapshotRef        string `db:"nir_snapshot_ref" json:"nir_snapshot_ref,omitempty"`
	GovernanceSnapshotRef string `db:"governance_snapshot_ref" json:"governance_snapshot_ref,omitempty"`
	CanonicalHash         string `db:"canonical_hash" json:"canonical_hash,omitempty"`
	PayloadHash           []byte

	// 🆕 Additional Canonical Schema fields
	ClientPayoutRef       string          `json:"client_payout_ref,omitempty"`
	RequestFingerprint    string          `json:"request_fingerprint,omitempty"`
	RoutingHintsJSON      json.RawMessage `json:"routing_hints_json,omitempty"`
	GovernanceState       string          `json:"governance_state,omitempty"`
	BusinessState         string          `json:"business_state,omitempty"`
	DuplicateRiskFlag     bool            `json:"duplicate_risk_flag,omitempty"`
	MappingProfileVersion string          `json:"mapping_profile_version,omitempty"`
	UpdatedAt             *time.Time      `json:"updated_at,omitempty"`
}
