package models

import "time"

// Policy represents one row in the policy_registry table.
//
// A policy is an IF-THEN rule stored in the database.
// When its conditions are met, ZPI creates an ActionContract.
//
// Example policy in plain English:
//   IF corridor razorpay.UPI success rate drops below 90%
//   THEN create an ESCALATE action and notify ops team
//
// This is stored as:
//   policy_id    = "P_FAILURE_BURST"
//   trigger_type = "event"
//   trigger_val  = "outcome.event.normalized"
//   dsl          = "WHEN corridor.failure_rate_1h > 0.10 THEN ESCALATE severity=HIGH"

type Policy struct {
	PolicyID     string `json:"policy_id" db:"policy_id"`
	Version      int    `json:"version" db:"version"`
	ScopeType    string `json:"scope_type" db:"scope_type"`
	TriggerType  string `json:"trigger_type" db:"trigger_type"`
	TriggerValue string `json:"trigger_value" db:"trigger_value"`
	DSL          string `json:"dsl" db:"dsl"`
	Enabled      bool   `json:"enabled" db:"enabled"`
	TenantID     string `json:"tenant_id,omitempty" db:"tenant_id"`
	// omitempty means: if TenantID is empty string, skip it in JSON output
	// This is used when a policy applies to ALL tenants (tenant_id is NULL in DB)
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// Decision is the list of valid actions ZPI can take.
//
// In Go, we use "typed string constants" instead of Java enums.
// They work the same way:
//
//   Java:   Decision.ESCALATE
//   Go:     DecisionEscalate
//
// The CHECK constraint in init.sql enforces that only these values
// can be stored in the action_contracts.decision column.

type Decision string

const (
	// DecisionAllow - explicit allow. Recorded for audit trail only.
	// Money impact: NONE
	DecisionAllow Decision = "ALLOW"

	// DecisionEscalate - create an ops incident and notify on-call team.
	// Money impact: NONE. Always safe to execute.
	DecisionEscalate Decision = "ESCALATE"

	// DecisionNotify - send a notification (Slack, email, webhook).
	// Money impact: NONE. Always safe to execute.
	DecisionNotify Decision = "NOTIFY"

	// DecisionOpenOpsIncident - create a structured ops ticket.
	// Money impact: NONE. Always safe to execute.
	DecisionOpenOpsIncident Decision = "OPEN_OPS_INCIDENT"

	// DecisionGenerateEvidence - ask Service 6 to build an evidence pack.
	// Money impact: NONE. Idempotent (running twice is fine).
	DecisionGenerateEvidence Decision = "GENERATE_EVIDENCE"

	// DecisionAdvisoryRecommendation - log a suggestion only. Zero auto-execution.
	// Money impact: NONE. Always safe.
	DecisionAdvisoryRecommendation Decision = "ADVISORY_RECOMMENDATION"

	// DecisionHold - pause this payout for manual review.
	// Money impact: INDIRECT (blocks payout).
	// REQUIRES: tenant has risk_gates_enabled = true in their config.
	DecisionHold Decision = "HOLD"

	// DecisionRetry - schedule a retry via Service 4.
	// Money impact: INDIRECT (triggers another payment attempt).
	// REQUIRES: tenant has safe_retry_enabled = true in their config.
	DecisionRetry Decision = "RETRY"
)

// IsSafe returns true if this decision has zero money movement risk.
// Used by outbox_worker.go to skip tenant config checks for safe actions.
//
// Example usage:
//   if !action.Decision.IsSafe() {
//       // check tenant config before executing
//   }
func (d Decision) IsSafe() bool {
	switch d {
	case DecisionAllow,
		DecisionEscalate,
		DecisionNotify,
		DecisionOpenOpsIncident,
		DecisionGenerateEvidence,
		DecisionAdvisoryRecommendation:
		return true
	}
	// HOLD and RETRY are NOT safe — they affect money movement
	return false
}

// ScopeRefs identifies WHAT an ActionContract is about.
// At least one field will be set. Others are optional context.
type ScopeRefs struct {
	TenantID   string `json:"tenant_id,omitempty"`
	IntentID   string `json:"intent_id,omitempty"`
	ContractID string `json:"contract_id,omitempty"`
	CorridorID string `json:"corridor_id,omitempty"`
}
