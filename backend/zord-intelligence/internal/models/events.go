package models

// What is this file?
// These structs represent the Kafka events ZPI receives from other services.
// When a Kafka message arrives, consumer.go decodes the JSON bytes
// into one of these structs so the rest of the code can work with typed data.
//
// Rule: These structs are READ ONLY from ZPI's perspective.
// ZPI never creates these — it only receives them from other services.

import (
	"time"

	"github.com/shopspring/decimal"
)

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

// GRADE A (ATTACHMENT INTELLIGENCE MODE) EVENTS
// These 5 events are the new upstream inputs introduced by the pivoted spec.
// They come from Service 5B (settlement observations), Service 5C (attachment
// and variance decisions), and Service 6 governance decisions.
//
// WHY "GRADE A"?
// The pivoted spec defines two operating modes:
//   Grade A — Attachment Intelligence Mode (these events)
//             Customer gives: intents + settlement files
//             ZPI produces:   leakage, ambiguity, defensibility, RCA, pattern
//   Grade B — Full Finality / Control Mode (existing events above)
//             Customer gives: dispatch control + real-time outcome signals
//             ZPI produces:   all of Grade A + finality-grade intelligence
//
// ZPI now supports both. Grade A events are the market-entry wedge.
// =============================================================================

// ── NEW EVENT A: from Service 5B ─────────────────────────────────────────────
//
// Arrives when Service 5B parses a settlement file line and creates a
// canonical settlement observation.
//
// WHAT IS A SETTLEMENT OBSERVATION?
// When a PSP or bank sends you a settlement statement (CSV, Excel, SFTP file),
// each line says: "we paid X amount on date Y with reference Z."
// Service 5B reads that file and turns each line into this event.
//
// ZPI uses this to:
//   - Track how many settlement observations arrived vs intents sent
//   - Feed the leakage calculation (unmatched = no observation for an intent)
//   - Update statement match rate projections
//
// Kafka topic: canonical.settlement.created  ← Service 5B
// =============================================================================

// CanonicalSettlementCreatedEvent represents one parsed settlement observation
// from a bank or PSP settlement file.
type CanonicalSettlementCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"` // when this event was emitted

	// ── Settlement observation identity ──────────────────────────────────────
	SettlementID string `json:"settlement_id"` // ZPI-internal ID: "sobs_" + uuid
	BatchID      string `json:"batch_id"`      // which batch this settlement belongs to (empty if unknown)

	// ── Source information ────────────────────────────────────────────────────
	SourceType     string `json:"source_type"`     // "SFTP_FILE", "API_CALLBACK", "MANUAL_UPLOAD"
	SourceStrength string `json:"source_strength"` // "HIGH", "MEDIUM", "LOW" — how reliable is this source?
	// HIGH   = bank statement or PSP settlement API (authoritative)
	// MEDIUM = webhook callback (fast but sometimes unreliable)
	// LOW    = manually uploaded CSV (human error risk)

	SourceSystemID  string  `json:"source_system_id"` // identifies the specific PSP/bank/ERP
	ParseConfidence float64 `json:"parse_confidence"` // 0.0–1.0: how confident was the parser?
	// 1.0 = perfect parse, all fields found
	// 0.7 = some fields missing or ambiguous
	// < 0.5 = poor quality, likely to cause attachment issues

	// ── Financial details ─────────────────────────────────────────────────────
	// IMPORTANT: All money amounts stored as int64 in MINOR UNITS (paise, cents).
	// Never float64 for money. This matches the DB rule in Phase 1.
	SettledAmountMinor decimal.Decimal `json:"settled_amount_minor"` // amount in minor currency units
	Currency           string          `json:"currency"`             // "INR", "USD"
	SettlementDate     string          `json:"settlement_date"`      // "2026-04-08" — date on statement

	// ── Carrier / reference fields ────────────────────────────────────────────
	// "Carriers" are reference identifiers that allow ZPI to match (attach)
	// this settlement observation to the original payout intent.
	// The richer the carriers, the more accurate the attachment.
	UTR             string  `json:"utr"`              // Unique Transaction Reference (Indian banking)
	RRN             string  `json:"rrn"`              // Retrieval Reference Number
	BankRef         string  `json:"bank_ref"`         // bank's own reference number
	ProviderRef     string  `json:"provider_ref"`     // PSP reference (e.g. Razorpay payment ID)
	ClientRef       string  `json:"client_ref"`       // merchant's own reference (most reliable)
	CarrierRichness float64 `json:"carrier_richness"` // 0.0–1.0: fraction of carrier fields populated
	// 1.0 = all 5 carriers populated → easy to match
	// 0.2 = only 1 carrier → very hard to match, high ambiguity risk

	// ── Attachment readiness ──────────────────────────────────────────────────
	// Score computed by Service 5B using its internal carrier + parse logic.
	// ZPI classifies this into READY / PARTIAL / POOR using fixed thresholds.
	// Range: 0.0 (no viable carriers) → 1.0 (all carriers present, parser confident).
	AttachmentReadiness float64 `json:"attachment_readiness"` // 0.0–1.0 score from Service 5B

	// ── Status observation ────────────────────────────────────────────────────
	StatusObservation string `json:"status_observation"` // "SETTLED", "REVERSED", "PENDING", "UNKNOWN"
}

