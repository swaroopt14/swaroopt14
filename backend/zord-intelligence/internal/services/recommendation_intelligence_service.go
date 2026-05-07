package services

// recommendation_intelligence_service.go
//
// Implements spec Section 10.6 — Recommendation Intelligence.
//
// WHAT THIS SERVICE DOES:
// Reads the latest snapshots from the other five intelligence layers
// (LEAKAGE, AMBIGUITY, DEFENSIBILITY, RCA, PATTERN) and synthesises them
// into a single RECOMMENDATION snapshot with ranked, actionable next steps.
//
// This is the "brain" of Service 7 — it translates intelligence into actions.
//
// KEY PRINCIPLE (spec §10.6):
//   "The underlying recommendation logic should still be rooted in deterministic
//   or explainable upstream signals."
//   LLM can help with presentation (Phase 7), but logic is deterministic here.
//
// RECOMMENDATION CARDS:
// Each card has:
//   - priority:        CRITICAL | HIGH | MEDIUM | LOW
//   - action:          the Decision constant (e.g. "REQUEST_SOURCE_PATCH")
//   - title:           short human-readable description
//   - reason:          what triggered this recommendation (links to source snapshot)
//   - source:          which intelligence layer flagged this
//   - amount_at_stake_minor: the financial impact (0 if not money-related)
//   - priority_score:  ML doc rule-based score 0.0–1.0
//
// PRIORITY SCORE FORMULA (ML doc §8.4):
//   priority_score = (impact × confidence × urgency × recurrence × actionability) / effort
//
//   urgency:       CRITICAL=1.0, HIGH=0.8, MEDIUM=0.5, LOW=0.2
//   impact:        0.30 base + clamp(amount_at_stake / 5_000_000, 0, 0.70)
//   confidence:    0.85 — deterministic signals carry high certainty
//   recurrence:    0.70 — intelligence issues recur without intervention
//   actionability: 0.90 — every ZPI action maps to a concrete next step
//   effort:        1.0  — normalisation denominator (Phase 7 will calibrate per action)
//
// Within each priority tier, cards are sorted by priority_score descending
// so the most impactful action in each tier rises to the top.

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// RecommendationIntelligenceService synthesises all other intelligence layers
// into ranked, actionable recommendation cards.
type RecommendationIntelligenceService struct {
	snapshotRepo *persistence.IntelligenceSnapshotRepo
}

// NewRecommendationIntelligenceService creates a RecommendationIntelligenceService.
func NewRecommendationIntelligenceService(
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
) *RecommendationIntelligenceService {
	return &RecommendationIntelligenceService{snapshotRepo: snapshotRepo}
}

// RecommendationSnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = RECOMMENDATION.
type RecommendationSnapshot struct {
	// Ranked list of recommendation cards (sorted by priority then priority_score)
	Cards []RecommendationCard `json:"cards"`

	// Summary counts by priority
	CriticalCount int `json:"critical_count"`
	HighCount     int `json:"high_count"`
	MediumCount   int `json:"medium_count"`
	LowCount      int `json:"low_count"`

	// Total amount at stake across all CRITICAL + HIGH recommendations
	TotalAmountAtStakeMinor decimal.Decimal `json:"total_amount_at_stake_minor"`

	// Source snapshot IDs used to build this recommendation set
	SourceSnapshotIDs []string `json:"source_snapshot_ids"`

	ComputedAt time.Time `json:"computed_at"`
}

// RecommendationCard is one actionable recommendation.
type RecommendationCard struct {
	CardID             string          `json:"card_id"`            // "rec_" + uuid — stable ID for UI dedup
	Priority           string          `json:"priority"`           // CRITICAL | HIGH | MEDIUM | LOW
	Action             string          `json:"action"`             // Decision constant
	Title              string          `json:"title"`              // short title for UI card
	Reason             string          `json:"reason"`             // what triggered this
	SourceLayer        string          `json:"source_layer"`       // LEAKAGE | AMBIGUITY | DEFENSIBILITY | RCA | PATTERN
	SourceSnapshotID   string          `json:"source_snapshot_id"` // which snapshot this came from
	AmountAtStakeMinor decimal.Decimal `json:"amount_at_stake_minor,omitempty"`
	PriorityScore      float64         `json:"priority_score"` // rule-based 0.0–1.0 score (ML doc §8.4)
}

