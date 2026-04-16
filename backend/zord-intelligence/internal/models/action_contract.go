package models

import "time"

// ActionContract is the most important struct in ZPI.
// Every decision ZPI makes becomes one ActionContract row in the DB.
//
// GOLDEN RULE: Once created, an ActionContract is NEVER changed.
// It is an immutable audit record. Like a signed contract in real life.
//
// PHASE 5 ADDITIONS:
//   - ContractStatus: approval lifecycle (ACTIVE → PENDING_APPROVAL → APPROVED/DISMISSED/EXPIRED)
//   - ExpiresAt:      time-sensitive decisions expire automatically
//   - PolicyFamily:   which of the 9 intelligence families created this action
//   - Severity:       HIGH | MEDIUM | LOW — promoted from DSL text to a typed field
//
// The frontend reads these via:
//
//	GET /v1/intelligence/actions?tenant_id=tnt_A
//	GET /v1/intelligence/actions/{action_id}
//	GET /v1/intelligence/actions/pending-approval?tenant_id=tnt_A
//	POST /v1/intelligence/actions/{action_id}/approve
//	POST /v1/intelligence/actions/{action_id}/dismiss

type ActionContract struct {
	ActionID string `json:"action_id" db:"action_id"`
	// Format: "act_" + UUID  e.g. "act_01J8X..."

	TenantID string `json:"tenant_id" db:"tenant_id"`

	PolicyID string `json:"policy_id" db:"policy_id"`
	// Which policy created this action. e.g. "P_SLA_BREACH_RISK"

	PolicyVersion int `json:"policy_version" db:"policy_version"`
	// Which version of that policy was active. Important for audits.

	ScopeRefs ScopeRefs `json:"scope_refs" db:"scope_refs"`
	// What this action is about — corridor, contract, tenant, or batch

	InputRefsJSON string `json:"input_refs_json" db:"input_refs_json"`
	// JSON string: the projection values that caused this decision.
	// Example: {"projection_key": "leakage.total", "value": 785000, "threshold": 500000}
	// MUST NOT contain PII.

	Decision Decision `json:"decision" db:"decision"`
	// What ZPI decided. Uses the Decision type from policy.go.

	Confidence float64 `json:"confidence" db:"confidence"`
	// How certain ZPI was: 0.000 to 1.000

	PayloadJSON string `json:"payload_json" db:"payload_json"`
	// JSON string: details the actuator needs to carry out the action.
	// Example for ESCALATE: {"severity": "HIGH", "notify": ["OPS"], "message": "..."}
	// MUST NOT contain PII.

	Signature string `json:"signature" db:"signature"`
	// Cryptographic proof this record was not tampered with.
	// Development: SHA-256 hash of the key fields.
	// Production: ed25519 signature via KMS.

	IdempotencyKey string `json:"idempotency_key" db:"idempotency_key"`
	// Prevents duplicate actions for the same event.
	// Formula: SHA-256 of (policy_id + scope_refs JSON + trigger_event_id)

	// ── PHASE 5: New lifecycle and classification fields ──────────────────────

	ContractStatus ContractStatus `json:"contract_status" db:"contract_status"`
	// Approval lifecycle of this ActionContract.
	// ACTIVE            → normal flow, outbox processes it immediately
	// PENDING_APPROVAL  → waiting for human sign-off before actuation
	// APPROVED          → human approved, outbox delivers it
	// DISMISSED         → human dismissed, no actuation will occur
	// EXPIRED           → approval window passed without action
	//
	// Determined at creation time by:
	//   1. policy.RequiresManualApproval flag → PENDING_APPROVAL
	//   2. decision.RequiresApproval()       → PENDING_APPROVAL
	//   3. everything else                   → ACTIVE

	ExpiresAt *time.Time `json:"expires_at,omitempty" db:"expires_at"`
	// Optional expiry for time-sensitive decisions.
	// Example: a HOLD action must be reviewed within 24h; after that it auto-EXPIRES.
	// NULL = never expires (correct default for most actions).
	// Set by action_service when policy.requires_manual_approval = true.

	PolicyFamily PolicyFamily `json:"policy_family,omitempty" db:"policy_family"`
	// Which of the 9 intelligence families created this action.
	// LEAKAGE | AMBIGUITY | DEFENSIBILITY | RCA | PATTERN | RECOMMENDATION
	// | SLA | BATCH | COMPLIANCE
	// Populated from policy_registry.policy_family at creation time.
	// Enables "show me all LEAKAGE-family actions" queries.

	Severity string `json:"severity,omitempty" db:"severity"`
	// HIGH | MEDIUM | LOW — promoted from DSL text to a queryable column.
	// Parsed from the DSL at evaluation time and persisted for fast filtering.

	CreatedAt time.Time `json:"created_at" db:"created_at"`
	// Set once at creation. Never updated. This is the only mutable-looking field
	// but it is written once and protected by the IMMUTABILITY RULE.
}