// ── NEW EVENT B: from Service 5C ─────────────────────────────────────────────
//
// Arrives when Service 5C makes an attachment decision — i.e., it has tried
// to match a settlement observation to a payout intent.
//
// WHAT IS AN ATTACHMENT DECISION?
// Service 5C has: one settlement observation (from 5B) and a set of candidate
// payout intents that could match it. It picks the best match (or says
// "I cannot decide — ambiguous").
//
// Decision types:
//   MATCH_EXACT       → one perfect match found (all carriers agree)
//   MATCH_HIGH        → one strong match (most carriers agree)
//   MATCH_AMBIGUOUS   → multiple possible matches, confidence is low
//   MATCH_UNRESOLVED  → no match found at all (unmatched intent or orphan settlement)
//   MATCH_DUPLICATE   → this settlement looks like a duplicate of another
//
// ZPI uses this to:
//   - Compute ambiguity counts and value-at-risk
//   - Feed the leakage calculation (MATCH_UNRESOLVED = potential leakage)
//   - Trigger policy evaluation for ambiguity-related policies
//
// Kafka topic: attachment.decision.created  ← Service 5C
// =============================================================================

// AttachmentDecisionCreatedEvent represents Service 5C's decision about
// which payout intent a settlement observation belongs to.
type AttachmentDecisionCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"`

	// ── Decision identity ─────────────────────────────────────────────────────
	DecisionID   string `json:"decision_id"`   // "adec_" + uuid — the decision's own ID
	SettlementID string `json:"settlement_id"` // which settlement observation was being attached
	IntentID     string `json:"intent_id"`     // which intent was selected (empty if UNRESOLVED)
	ContractID   string `json:"contract_id"`   // the contract associated with the intent (if found)
	CorridorID   string `json:"corridor_id"`   // which payment corridor this belongs to
	BatchID      string `json:"batch_id"`      // which batch this belongs to (if applicable)

	// ── Decision outcome ──────────────────────────────────────────────────────
	DecisionType string `json:"decision_type"` // one of the 5 types below:
	// "MATCH_EXACT"      — perfect match, all carriers agree
	// "MATCH_HIGH"       — strong match, most carriers agree
	// "MATCH_AMBIGUOUS"  — multiple candidates, cannot auto-confirm
	// "MATCH_UNRESOLVED" — no match found (leakage risk)
	// "MATCH_DUPLICATE"  — duplicate settlement detected

	// ── Confidence and ambiguity scores ──────────────────────────────────────
	ConfidenceScore float64 `json:"confidence_score"` // 0.0–1.0: how sure is Service 5C?
	// 1.0  = certain (MATCH_EXACT with all carriers matching)
	// 0.85 = strong (MATCH_HIGH)
	// 0.50 = uncertain (MATCH_AMBIGUOUS)
	// 0.0  = no match (MATCH_UNRESOLVED)

	AmbiguityScore float64 `json:"ambiguity_score"` // 0.0–1.0: how hard was this to resolve?
	// 0.0 = trivial (one obvious match)
	// 1.0 = maximum ambiguity (payroll batch: 500 employees, same amount)

	// ── Supporting evidence ────────────────────────────────────────────────────
	SupportingCarriers []string `json:"supporting_carriers"` // which carrier fields matched
	// e.g. ["utr", "client_ref"] or ["amount_only"] (weak)
	CandidateSetSize int `json:"candidate_set_size"` // how many intents were considered
	// 1 = trivial (only one candidate)
	// 50 = hard (payroll-like batch with many same-amount payouts)

	CandidateSetHash string `json:"candidate_set_hash"` // hash of the candidate set for audit
	// Stored so we can replay the decision without storing all candidate IDs

	// ── Financial details ─────────────────────────────────────────────────────
	SettledAmountMinor  decimal.Decimal `json:"settled_amount_minor"`  // amount from the settlement observation
	IntendedAmountMinor decimal.Decimal `json:"intended_amount_minor"` // amount from the matched intent (0 if unresolved)
	Currency            string          `json:"currency"`
}