// computePriorityScore implements the ML doc §8.4 rule-based priority formula:
//
//	priority_score = (impact × confidence × urgency × recurrence × actionability) / effort
//
// Returns a value in [0.0, 1.0] rounded to 3 decimal places.
func (s *RecommendationIntelligenceService) computePriorityScore(
	priority string,
	amountAtStakeMinor decimal.Decimal,
) float64 {
	urgencyMap := map[string]float64{
		"CRITICAL": 1.0,
		"HIGH":     0.8,
		"MEDIUM":   0.5,
		"LOW":      0.2,
	}
	urgency, ok := urgencyMap[priority]
	if !ok {
		urgency = 0.2
	}

	// impact: base 0.30 + financial exposure contribution (scales to 1.0 at ₹50L)
	impact := 0.30 + math.Min(amountAtStakeMinor.InexactFloat64()/5_000_000.0, 0.70)

	const (
		confidence    = 0.85 // deterministic signals have well-known accuracy
		recurrence    = 0.70 // intelligence issues typically persist until fixed
		actionability = 0.90 // every ZPI card maps to a concrete remediation step
		effort        = 1.0  // normalisation denominator; Phase 7 will calibrate
	)

	score := (impact * confidence * urgency * recurrence * actionability) / effort
	if score > 1.0 {
		score = 1.0
	}
	return math.Round(score*1000) / 1000
}

