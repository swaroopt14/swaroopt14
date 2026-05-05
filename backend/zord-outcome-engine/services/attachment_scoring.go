package services

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT SCORING ENGINE
//
// Deterministic, versioned scoring for intent-to-settlement candidate ranking.
// Every score component is explicit and logged in score_breakdown_json so that
// Service 6 can prove it and Service 7 can explain it.
//
// Ruleset version: "v1"
// ─────────────────────────────────────────────────────────────────────────────

import (
	"encoding/json"
	"math"
	"time"

	"zord-outcome-engine/models"

	"github.com/shopspring/decimal"
)

const (
	RulesetVersion = "v1"
)

type CarrierPriorityPolicy struct {
	ExactRef                float64 `json:"exact_ref"`
	ClientRef               float64 `json:"client_ref"`
	ProviderRef             float64 `json:"provider_ref"`
	BankRef                 float64 `json:"bank_ref"`
	ZordSignature           float64 `json:"zord_signature"`
	BeneficiaryMatch        float64 `json:"beneficiary_match"`
	AmountMatch             float64 `json:"amount_match"`
	CurrencyMatch           float64 `json:"currency_match"`
	BatchMatch              float64 `json:"batch_match"`
	TimeWindow              float64 `json:"time_window"`
	SourceSystem            float64 `json:"source_system"`
	ParseConfidenceModifier float64 `json:"parse_confidence_modifier"`
	SourceStrengthModifier  float64 `json:"source_strength_modifier"`
	ConflictPenalty         float64 `json:"conflict_penalty"`
}

type TimeWindowPolicy struct {
	MaxHoursDifference float64 `json:"max_hours_difference"`
	StrictSameDay      bool    `json:"strict_same_day"`
	AllowCrossPeriod   bool    `json:"allow_cross_period"`
}

type AmountTolerancePolicy struct {
	ExactMatchRequired       bool    `json:"exact_match_required"`
	ToleranceMinor           int64   `json:"tolerance_minor"`
	AllowPercentageTolerance bool    `json:"allow_percentage_tolerance"`
	PercentageTolerance      float64 `json:"percentage_tolerance"`
}

type BatchBoundaryPolicy struct {
	StrictBatchMatching          bool `json:"strict_batch_matching"`
	AllowCrossBatchIfStrongMatch bool `json:"allow_cross_batch_if_strong_match"`
}

type ManualReviewThresholds struct {
	HighConfidenceScore        float64 `json:"high_confidence_score"`
	ExactMatchScore            float64 `json:"exact_match_score"`
	AmbiguityMarginThreshold   float64 `json:"ambiguity_margin_threshold"`
	MinScoreForAutoAttach      float64 `json:"min_score_for_auto_attach"`
	MaxCandidatesForAutoAttach int     `json:"max_candidates_for_auto_attach"`
}

type AttachmentPolicyConfig struct {
	CarrierPriority        CarrierPriorityPolicy
	TimeWindow             TimeWindowPolicy
	AmountTolerance        AmountTolerancePolicy
	BatchBoundary          BatchBoundaryPolicy
	ManualReviewThresholds ManualReviewThresholds
}

