package services

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT SCORING ENGINE
//
// Deterministic, versioned scoring for intent-to-settlement candidate ranking.
// Every score component is explicit and logged in score_breakdown_json so that
// Service 6 can prove it and Service 7 can explain it.
//
// Ruleset version: "5c-v1"
// ─────────────────────────────────────────────────────────────────────────────

import (
	"math"
	"time"

	"github.com/shopspring/decimal"
	"zord-outcome-engine/models"
)

const (
	RulesetVersion = "5c-v1"

	// ── Layer 1: Exact carrier scores ─────────────────────────────────────
	ScoreZordSignatureExact   = 100.0
	ScoreClientPayoutRefExact = 90.0
	ScoreBatchRowExact        = 85.0
	ScoreProviderRefExact     = 85.0
	ScoreBankRefExact         = 85.0

	// ── Layer 2: Composite / soft scores ──────────────────────────────────
	ScoreBeneficiaryFpMatch = 50.0
	ScoreAmountMatch        = 30.0
	ScoreCurrencyMatch      = 10.0
	ScoreTimeWindowMatch    = 20.0
	ScoreBatchFamilyMatch   = 15.0
	ScoreSourceSystemMatch  = 10.0

	// ── Modifiers ─────────────────────────────────────────────────────────
	PenaltyWeakParseConf     = -20.0 // parse_confidence < 0.6
	PenaltyLowSourceStrength = -15.0 // source_strength_class == INTERNAL_EXPORT
	PenaltyConflictingRefs   = -40.0 // bank/provider refs present but don't match

	// ── Ambiguity threshold ───────────────────────────────────────────────
	// If top two candidates are within this margin the result is AMBIGUOUS.
	DefaultAmbiguityMargin = 15.0

	// ── Time window ───────────────────────────────────────────────────────
	// Settlement observations within this window of intended_execution_at
	// qualify for the time-window bonus.
	DefaultTimeWindowHours = 72
)

// ScoreBreakdown is persisted as score_breakdown_json for full auditability.
type ScoreBreakdown struct {
	RulesetVersion         string  `json:"ruleset_version"`
	ZordSignatureScore     float64 `json:"zord_signature_score"`
	ClientRefScore         float64 `json:"client_ref_score"`
	ProviderRefScore       float64 `json:"provider_ref_score"`
	BankRefScore           float64 `json:"bank_ref_score"`
	BeneficiaryMatchScore  float64 `json:"beneficiary_match_score"`
	AmountMatchScore       float64 `json:"amount_match_score"`
	CurrencyMatchScore     float64 `json:"currency_match_score"`
	TimeWindowScore        float64 `json:"time_window_score"`
	BatchMatchScore        float64 `json:"batch_match_score"`
	SourceSystemScore      float64 `json:"source_system_score"`
	ParseConfModifier      float64 `json:"parse_conf_modifier"`
	SourceStrengthModifier float64 `json:"source_strength_modifier"`
	ConflictingRefPenalty  float64 `json:"conflicting_ref_penalty"`
	TotalScore             float64 `json:"total_score"`
}

// CandidateScore is the intermediate result returned by ScoreCandidate.
type CandidateScore struct {
	IntentID         interface{} // uuid.UUID
	Breakdown        ScoreBreakdown
	Total            float64
	ConfidenceBucket string

	// Match flags (written directly into AttachmentCandidate)
	ExactRefMatch      bool
	ClientRefMatch     bool
	ProviderRefMatch   bool
	BankRefMatch       bool
	BatchMatch         bool
	BeneficiaryFpMatch bool
	AmountMatch        bool
	CurrencyMatch      bool
	TimeWindowMatch    bool
	SourceSystemMatch  bool
	ZordSignatureMatch bool
	CompositeMatch     bool
	// ParseConfPenalised is set when obs.ParseConfidence < 0.6.
	// Used by classifyConfidence to prevent low-trust observations
	// from reaching the HIGH bucket regardless of composite score.
	ParseConfPenalised bool
}