// ── NEW EVENT C: from Service 5C ─────────────────────────────────────────────
//
// Arrives when Service 5C detects a variance between what was intended
// and what was settled.
//
// WHAT IS A VARIANCE RECORD?
// Even when a settlement IS attached (matched) to an intent, the amounts
// or dates might not match perfectly:
//   - Under-settlement: we expected ₹1000 but received ₹980 (TDS deducted)
//   - Over-settlement: we expected ₹1000 but received ₹1020 (fee reversal?)
//   - Value-date mismatch: settled on Apr 9 but we expected Apr 8
//   - Cross-period: intent raised in March, settled in April
//   - Deduction: PSP deducted a fee not agreed upon
//
// ZPI uses this to:
//   - Compute the leakage amount (under-settlement is direct money loss)
//   - Feed the reconciliation intelligence layer
//   - Trigger OPEN_OPS_INCIDENT for unexpected deductions
//
// Kafka topic: variance.record.created  ← Service 5C
// =============================================================================

// VarianceRecordCreatedEvent represents a financial mismatch between
// what was intended and what was actually settled.
type VarianceRecordCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"`

	// ── Variance identity ─────────────────────────────────────────────────────
	VarianceID   string `json:"variance_id"`   // "var_" + uuid
	DecisionID   string `json:"decision_id"`   // which attachment decision produced this variance
	IntentID     string `json:"intent_id"`     // the original payout intent
	SettlementID string `json:"settlement_id"` // the settlement observation
	CorridorID   string `json:"corridor_id"`
	BatchID      string `json:"batch_id"`

	// ── Variance type ─────────────────────────────────────────────────────────
	VarianceType string `json:"variance_type"` // one of:
	// "UNDER_SETTLEMENT"   — received less than intended
	// "OVER_SETTLEMENT"    — received more than intended
	// "VALUE_DATE_MISMATCH"— settled on wrong date
	// "CROSS_PERIOD"       — settlement crossed a financial period boundary
	// "DEDUCTION"          — PSP/bank deducted a fee or tax
	// "REVERSAL"           — settled but then reversed/returned

	// ── Financial values ──────────────────────────────────────────────────────
	// ALL amounts in minor currency units (paise, cents). Never float64.
	IntendedAmountMinor decimal.Decimal `json:"intended_amount_minor"` // what we expected
	SettledAmountMinor  decimal.Decimal `json:"settled_amount_minor"`  // what we actually received
	VarianceAmountMinor decimal.Decimal `json:"variance_amount_minor"` // intended - settled (negative = over)
	Currency            string          `json:"currency"`

	// ── Date mismatch ─────────────────────────────────────────────────────────
	ExpectedValueDate string `json:"expected_value_date"` // "2026-04-08"
	ActualValueDate   string `json:"actual_value_date"`   // "2026-04-09"
	CrossPeriodFlag   bool   `json:"cross_period_flag"`   // true if settlement crossed a month/quarter boundary

	// ── Evidence and deduction context ───────────────────────────────────────
	DeductionReason  string   `json:"deduction_reason"`   // e.g. "TDS_2PCT", "PSP_FEE", "" if not a deduction
	IsWhitelisted    bool     `json:"is_whitelisted"`     // true = this deduction was pre-agreed with the PSP
	EvidenceGapFlags []string `json:"evidence_gap_flags"` // fields missing from evidence pack
	// e.g. ["missing_utr", "no_bank_confirmation"]
}

// ── NEW EVENT D: from Service 5C ─────────────────────────────────────────────
//
// Arrives when Service 5C updates the aggregate status of an entire batch.
//
// WHAT IS A BATCH SUMMARY?
// A batch is a group of payouts submitted together (e.g. payroll for 500 employees).
// As individual payouts get attached and resolved, Service 5C periodically
// emits a summary of the whole batch's current state.
//
// ZPI uses this to:
//   - Update the batch_contracts table (Phase 1 schema)
//   - Compute batch-level ambiguity and defensibility scores
//   - Trigger REVIEW_AMBIGUOUS_BATCH policy if ambiguity is high
//   - Feed the Pattern intelligence layer
//
// Kafka topic: batch.summary.updated  ← Service 5C
// =============================================================================