// ComputeAndSave reads the latest snapshots from each intelligence layer
// and produces a RECOMMENDATION snapshot.
//
// Called by HandleAttachmentDecision, HandleVarianceRecord, HandleGovernanceDecision,
// and HandleBatchSummaryUpdated — i.e. after any event that could change the
// intelligence landscape.
//
// IMPORTANT: We only read the LATEST snapshot per layer. If no snapshot exists
// for a layer yet (e.g. no failures → no RCA snapshot), that layer is skipped.
// This is correct: we never generate phantom recommendations from missing data.
func (s *RecommendationIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	var cards []RecommendationCard
	var sourceIDs []string

	// ── Read LEAKAGE snapshot ──────────────────────────────────────────────
	leakageSnap, err := s.snapshotRepo.GetLatestByType(ctx, tenantID, "LEAKAGE", "TENANT", nil)
	if err != nil {
		return fmt.Errorf("recommendation_svc: read LEAKAGE snap: %w", err)
	}
	if leakageSnap != nil {
		sourceIDs = append(sourceIDs, leakageSnap.SnapshotID)
		cards = append(cards, s.cardsFromLeakage(leakageSnap)...)
	}

	// ── Read AMBIGUITY snapshot ────────────────────────────────────────────
	ambSnap, err := s.snapshotRepo.GetLatestByType(ctx, tenantID, "AMBIGUITY", "TENANT", nil)
	if err != nil {
		return fmt.Errorf("recommendation_svc: read AMBIGUITY snap: %w", err)
	}
	if ambSnap != nil {
		sourceIDs = append(sourceIDs, ambSnap.SnapshotID)
		cards = append(cards, s.cardsFromAmbiguity(ambSnap)...)
	}

	// ── Read DEFENSIBILITY snapshot ───────────────────────────────────────
	defSnap, err := s.snapshotRepo.GetLatestByType(ctx, tenantID, "DEFENSIBILITY", "TENANT", nil)
	if err != nil {
		return fmt.Errorf("recommendation_svc: read DEFENSIBILITY snap: %w", err)
	}
	if defSnap != nil {
		sourceIDs = append(sourceIDs, defSnap.SnapshotID)
		cards = append(cards, s.cardsFromDefensibility(defSnap)...)
	}

	// ── Read RCA snapshot ─────────────────────────────────────────────────
	// We query CORRIDOR scope for RCA. To make this global, we look for the most recent one across any corridor.
	rcaSnap, err := s.snapshotRepo.GetLatestByType(ctx, tenantID, "RCA", "CORRIDOR", nil)
	if err == nil && rcaSnap != nil {
		sourceIDs = append(sourceIDs, rcaSnap.SnapshotID)
		if card := s.cardFromRCA(rcaSnap); card != nil {
			cards = append(cards, *card)
		}
	}

	// ── Read PATTERN snapshot ─────────────────────────────────────────────
	// Query BATCH scope.
	patternSnap, err := s.snapshotRepo.GetLatestByType(ctx, tenantID, "PATTERN", "BATCH", nil)
	if err == nil && patternSnap != nil {
		sourceIDs = append(sourceIDs, patternSnap.SnapshotID)
		if card := s.cardFromPattern(patternSnap); card != nil {
			cards = append(cards, *card)
		}
	}

	// If no cards at all, still write an empty recommendation snapshot
	// so the API has something to return (empty is better than 404).

	// Sort cards: CRITICAL first, then HIGH, MEDIUM, LOW;
	// within the same tier, sort by priority_score descending so the
	// highest-impact action in each tier rises to the top.
	priorityOrder := map[string]int{"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
	sort.Slice(cards, func(i, j int) bool {
		pi := priorityOrder[cards[i].Priority]
		pj := priorityOrder[cards[j].Priority]
		if pi != pj {
			return pi < pj
		}
		return cards[i].PriorityScore > cards[j].PriorityScore
	})

	// Build summary
	snap := RecommendationSnapshot{
		Cards:             cards,
		SourceSnapshotIDs: sourceIDs,
		ComputedAt:        time.Now().UTC(),
	}
	for _, c := range cards {
		switch c.Priority {
		case "CRITICAL":
			snap.CriticalCount++
			snap.TotalAmountAtStakeMinor = snap.TotalAmountAtStakeMinor.Add(c.AmountAtStakeMinor)
		case "HIGH":
			snap.HighCount++
			snap.TotalAmountAtStakeMinor = snap.TotalAmountAtStakeMinor.Add(c.AmountAtStakeMinor)
		case "MEDIUM":
			snap.MediumCount++
		case "LOW":
			snap.LowCount++
		}
	}

	// Persist
	projRefsJSON, _ := json.Marshal(sourceIDs)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("recommendation_svc.ComputeAndSave marshal tenant=%s: %w", tenantID, err)
	}

	snapID := "snap_" + uuid.New().String()
	modelVer := "rule_based_v1"
	return s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "RECOMMENDATION",
		ScopeType:          "TENANT",
		ScopeRef:           nil,
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	})
}