// ScoreCandidate evaluates one (settlement observation, intent) pair and returns
// a fully populated CandidateScore. The function is pure — no DB calls.
func ScoreCandidate(
	obs models.CanonicalSettlementObservation,
	intent models.CanonicalIntent,
	profile *models.AttachmentRuleProfile,
) CandidateScore {
	bd := ScoreBreakdown{RulesetVersion: RulesetVersion}
	cs := CandidateScore{}

	// ── LAYER 1: Exact carrier matches ────────────────────────────────────

	// Zord prepare-and-sign signature (strongest possible carrier)
	// if intent.ZordSignatureCarrier != nil && obs.ClientReferenceCandidate != nil &&
	// 	*intent.ZordSignatureCarrier == *obs.ClientReferenceCandidate {
	// 	bd.ZordSignatureScore = ScoreZordSignatureExact
	// 	cs.ZordSignatureMatch = true
	// 	cs.ExactRefMatch = true
	// }

	// Client payout reference
	if intent.ClientPayoutRef != nil && obs.ClientReferenceCandidate != nil &&
		*intent.ClientPayoutRef == *obs.ClientReferenceCandidate {
		bd.ClientRefScore = ScoreClientPayoutRefExact
		cs.ClientRefMatch = true
		cs.ExactRefMatch = true
	}

	// Provider reference
	if intent.ProviderHint != nil && obs.ProviderReference != nil &&
		*intent.ProviderHint == *obs.ProviderReference {
		bd.ProviderRefScore = ScoreProviderRefExact
		cs.ProviderRefMatch = true
		cs.ExactRefMatch = true
	} else if obs.ProviderReference != nil && intent.ProviderHint != nil &&
		*obs.ProviderReference != *intent.ProviderHint {
		// Conflicting provider refs are a strong negative signal.
		bd.ConflictingRefPenalty += PenaltyConflictingRefs / 2
	}

	// Bank reference (UTR/RRN) — strongest finality carrier after Zord sig
	// We can only match bank ref if the intent carried one (e.g. via prepare-and-sign).
	// Most intents won't have this until Stage 2 of the trust ladder; absence is neutral.

	// Batch reference
	if intent.ClientBatchRef != nil && obs.BatchReference != nil &&
		*intent.ClientBatchRef == *obs.BatchReference {
		bd.BatchMatchScore = ScoreBatchRowExact
		cs.BatchMatch = true
	}

	// ── LAYER 2: Composite / soft matching ───────────────────────────────

	// Beneficiary fingerprint
	if obs.BeneficiaryFingerprint == intent.BeneficiaryFingerprint &&
		obs.BeneficiaryFingerprint != "" {
		bd.BeneficiaryMatchScore = ScoreBeneficiaryFpMatch
		cs.BeneficiaryFpMatch = true
	}

	// Amount match:
	// - Primary check uses observed row amount.
	// - If settled_amount is present, accept that as an alternate match value.
	// This avoids false negatives when providers emit both gross and settled values.
	obsAmount := obs.Amount
	amountTolerance := decimal.Zero
	if profile != nil && profile.AmountTolerancePolicyJSON != nil {
		// amountTolerance = ... (unmarshal from JSON if needed)
		amountTolerance = decimal.Zero
	}

	primaryDiff := obsAmount.Sub(intent.Amount).Abs()
	settledDiffMatch := false
	if obs.SettledAmount != nil {
		settledDiff := obs.SettledAmount.Sub(intent.Amount).Abs()
		settledDiffMatch = settledDiff.LessThanOrEqual(amountTolerance)
	}
	if primaryDiff.LessThanOrEqual(amountTolerance) || settledDiffMatch {
		bd.AmountMatchScore = ScoreAmountMatch
		cs.AmountMatch = true
	}

	// Currency
	if obs.CurrencyCode == intent.CurrencyCode && obs.CurrencyCode != "" {
		bd.CurrencyMatchScore = ScoreCurrencyMatch
		cs.CurrencyMatch = true
	}

	// Time window
	if intent.IntendedExecutionAt != nil {
		windowHours := DefaultTimeWindowHours
		diff := obs.ObservationTimestamp.Sub(*intent.IntendedExecutionAt)
		if math.Abs(diff.Hours()) <= float64(windowHours) {
			bd.TimeWindowScore = ScoreTimeWindowMatch
			cs.TimeWindowMatch = true
		}
	}

	// Source system hint
	if intent.ProviderHint != nil && *intent.ProviderHint == obs.SourceSystem {
		bd.SourceSystemScore = ScoreSourceSystemMatch
		cs.SourceSystemMatch = true
	}

	// ── MODIFIERS ─────────────────────────────────────────────────────────

	// Low parse confidence is a trust penalty.
	// Also flag the candidate so classifyConfidence can gate the HIGH bucket.
	if obs.ParseConfidence < 0.6 {
		bd.ParseConfModifier = PenaltyWeakParseConf
		cs.ParseConfPenalised = true
	}

	// Internal exports carry less finality weight.
	if obs.SourceStrengthClass == "INTERNAL_EXPORT" {
		bd.SourceStrengthModifier = PenaltyLowSourceStrength
	}

	// ── TOTAL SCORE ───────────────────────────────────────────────────────

	total := bd.ZordSignatureScore +
		bd.ClientRefScore +
		bd.ProviderRefScore +
		bd.BankRefScore +
		bd.BeneficiaryMatchScore +
		bd.AmountMatchScore +
		bd.CurrencyMatchScore +
		bd.TimeWindowScore +
		bd.BatchMatchScore +
		bd.SourceSystemScore +
		bd.ParseConfModifier +
		bd.SourceStrengthModifier +
		bd.ConflictingRefPenalty

	if total < 0 {
		total = 0
	}
	bd.TotalScore = total
	cs.Breakdown = bd
	cs.Total = total

	// Composite: beneficiary + amount + currency qualifies.
	cs.CompositeMatch = cs.BeneficiaryFpMatch && cs.AmountMatch && cs.CurrencyMatch

	// ── CONFIDENCE BUCKET ─────────────────────────────────────────────────
	cs.ConfidenceBucket = classifyConfidence(cs)

	return cs
}

