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
	ExactCarrierScore      float64 `json:"exact_carrier_score"`
	BusinessReferenceScore float64 `json:"business_reference_score"`
	QualityModifiers       float64 `json:"quality_modifiers"`
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

func ScoreCandidate(
	obs models.CanonicalSettlementObservation,
	intent models.CanonicalIntent,
	profile *models.AttachmentRuleProfile,
) CandidateScore {
	bd := ScoreBreakdown{RulesetVersion: RulesetVersion}
	cs := CandidateScore{}
	policy := parseRuleProfile(profile)

	// ── LAYER 1: Exact carrier matches ────────────────────────────────────

	// Zord signature / prepared carrier exact match: +120
	// if intent.ZordSignatureCarrier != nil && obs.ZordSignatureCarrier != nil &&
	// 	*intent.ZordSignatureCarrier == *obs.ZordSignatureCarrier && *intent.ZordSignatureCarrier != "" {
	// 	bd.ExactCarrierScore += 120
	// 	cs.ZordSignatureMatch = true
	// 	cs.ExactRefMatch = true
	// }

	// Client payout reference exact match: +100
	if intent.ClientPayoutRef != nil && obs.ClientReferenceCandidate != nil &&
		*intent.ClientPayoutRef == *obs.ClientReferenceCandidate && *intent.ClientPayoutRef != "" {
		bd.BusinessReferenceScore += 100
		cs.ClientRefMatch = true
		cs.ExactRefMatch = true
	}

	// business_idempotency_key match: +95
	if intent.BusinessIdempotencyKey != nil && obs.ClientReferenceCandidate != nil &&
		*intent.BusinessIdempotencyKey == *obs.ClientReferenceCandidate && *intent.BusinessIdempotencyKey != "" {
		bd.BusinessReferenceScore += 95
		cs.ExactRefMatch = true
	}

	// batch_id + source_row_ref exact match: +90
	// We use ClientBatchRef as batch_id and SourceRowRef as row identifier.
	if intent.ClientBatchRef != nil && obs.BatchReference != nil &&
		*intent.ClientBatchRef == *obs.BatchReference && *intent.ClientBatchRef != "" {
		// If we also had source_row_ref in intent, we'd check it here.
		// For now, batch match is a strong signal.
		bd.BatchMatchScore += 90
		cs.BatchMatch = true
	}

	// provider reference match: +85
	if intent.ProviderHint != nil && obs.ProviderReference != nil &&
		*intent.ProviderHint == *obs.ProviderReference && *intent.ProviderHint != "" {
		bd.ProviderRefScore += 85
		cs.ProviderRefMatch = true
		cs.ExactRefMatch = true
	} else if obs.ProviderReference != nil && intent.ProviderHint != nil &&
		*obs.ProviderReference != *intent.ProviderHint && *obs.ProviderReference != "" {
		// Conflict penalty: provider/bank reference conflict: -70
		bd.ConflictingRefPenalty -= 70
	}

	// bank reference deterministic link: +85
	if obs.BankReference != nil && intent.ProviderHint != nil &&
		*obs.BankReference == *intent.ProviderHint && *obs.BankReference != "" {
		bd.BankRefScore += 85
		cs.BankRefMatch = true
		cs.ExactRefMatch = true
	}

	// beneficiary_fingerprint match: +35
	// if intent.BeneficiaryFingerprint != nil && obs.BeneficiaryFingerprint != nil &&
	// 	*intent.BeneficiaryFingerprint == *obs.BeneficiaryFingerprint && *intent.BeneficiaryFingerprint != "" {
	// 	bd.QualityModifiers += 35
	// }

	// ── LAYER 2: Composite / soft matching ───────────────────────────────

	// Amount match within tolerance: +30
	obsAmount := obs.Amount
	amountTolerance := decimal.NewFromInt(policy.AmountTolerance.ToleranceMinor)
	primaryDiff := obsAmount.Sub(intent.Amount).Abs()
	if primaryDiff.LessThanOrEqual(amountTolerance) {
		bd.AmountMatchScore += 30
		cs.AmountMatch = true
	} else {
		// Conflict: amount mismatch beyond tolerance: -50
		bd.ConflictingRefPenalty -= 50
	}

	// Currency match: +10
	if obs.CurrencyCode == intent.CurrencyCode && obs.CurrencyCode != "" {
		bd.AmountMatchScore += 10
		cs.CurrencyMatch = true
	} else {
		// Conflict: currency mismatch: -100
		bd.ConflictingRefPenalty -= 100
	}

	// Time window match: +20
	if intent.IntendedExecutionAt != nil {
		windowHours := policy.TimeWindow.MaxHoursDifference
		diff := obs.ObservationTimestamp.Sub(*intent.IntendedExecutionAt)
		if math.Abs(diff.Hours()) <= windowHours {
			bd.TimeWindowScore += 20
			cs.TimeWindowMatch = true
		}
	}

	// Batch family match: +15
	if intent.ClientBatchRef != nil && obs.BatchReference != nil &&
		*intent.ClientBatchRef == *obs.BatchReference && *intent.ClientBatchRef != "" {
		bd.BatchMatchScore += 15
	}

	// Source system/corridor match: +10
	if intent.ProviderHint != nil && *intent.ProviderHint == obs.SourceSystem {
		bd.SourceSystemScore += 10
		cs.SourceSystemMatch = true
	}
	if intent.Corridor != nil && obs.CorridorID != "" && *intent.Corridor == obs.CorridorID {
		bd.SourceSystemScore += 10
	}

	// ── QUALITY MODIFIERS ─────────────────────────────────────────────────

	// parse_confidence < 70: -20
	if obs.ParseConfidence < 0.7 {
		bd.QualityModifiers -= 20
		cs.ParseConfPenalised = true
	}

	// mapping_confidence < 70: -15
	if obs.MappingConfidence < 0.7 {
		bd.QualityModifiers -= 15
	}

	// attachment_readiness_score < 60: -15
	if obs.AttachmentReadinessScore < 0.6 {
		bd.QualityModifiers -= 15
	}

	// source_strength_class = INTERNAL_EXPORT: -10
	if obs.SourceStrengthClass == "INTERNAL_EXPORT" {
		bd.QualityModifiers -= 10
	}

	// source_strength_class = MANUAL_UPLOAD: -20
	if obs.SourceStrengthClass == "MANUAL_UPLOAD" {
		bd.QualityModifiers -= 20
	}

	// ── TOTAL SCORE ───────────────────────────────────────────────────────

	total := bd.ExactCarrierScore +
		bd.BusinessReferenceScore +
		bd.BankRefScore +
		bd.AmountMatchScore +
		bd.BatchMatchScore +
		bd.TimeWindowScore +
		bd.SourceSystemScore +
		bd.QualityModifiers +
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
	case cs.ExactRefMatch && cs.AmountMatch && cs.CurrencyMatch && !cs.ParseConfPenalised:
		return models.ConfidenceExact
	case cs.Total >= 150.0 && !cs.ParseConfPenalised: // Bank-grade high threshold
		return models.ConfidenceHigh
	case cs.Total >= 90.0:
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
