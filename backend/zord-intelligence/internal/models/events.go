package models

// What is this file?
// These structs represent the Kafka events ZPI receives from other services.
// When a Kafka message arrives, consumer.go decodes the JSON bytes
// into one of these structs so the rest of the code can work with typed data.
//
// Rule: These structs are READ ONLY from ZPI's perspective.
// ZPI never creates these — it only receives them from other services.

import "time"

// ── Event 1: from Service 2 ───────────────────────────────────────────────────
//
// Arrives when a merchant creates a new payout intent.
// ZPI uses this to:
//   - Start an SLA timer (deadline = created_at + 6 hours)
//   - Increment the pending backlog count for this corridor

type IntentCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	IntentID   string    `json:"intent_id"`
	ContractID string    `json:"contract_id"`
	CorridorID string    `json:"corridor_id"` // e.g. "razorpay.UPI", "cashfree.IMPS"
	Amount     string    `json:"amount"`      // stored as string, never float (money rule)
	Currency   string    `json:"currency"`    // "INR", "USD"
	CreatedAt  time.Time `json:"created_at"`
	TraceID    string    `json:"trace_id"`
}

// ── Event 2: from Service 4 ───────────────────────────────────────────────────
//
// Arrives when Service 4 (Relay) sends a payout attempt to a PSP.
// ZPI uses this to:
//   - Track attempt count per contract
//   - Update the pending backlog age buckets

type DispatchAttemptCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	IntentID   string    `json:"intent_id"`
	ContractID string    `json:"contract_id"`
	AttemptID  string    `json:"attempt_id"`
	AttemptNo  int       `json:"attempt_no"` // 1 = first try, 2 = retry, etc.
	CorridorID string    `json:"corridor_id"`
	Provider   string    `json:"provider"` // "razorpay", "cashfree"
	DispatchAt time.Time `json:"dispatch_at"`
	TraceID    string    `json:"trace_id"`
}

// ── Event 3: from Service 5 ───────────────────────────────────────────────────
//
// Arrives for every normalized outcome signal (webhook / poll / bank statement).
// ZPI uses this to:
//   - Update failure taxonomy (which reason codes are most common?)
//   - Feed the anomaly detection (is failure rate spiking?)

type OutcomeNormalizedEvent struct {
	EventID         string    `json:"event_id"`
	TenantID        string    `json:"tenant_id"`
	IntentID        string    `json:"intent_id"`
	ContractID      string    `json:"contract_id"`
	CorridorID      string    `json:"corridor_id"`
	Provider        string    `json:"provider"`
	SourceType      string    `json:"source_type"`      // "webhook", "poll", "statement"
	StatusCandidate string    `json:"status_candidate"` // "SUCCESS", "FAILED", "PENDING"
	ReasonCode      string    `json:"reason_code"`      // e.g. "INSUFFICIENT_FUNDS"
	Confidence      float64   `json:"confidence"`       // 0.0 to 1.0
	OccurredAt      time.Time `json:"occurred_at"`
	TraceID         string    `json:"trace_id"`
}

// ── Event 4: from Service 5 ───────────────────────────────────────────────────
//
// THE MOST IMPORTANT EVENT for ZPI.
// Arrives when Service 5 reaches a terminal decision with full confidence.
// ZPI uses this to:
//   - Compute time_to_finality (how long did this payout take?)
//   - Update success_rate for this corridor
//   - Mark the SLA timer as RESOLVED or BREACHED
//   - Trigger policy evaluation

type FinalityCertIssuedEvent struct {
	EventID         string    `json:"event_id"`
	TenantID        string    `json:"tenant_id"`
	IntentID        string    `json:"intent_id"`
	ContractID      string    `json:"contract_id"`
	CorridorID      string    `json:"corridor_id"`
	Provider        string    `json:"provider"`
	FinalState      string    `json:"final_state"`       // "SETTLED", "FAILED", "REVERSED"
	Confidence      float64   `json:"confidence"`        // 0.0 to 1.0
	FinalityLevel   string    `json:"finality_level"`    // "PROVISIONAL", "CONFIRMED"
	IntentCreatedAt time.Time `json:"intent_created_at"` // when was the original intent?
	DecisionAt      time.Time `json:"decision_at"`       // when did finality happen?
	CertificateID   string    `json:"certificate_id"`
	TraceID         string    `json:"trace_id"`

	// ── NEW FIELDS from Service 5 (added per gap spec) ───────────────────
	//
	// HasProviderRef: did Service 5 find a UTR/RRN/BankRef in the Trace Graph?
	//   true  → provider gave us a traceable reference (good traceability)
	//   false → no provider reference found (reduces audit-grade confidence)
	//
	// ConflictCount: how many signal pairs disagreed during Outcome Fusion?
	//   0 → all signals agreed — cleanest possible finality
	//   1+ → signals conflicted; Service 5 used truth hierarchy to resolve
	//
	// ConflictTypes: which specific conflicts occurred?
	//   e.g. ["webhook_vs_poll_mismatch", "amount_mismatch"]
	//   Empty slice when ConflictCount == 0.
	HasProviderRef bool     `json:"has_provider_ref"` // true if UTR/RRN/BankRef found
	ConflictCount  int      `json:"conflict_count"`   // number of signal conflicts (0 = clean)
	ConflictTypes  []string `json:"conflict_types"`   // e.g. ["webhook_vs_poll_mismatch"]
}