func classifyConfidence(cs CandidateScore) string {
	switch {
	case cs.ExactRefMatch && cs.AmountMatch && cs.CurrencyMatch:
		return models.ConfidenceExact
	case cs.Total >= 120 && !cs.ParseConfPenalised:
		return models.ConfidenceHigh
	case cs.Total >= 70:
		return models.ConfidenceMedium
	default:
		return models.ConfidenceLow
	}
}

// SelectDecisionType converts a ranked candidate list into a formal decision type.
// This is the most important function in Service 5C — it must never auto-finalise
// an ambiguous match.
func SelectDecisionType(
	ranked []CandidateScore,
	profile *models.AttachmentRuleProfile,
) (decisionType string, reasonCode string) {

	ambiguityMargin := DefaultAmbiguityMargin
	if profile != nil && profile.AmbiguityMarginThreshold > 0 {
		ambiguityMargin = profile.AmbiguityMarginThreshold * 100 // stored 0-1, used as raw points
	}

	switch {
	case len(ranked) == 0:
		return models.DecisionMatchUnresolved, "NO_CANDIDATES"

	case len(ranked) == 1:
		cs := ranked[0]
		switch cs.ConfidenceBucket {
		case models.ConfidenceExact:
			return models.DecisionMatchExact, "SINGLE_EXACT_CARRIER"
		case models.ConfidenceHigh:
			return models.DecisionMatchHighConfidence, "SINGLE_HIGH_CONFIDENCE_COMPOSITE"
		case models.ConfidenceMedium:
			return models.DecisionMatchAmbiguous, "SINGLE_MEDIUM_CANDIDATE"
		default:
			return models.DecisionMatchUnresolved, "SINGLE_LOW_CONFIDENCE"
		}

	default:
		top := ranked[0]
		runnerUp := ranked[1]

		// Conflicting strong carriers (two candidates with exact refs) = CONFLICTED.
		if top.ExactRefMatch && runnerUp.ExactRefMatch {
			return models.DecisionMatchConflicted, "CONFLICTING_EXACT_CARRIERS"
		}

		// If top two candidates are within the ambiguity margin → AMBIGUOUS.
		margin := top.Total - runnerUp.Total
		if margin <= ambiguityMargin {
			return models.DecisionMatchAmbiguous, "CANDIDATES_WITHIN_AMBIGUITY_MARGIN"
		}

		// Dominant candidate exists.
		switch top.ConfidenceBucket {
		case models.ConfidenceExact:
			return models.DecisionMatchExact, "DOMINANT_EXACT_CARRIER"
		case models.ConfidenceHigh:
			return models.DecisionMatchHighConfidence, "DOMINANT_HIGH_CONFIDENCE"
		default:
			return models.DecisionMatchAmbiguous, "WEAK_DOMINANT_CANDIDATE"
		}
	}
}

