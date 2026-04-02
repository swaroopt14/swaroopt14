package models

import "time"

// ProjectionState represents one row in the projection_state table.
//
// A projection is a computed KPI number derived from Kafka events.
// Examples:
//   - "razorpay.UPI success rate in last 24h = 97%"
//   - "cashfree.IMPS finality p95 in last 24h = 8 minutes"
//   - "tenant tnt_A evidence readiness = 91%"
//
// ZPI computes these numbers continuously as events arrive from Kafka.
// The frontend reads them via GET /v1/intelligence/kpis

type ProjectionState struct {
	ID                int64     `json:"id" db:"id"`
	TenantID          string    `json:"tenant_id" db:"tenant_id"`
	ProjectionKey     string    `json:"projection_key" db:"projection_key"`
	WindowStart       time.Time `json:"window_start" db:"window_start"`
	WindowEnd         time.Time `json:"window_end" db:"window_end"`
	ValueJSON         string    `json:"value_json" db:"value_json"`
	ComputedAt        time.Time `json:"computed_at" db:"computed_at"`
	ProjectionVersion int       `json:"projection_version" db:"projection_version"`
}

// ── Projection Value Types ────────────────────────────────────────────────────
// These are the shapes stored inside ValueJSON above.
// projection_service.go marshals these to JSON before saving.
// kpi_handler.go can unmarshal them to send structured data to frontend.

// SuccessRateValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.success_rate.razorpay_UPI"
type SuccessRateValue struct {
	Rate         float64   `json:"rate"`          // 0.0 to 1.0 e.g. 0.97
	SettledCount int       `json:"settled_count"` // how many SETTLED
	TotalCount   int       `json:"total_count"`   // how many total
	UpdatedAt    time.Time `json:"updated_at"`
}

// FinalityLatencyValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.finality_p95.razorpay_UPI"
type FinalityLatencyValue struct {
	P50Seconds float64   `json:"p50_seconds"` // median time to finality
	P95Seconds float64   `json:"p95_seconds"` // 95th percentile — the SLA number
	Count      int       `json:"count"`       // how many data points
	UpdatedAt  time.Time `json:"updated_at"`
}

// EvidenceReadinessValue is stored in ProjectionState.ValueJSON
// for projection_key "tenant.evidence_readiness"
type EvidenceReadinessValue struct {
	Rate         float64   `json:"rate"`          // 0.0 to 1.0
	WithEvidence int       `json:"with_evidence"` // contracts that have evidence packs
	TotalSettled int       `json:"total_settled"` // total settled contracts
	UpdatedAt    time.Time `json:"updated_at"`
}

// FailureTaxonomyValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.failure_taxonomy.razorpay_UPI"
type FailureTaxonomyValue struct {
	TopReasons []ReasonCount `json:"top_reasons"` // sorted by count, top 5
	TotalFails int           `json:"total_fails"`
	UpdatedAt  time.Time     `json:"updated_at"`
}

// ReasonCount is one entry inside FailureTaxonomyValue.TopReasons
type ReasonCount struct {
	ReasonCode string  `json:"reason_code"` // e.g. "INSUFFICIENT_FUNDS"
	Count      int     `json:"count"`
	Rate       float64 `json:"rate"` // count / total_fails
}

// PendingBacklogValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.pending_backlog.razorpay_UPI"
type PendingBacklogValue struct {
	TotalPending  int       `json:"total_pending"`
	Bucket0to10m  int       `json:"bucket_0_10m"`   // pending 0-10 minutes
	Bucket10to60m int       `json:"bucket_10_60m"`  // pending 10-60 minutes
	Bucket1to6h   int       `json:"bucket_1_6h"`    // pending 1-6 hours
	Bucket6hPlus  int       `json:"bucket_6h_plus"` // pending 6+ hours (critical)
	UpdatedAt     time.Time `json:"updated_at"`
}

// RetryRecoveryRateValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.retry_recovery_rate.razorpay_UPI"
//
// Tracks how well retries rescue failed payouts per corridor.
// Data source: DispatchAttemptCreatedEvent (attempt_no > 1 = retry)
//              FinalityCertIssuedEvent (final_state = SETTLED after retry = recovered)
//
// Example:
//   corridor razorpay.UPI today:
//   - total_attempts: 1200 dispatches
//   - retry_attempts: 80 (attempt_no > 1)
//   - recovered:      55 (retried AND reached SETTLED)
//   - recovery_rate:  0.6875 (55/80)
type RetryRecoveryRateValue struct {
	TotalAttempts  int       `json:"total_attempts"`  // all dispatch attempts (including first)
	RetryAttempts  int       `json:"retry_attempts"`  // dispatches with attempt_no > 1
	Recovered      int       `json:"recovered"`       // retried intents that reached SETTLED
	RecoveryRate   float64   `json:"recovery_rate"`   // recovered / retry_attempts (0 if no retries)
	UpdatedAt      time.Time `json:"updated_at"`
}

// StatementMatchRateValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.statement_match_rate.razorpay_UPI"
//
// Tracks what % of settled payouts appear in the bank/PSP settlement statement.
// Requires Service 5 to emit StatementMatchEvent (new Kafka topic).
//
// A low match rate is a finance alarm: payouts are "settled" per signals
// but the money isn't confirmed in the statement → potential leakage or
// delay in settlement → reconciliation exceptions pile up.
//
// Example:
//   corridor razorpay.UPI today:
//   - total_settled:      1000 payouts reached SETTLED state
//   - matched:             970 found in statement
//   - unmatched:            30 NOT in statement after 24h
//   - match_rate:          0.97
//   - avg_match_age_secs: 1200 (avg delay between finality and statement appearance)
type StatementMatchRateValue struct {
	TotalSettled      int       `json:"total_settled"`       // payouts that reached SETTLED
	Matched           int       `json:"matched"`             // found in settlement statement
	Unmatched         int       `json:"unmatched"`           // NOT found after 24h
	MatchRate         float64   `json:"match_rate"`          // matched / total_settled
	AvgMatchAgeSecs   float64   `json:"avg_match_age_secs"`  // avg aged_seconds across MATCHED events
	TotalMatchAgeSecs int64     `json:"total_match_age_secs"` // running sum for incremental avg
	UpdatedAt         time.Time `json:"updated_at"`
}

// ProviderRefMissingRateValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.provider_ref_missing_rate.razorpay_UPI"
//
// Tracks what % of finalized payouts are missing a provider reference
// (UTR / RRN / BankRef). A missing ref means:
//   - Cannot trace the money end-to-end
//   - Disputes become very hard to resolve
//   - Evidence packs are weaker
//
// Data source: FinalityCertIssuedEvent.HasProviderRef (new field from Service 5)
//
// Example:
//   corridor cashfree.IMPS today:
//   - total_finalized:   500
//   - missing_ref:        45 (has_provider_ref = false)
//   - with_ref:          455
//   - missing_rate:      0.09  ← 9% of payouts have no traceable bank reference
type ProviderRefMissingRateValue struct {
	TotalFinalized int       `json:"total_finalized"` // all finalized (any final_state)
	MissingRef     int       `json:"missing_ref"`     // has_provider_ref = false
	WithRef        int       `json:"with_ref"`        // has_provider_ref = true
	MissingRate    float64   `json:"missing_rate"`    // missing_ref / total_finalized
	UpdatedAt      time.Time `json:"updated_at"`
}

// ConflictRateInFusionValue is stored in ProjectionState.ValueJSON
// for projection_key like "corridor.conflict_rate_in_fusion.razorpay_UPI"
//
// Tracks how often Outcome Fusion encounters conflicting signals when
// building finality for this corridor. High conflict rate means:
//   - PSP signals are unreliable / inconsistent
//   - More ops investigation needed per payout
//   - Higher risk of wrong finality decision
//
// Data source: FinalityCertIssuedEvent.ConflictCount + ConflictTypes (new fields)
//
// ConflictTypeBreakdown lets ops see WHICH conflict types dominate,
// e.g. "webhook_vs_poll_mismatch" vs "amount_mismatch"
//
// Example:
//   corridor razorpay.UPI today:
//   - total_finalized:   1000
//   - with_conflicts:      87 (conflict_count > 0)
//   - conflict_rate:      0.087
//   - total_conflicts:    95  (sum of all conflict_count values — can be > with_conflicts)
//   - conflict_type_breakdown: {"webhook_vs_poll_mismatch": 50, "amount_mismatch": 37}
type ConflictRateInFusionValue struct {
	TotalFinalized        int            `json:"total_finalized"`         // all finalized certs
	WithConflicts         int            `json:"with_conflicts"`          // certs that had conflict_count > 0
	ConflictRate          float64        `json:"conflict_rate"`           // with_conflicts / total_finalized
	TotalConflicts        int            `json:"total_conflicts"`         // sum of all conflict_count values
	ConflictTypeBreakdown map[string]int `json:"conflict_type_breakdown"` // per-type counts
	UpdatedAt             time.Time      `json:"updated_at"`
}

// SLABreachRateValue is stored in ProjectionState.ValueJSON
// for projection_key "tenant.sla_breach_rate"
//
// Tracks SLA compliance per tenant per day.
// An SLA timer is "breached" when:
//   1. Timer reaches its deadline (created_at + SLA_DURATION)
//   2. But payout is still PENDING (not SETTLED/FAILED/REVERSED)
//   3. We say "the SLA was breached"
//
// Example:
//   tenant_id "tnt_A" on 2024-01-15:
//   - total_processed: 1000 intents that reached finality
//   - breached: 45 (exceeded their SLA deadline)
//   - on_time: 955 (settled before deadline)
//   - breach_rate: 0.045 (45/1000)
//   - avg_breach_seconds: 1200 (average 20 minutes late)
type SLABreachRateValue struct {
	TotalProcessed     int       `json:"total_processed"`      // intents finalized in window
	Breached           int       `json:"breached"`             // exceeded SLA
	OnTime             int       `json:"on_time"`              // met SLA
	BreachRate         float64   `json:"breach_rate"`          // breached / total_processed
	AvgBreachSeconds   float64   `json:"avg_breach_seconds"`   // average late time
	TotalBreachSeconds int64     `json:"total_breach_seconds"` // running sum (for incremental avg)
	UpdatedAt          time.Time `json:"updated_at"`
}