// BatchSummaryUpdatedEvent represents the current aggregate state of a batch.
type BatchSummaryUpdatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"`

	// ── Batch identity ────────────────────────────────────────────────────────
	BatchID         string `json:"batch_id"`         // e.g. "PAYROLL-2026-04-01"
	SourceReference string `json:"source_reference"` // file path or API reference
	CorridorID      string `json:"corridor_id"`

	// ── Aggregate counts ─────────────────────────────────────────────────────
	TotalCount        int `json:"total_count"`         // total intents in the batch
	SuccessCount      int `json:"success_count"`       // fully settled, no variance
	FailedCount       int `json:"failed_count"`        // failed or reversed
	PendingCount      int `json:"pending_count"`       // not yet resolved
	ReversedCount     int `json:"reversed_count"`      // reversed after settlement
	PartialReconCount int `json:"partial_recon_count"` // attached but with variance

	// ── Aggregate money amounts (all in minor units) ──────────────────────────
	TotalIntendedAmountMinor  decimal.Decimal `json:"total_intended_amount_minor"`
	TotalConfirmedAmountMinor decimal.Decimal `json:"total_confirmed_amount_minor"`
	TotalVarianceMinor        decimal.Decimal `json:"total_variance_minor"` // positive = leakage

	// ── Intelligence scores ───────────────────────────────────────────────────
	AmbiguityScore float64 `json:"ambiguity_score"` // 0.0–1.0 computed by Service 5C
	// High ambiguity = many same-amount payouts, weak carrier references

	BatchFinalityStatus string `json:"batch_finality_status"` // "PROCESSING", "FULLY_SETTLED", etc.
	// matches batch_contracts.batch_finality_status values from Phase 1 schema
}

// ── NEW EVENT E: from Service 6 ──────────────────────────────────────────────
//
// Arrives when Service 6 creates or updates a governance decision for a payment.
//
// WHAT IS A GOVERNANCE DECISION?
// Every payment that goes through Zord must have a governance record — a
// signed statement that the payment was reviewed, approved, and complies with
// policies (KYC, AML, risk limits, regulatory requirements).
//
// Service 6 embeds governance decisions inside Evidence Packs.
// This event tells ZPI that a governance decision now exists for a payment,
// so ZPI can update its defensibility score for that payment.
//
// WHY DOES ZPI NEED TO KNOW?
// The new spec says "governance decision coverage" is a MUST-HAVE for
// the Defensibility intelligence layer (Section 10.3).
// Without knowing which payments have governance coverage, ZPI cannot
// accurately compute "audit-ready %" or defensibility tiers.
//
// Kafka topic: governance.decision.created  ← Service 6
// =============================================================================

// GovernanceDecisionCreatedEvent represents a governance decision
// attached to a payout intent by Service 6.
type GovernanceDecisionCreatedEvent struct {
	EventID    string    `json:"event_id"`
	TenantID   string    `json:"tenant_id"`
	TraceID    string    `json:"trace_id"`
	OccurredAt time.Time `json:"occurred_at"`

	// ── Governance decision identity ──────────────────────────────────────────
	GovernanceDecisionID string `json:"governance_decision_id"` // "gdec_" + uuid
	IntentID             string `json:"intent_id"`              // which payout this covers
	ContractID           string `json:"contract_id"`
	EvidencePackID       string `json:"evidence_pack_id"` // which evidence pack contains this decision

	// ── Decision outcome ──────────────────────────────────────────────────────
	DecisionOutcome string `json:"decision_outcome"` // "APPROVED", "REJECTED", "ESCALATED", "PENDING"

	// ── Coverage details ──────────────────────────────────────────────────────
	// These flags tell ZPI which governance checks were performed.
	// Used to compute the defensibility score in Section 10.3:
	//   pack exists? +20
	//   governance decision present? +15
	//   ... etc.
	KYCChecked       bool `json:"kyc_checked"`       // KYC verification was performed
	AMLChecked       bool `json:"aml_checked"`       // AML screening was performed
	RiskChecked      bool `json:"risk_checked"`      // risk limit check was performed
	PolicyCompliant  bool `json:"policy_compliant"`  // complies with tenant's internal policies
	ReplayEquivalent bool `json:"replay_equivalent"` // evidence is sufficient to replay the decision

	// ── Authorisation context ─────────────────────────────────────────────────
	AuthorityLevel string `json:"authority_level"` // "SYSTEM_AUTO", "RULE_BASED", "HUMAN_REVIEW"
	// SYSTEM_AUTO  = automated system decision (lower evidential weight in disputes)
	// RULE_BASED   = triggered by a configured policy (medium weight)
	// HUMAN_REVIEW = a human reviewed and approved (highest evidential weight)

	DecidedAt time.Time `json:"decided_at"` // when the governance decision was made
}
