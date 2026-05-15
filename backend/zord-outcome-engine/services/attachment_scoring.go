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
	"log"
	"math"
	"strings"
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
	ExactMarginThreshold       float64 `json:"exact_margin_threshold"`
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
			HighConfidenceScore:      135.0,
			MinScoreForAutoAttach:    80.0,
			AmbiguityMarginThreshold: 15.0,
			ExactMarginThreshold:     20.0,
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
	RulesetVersion string `json:"ruleset_version"`

	ExactCarrierScore          float64 `json:"exact_carrier_score"`
	BusinessReferenceScore     float64 `json:"business_reference_score"`
	ProviderBankReferenceScore float64 `json:"provider_bank_reference_score"`
	PartyAmountScore            float64 `json:"party_amount_score"`
	BatchContextScore           float64 `json:"batch_context_score"`
	TimingScore                 float64 `json:"timing_score"`
	SourceSystemScore          float64 `json:"source_system_score"`
	QualityModifiers           float64 `json:"quality_modifiers"`
	ConflictPenalties          float64 `json:"conflict_penalties"`
}

// CandidateScore is the intermediate result returned by ScoreCandidate.
type CandidateScore struct {
	IntentID         interface{} // uuid.UUID
	Breakdown        ScoreBreakdown
	BreakdownJSON    []byte
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

	// Classification context
	ParseConfPenalised bool
	QualityAcceptable  bool
	HasHardConflict    bool
	HasAnyConflict     bool
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
	if intent.ZordSignatureCarrier != nil && obs.ZordSignatureCarrier != nil &&
		strings.EqualFold(*intent.ZordSignatureCarrier, *obs.ZordSignatureCarrier) && *intent.ZordSignatureCarrier != "" {
		bd.ExactCarrierScore += 120
		cs.ZordSignatureMatch = true
		cs.ExactRefMatch = true
	}

	// Client payout reference exact match: +100
	if intent.ClientPayoutRef != nil && obs.ClientReferenceCandidate != nil &&
		strings.EqualFold(*intent.ClientPayoutRef, *obs.ClientReferenceCandidate) && *intent.ClientPayoutRef != "" {
		log.Printf("[ScoreCandidate] Intent=%s Obs=%s MATCH: ClientPayoutRef (%s)", intent.IntentID, obs.SettlementObservationID, *intent.ClientPayoutRef)
		bd.BusinessReferenceScore += 100
		cs.ClientRefMatch = true
		cs.ExactRefMatch = true
	}

	// business_idempotency_key match: +95
	if intent.BusinessIdempotencyKey != nil && obs.ClientReferenceCandidate != nil &&
		strings.EqualFold(*intent.BusinessIdempotencyKey, *obs.ClientReferenceCandidate) && *intent.BusinessIdempotencyKey != "" {
		bd.BusinessReferenceScore += 95
		cs.ExactRefMatch = true
	}

	// batch_id + source_row_ref exact match: +90
	if intent.ClientBatchRef != nil && obs.BatchReference != nil &&
		strings.EqualFold(*intent.ClientBatchRef, *obs.BatchReference) && *intent.ClientBatchRef != "" {
		bd.BatchContextScore += 90
		cs.BatchMatch = true
		cs.ExactRefMatch = true
	}

	// provider reference match: +85
	if intent.ProviderHint != nil && obs.ProviderReference != nil && *intent.ProviderHint != "" {
		if strings.EqualFold(*intent.ProviderHint, *obs.ProviderReference) {
			bd.ProviderBankReferenceScore += 85
			cs.ProviderRefMatch = true
		} else if *obs.ProviderReference != "" {
			bd.ConflictPenalties -= 70
			cs.HasHardConflict = true
			cs.HasAnyConflict = true
		}
	}

	// bank reference match: +85
	if intent.ProviderHint != nil && obs.BankReference != nil && *intent.ProviderHint != "" &&
		strings.EqualFold(*intent.ProviderHint, *obs.BankReference) {
		bd.ProviderBankReferenceScore += 85
		cs.BankRefMatch = true
	}

	// beneficiary_fingerprint match: +35
	if intent.BeneficiaryFingerprint != nil && obs.BeneficiaryFingerprint != nil &&
		strings.EqualFold(*intent.BeneficiaryFingerprint, *obs.BeneficiaryFingerprint) && *intent.BeneficiaryFingerprint != "" {
		bd.QualityModifiers += 35
	}

	// ── LAYER 2: Composite / soft matching ───────────────────────────────

	// Amount match within tolerance: +30
	obsAmount := obs.Amount
	amountTolerance := decimal.NewFromInt(policy.AmountTolerance.ToleranceMinor)
	primaryDiff := obsAmount.Sub(intent.Amount).Abs()
	if primaryDiff.LessThanOrEqual(amountTolerance) {
		bd.PartyAmountScore += 30
		cs.AmountMatch = true
	} else {
		bd.ConflictPenalties -= 50
		cs.HasAnyConflict = true
	}

	// Currency match: +10
	if strings.EqualFold(obs.CurrencyCode, intent.CurrencyCode) && obs.CurrencyCode != "" {
		bd.PartyAmountScore += 10
		cs.CurrencyMatch = true
	} else {
		bd.ConflictPenalties -= 100
		cs.HasHardConflict = true
		cs.HasAnyConflict = true
	}

	// Time window match: +20
	if intent.IntendedExecutionAt != nil {
		windowHours := policy.TimeWindow.MaxHoursDifference
		diff := obs.ObservationTimestamp.Sub(*intent.IntendedExecutionAt)
		if math.Abs(diff.Hours()) <= windowHours {
			bd.TimingScore += 20
			cs.TimeWindowMatch = true
		}
	}

	// batch family match: +15
	if intent.ClientBatchRef != nil && obs.ClientBatchID != "" && strings.EqualFold(*intent.ClientBatchRef, obs.ClientBatchID) {
		bd.BatchContextScore += 15
	}

	// source system/corridor match: +10
	if intent.ProviderHint != nil && strings.EqualFold(*intent.ProviderHint, obs.SourceSystem) {
		bd.SourceSystemScore += 10
		cs.SourceSystemMatch = true
	}
	if intent.Corridor != nil && obs.CorridorID != "" && strings.EqualFold(*intent.Corridor, obs.CorridorID) {
		bd.SourceSystemScore += 10
	}

	// ── QUALITY MODIFIERS ─────────────────────────────────────────────────

	cs.QualityAcceptable = true

	if obs.ParseConfidence < 0.7 {
		bd.QualityModifiers -= 20
		cs.ParseConfPenalised = true
		cs.QualityAcceptable = false
	}
	if obs.MappingConfidence < 0.7 {
		bd.QualityModifiers -= 15
		cs.QualityAcceptable = false
	}
	if obs.AttachmentReadinessScore < 0.6 {
		bd.QualityModifiers -= 15
		cs.QualityAcceptable = false
	}

	switch obs.SourceStrengthClass {
	case "INTERNAL_EXPORT":
		bd.QualityModifiers -= 10
	case "MANUAL_UPLOAD":
		bd.QualityModifiers -= 20
	}

	// ── FINAL SUMMATION ───────────────────────────────────────────────────

	total := bd.ExactCarrierScore +
		bd.BusinessReferenceScore +
		bd.ProviderBankReferenceScore +
		bd.PartyAmountScore +
		bd.BatchContextScore +
		bd.TimingScore +
		bd.SourceSystemScore +
		bd.QualityModifiers +
		bd.ConflictPenalties

	if total < 0 {
		total = 0
	}
	cs.Total = total
	cs.Breakdown = bd
	cs.BreakdownJSON, _ = json.Marshal(bd)

	return cs
}