// ── Event 8: from Service 5 (NEW — statement reconciliation) ─────────────────
//
// Arrives when Service 5 reconciles a settled payout against bank statements.
// ZPI uses this to compute statement_match_rate:
//   - MATCHED events → payout found in settlement statement
//   - UNMATCHED events → payout settled per signals but NOT in statement after 24h
//
// Kafka topic: statement.match.event
// Emitted by:  Service 5 Statement Adapter after each reconciliation pass

type StatementMatchEvent struct {
	EventID          string    `json:"event_id"`
	TenantID         string    `json:"tenant_id"`
	IntentID         string    `json:"intent_id"`
	CorridorID       string    `json:"corridor_id"` // e.g. "razorpay.UPI"
	Provider         string    `json:"provider"`
	MatchStatus      string    `json:"match_status"`      // "MATCHED" or "UNMATCHED"
	SettlementAmount string    `json:"settlement_amount"` // stored as string (money rule)
	SettlementDate   time.Time `json:"settlement_date"`   // when statement shows settlement
	SettledAt        time.Time `json:"settled_at"`        // when ZPI declared finality
	SourceStatement  string    `json:"source_statement"`  // e.g. "razorpay_settlement_2024-01-15"
	UTRMatched       string    `json:"utr_matched"`       // blank if UNMATCHED
	AgedSeconds      int64     `json:"aged_seconds"`      // time between settled_at and settlement_date
	CreatedAt        time.Time `json:"created_at"`
	TraceID          string    `json:"trace_id"`
}

// ── Event 5: from Service 5 / 6 ──────────────────────────────────────────────
//
// Arrives when the final contract read model is updated.
// This is the PRIMARY trigger for ZPI's policy engine.
// ZPI uses this to:
//   - Run all enabled event-triggered policies against current state

type FinalContractUpdatedEvent struct {
	EventID       string    `json:"event_id"`
	TenantID      string    `json:"tenant_id"`
	IntentID      string    `json:"intent_id"`
	ContractID    string    `json:"contract_id"`
	CorridorID    string    `json:"corridor_id"`
	Provider      string    `json:"provider"`
	Status        string    `json:"status"` // current contract status
	Confidence    float64   `json:"confidence"`
	FinalityLevel string    `json:"finality_level"`
	UpdatedAt     time.Time `json:"updated_at"`
	TraceID       string    `json:"trace_id"`
}

// ── Event 6: from Service 6 ───────────────────────────────────────────────────
//
// Arrives when Service 6 finishes building an evidence pack.
// ZPI uses this to:
//   - Update the evidence_readiness_rate projection
//   - Mark this contract as "has evidence" (reduces compliance risk score)

type EvidencePackReadyEvent struct {
	EventID        string    `json:"event_id"`
	TenantID       string    `json:"tenant_id"`
	IntentID       string    `json:"intent_id"`
	ContractID     string    `json:"contract_id"`
	EvidencePackID string    `json:"evidence_pack_id"`
	MerkleRoot     string    `json:"merkle_root"` // cryptographic proof of evidence contents
	CreatedAt      time.Time `json:"created_at"`
	TraceID        string    `json:"trace_id"`
}

// ── Event 7: from any service's Dead Letter Queue ─────────────────────────────
//
// Arrives when any service fails to process a message after max retries.
// ZPI uses this to:
//   - Cluster failure reasons (which error codes keep appearing?)
//   - Suggest remediation (if reason = TIMEOUT → safe to retry)

type DLQEvent struct {
	EventID       string    `json:"event_id"`
	TenantID      string    `json:"tenant_id"`
	OriginalTopic string    `json:"original_topic"` // which topic failed
	ReasonCode    string    `json:"reason_code"`
	ErrorMessage  string    `json:"error_message"`
	AttemptCount  int       `json:"attempt_count"`
	FailedAt      time.Time `json:"failed_at"`
	TraceID       string    `json:"trace_id"`
}

// CorridorHealthTickEvent is a lightweight corridor heartbeat.
// Used by Service 7 to keep an operational "health status" projection per corridor.
type CorridorHealthTickEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	CorridorID string    `json:"corridor_id"`
	TickAt     time.Time `json:"tick_at"`
	TraceID    string    `json:"trace_id"`
}

// SLATimerTickEvent is a lightweight SLA timer heartbeat per corridor.
// Used by Service 7 to keep an operational SLA tick projection per corridor.
type SLATimerTickEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	CorridorID string    `json:"corridor_id"`
	TickAt     time.Time `json:"tick_at"`
	TraceID    string    `json:"trace_id"`
}