// cardsFromLeakage extracts recommendation cards from a LEAKAGE snapshot.
func (s *RecommendationIntelligenceService) cardsFromLeakage(
	snap *persistence.IntelligenceSnapshot,
) []RecommendationCard {
	var lsnap LeakageSnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &lsnap); err != nil {
		return nil
	}

	var cards []RecommendationCard

	// CRITICAL: leakage above 5%
	if lsnap.LeakagePercentage > 0.05 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "CRITICAL",
			Action:             "ESCALATE",
			Title:              fmt.Sprintf("%.1f%% of intended volume is leaking", lsnap.LeakagePercentage*100),
			Reason:             fmt.Sprintf("Total leakage: ₹%s minor units across %d unmatched intents", lsnap.TotalAmountMinor, lsnap.UnmatchedIntentCount),
			SourceLayer:        "LEAKAGE",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: lsnap.TotalAmountMinor,
			PriorityScore:      s.computePriorityScore("CRITICAL", lsnap.TotalAmountMinor),
		})
	}

	// HIGH: unmatched intents > 10
	if lsnap.UnmatchedIntentCount > 10 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "HIGH",
			Action:             "REQUEST_SOURCE_PATCH",
			Title:              fmt.Sprintf("%d intents have no settlement match", lsnap.UnmatchedIntentCount),
			Reason:             "Source system is not producing settlement references — fix carrier fields",
			SourceLayer:        "LEAKAGE",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: lsnap.UnmatchedAmountMinor,
			PriorityScore:      s.computePriorityScore("HIGH", lsnap.UnmatchedAmountMinor),
		})
	}

	// HIGH: reversals
	if lsnap.ReversalCount > 0 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "HIGH",
			Action:             "ESCALATE",
			Title:              fmt.Sprintf("%d reversals detected after successful settlement", lsnap.ReversalCount),
			Reason:             "Reversals indicate PSP clawback or manual recall — finance review required",
			SourceLayer:        "LEAKAGE",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: lsnap.ReversalExposureMinor,
			PriorityScore:      s.computePriorityScore("HIGH", lsnap.ReversalExposureMinor),
		})
	}

	// Prepare-and-sign recommendation when leakage is HIGH
	if lsnap.LeakagePercentage > 0.025 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "MEDIUM",
			Action:           "PREPARE_AND_SIGN_RECOMMENDED",
			Title:            "Consider Zord prepare-and-sign mode to reduce future leakage",
			Reason:           fmt.Sprintf("Leakage rate %.1f%% exceeds 2.5%% — prepare-and-sign would improve traceability", lsnap.LeakagePercentage*100),
			SourceLayer:      "LEAKAGE",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("MEDIUM", decimal.Zero),
		})
	}

	return cards
}

// cardFromRCA extracts a recommendation card from an RCA snapshot.
func (s *RecommendationIntelligenceService) cardFromRCA(
	snap *persistence.IntelligenceSnapshot,
) *RecommendationCard {
	var rsnap RCASnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &rsnap); err != nil {
		return nil
	}

	if rsnap.RecommendedAction == "" {
		return nil
	}

	if len(rsnap.TopFailureDrivers) == 0 {
		return nil
	}

	// RecommendedAction comes formatted like: "ESCALATE: PSP system errors..."
	// We'll split it or just use it as the reason.
	action := "NOTIFY"
	if len(rsnap.RecommendedAction) > 8 {
		// Crude extraction for the UI card, assuming Phase 4 formatting
		action = "ESCALATE" // Default fallback
	}

	return &RecommendationCard{
		CardID:           "rec_" + uuid.New().String(),
		Priority:         "HIGH",
		Action:           action,
		Title:            fmt.Sprintf("Top Failure Driver: %s", rsnap.TopFailureDrivers[0].Family),
		Reason:           rsnap.RecommendedAction,
		SourceLayer:      "RCA",
		SourceSnapshotID: snap.SnapshotID,
		PriorityScore:    s.computePriorityScore("HIGH", decimal.Zero),
	}
}

// cardFromPattern extracts a recommendation card from a PATTERN snapshot.
func (s *RecommendationIntelligenceService) cardFromPattern(
	snap *persistence.IntelligenceSnapshot,
) *RecommendationCard {
	var psnap PatternSnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &psnap); err != nil {
		return nil
	}

	if !psnap.PrepareAndSignRecommended {
		return nil
	}

	return &RecommendationCard{
		CardID:             "rec_" + uuid.New().String(),
		Priority:           "MEDIUM",
		Action:             "PREPARE_AND_SIGN_RECOMMENDED",
		Title:              "Batch Quality Risk Detected",
		Reason:             psnap.RecommendedAction,
		SourceLayer:        "PATTERN",
		SourceSnapshotID:   snap.SnapshotID,
		AmountAtStakeMinor: psnap.TotalVarianceMinor,
		PriorityScore:      s.computePriorityScore("MEDIUM", psnap.TotalVarianceMinor),
	}
}