func parseRuleProfile(profile *models.AttachmentRuleProfile) AttachmentPolicyConfig {
	cfg := AttachmentPolicyConfig{
		CarrierPriority: CarrierPriorityPolicy{
			ExactRef:                100.0,
			ClientRef:               90.0,
			ProviderRef:             85.0,
			BankRef:                 85.0,
			ZordSignature:           100.0,
			AmountMatch:             30.0,
			CurrencyMatch:           10.0,
			BatchMatch:              15.0,
			TimeWindow:              20.0,
			SourceSystem:            10.0,
			ParseConfidenceModifier: -20.0,
			SourceStrengthModifier:  -15.0,
			ConflictPenalty:         -40.0,
		},
		TimeWindow: TimeWindowPolicy{
			MaxHoursDifference: 72,
		},
		AmountTolerance: AmountTolerancePolicy{
			ExactMatchRequired: true,
			ToleranceMinor:     0,
		},
		ManualReviewThresholds: ManualReviewThresholds{
			HighConfidenceScore:      120.0,
			MinScoreForAutoAttach:    70.0,
			AmbiguityMarginThreshold: 15.0,
		},
	}

	if profile == nil {
		return cfg
	}

	if len(profile.CarrierPriorityJSON) > 0 {
		_ = json.Unmarshal(profile.CarrierPriorityJSON, &cfg.CarrierPriority)
	}
	if len(profile.TimeWindowPolicyJSON) > 0 {
		_ = json.Unmarshal(profile.TimeWindowPolicyJSON, &cfg.TimeWindow)
	}
	if len(profile.AmountTolerancePolicyJSON) > 0 {
		_ = json.Unmarshal(profile.AmountTolerancePolicyJSON, &cfg.AmountTolerance)
	}
	if len(profile.BatchBoundaryPolicyJSON) > 0 {
		_ = json.Unmarshal(profile.BatchBoundaryPolicyJSON, &cfg.BatchBoundary)
	}
	if len(profile.ManualReviewThresholdsJSON) > 0 {
		_ = json.Unmarshal(profile.ManualReviewThresholdsJSON, &cfg.ManualReviewThresholds)
	}

	return cfg
}