func ClassifyConfidenceContext(top CandidateScore, ranked []CandidateScore, thresholds ManualReviewThresholds) string {
	margin := 0.0
	if len(ranked) > 1 {
		margin = top.Total - ranked[1].Total
	}

	// INVALID: hard conflict or impossible match
	if top.HasHardConflict || top.Total <= 0 {
		log.Printf("[ClassifyConfidenceContext] Intent=%s - INVALID (Conflict=%v, Score=%.2f)", top.IntentID, top.HasHardConflict, top.Total)
		return models.ConfidenceInvalid
	}

	// EXACT: has top-tier exact carrier + amount + currency + no strong conflict + dominant margin
	if top.ExactRefMatch && top.AmountMatch && top.CurrencyMatch && !top.HasAnyConflict {
		if len(ranked) == 1 || margin >= thresholds.ExactMarginThreshold {
			log.Printf("[ClassifyConfidenceContext] Intent=%s - EXACT Match (Score: %.2f, Margin: %.2f)", top.IntentID, top.Total, margin)
			return models.ConfidenceExact
		}
		log.Printf("[ClassifyConfidenceContext] Intent=%s - EXACT Candidate demoted to HIGH due to margin %.2f < %.2f", top.IntentID, margin, thresholds.ExactMarginThreshold)
	}

	// HIGH: score >= threshold + margin >= threshold + quality acceptable + no hard conflict
	if top.Total >= thresholds.HighConfidenceScore {
		if margin >= thresholds.AmbiguityMarginThreshold {
			if top.QualityAcceptable {
				log.Printf("[ClassifyConfidenceContext] Intent=%s - HIGH Confidence (Score: %.2f, Margin: %.2f)", top.IntentID, top.Total, margin)
				return models.ConfidenceHigh
			}
			log.Printf("[ClassifyConfidenceContext] Intent=%s - HIGH Candidate demoted to MEDIUM due to quality", top.IntentID)
		} else {
			log.Printf("[ClassifyConfidenceContext] Intent=%s - HIGH Candidate demoted to MEDIUM due to margin %.2f < %.2f", top.IntentID, margin, thresholds.AmbiguityMarginThreshold)
		}
	}

	// MEDIUM: score >= medium_threshold but margin/quality not enough for HIGH
	if top.Total >= thresholds.MinScoreForAutoAttach {
		log.Printf("[ClassifyConfidenceContext] Intent=%s - MEDIUM Confidence (Score: %.2f)", top.IntentID, top.Total)
		return models.ConfidenceMedium
	}

	// LOW: below medium threshold
	log.Printf("[ClassifyConfidenceContext] Intent=%s - LOW Confidence (Score: %.2f)", top.IntentID, top.Total)
	return models.ConfidenceLow
}

