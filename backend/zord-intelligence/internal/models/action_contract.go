package models

import "time"

// ActionContract is the most important struct in ZPI.
// Every decision ZPI makes becomes one ActionContract row in the DB.
//
// GOLDEN RULE: Once created, an ActionContract is NEVER changed.
// It is an immutable audit record. Like a signed contract in real life.
//
// The frontend reads these via:
//   GET /v1/intelligence/actions?tenant_id=tnt_A
//   GET /v1/intelligence/actions/{action_id}
//
// Example in plain English:
//   "At 14:32 on Jan 15, policy P_SLA_BREACH_RISK triggered because
//    corridor razorpay.UPI had finality_p95 of 7.2 hours (> 6h limit).
//    ZPI decided to ESCALATE with confidence 0.95.
//    This decision was signed with key zpi-signing-key-v1."

type ActionContract struct {
	ActionID string `json:"action_id" db:"action_id"`
	// Format: "act_" + UUID  e.g. "act_01J8X..."

	TenantID string `json:"tenant_id" db:"tenant_id"`

	PolicyID string `json:"policy_id" db:"policy_id"`
	// Which policy created this action. e.g. "P_SLA_BREACH_RISK"

	PolicyVersion int `json:"policy_version" db:"policy_version"`
	// Which version of that policy was active. Important for audits.

	ScopeRefs ScopeRefs `json:"scope_refs" db:"scope_refs"`
	// What this action is about — corridor, contract, or tenant

	InputRefsJSON string `json:"input_refs_json" db:"input_refs_json"`
	// JSON string: the projection values that caused this decision.
	// Example: {"projection_key": "corridor.success_rate.razorpay_UPI",
	//            "value": 0.82, "threshold": 0.90}
	// Stored as string so we can save any shape without changing the schema.

	Decision Decision `json:"decision" db:"decision"`
	// What ZPI decided. Uses the Decision type from policy.go.

	Confidence float64 `json:"confidence" db:"confidence"`
	// How certain ZPI was: 0.000 to 1.000

	PayloadJSON string `json:"payload_json" db:"payload_json"`
	// JSON string: details the actuator needs to carry out the action.
	// Example for ESCALATE: {"severity": "HIGH", "notify": ["OPS"],
	//                        "message": "SLA breach risk on razorpay.UPI"}
	// MUST NOT contain PII (names, account numbers, etc.)

	Signature string `json:"signature" db:"signature"`
	// Cryptographic proof this record was not tampered with.
	// Development: SHA-256 hash of the key fields.
	// Production: ed25519 signature via KMS (same key your team uses in zord-edge).

	IdempotencyKey string `json:"idempotency_key" db:"idempotency_key"`
	// Prevents duplicate actions for the same event.
	// Formula: SHA-256 of (policy_id + scope_refs JSON + trigger_event_id)
	// If the same Kafka event is processed twice, the UNIQUE constraint
	// on this column prevents two identical ActionContracts from being created.

	CreatedAt time.Time `json:"created_at" db:"created_at"`
	// Set once at creation. Never updated.
}

// ActionContractSummary is a lighter version for list API responses.
// When the frontend asks for a list of actions, we don't need to send
// the full payload and input_refs for every row — just the summary.
type ActionContractSummary struct {
	ActionID   string    `json:"action_id"`
	TenantID   string    `json:"tenant_id"`
	PolicyID   string    `json:"policy_id"`
	Decision   Decision  `json:"decision"`
	Confidence float64   `json:"confidence"`
	ScopeRefs  ScopeRefs `json:"scope_refs"`
	CreatedAt  time.Time `json:"created_at"`
}