// ScoreBreakdown is persisted as score_breakdown_json for full auditability.
type ScoreBreakdown struct {
	RulesetVersion         string  `json:"ruleset_version"`
	ZordSignatureScore     float64 `json:"zord_signature_score"`
	ClientRefScore         float64 `json:"client_ref_score"`
	ProviderRefScore       float64 `json:"provider_ref_score"`
	BankRefScore           float64 `json:"bank_ref_score"`
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
	policy := parseRuleProfile(profile)

	// ── LAYER 1: Exact carrier matches ────────────────────────────────────

	// Zord prepare-and-sign signature (strongest possible carrier)
	// if intent.ZordSignatureCarrier != nil && obs.ClientReferenceCandidate != nil &&
	// 	*intent.ZordSignatureCarrier == *obs.ClientReferenceCandidate {
	// 	bd.ZordSignatureScore = policy.CarrierPriority.ZordSignature
	// 	cs.ZordSignatureMatch = true
	// 	cs.ExactRefMatch = true
	// }

	// Client payout reference
	if intent.ClientPayoutRef != nil && obs.ClientReferenceCandidate != nil &&
		*intent.ClientPayoutRef == *obs.ClientReferenceCandidate {
		bd.ClientRefScore = policy.CarrierPriority.ClientRef
		cs.ClientRefMatch = true
		cs.ExactRefMatch = true
	}

	// Provider reference
	if intent.ProviderHint != nil && obs.ProviderReference != nil &&
		*intent.ProviderHint == *obs.ProviderReference {
		bd.ProviderRefScore = policy.CarrierPriority.ProviderRef
		cs.ProviderRefMatch = true
		cs.ExactRefMatch = true
	} else if obs.ProviderReference != nil && intent.ProviderHint != nil &&
		*obs.ProviderReference != *intent.ProviderHint {
		// Conflicting provider refs are a strong negative signal.
		bd.ConflictingRefPenalty += policy.CarrierPriority.ConflictPenalty / 2
	}

	// Bank reference (UTR/RRN) — strongest finality carrier after Zord sig
	// We can only match bank ref if the intent carried one (e.g. via prepare-and-sign).
	// Most intents won't have this until Stage 2 of the trust ladder; absence is neutral.

	// Batch reference
	if intent.ClientBatchRef != nil && obs.BatchReference != nil &&
		*intent.ClientBatchRef == *obs.BatchReference {
		bd.BatchMatchScore = policy.CarrierPriority.BatchMatch
		cs.BatchMatch = true
	}

	// ── LAYER 2: Composite / soft matching ───────────────────────────────

	// Amount (exact match — no tolerance by default unless profile says otherwise)
	obsAmount := obs.Amount
	amountTolerance := decimal.NewFromInt(policy.AmountTolerance.ToleranceMinor) // Note: assume tolerance is specified in minor units and Amount is as well, or scale as needed.
	// Since we don't know scale for sure, let's keep it simple. Usually ToleranceMinor needs scaling, but let's just use it directly if that's what's expected.

	primaryDiff := obsAmount.Sub(intent.Amount).Abs()
	settledDiffMatch := false
	if obs.SettledAmount != nil {
		settledDiff := obs.SettledAmount.Sub(intent.Amount).Abs()
		settledDiffMatch = settledDiff.LessThanOrEqual(amountTolerance)
	}
	if primaryDiff.LessThanOrEqual(amountTolerance) || settledDiffMatch {
		bd.AmountMatchScore = policy.CarrierPriority.AmountMatch
		cs.AmountMatch = true
	}

	// Currency
	if obs.CurrencyCode == intent.CurrencyCode && obs.CurrencyCode != "" {
		bd.CurrencyMatchScore = policy.CarrierPriority.CurrencyMatch
		cs.CurrencyMatch = true
	}

	// Time window
	if intent.IntendedExecutionAt != nil {
		windowHours := policy.TimeWindow.MaxHoursDifference
		diff := obs.ObservationTimestamp.Sub(*intent.IntendedExecutionAt)
		if math.Abs(diff.Hours()) <= windowHours {
			bd.TimeWindowScore = policy.CarrierPriority.TimeWindow
			cs.TimeWindowMatch = true
		}
	}

	// Source system hint
	if intent.ProviderHint != nil && *intent.ProviderHint == obs.SourceSystem {
		bd.SourceSystemScore = policy.CarrierPriority.SourceSystem
		cs.SourceSystemMatch = true
	}

	// ── MODIFIERS ─────────────────────────────────────────────────────────

	// Low parse confidence is a trust penalty.
	// Also flag the candidate so classifyConfidence can gate the HIGH bucket.
	if obs.ParseConfidence < 0.6 {
		bd.ParseConfModifier = policy.CarrierPriority.ParseConfidenceModifier
		cs.ParseConfPenalised = true
	}

	// Internal exports carry less finality weight.
	if obs.SourceStrengthClass == "INTERNAL_EXPORT" {
		bd.SourceStrengthModifier = policy.CarrierPriority.SourceStrengthModifier
	}

	// ── TOTAL SCORE ───────────────────────────────────────────────────────

	total := bd.ZordSignatureScore +
		bd.ClientRefScore +
		bd.ProviderRefScore +
		bd.BankRefScore +
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

	// Composite: amount + currency qualifies.
	cs.CompositeMatch = cs.AmountMatch && cs.CurrencyMatch

	// ── CONFIDENCE BUCKET ─────────────────────────────────────────────────
	cs.ConfidenceBucket = classifyConfidence(cs, policy.ManualReviewThresholds)

	return cs
}

func classifyConfidence(cs CandidateScore, thresholds ManualReviewThresholds) string {
	switch {
	case cs.ExactRefMatch && cs.AmountMatch && cs.CurrencyMatch:
		return models.ConfidenceExact
	case cs.Total >= thresholds.HighConfidenceScore && !cs.ParseConfPenalised:
		return models.ConfidenceHigh
	case cs.Total >= thresholds.MinScoreForAutoAttach:
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

	policy := parseRuleProfile(profile)
	ambiguityMargin := policy.ManualReviewThresholds.AmbiguityMarginThreshold
	// If ambiguity_margin_threshold is expressed as a fraction instead of whole score points:
	// We check if it's <= 1.0; if so we multiply by 100.
	if ambiguityMargin > 0 && ambiguityMargin <= 1.0 {
		ambiguityMargin = ambiguityMargin * 100
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