// cardsFromAmbiguity extracts recommendation cards from an AMBIGUITY snapshot.
func (s *RecommendationIntelligenceService) cardsFromAmbiguity(
	snap *persistence.IntelligenceSnapshot,
) []RecommendationCard {
	var asnap AmbiguitySnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &asnap); err != nil {
		return nil
	}

	var cards []RecommendationCard

	if asnap.AmbiguityRate > 0.10 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "CRITICAL",
			Action:             "REVIEW_AMBIGUOUS_BATCH",
			Title:              fmt.Sprintf("%.1f%% of attachment decisions are ambiguous", asnap.AmbiguityRate*100),
			Reason:             asnap.WeakestCohortSignal,
			SourceLayer:        "AMBIGUITY",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: asnap.ValueAtRiskMinor,
			PriorityScore:      s.computePriorityScore("CRITICAL", asnap.ValueAtRiskMinor),
		})
	} else if asnap.AmbiguityRate > 0.05 {
		cards = append(cards, RecommendationCard{
			CardID:             "rec_" + uuid.New().String(),
			Priority:           "HIGH",
			Action:             "REQUEST_SOURCE_PATCH",
			Title:              fmt.Sprintf("%.1f%% ambiguity rate — source data quality needs improvement", asnap.AmbiguityRate*100),
			Reason:             asnap.WeakestCohortSignal,
			SourceLayer:        "AMBIGUITY",
			SourceSnapshotID:   snap.SnapshotID,
			AmountAtStakeMinor: asnap.ValueAtRiskMinor,
			PriorityScore:      s.computePriorityScore("HIGH", asnap.ValueAtRiskMinor),
		})
	}

	if asnap.ProviderRefMissingRate > 0.15 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "HIGH",
			Action:           "REQUEST_STRONGER_CARRIER_CONTRACT",
			Title:            fmt.Sprintf("%.1f%% of decisions have no carrier references", asnap.ProviderRefMissingRate*100),
			Reason:           "PSP is not returning UTR/RRN — renegotiate contract to require reference fields",
			SourceLayer:      "AMBIGUITY",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("HIGH", decimal.Zero),
		})
	}

	return cards
}

// cardsFromDefensibility extracts recommendation cards from a DEFENSIBILITY snapshot.
func (s *RecommendationIntelligenceService) cardsFromDefensibility(
	snap *persistence.IntelligenceSnapshot,
) []RecommendationCard {
	var dsnap DefensibilitySnapshot
	if err := json.Unmarshal(snap.SnapshotJSON, &dsnap); err != nil {
		return nil
	}

	var cards []RecommendationCard

	if dsnap.AuditReadyPct < 0.70 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "HIGH",
			Action:           "REGENERATE_EVIDENCE",
			Title:            fmt.Sprintf("Only %.1f%% of payments are audit-ready", dsnap.AuditReadyPct*100),
			Reason:           "Governance coverage and evidence pack rate are below audit thresholds",
			SourceLayer:      "DEFENSIBILITY",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("HIGH", decimal.Zero),
		})
	}

	if dsnap.GovernanceRejectedCount > 0 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "CRITICAL",
			Action:           "ESCALATE",
			Title:            fmt.Sprintf("%d governance decisions were REJECTED", dsnap.GovernanceRejectedCount),
			Reason:           "Rejected governance decisions indicate compliance violations",
			SourceLayer:      "DEFENSIBILITY",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("CRITICAL", decimal.Zero),
		})
	}

	if dsnap.ReplayabilityPct < 0.60 {
		cards = append(cards, RecommendationCard{
			CardID:           "rec_" + uuid.New().String(),
			Priority:         "MEDIUM",
			Action:           "REGENERATE_EVIDENCE",
			Title:            fmt.Sprintf("Only %.1f%% of decisions are replay-equivalent", dsnap.ReplayabilityPct*100),
			Reason:           "Low replay coverage means disputes will be hard to defend",
			SourceLayer:      "DEFENSIBILITY",
			SourceSnapshotID: snap.SnapshotID,
			PriorityScore:    s.computePriorityScore("MEDIUM", decimal.Zero),
		})
	}

	return cards
}
