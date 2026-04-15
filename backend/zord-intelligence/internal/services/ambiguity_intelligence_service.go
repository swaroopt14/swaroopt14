package services

// ambiguity_intelligence_service.go
//
// Implements spec Section 10.2 — Ambiguity / Confidence Intelligence.
//
// WHAT THIS SERVICE DOES:
// Reads the ambiguity.summary projection (maintained atomically by
// AtomicRecordAttachmentDecision in projection_repo.go) and produces
// a materialised AMBIGUITY snapshot.
//
// Key outputs (spec §10.2):
//   - ambiguous_intent_count and ambiguous_amount
//   - unresolved_settlement_count
//   - avg_attachment_confidence
//   - provider_ref_missing_rate
//   - value_at_risk_minor (the headline finance number)
//   - ambiguity_rate (what % of decisions are ambiguous)
//   - risk tier: CRITICAL / HIGH / MEDIUM / LOW / CLEAN
//
// DESIGN: deterministic only for v1. ML propensity prediction comes in Phase 8.

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// AmbiguityIntelligenceService computes AMBIGUITY snapshots.
type AmbiguityIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
	mlRepo       *persistence.MLFeatureStoreRepo
}

// NewAmbiguityIntelligenceService creates an AmbiguityIntelligenceService.
func NewAmbiguityIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	mlRepo *persistence.MLFeatureStoreRepo,
) *AmbiguityIntelligenceService {
	return &AmbiguityIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		mlRepo:       mlRepo,
	}
}

// AmbiguitySnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = AMBIGUITY.
type AmbiguitySnapshot struct {
	// ── Headline numbers ─────────────────────────────────────────────────
	ValueAtRiskMinor         int64   `json:"value_at_risk_minor"`         // finance's headline number
	AmbiguityRate            float64 `json:"ambiguity_rate"`              // ambiguous / total decisions
	AvgAttachmentConfidence  float64 `json:"avg_attachment_confidence"`   // running average 0.0–1.0
	ProviderRefMissingRate   float64 `json:"provider_ref_missing_rate"`   // fraction with no carriers

	// ── Counts ───────────────────────────────────────────────────────────
	AmbiguousIntentCount      int `json:"ambiguous_intent_count"`
	UnresolvedSettlementCount int `json:"unresolved_settlement_count"`
	ProviderRefMissingCount   int `json:"provider_ref_missing_count"`
	TotalDecisions            int `json:"total_decisions"`

	// ── Money ────────────────────────────────────────────────────────────
	AmbiguousAmountMinor int64 `json:"ambiguous_amount_minor"`

	// ── Risk classification ───────────────────────────────────────────────
	// CRITICAL: > 10% of decisions are ambiguous OR value_at_risk > 10L
	// HIGH:     > 5% OR value_at_risk > 5L
	// MEDIUM:   > 2%
	// LOW:      > 0%
	// CLEAN:    0
	RiskTier string `json:"risk_tier"`

	// ── Weakest cohort (top ambiguity driver) ─────────────────────────────
	// Provider ref missing rate is the single strongest predictor of ambiguity.
	// If provider_ref_missing_rate > 0.15, source system needs patching.
	WeakestCohortSignal string `json:"weakest_cohort_signal,omitempty"`

	// ── Recommended action ────────────────────────────────────────────────
	RecommendedAction string `json:"recommended_action,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

// ComputeAndSave reads the current ambiguity projection, builds the snapshot,
// and persists it to intelligence_snapshots.
//
// Called after every AttachmentDecisionCreatedEvent by HandleAttachmentDecision.
func (s *AmbiguityIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	// Step 1: read latest ambiguity projection
	amb, err := s.projRepo.GetAmbiguitySummary(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("ambiguity_svc.ComputeAndSave GetAmbiguitySummary tenant=%s: %w", tenantID, err)
	}
	if amb == nil || amb.TotalDecisions == 0 {
		return nil // no data yet
	}

	// Step 2: build snapshot
	snap := s.buildSnapshot(amb)

	// Step 3: marshal and persist
	projRefs := []string{"ambiguity.summary"}
	projRefsJSON, _ := json.Marshal(projRefs)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("ambiguity_svc.ComputeAndSave marshal tenant=%s: %w", tenantID, err)
	}

	snapID := "snap_" + uuid.New().String()
	modelVer := "deterministic_v1"
	if err := s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "AMBIGUITY",
		ScopeType:          "TENANT",
		ScopeRef:           nil,
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("ambiguity_svc.ComputeAndSave Create snapshot tenant=%s: %w", tenantID, err)
	}

	// Step 4: persist ML features (ambiguity propensity — Phase 8)
	if err := s.persistMLFeatures(ctx, tenantID, snapID, amb, windowStart, windowEnd); err != nil {
		log.Printf("ambiguity_svc: persistMLFeatures failed tenant=%s: %v", tenantID, err)
	}

	return nil
}

func (s *AmbiguityIntelligenceService) buildSnapshot(av *models.AmbiguityValue) AmbiguitySnapshot {
	snap := AmbiguitySnapshot{
		ValueAtRiskMinor:        av.ValueAtRiskMinor,
		AmbiguityRate:           av.AmbiguityRate,
		AvgAttachmentConfidence: av.AvgAttachmentConfidence,
		ProviderRefMissingRate:  av.ProviderRefMissingRate,
		AmbiguousIntentCount:    av.AmbiguousIntentCount,
		UnresolvedSettlementCount: av.UnresolvedSettlementCount,
		ProviderRefMissingCount: av.ProviderRefMissingCount,
		TotalDecisions:          av.TotalDecisions,
		AmbiguousAmountMinor:    av.AmbiguousAmountMinor,
		ComputedAt:              time.Now().UTC(),
	}

	snap.RiskTier = ambiguityRiskTier(av.AmbiguityRate, av.ValueAtRiskMinor)
	snap.WeakestCohortSignal = s.weakestCohortSignal(av)
	snap.RecommendedAction = s.recommendedAction(av)
	return snap
}

// ambiguityRiskTier classifies ambiguity level.
// 10L = 1,000,000 minor units (₹10 lakh).
func ambiguityRiskTier(rate float64, valueAtRisk int64) string {
	switch {
	case rate > 0.10 || valueAtRisk > 1_000_000:
		return "CRITICAL"
	case rate > 0.05 || valueAtRisk > 500_000:
		return "HIGH"
	case rate > 0.02:
		return "MEDIUM"
	case rate > 0:
		return "LOW"
	default:
		return "CLEAN"
	}
}

func (s *AmbiguityIntelligenceService) weakestCohortSignal(av *models.AmbiguityValue) string {
	if av.ProviderRefMissingRate > 0.15 {
		return fmt.Sprintf(
			"provider_ref_missing_rate=%.1f%% — source system is not supplying UTR/RRN/client_ref",
			av.ProviderRefMissingRate*100,
		)
	}
	if av.AvgAttachmentConfidence < 0.70 {
		return fmt.Sprintf(
			"avg_attachment_confidence=%.2f — settlement files have weak carrier richness",
			av.AvgAttachmentConfidence,
		)
	}
	return ""
}

func (s *AmbiguityIntelligenceService) recommendedAction(av *models.AmbiguityValue) string {
	if av.ProviderRefMissingRate > 0.15 {
		return "REQUEST_SOURCE_PATCH: require client_ref and UTR in all settlement exports"
	}
	if av.AmbiguityRate > 0.10 {
		return "REVIEW_AMBIGUOUS_BATCH: ambiguity rate critically high — manual review required"
	}
	if av.UnresolvedSettlementCount > 20 {
		return "REQUEST_STRONGER_CARRIER_CONTRACT: too many unresolved settlements — renegotiate PSP reference fields"
	}
	return ""
}

func (s *AmbiguityIntelligenceService) persistMLFeatures(
	ctx context.Context,
	tenantID, snapshotID string,
	av *models.AmbiguityValue,
	windowStart, windowEnd time.Time,
) error {
	features := map[string]any{
		"ambiguity_rate":             av.AmbiguityRate,
		"avg_attachment_confidence":  av.AvgAttachmentConfidence,
		"provider_ref_missing_rate":  av.ProviderRefMissingRate,
		"value_at_risk_minor":        av.ValueAtRiskMinor,
		"total_decisions":            av.TotalDecisions,
		"ambiguous_intent_count":     av.AmbiguousIntentCount,
		"unresolved_settlement_count": av.UnresolvedSettlementCount,
		"snapshot_id":                snapshotID,
	}
	featJSON, err := json.Marshal(features)
	if err != nil {
		return err
	}
	return s.mlRepo.Insert(ctx, persistence.MLFeatureRow{
		FeatureRowID:  "feat_" + uuid.New().String(),
		TenantID:      tenantID,
		ScopeType:     "TENANT",
		ScopeRef:      tenantID,
		FeatureFamily: "AMBIGUITY",
		WindowStart:   windowStart,
		WindowEnd:     windowEnd,
		FeaturesJSON:  featJSON,
		LabelJSON:     nil,
		CreatedAt:     time.Now().UTC(),
	})
}