// SelectDecisionType converts a ranked candidate list into a formal decision type.
// This is the most important function in Service 5C — it must never auto-finalise
// an ambiguous match.
func SelectDecisionType(
	ranked []CandidateScore,
	profile *models.AttachmentRuleProfile,
) (decisionType string, reasonCode string) {

	if len(ranked) == 0 {
		return models.DecisionMatchUnresolved, "NO_CANDIDATES"
	}

	policy := parseRuleProfile(profile)
	top := ranked[0]
	// Re-evaluate confidence bucket based on context (ranked list)
	top.ConfidenceBucket = ClassifyConfidenceContext(top, ranked, policy.ManualReviewThresholds)
	ranked[0] = top // update back into slice

	switch {
	case len(ranked) == 1:
		switch top.ConfidenceBucket {
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
		runnerUp := ranked[1]

		// Conflicting strong carriers (two candidates with exact refs) = CONFLICTED.
		if top.ExactRefMatch && runnerUp.ExactRefMatch {
			return models.DecisionMatchConflicted, "CONFLICTING_EXACT_CARRIERS"
		}

		// Dominant candidate exists based on re-evaluated confidence.
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

// sourceStrengthScore converts obs.SourceStrengthClass to a 0-1 normalised value
// for use inside confidence and ambiguity formulas.
// Matches the source strength table from the PDF review.
func sourceStrengthScore(sourceStrengthClass string) float64 {
	switch sourceStrengthClass {
	case "BANK_LEDGER":
		return 1.0
	case "PSP_REPORT":
		return 0.85
	case "INTERNAL_EXPORT":
		return 0.65
	case "MANUAL_UPLOAD":
		return 0.45
	default: // UNKNOWN
		return 0.30
	}
}

// ComputeAmbiguityScore returns a normalised 0-1 ambiguity score.
// Higher = more uncertain. Feeds Service 7 ambiguity intelligence.
//
// Formula (per PDF review):
//
//	ambiguity_score =
//	  0.30 * candidate_set_risk
//	  + 0.25 * margin_risk
//	  + 0.20 * carrier_weakness
//	  + 0.10 * parse_mapping_weakness
//	  + 0.10 * source_weakness
//	  + 0.05 * conflict_risk
//
// Hard overrides applied after formula:
//
//	MATCH_UNRESOLVED  → 1.0
//	MATCH_CONFLICTED  → 0.95
//	MATCH_EXACT       → cap at 0.05
func ComputeAmbiguityScore(
	ranked []CandidateScore,
	decisionType string,
	obs models.CanonicalSettlementObservation,
	policy AttachmentPolicyConfig,
) float64 {
	// Hard overrides — these never run the formula.
	switch decisionType {
	case models.DecisionMatchUnresolved:
		return 1.0
	case models.DecisionMatchConflicted:
		return 0.95
	}

	candidateSetSize := len(ranked)

	// candidate_set_risk
	var candidateSetRisk float64
	switch {
	case candidateSetSize <= 1:
		candidateSetRisk = 0.0
	case candidateSetSize == 2:
		candidateSetRisk = 0.3
	case candidateSetSize <= 5:
		candidateSetRisk = 0.6
	default:
		candidateSetRisk = 1.0
	}

	// margin_risk
	var marginRisk float64
	ambiguityThreshold := policy.ManualReviewThresholds.AmbiguityMarginThreshold
	if ambiguityThreshold <= 0 {
		ambiguityThreshold = 15.0
	}
	if candidateSetSize >= 2 {
		scoreMargin := ranked[0].Total - ranked[1].Total
		marginRisk = 1.0 - math.Min(scoreMargin/ambiguityThreshold, 1.0)
	} else {
		// Only one candidate — no margin risk from competition.
		marginRisk = 0.0
	}

	// carrier_weakness: 1 - carrier_richness_score (already 0-1 on the observation)
	carrierWeakness := 1.0 - obs.CarrierRichnessScore

	// parse_mapping_weakness
	parseMappingAvg := (obs.ParseConfidence + obs.MappingConfidence) / 2.0
	parseMappingWeakness := 1.0 - parseMappingAvg

	// source_weakness
	sourceWeakness := 1.0 - sourceStrengthScore(obs.SourceStrengthClass)

	// conflict_risk
	var conflictRisk float64
	if candidateSetSize > 0 && (ranked[0].HasHardConflict || ranked[0].HasAnyConflict) {
		conflictRisk = 1.0
	}

	score := 0.30*candidateSetRisk +
		0.25*marginRisk +
		0.20*carrierWeakness +
		0.10*parseMappingWeakness +
		0.10*sourceWeakness +
		0.05*conflictRisk

	// Hard cap for MATCH_EXACT.
	if decisionType == models.DecisionMatchExact {
		if score > 0.05 {
			score = 0.05
		}
	}

	return math.Min(score, 1.0)
}

// ComputeConfidenceScore returns a 0-1 confidence for the winning candidate.
//
// Formula (per PDF review):
//
//	confidence_score =
//	  0.35 * normalized_winning_score
//	  + 0.25 * margin_strength
//	  + 0.15 * carrier_tier_strength
//	  + 0.10 * parse_mapping_quality
//	  + 0.10 * source_strength_score
//	  + 0.05 * candidate_set_simplicity
//
// Hard caps applied after formula:
//
//	MATCH_AMBIGUOUS   → cap at 0.60
//	MATCH_CONFLICTED  → cap at 0.35
//	MATCH_UNRESOLVED  → cap at 0.20
//	hard conflict     → cap at 0.30
func ComputeConfidenceScore(
	top CandidateScore,
	decisionType string,
	ranked []CandidateScore,
	obs models.CanonicalSettlementObservation,
	policy AttachmentPolicyConfig,
) float64 {
	ambiguityThreshold := policy.ManualReviewThresholds.AmbiguityMarginThreshold
	if ambiguityThreshold <= 0 {
		ambiguityThreshold = 15.0
	}

	// normalized_winning_score
	normalizedWinningScore := math.Min(top.Total/150.0, 1.0)

	// margin_strength
	var marginStrength float64
	if len(ranked) >= 2 {
		scoreMargin := ranked[0].Total - ranked[1].Total
		marginStrength = math.Min(scoreMargin/ambiguityThreshold, 1.0)
	} else {
		// Single candidate — treat as full margin strength.
		marginStrength = 1.0
	}

	// carrier_tier_strength: derived from the top candidate's match flags.
	// Exact ref match = 1.0, composite match only = 0.5, neither = 0.2.
	var carrierTierStrength float64
	switch {
	case top.ExactRefMatch:
		carrierTierStrength = 1.0
	case top.CompositeMatch:
		carrierTierStrength = 0.5
	default:
		carrierTierStrength = 0.2
	}

	// parse_mapping_quality
	parseMappingQuality := (obs.ParseConfidence + obs.MappingConfidence) / 2.0

	// source_strength_score
	srcStrength := sourceStrengthScore(obs.SourceStrengthClass)

	// candidate_set_simplicity
	var candidateSetSimplicity float64
	candidateSetSize := len(ranked)
	switch {
	case candidateSetSize <= 1:
		candidateSetSimplicity = 1.0
	case candidateSetSize == 2:
		candidateSetSimplicity = 0.7
	case candidateSetSize <= 5:
		candidateSetSimplicity = 0.4
	default:
		candidateSetSimplicity = 0.1
	}

	score := 0.35*normalizedWinningScore +
		0.25*marginStrength +
		0.15*carrierTierStrength +
		0.10*parseMappingQuality +
		0.10*srcStrength +
		0.05*candidateSetSimplicity

	// Hard caps per decision type.
	switch decisionType {
	case models.DecisionMatchAmbiguous:
		if score > 0.60 {
			score = 0.60
		}
	case models.DecisionMatchConflicted:
		if score > 0.35 {
			score = 0.35
		}
	case models.DecisionMatchUnresolved:
		if score > 0.20 {
			score = 0.20
		}
	}

	// Hard conflict cap overrides the above.
	if top.HasHardConflict && score > 0.30 {
		score = 0.30
	}

	return math.Min(score, 1.0)
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

// classifyVarianceType derives the variance_type enum value from the computed
// flags and amounts.  Added per PDF review (section 9 — corrected variance schema).
func classifyVarianceType(
	amountVariance decimal.Decimal,
	flags map[string]bool,
	obs models.CanonicalSettlementObservation,
) string {
	if flags["status_variance"] {
		return models.VarianceTypeStatusMismatch
	}
	if flags["cross_period"] {
		return models.VarianceTypeCrossPeriod
	}
	if flags["value_date_mismatch"] {
		return models.VarianceTypeValueDateMismatch
	}
	if amountVariance.IsZero() {
		return models.VarianceTypeNoVariance
	}
	// Fee/deduction variance when the observation recorded a fee or deduction amount.
	if obs.FeeAmount != nil && !obs.FeeAmount.IsZero() {
		return models.VarianceTypeFeeDeduction
	}
	if obs.DeductionAmount != nil && !obs.DeductionAmount.IsZero() {
		return models.VarianceTypeFeeDeduction
	}
	if amountVariance.IsPositive() {
		return models.VarianceTypeUnderSettlement
	}
	return models.VarianceTypeOverSettlement
}

// isCrossPeriod returns true when intent and settlement fall in different calendar months.
func isCrossPeriod(intentDay, settleDay time.Time) bool {
	return intentDay.Month() != settleDay.Month() || intentDay.Year() != settleDay.Year()
}
