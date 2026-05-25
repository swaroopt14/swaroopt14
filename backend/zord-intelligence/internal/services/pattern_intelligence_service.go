package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/mlclient"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

type PatternIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
	batchRepo    *persistence.BatchContractRepo
	mlRepo       *persistence.MLFeatureStoreRepo
	predRepo     *persistence.MLPredictionRepo
	mlClient     *mlclient.Client
}

type patternFeatureInputs struct {
	AmbiguityRate   float64
	VarianceRate    float64
	SettlementRatio float64
	UnresolvedRatio float64
	MissingRefRate  float64
}

func NewPatternIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	batchRepo *persistence.BatchContractRepo,
	mlRepo *persistence.MLFeatureStoreRepo,
	predRepo *persistence.MLPredictionRepo,
	mlClient *mlclient.Client,
) *PatternIntelligenceService {
	return &PatternIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		batchRepo:    batchRepo,
		mlRepo:       mlRepo,
		predRepo:     predRepo,
		mlClient:     mlClient,
	}
}

type PatternSnapshot struct {
	BatchID string `json:"batch_id"`

	TotalCount         int             `json:"total_count"`
	SuccessCount       int             `json:"success_count"`
	FailedCount        int             `json:"failed_count"`
	PendingCount       int             `json:"pending_count"`
	ReversedCount      int             `json:"reversed_count"`
	PartialReconCount  int             `json:"partial_recon_count"`
	TotalVarianceMinor decimal.Decimal `json:"total_variance_minor"`

	AmbiguityScore float64 `json:"ambiguity_score"`
	BatchRiskScore float64 `json:"batch_risk_score"`
	FinalityStatus string  `json:"finality_status"`

	// ── P1: Batch attachment quality score ────────────────────────────────────
	BatchQualityScore  float64 `json:"batch_quality_score"`   // primary P1 output
	ExactMatchCount    int     `json:"exact_match_count"`
	HighConfidenceCount int    `json:"high_confidence_count"`
	AmbiguousCount     int     `json:"ambiguous_count"`
	UnresolvedCount    int     `json:"unresolved_count"`
	ConflictedCount    int     `json:"conflicted_count"`

	RiskSignals []BatchRiskSignal `json:"risk_signals"`
	RiskTier    string            `json:"risk_tier"`

	BatchAnomalyScore float64 `json:"batch_anomaly_score"`
	AnomalyLevel      string  `json:"anomaly_level"`
	AnomalyType       string  `json:"anomaly_type"`

	PrepareAndSignRecommended bool   `json:"prepare_and_sign_recommended"`
	RecommendedAction         string `json:"recommended_action,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

type BatchRiskSignal struct {
	Signal       string  `json:"signal"`
	Severity     string  `json:"severity"`
	Value        float64 `json:"value"`
	Threshold    float64 `json:"threshold"`
	Contribution float64 `json:"contribution"`
}

func (s *PatternIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID, batchID string,
	windowStart, windowEnd time.Time,
) error {
	batchHealth, err := s.projRepo.GetBatchHealth(ctx, tenantID, batchID)
	if err != nil {
		return fmt.Errorf("pattern_svc.ComputeAndSave GetBatchHealth batch=%s: %w", batchID, err)
	}
	if batchHealth == nil || batchHealth.TotalCount == 0 {
		bc, err := s.batchRepo.GetByID(ctx, batchID)
		if err != nil || bc == nil {
			return nil
		}
		batchHealth = &models.BatchHealthValue{
			TotalCount:                bc.TotalCount,
			SuccessCount:              bc.SuccessCount,
			FailedCount:               bc.FailedCount,
			PendingCount:              bc.PendingCount,
			ReversedCount:             bc.ReversedCount,
			PartialReconCount:         bc.PartialReconCount,
			TotalIntendedAmountMinor:  bc.TotalIntendedAmountMinor,
			TotalConfirmedAmountMinor: bc.TotalConfirmedAmountMinor,
			TotalVarianceMinor:        bc.TotalVarianceMinor,
			FinalityStatus:            bc.BatchFinalityStatus,
		}
		if bc.AmbiguityScore != nil {
			batchHealth.AmbiguityScore = *bc.AmbiguityScore
		}
	}

	inputs := s.buildFeatureInputs(ctx, tenantID, batchHealth)
	snap := s.buildSnapshot(batchID, batchHealth, inputs)
	s.attachIsolationForestAnomaly(ctx, tenantID, inputs, &snap)

	projKey := fmt.Sprintf("batch.health.%s", batchID)
	projRefs := []string{projKey}
	projRefsJSON, _ := json.Marshal(projRefs)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("pattern_svc.ComputeAndSave marshal batch=%s: %w", batchID, err)
	}

	scopeRef := batchID
	snapID := "snap_" + uuid.New().String()
	modelVer := "isolation_forest_v1"
	if err := s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "PATTERN",
		ScopeType:          "BATCH",
		ScopeRef:           &scopeRef,
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("pattern_svc.ComputeAndSave Create snapshot batch=%s: %w", batchID, err)
	}

	if err := s.projRepo.UpsertPatternTenantSummary(
		ctx, tenantID, snap.BatchRiskScore, inputs.SettlementRatio, windowStart, windowEnd,
	); err != nil {
		log.Printf("pattern_svc: UpsertPatternTenantSummary failed tenant=%s batch=%s: %v", tenantID, batchID, err)
	}

	// ── P2/P3/P6: Tenant-level pattern KPI snapshot ────────────────────────
	if err := s.computeAndSaveTenantPatternKPIs(ctx, tenantID, batchID, windowStart, windowEnd); err != nil {
		log.Printf("pattern_svc: computeAndSaveTenantPatternKPIs failed tenant=%s batch=%s: %v",
			tenantID, batchID, err)
	}

	if err := s.persistMLFeatures(ctx, tenantID, batchID, snapID, batchHealth, inputs, windowStart, windowEnd); err != nil {
		_ = err
	}

	s.persistMLPrediction(ctx, tenantID, batchID, snapID, batchHealth, inputs, snap)
	return nil
}

func (s *PatternIntelligenceService) buildSnapshot(
	batchID string,
	bh *models.BatchHealthValue,
	inputs patternFeatureInputs,
) PatternSnapshot {
	snap := PatternSnapshot{
		BatchID:             batchID,
		TotalCount:          bh.TotalCount,
		SuccessCount:        bh.SuccessCount,
		FailedCount:         bh.FailedCount,
		PendingCount:        bh.PendingCount,
		ReversedCount:       bh.ReversedCount,
		PartialReconCount:   bh.PartialReconCount,
		TotalVarianceMinor:  bh.TotalVarianceMinor,
		AmbiguityScore:      bh.AmbiguityScore,
		FinalityStatus:      bh.FinalityStatus,
		BatchQualityScore:   bh.AggregateScore,
		ExactMatchCount:     bh.ExactMatchCount,
		HighConfidenceCount: bh.HighConfidenceCount,
		AmbiguousCount:      bh.AmbiguousCount,
		UnresolvedCount:     bh.UnresolvedCount,
		ConflictedCount:     bh.ConflictedCount,
		ComputedAt:          time.Now().UTC(),
	}

	snap.BatchRiskScore, snap.RiskSignals = s.computeRiskScore(inputs)
	snap.RiskTier = batchRiskTier(snap.BatchRiskScore)
	snap.PrepareAndSignRecommended = snap.BatchRiskScore > 0.60
	snap.RecommendedAction = s.recommendedAction(&snap)
	return snap
}

func (s *PatternIntelligenceService) computeRiskScore(inputs patternFeatureInputs) (float64, []BatchRiskSignal) {
	var signals []BatchRiskSignal
	score := 0.0

	ambiguityContrib := 0.30 * patternClamp01(inputs.AmbiguityRate/0.25)
	score += ambiguityContrib
	if ambiguityContrib > 0 {
		signals = append(signals, BatchRiskSignal{
			Signal:       "HIGH_AMBIGUITY",
			Severity:     severityFromRate(inputs.AmbiguityRate, 0.25, 0.50),
			Value:        inputs.AmbiguityRate,
			Threshold:    0.25,
			Contribution: ambiguityContrib,
		})
	}

	varianceContrib := 0.30 * patternClamp01(inputs.VarianceRate/0.10)
	score += varianceContrib
	if varianceContrib > 0 {
		signals = append(signals, BatchRiskSignal{
			Signal:       "HIGH_VARIANCE_RATIO",
			Severity:     severityFromRate(inputs.VarianceRate, 0.10, 0.20),
			Value:        inputs.VarianceRate,
			Threshold:    0.10,
			Contribution: varianceContrib,
		})
	}

	unresolvedOrMissing := math.Max(inputs.UnresolvedRatio, inputs.MissingRefRate)
	unresolvedContrib := 0.20 * patternClamp01(unresolvedOrMissing/0.10)
	score += unresolvedContrib
	if unresolvedContrib > 0 {
		signals = append(signals, BatchRiskSignal{
			Signal:       "UNRESOLVED_OR_MISSING_REF_RATE",
			Severity:     severityFromRate(unresolvedOrMissing, 0.10, 0.20),
			Value:        unresolvedOrMissing,
			Threshold:    0.10,
			Contribution: unresolvedContrib,
		})
	}

	settlementGap := patternClamp01(1.0 - inputs.SettlementRatio)
	settlementGapContrib := 0.20 * patternClamp01(settlementGap/0.25)
	score += settlementGapContrib
	if settlementGapContrib > 0 {
		signals = append(signals, BatchRiskSignal{
			Signal:       "SETTLEMENT_GAP",
			Severity:     severityFromRate(settlementGap, 0.25, 0.50),
			Value:        settlementGap,
			Threshold:    0.25,
			Contribution: settlementGapContrib,
		})
	}

	return patternClamp01(score), signals
}

func batchRiskTier(score float64) string {
	switch {
	case score >= 0.75:
		return "CRITICAL"
	case score >= 0.50:
		return "HIGH"
	case score >= 0.25:
		return "MEDIUM"
	case score > 0:
		return "LOW"
	default:
		return "CLEAN"
	}
}

func (s *PatternIntelligenceService) recommendedAction(snap *PatternSnapshot) string {
	if snap.BatchRiskScore >= 0.75 {
		return "REVIEW_AMBIGUOUS_BATCH: batch risk is CRITICAL - manual review required before proceeding"
	}
	if snap.PrepareAndSignRecommended {
		return "PREPARE_AND_SIGN_RECOMMENDED: batch quality risk justifies Zord prepare-and-sign mode"
	}
	if snap.AmbiguityScore > 0.50 {
		return "REQUEST_STRONGER_CARRIER_CONTRACT: high ambiguity - require UTR/client_ref in settlement files"
	}
	if snap.TotalVarianceMinor.IsPositive() {
		return "OPEN_OPS_INCIDENT: financial variance detected - reconciliation review required"
	}
	return ""
}

func (s *PatternIntelligenceService) attachIsolationForestAnomaly(
	ctx context.Context,
	tenantID string,
	inputs patternFeatureInputs,
	snap *PatternSnapshot,
) {
	history, err := s.mlRepo.GetRecentBatchFeatures(ctx, tenantID, 200)
	if err != nil {
		log.Printf("pattern_svc: GetRecentBatchFeatures failed tenant=%s: %v", tenantID, err)
		snap.AnomalyLevel = "INSUFFICIENT_DATA"
		snap.AnomalyType = "error"
		return
	}

	const minBatches = 10
	if len(history) < minBatches {
		snap.BatchAnomalyScore = 0.5
		snap.AnomalyLevel = "INSUFFICIENT_DATA"
		snap.AnomalyType = "not_enough_history"
		return
	}

	ifResult, err := s.mlClient.InvokeIsolationForest(ctx, mlclient.IFRequest{
		TenantID:        tenantID,
		AmbiguityRate:   inputs.AmbiguityRate,
		VarianceRate:    inputs.VarianceRate,
		SettlementRatio: inputs.SettlementRatio,
		UnresolvedRatio: inputs.UnresolvedRatio,
		MissingRefRate:  inputs.MissingRefRate,
		History:         history,
	})
	if err != nil {
		log.Printf("pattern_svc: InvokeIsolationForest failed tenant=%s: %v", tenantID, err)
		// ifResult is already the safe fallback (0.5, INSUFFICIENT_DATA)
	}

	riskHint := patternClamp01((inputs.AmbiguityRate + inputs.VarianceRate + math.Max(inputs.UnresolvedRatio, inputs.MissingRefRate) + (1.0 - inputs.SettlementRatio)) / 4.0)
	snap.BatchAnomalyScore = patternClamp01((ifResult.Score + riskHint) / 2.0)
	snap.AnomalyLevel = levelFromScore(snap.BatchAnomalyScore)
	snap.AnomalyType = ifResult.AnomalyType
}

func (s *PatternIntelligenceService) persistMLPrediction(
	ctx context.Context,
	tenantID, batchID, snapID string,
	bh *models.BatchHealthValue,
	inputs patternFeatureInputs,
	snap PatternSnapshot,
) {
	explanation := map[string]any{
		"algorithm":     "isolation_forest_v1",
		"calibration":   "if_plus_risk_hint",
		"anomaly_type":  snap.AnomalyType,
		"anomaly_level": snap.AnomalyLevel,
		"features": map[string]any{
			"ambiguity_rate":   inputs.AmbiguityRate,
			"variance_rate":    inputs.VarianceRate,
			"settlement_ratio": inputs.SettlementRatio,
			"unresolved_ratio": inputs.UnresolvedRatio,
			"missing_ref_rate": inputs.MissingRefRate,
			"total_count":      bh.TotalCount,
			"variance_minor":   bh.TotalVarianceMinor,
		},
	}
	expJSON, _ := json.Marshal(explanation)

	pred := persistence.MLPrediction{
		PredictionID:     "pred_" + uuid.New().String(),
		TenantID:         tenantID,
		ModelID:          "isolation_forest_v1_pattern",
		ScopeType:        "BATCH",
		ScopeRef:         batchID,
		PredictionFamily: "PATTERN",
		PredictionValue:  snap.AnomalyLevel,
		PredictionScore:  snap.BatchAnomalyScore,
		Confidence:       1.0,
		ExplanationJSON:  expJSON,
		SnapshotID:       &snapID,
		CreatedAt:        time.Now().UTC(),
	}
	if err := s.predRepo.InsertPrediction(ctx, pred); err != nil {
		log.Printf("pattern_svc: InsertPrediction failed tenant=%s batch=%s: %v", tenantID, batchID, err)
	}
}

func (s *PatternIntelligenceService) persistMLFeatures(
	ctx context.Context,
	tenantID, batchID, snapshotID string,
	bh *models.BatchHealthValue,
	inputs patternFeatureInputs,
	windowStart, windowEnd time.Time,
) error {
	features := map[string]any{
		"total_count":                 bh.TotalCount,
		"settled_count":               settledCountForBatch(bh),
		"total_intended_amount_minor": bh.TotalIntendedAmountMinor,
		"total_variance_minor":        bh.TotalVarianceMinor,
		"ambiguity_score":             bh.AmbiguityScore,
		"ambiguity_rate":              inputs.AmbiguityRate,
		"variance_rate":               inputs.VarianceRate,
		"settlement_ratio":            inputs.SettlementRatio,
		"settlement_gap":              patternClamp01(1.0 - inputs.SettlementRatio),
		"unresolved_ratio":            inputs.UnresolvedRatio,
		"missing_ref_rate":            inputs.MissingRefRate,
		"finality_status":             bh.FinalityStatus,
		"snapshot_id":                 snapshotID,
	}
	featJSON, err := json.Marshal(features)
	if err != nil {
		return err
	}
	return s.mlRepo.Insert(ctx, persistence.MLFeatureRow{
		FeatureRowID:  "feat_" + uuid.New().String(),
		TenantID:      tenantID,
		ScopeType:     "BATCH",
		ScopeRef:      batchID,
		FeatureFamily: "PATTERN",
		WindowStart:   windowStart,
		WindowEnd:     windowEnd,
		FeaturesJSON:  featJSON,
		LabelJSON:     nil,
		CreatedAt:     time.Now().UTC(),
	})
}

func safeDivide(num, denom float64) float64 {
	if denom == 0 {
		return 0
	}
	return num / denom
}

func settledCountForBatch(bh *models.BatchHealthValue) int {
	settled := bh.SuccessCount + bh.PartialReconCount + bh.ReversedCount
	if settled < 0 {
		return 0
	}
	if settled > bh.TotalCount {
		return bh.TotalCount
	}
	return settled
}

func (s *PatternIntelligenceService) buildFeatureInputs(
	ctx context.Context,
	tenantID string,
	bh *models.BatchHealthValue,
) patternFeatureInputs {
	inputs := patternFeatureInputs{
		AmbiguityRate:   patternClamp01(bh.AmbiguityScore),
		VarianceRate:    0,
		SettlementRatio: 0,
		UnresolvedRatio: 0,
		MissingRefRate:  0,
	}

	if bh.TotalIntendedAmountMinor.IsPositive() {
		inputs.VarianceRate = patternClamp01(math.Abs(bh.TotalVarianceMinor.InexactFloat64()) / bh.TotalIntendedAmountMinor.InexactFloat64())
	}
	if bh.TotalCount > 0 {
		inputs.SettlementRatio = patternClamp01(float64(settledCountForBatch(bh)) / float64(bh.TotalCount))
	}

	amb, err := s.projRepo.GetAmbiguitySummary(ctx, tenantID)
	if err != nil || amb == nil {
		return inputs
	}

	decisionDenom := amb.TotalDecisions
	if decisionDenom <= 0 {
		decisionDenom = bh.TotalCount
	}
	if decisionDenom > 0 {
		inputs.UnresolvedRatio = patternClamp01(float64(amb.UnresolvedSettlementCount) / float64(decisionDenom))
	}
	inputs.MissingRefRate = patternClamp01(amb.ProviderRefMissingRate)
	if amb.AmbiguityRate > inputs.AmbiguityRate {
		inputs.AmbiguityRate = patternClamp01(amb.AmbiguityRate)
	}

	return inputs
}

func severityFromRate(value, highThreshold, criticalThreshold float64) string {
	switch {
	case value >= criticalThreshold:
		return "CRITICAL"
	case value >= highThreshold:
		return "HIGH"
	case value > 0:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

func patternClamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func levelFromScore(score float64) string {
	switch {
	case score >= 0.80:
		return "CRITICAL"
	case score >= 0.65:
		return "HIGH"
	case score >= 0.55:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

// PatternTenantKPISnapshot is the TENANT-scoped pattern snapshot holding P2/P3/P6.
type PatternTenantKPISnapshot struct {
	DuplicateRiskRate            float64 `json:"duplicate_risk_rate"`             // P2
	DuplicateRiskCount           int     `json:"duplicate_risk_count"`            // P2 numerator
	TotalIntentCount             int     `json:"total_intent_count"`              // P2 denominator
	SameBeneficiaryAmountDensity float64 `json:"same_beneficiary_amount_density"` // P3
	SettlementDelayP95Days       float64 `json:"settlement_delay_p95_days"`       // P6
	ComputedAt                   time.Time `json:"computed_at"`
}

// computeAndSaveTenantPatternKPIs reads P2/P3/P6 projections and writes a
// TENANT-scoped PATTERN intelligence snapshot for these rolling KPIs.
//
// P2: duplicate_risk_rate = duplicate_risk_count / total_intent_count
// P3: same_beneficiary_amount_density = max_pair_count / total_batch_intents
// P6: settlement_delay_p95_days = 95th-percentile of settlement_delay_samples
func (s *PatternIntelligenceService) computeAndSaveTenantPatternKPIs(
	ctx context.Context,
	tenantID, batchID string,
	windowStart, windowEnd time.Time,
) error {
	// Read P2 and P6 from the pattern.p2_p6 projection
	p2p6, err := s.projRepo.GetPatternP2P6Summary(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("GetPatternP2P6Summary tenant=%s: %w", tenantID, err)
	}
	if p2p6 == nil {
		return nil // no data yet, skip
	}

	kpiSnap := PatternTenantKPISnapshot{
		DuplicateRiskRate:      p2p6.DuplicateRiskRate,
		DuplicateRiskCount:     p2p6.DuplicateRiskCount,
		TotalIntentCount:       p2p6.TotalIntentCount,
		SettlementDelayP95Days: p2p6.SettlementDelayP95Days,
		ComputedAt:             time.Now().UTC(),
	}

	// Read P3 from the pattern.batch_density.{batchID} projection
	if batchID != "" {
		density, densityErr := s.projRepo.GetBatchIntentDensity(ctx, tenantID, batchID)
		if densityErr != nil {
			log.Printf("pattern_svc: GetBatchIntentDensity failed tenant=%s batch=%s: %v",
				tenantID, batchID, densityErr)
		} else if density != nil {
			kpiSnap.SameBeneficiaryAmountDensity = density.SameBeneficiaryAmountDensity
		}
	}

	snapJSON, err := json.Marshal(kpiSnap)
	if err != nil {
		return fmt.Errorf("marshal tenant kpi snapshot: %w", err)
	}
	projRefs := []string{"pattern.p2_p6", fmt.Sprintf("pattern.batch_density.%s", batchID)}
	projRefsJSON, _ := json.Marshal(projRefs)
	modelVer := "deterministic_v1"
	snapID := "snap_" + uuid.New().String()
	return s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "PATTERN",
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