// ComputeAmbiguityScore returns a normalised 0-1 ambiguity score.
// Higher = more uncertain. Feeds Service 7 ambiguity intelligence.
func ComputeAmbiguityScore(ranked []CandidateScore, decisionType string) float64 {
	switch decisionType {
	case models.DecisionMatchExact:
		return 0.02
	case models.DecisionMatchHighConfidence:
		if len(ranked) > 1 {
			margin := ranked[0].Total - ranked[1].Total
			return math.Max(0.05, 1-math.Min(margin/100, 1))
		}
		return 0.10
	case models.DecisionMatchAmbiguous:
		return 0.70
	case models.DecisionMatchConflicted:
		return 0.90
	default: // UNRESOLVED
		return 1.0
	}
}

// ComputeConfidenceScore returns a 0-1 confidence for the winning candidate.
func ComputeConfidenceScore(top CandidateScore, decisionType string) float64 {
	switch decisionType {
	case models.DecisionMatchExact:
		return 0.99
	case models.DecisionMatchHighConfidence:
		return math.Min(top.Total/150.0, 0.94)
	case models.DecisionMatchAmbiguous:
		return 0.50
	case models.DecisionMatchConflicted:
		return 0.30
	default:
		return 0.0
	}
}

// abs64 is a simple absolute value for int64.
func abs64(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}

// ─────────────────────────────────────────────────────────────────────────────
// VARIANCE COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

// VarianceInputs bundles the fields needed for variance computation to keep the
// function signature stable as the model evolves.
type VarianceInputs struct {
	Intent      models.CanonicalIntent
	Observation models.CanonicalSettlementObservation
}