// ContractStatus is the approval lifecycle of an ActionContract.
//
// State machine:
//
//	ACTIVE ──────────────────────────────────────────────────────────→ (delivered)
//	PENDING_APPROVAL → APPROVED  → (delivered after approval)
//	PENDING_APPROVAL → DISMISSED → (never delivered)
//	PENDING_APPROVAL → EXPIRED   → (approval window missed)
type ContractStatus string

const (
	// ContractStatusActive — normal flow. Outbox delivers immediately.
	// All safe decisions (ESCALATE, NOTIFY, REQUEST_SOURCE_PATCH, etc.) start here.
	ContractStatusActive ContractStatus = "ACTIVE"

	// ContractStatusPendingApproval — waiting for a human to approve or dismiss.
	// Set when:
	//   - policy.requires_manual_approval = true, OR
	//   - decision.RequiresApproval() = true (HOLD, RETRY, REVIEW_AMBIGUOUS_BATCH)
	// Outbox worker SKIPS entries whose action has this status.
	ContractStatusPendingApproval ContractStatus = "PENDING_APPROVAL"

	// ContractStatusApproved — human approved this action.
	// Outbox worker will deliver it on next poll.
	// Set by: POST /v1/intelligence/actions/{id}/approve
	ContractStatusApproved ContractStatus = "APPROVED"

	// ContractStatusDismissed — human dismissed this action.
	// Outbox worker will never deliver it.
	// Set by: POST /v1/intelligence/actions/{id}/dismiss
	ContractStatusDismissed ContractStatus = "DISMISSED"

	// ContractStatusExpired — approval window passed without a decision.
	// Set by the background expiry job (outbox_worker or a dedicated cron).
	ContractStatusExpired ContractStatus = "EXPIRED"
)

// IsDeliverable returns true if the outbox worker should attempt Kafka delivery.
//
// RULE:
//   - ACTIVE    → deliver immediately
//   - APPROVED  → deliver (human approved it)
//   - everything else → skip (pending / dismissed / expired)
func (cs ContractStatus) IsDeliverable() bool {
	return cs == ContractStatusActive || cs == ContractStatusApproved
}

// IsFinal returns true if this status cannot change anymore.
// Final contracts are fully resolved — no further action possible.
func (cs ContractStatus) IsFinal() bool {
	return cs == ContractStatusDismissed || cs == ContractStatusExpired
}

// ActionContractSummary is a lighter version for list API responses.
// When the frontend asks for a list of actions, we don't need to send
// the full payload and input_refs for every row — just the summary.
type ActionContractSummary struct {
	ActionID       string         `json:"action_id"`
	TenantID       string         `json:"tenant_id"`
	PolicyID       string         `json:"policy_id"`
	Decision       Decision       `json:"decision"`
	Confidence     float64        `json:"confidence"`
	ContractStatus ContractStatus `json:"contract_status"` // PHASE 5: included in list view
	PolicyFamily   PolicyFamily   `json:"policy_family,omitempty"`
	Severity       string         `json:"severity,omitempty"`
	ScopeRefs      ScopeRefs      `json:"scope_refs"`
	ExpiresAt      *time.Time     `json:"expires_at,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
}

// ApprovalDefaultExpiryHours is how long a PENDING_APPROVAL action stays open
// before it auto-expires. Fintech standard: 24 hours for HOLD/RETRY decisions.
// Risk-impacting decisions that nobody reviews within 24h should auto-expire
// so the system never has stale approval requests affecting live operations.
const ApprovalDefaultExpiryHours = 24