// ComputeVariance calculates the formal difference between intent and observation.
// Returned severity and reason codes feed Service 7 intelligence.
func ComputeVariance(in VarianceInputs) (amountVariance decimal.Decimal, severity string, flags map[string]bool, reasons []string) {
	flags = make(map[string]bool)
	reasons = []string{}

	// ── Amount variance ───────────────────────────────────────────────────
	obsAmount := in.Observation.Amount
	amountVariance = in.Intent.Amount.Sub(obsAmount)
	if in.Observation.SettledAmount != nil {
		settledVariance := in.Intent.Amount.Sub(*in.Observation.SettledAmount)
		// Use the closer amount signal to avoid false variance when
		// providers emit both gross amount and settled/net amount.
		if settledVariance.Abs().LessThan(amountVariance.Abs()) {
			amountVariance = settledVariance
		}
	}
	if !amountVariance.IsZero() {
		reasons = append(reasons, "AMOUNT_MISMATCH")
	}

	// ── Currency ─────────────────────────────────────────────────────────
	flags["currency_match"] = in.Intent.CurrencyCode == in.Observation.CurrencyCode
	if !flags["currency_match"] {
		reasons = append(reasons, "CURRENCY_MISMATCH")
	}

	// ── Value-date mismatch ───────────────────────────────────────────────
	// Core finance pain point flagged explicitly in the spec.
	if in.Intent.IntendedExecutionAt != nil && in.Observation.ValueDate != nil {
		intentDay := in.Intent.IntendedExecutionAt.Truncate(24 * time.Hour)
		settleDay := in.Observation.ValueDate.Truncate(24 * time.Hour)
		delayDays := int(settleDay.Sub(intentDay).Hours() / 24)

		flags["value_date_mismatch"] = delayDays != 0
		flags["cross_period"] = isCrossPeriod(intentDay, settleDay)

		if delayDays != 0 {
			reasons = append(reasons, "VALUE_DATE_MISMATCH")
		}
		if flags["cross_period"] {
			reasons = append(reasons, "CROSS_PERIOD_SETTLEMENT")
		}
	}

	// ── Missing reference flags ───────────────────────────────────────────
	flags["provider_ref_missing"] = in.Observation.ProviderReference == nil
	flags["bank_ref_missing"] = in.Observation.BankReference == nil

	if flags["provider_ref_missing"] {
		reasons = append(reasons, "PROVIDER_REF_MISSING")
	}
	if flags["bank_ref_missing"] {
		reasons = append(reasons, "BANK_REF_MISSING")
	}

	// Evidence gap: no strong reference at all.
	flags["evidence_gap"] = flags["provider_ref_missing"] && flags["bank_ref_missing"]
	if flags["evidence_gap"] {
		reasons = append(reasons, "EVIDENCE_GAP")
	}

	// ── Status variance ───────────────────────────────────────────────────
	// Settled status not matching expected (e.g. intent says PENDING but obs says FAILED)
	flags["status_variance"] = in.Observation.SettlementStatus == "FAILED" ||
		in.Observation.SettlementStatus == "REVERSED" ||
		in.Observation.SettlementStatus == "RETURNED"
	if flags["status_variance"] {
		reasons = append(reasons, "UNEXPECTED_SETTLEMENT_STATUS")
	}

	// ── Severity classification ───────────────────────────────────────────
	severity = classifyVarianceSeverity(amountVariance, in.Intent.Amount, flags)
	return
}

func classifyVarianceSeverity(variance decimal.Decimal, intendedAmount decimal.Decimal, flags map[string]bool) string {
	if flags["status_variance"] && variance.Equal(intendedAmount) {
		// Settlement status is failed and full amount is missing — critical.
		return models.VarianceSeverityCritical
	}
	if flags["evidence_gap"] {
		return models.VarianceSeverityHigh
	}
	if !variance.IsZero() {
		div := intendedAmount
		if div.IsZero() {
			div = decimal.NewFromInt(1)
		}
		pct, _ := variance.Abs().Div(div).Mul(decimal.NewFromInt(100)).Float64()
		switch {
		case pct > 10:
			return models.VarianceSeverityHigh
		case pct > 1:
			return models.VarianceSeverityMedium
		default:
			return models.VarianceSeverityLow
		}
	}
	if flags["cross_period"] || flags["value_date_mismatch"] {
		return models.VarianceSeverityMedium
	}
	if flags["provider_ref_missing"] || flags["bank_ref_missing"] {
		return models.VarianceSeverityLow
	}
	return models.VarianceSeverityInfo
}

// isCrossPeriod returns true when intent and settlement fall in different calendar months.
func isCrossPeriod(intentDay, settleDay time.Time) bool {
	return intentDay.Month() != settleDay.Month() || intentDay.Year() != settleDay.Year()
}
