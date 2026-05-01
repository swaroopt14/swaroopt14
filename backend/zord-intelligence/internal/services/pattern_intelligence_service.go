package services

// pattern_intelligence_service.go
//
// Implements spec Section 10.5 — Pattern & Pre-Dispatch Quality Intelligence.
//
// WHAT THIS SERVICE DOES:
// Reads batch health projections (batch.health.{batch_id}) and produces
// a materialised PATTERN snapshot for each batch.
//
// Key outputs (spec §10.5):
//   - batch risk score (0.0–1.0)
//   - bad batch patterns (high variance, high pending, high ambiguity)
//   - duplicate-risk warnings
//   - "prepare-and-sign recommended" cohorts
//
// DESIGN: deterministic scoring formula from batch health metrics.
// Isolation Forest / ML clustering is Phase 8.
//
// BATCH RISK SCORE FORMULA:
//   The score is a weighted sum of four risk signals, capped at 1.0:
//     ambiguity_weight    = 0.35  (ambiguity is the strongest pre-dispatch predictor)
//     variance_weight     = 0.30  (financial variance = direct leakage risk)
//     pending_weight      = 0.20  (high pending = operational backlog risk)
//     failed_weight       = 0.15  (failures = pattern quality signal)

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/ml/isolation"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// PatternIntelligenceService computes PATTERN snapshots from batch health data.
type PatternIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
	batchRepo    *persistence.BatchContractRepo
	mlRepo       *persistence.MLFeatureStoreRepo
	predRepo     *persistence.MLPredictionRepo
}

// NewPatternIntelligenceService creates a PatternIntelligenceService.
func NewPatternIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	batchRepo *persistence.BatchContractRepo,
	mlRepo *persistence.MLFeatureStoreRepo,
	predRepo *persistence.MLPredictionRepo,
) *PatternIntelligenceService {
	return &PatternIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		batchRepo:    batchRepo,
		mlRepo:       mlRepo,
		predRepo:     predRepo,
	}
}

// PatternSnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = PATTERN, scope_type = BATCH.
type PatternSnapshot struct {
	BatchID string `json:"batch_id"`

	// ── Batch health summary ──────────────────────────────────────────────
	TotalCount        int   `json:"total_count"`
	SuccessCount      int   `json:"success_count"`
	FailedCount       int   `json:"failed_count"`
	PendingCount      int   `json:"pending_count"`
	ReversedCount     int   `json:"reversed_count"`
	PartialReconCount int   `json:"partial_recon_count"`
	TotalVarianceMinor int64 `json:"total_variance_minor"`

	// ── Intelligence scores ───────────────────────────────────────────────
	AmbiguityScore  float64 `json:"ambiguity_score"`  // from Service 5C
	BatchRiskScore  float64 `json:"batch_risk_score"` // computed here (0.0–1.0)
	FinalityStatus  string  `json:"finality_status"`

	// ── Risk signals ─────────────────────────────────────────────────────
	RiskSignals []BatchRiskSignal `json:"risk_signals"`

	// ── Risk tier ─────────────────────────────────────────────────────────
	RiskTier string `json:"risk_tier"` // CRITICAL | HIGH | MEDIUM | LOW | CLEAN

	// ── ML: Isolation Forest anomaly detection ────────────────────────────
	// Does this batch look unusual compared to all other batches we've seen?
	// BatchAnomalyScore: 0.0 (normal) → 1.0 (highly anomalous)
	// AnomalyLevel:      "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
	// AnomalyType:       which feature drove the anomaly (e.g. "HIGH_AMBIGUITY")
	//
	// Unlike BatchRiskScore (which checks fixed thresholds like "ambiguity > 30%"),
	// Isolation Forest asks "is this batch unusual FOR YOUR POPULATION?"
	// A batch with 40% ambiguity might be normal if all your batches have high
	// ambiguity — IF will reflect that, while fixed thresholds won't.
	BatchAnomalyScore float64 `json:"batch_anomaly_score"`
	AnomalyLevel      string  `json:"anomaly_level"`
	AnomalyType       string  `json:"anomaly_type"`

	// ── Recommendations ───────────────────────────────────────────────────
	PrepareAndSignRecommended bool   `json:"prepare_and_sign_recommended"`
	RecommendedAction         string `json:"recommended_action,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

// BatchRiskSignal is one contributing risk factor for this batch.
type BatchRiskSignal struct {
	Signal      string  `json:"signal"`       // e.g. "HIGH_AMBIGUITY"
	Severity    string  `json:"severity"`     // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
	Value       float64 `json:"value"`        // the measured value
	Threshold   float64 `json:"threshold"`    // the threshold that was exceeded
	Contribution float64 `json:"contribution"` // how much this added to batch_risk_score
}

// ComputeAndSave builds a PATTERN snapshot for one batch.
//
// Called by HandleBatchSummaryUpdated after the batch_contracts row is upserted.
func (s *PatternIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID, batchID string,
	windowStart, windowEnd time.Time,
) error {
	// Step 1: read batch health projection
	batchHealth, err := s.projRepo.GetBatchHealth(ctx, tenantID, batchID)
	if err != nil {
		return fmt.Errorf("pattern_svc.ComputeAndSave GetBatchHealth batch=%s: %w", batchID, err)
	}
	if batchHealth == nil || batchHealth.TotalCount == 0 {
		// Also try batch_contracts as fallback (batch health projection may not be
		// written yet if this is the first event for this batch)
		bc, err := s.batchRepo.GetByID(ctx, batchID)
		if err != nil || bc == nil {
			return nil
		}
		// Convert BatchContract to BatchHealthValue for scoring
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

	// Step 2: compute deterministic risk score and build snapshot
	snap := s.buildSnapshot(batchID, batchHealth)

	// Step 3: ML — Isolation Forest anomaly detection
	// Read historical batch feature vectors for this tenant, train an IF on them,
	// then score the current batch to detect if it is anomalous vs the population.
	s.attachIsolationForestAnomaly(ctx, tenantID, batchHealth, &snap)

	// Step 4: persist snapshot
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

	// Step 5: persist ML features for future training
	if err := s.persistMLFeatures(ctx, tenantID, batchID, snapID, batchHealth, windowStart, windowEnd); err != nil {
		_ = err // non-fatal
	}

	// Step 6: persist the IF prediction to ml_predictions for audit trail
	s.persistMLPrediction(ctx, tenantID, batchID, snapID, batchHealth, snap)

	return nil
}

// buildSnapshot scores the batch and populates the PatternSnapshot.
func (s *PatternIntelligenceService) buildSnapshot(
	batchID string,
	bh *models.BatchHealthValue,
) PatternSnapshot {
	snap := PatternSnapshot{
		BatchID:           batchID,
		TotalCount:        bh.TotalCount,
		SuccessCount:      bh.SuccessCount,
		FailedCount:       bh.FailedCount,
		PendingCount:      bh.PendingCount,
		ReversedCount:     bh.ReversedCount,
		PartialReconCount: bh.PartialReconCount,
		TotalVarianceMinor: bh.TotalVarianceMinor,
		AmbiguityScore:    bh.AmbiguityScore,
		FinalityStatus:    bh.FinalityStatus,
		ComputedAt:        time.Now().UTC(),
	}

	// Compute batch risk score and signals
	snap.BatchRiskScore, snap.RiskSignals = s.computeRiskScore(bh)
	snap.RiskTier = batchRiskTier(snap.BatchRiskScore)

	// Prepare-and-sign recommendation: if risk is HIGH or CRITICAL, and
	// the batch has significant volume, recommend prepare-and-sign mode
	snap.PrepareAndSignRecommended = snap.BatchRiskScore > 0.60 && bh.TotalCount > 50

	snap.RecommendedAction = s.recommendedAction(&snap)
	return snap
}

// computeRiskScore computes the batch risk score (0.0–1.0) using a weighted formula.
//
// Weights (must sum to 1.0):
//   ambiguity_weight = 0.35
//   variance_weight  = 0.30
//   pending_weight   = 0.20
//   failed_weight    = 0.15
func (s *PatternIntelligenceService) computeRiskScore(bh *models.BatchHealthValue) (float64, []BatchRiskSignal) {
	if bh.TotalCount == 0 {
		return 0, nil
	}

	var signals []BatchRiskSignal
	score := 0.0

	n := float64(bh.TotalCount)

	// ── Signal 1: Ambiguity (weight 0.35) ────────────────────────────────
	ambThreshold := 0.30 // > 30% ambiguity is high risk
	if bh.AmbiguityScore > ambThreshold {
		contrib := ((bh.AmbiguityScore - ambThreshold) / (1.0 - ambThreshold)) * 0.35
		if contrib > 0.35 {
			contrib = 0.35
		}
		score += contrib
		severity := "MEDIUM"
		if bh.AmbiguityScore > 0.70 {
			severity = "CRITICAL"
		} else if bh.AmbiguityScore > 0.50 {
			severity = "HIGH"
		}
		signals = append(signals, BatchRiskSignal{
			Signal:      "HIGH_AMBIGUITY",
			Severity:    severity,
			Value:       bh.AmbiguityScore,
			Threshold:   ambThreshold,
			Contribution: contrib,
		})
	}

	// ── Signal 2: Variance ratio (weight 0.30) ────────────────────────────
	// variance_ratio = total_variance_minor / total_intended_amount_minor
	varRatio := 0.0
	if bh.TotalIntendedAmountMinor > 0 {
		varRatio = float64(bh.TotalVarianceMinor) / float64(bh.TotalIntendedAmountMinor)
	}
	varThreshold := 0.05 // > 5% variance
	if varRatio > varThreshold {
		contrib := ((varRatio - varThreshold) / (1.0 - varThreshold)) * 0.30
		if contrib > 0.30 {
			contrib = 0.30
		}
		score += contrib
		severity := "MEDIUM"
		if varRatio > 0.15 {
			severity = "CRITICAL"
		} else if varRatio > 0.10 {
			severity = "HIGH"
		}
		signals = append(signals, BatchRiskSignal{
			Signal:      "HIGH_VARIANCE_RATIO",
			Severity:    severity,
			Value:       varRatio,
			Threshold:   varThreshold,
			Contribution: contrib,
		})
	}

	// ── Signal 3: Pending ratio (weight 0.20) ─────────────────────────────
	pendingRatio := float64(bh.PendingCount) / n
	pendThreshold := 0.20 // > 20% still pending
	if pendingRatio > pendThreshold {
		contrib := ((pendingRatio - pendThreshold) / (1.0 - pendThreshold)) * 0.20
		if contrib > 0.20 {
			contrib = 0.20
		}
		score += contrib
		signals = append(signals, BatchRiskSignal{
			Signal:      "HIGH_PENDING_RATIO",
			Severity:    "MEDIUM",
			Value:       pendingRatio,
			Threshold:   pendThreshold,
			Contribution: contrib,
		})
	}

	// ── Signal 4: Failed ratio (weight 0.15) ──────────────────────────────
	failedRatio := float64(bh.FailedCount) / n
	failThreshold := 0.05 // > 5% failures
	if failedRatio > failThreshold {
		contrib := ((failedRatio - failThreshold) / (1.0 - failThreshold)) * 0.15
		if contrib > 0.15 {
			contrib = 0.15
		}
		score += contrib
		severity := "MEDIUM"
		if failedRatio > 0.15 {
			severity = "HIGH"
		}
		signals = append(signals, BatchRiskSignal{
			Signal:      "HIGH_FAILURE_RATIO",
			Severity:    severity,
			Value:       failedRatio,
			Threshold:   failThreshold,
			Contribution: contrib,
		})
	}

	// Reversals add a fixed penalty (any reversal in a batch = HIGH risk signal)
	if bh.ReversedCount > 0 {
		score += 0.10
		signals = append(signals, BatchRiskSignal{
			Signal:      "REVERSALS_DETECTED",
			Severity:    "HIGH",
			Value:       float64(bh.ReversedCount),
			Threshold:   0,
			Contribution: 0.10,
		})
	}

	if score > 1.0 {
		score = 1.0
	}
	return score, signals
}

// batchRiskTier maps a batch risk score to a tier.
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
		return "REVIEW_AMBIGUOUS_BATCH: batch risk is CRITICAL — manual review required before proceeding"
	}
	if snap.PrepareAndSignRecommended {
		return "PREPARE_AND_SIGN_RECOMMENDED: batch quality risk justifies Zord prepare-and-sign mode"
	}
	if snap.AmbiguityScore > 0.50 {
		return "REQUEST_STRONGER_CARRIER_CONTRACT: high ambiguity — require UTR/client_ref in settlement files"
	}
	if snap.TotalVarianceMinor > 0 {
		return "OPEN_OPS_INCIDENT: financial variance detected — reconciliation review required"
	}
	return ""
}

// attachIsolationForestAnomaly trains an Isolation Forest on recent batch history
// and scores the current batch. Mutates snap in-place.
//
// HOW ISOLATION FOREST WORKS HERE:
//   1. Read last 200 PATTERN feature rows from the feature store (historical batches).
//   2. Build 100 random isolation trees on a 256-point subsample.
//   3. Score this batch: short average path length → anomaly.
//   4. Attach score + level + anomaly type to the snapshot.
//
// WHY TRAIN FRESH EACH TIME?
// Isolation Forest trains in O(n log n) — very fast for ≤200 batches.
// Training fresh avoids stale models when the batch population changes.
// No model persistence needed: the feature store IS the "model input".
func (s *PatternIntelligenceService) attachIsolationForestAnomaly(
	ctx context.Context,
	tenantID string,
	bh *models.BatchHealthValue,
	snap *PatternSnapshot,
) {
	// Pull historical batch feature vectors
	history, err := s.mlRepo.GetRecentBatchFeatures(ctx, tenantID, 200)
	if err != nil {
		log.Printf("pattern_svc: GetRecentBatchFeatures failed tenant=%s: %v", tenantID, err)
		snap.AnomalyLevel = "INSUFFICIENT_DATA"
		snap.AnomalyType = "error"
		return
	}

	// Need at least 10 batches to build a meaningful forest
	const minBatches = 10
	if len(history) < minBatches {
		snap.BatchAnomalyScore = 0.5
		snap.AnomalyLevel = "INSUFFICIENT_DATA"
		snap.AnomalyType = "not_enough_history"
		return
	}

	// Build and train the Isolation Forest on historical data
	forest := isolation.New(100, 256)
	forest.Fit(history)

	// Build feature vector for the current batch and score it
	features := isolation.BuildFeatures(
		bh.AmbiguityScore,
		bh.TotalVarianceMinor,
		bh.TotalIntendedAmountMinor,
		bh.PendingCount,
		bh.FailedCount,
		bh.ReversedCount,
		bh.TotalCount,
	)

	result := forest.Score(features)
	snap.BatchAnomalyScore = result.Score
	snap.AnomalyLevel = result.Level
	snap.AnomalyType = result.AnomalyType
}

// persistMLPrediction writes the Isolation Forest result to ml_predictions.
func (s *PatternIntelligenceService) persistMLPrediction(
	ctx context.Context,
	tenantID, batchID, snapID string,
	bh *models.BatchHealthValue,
	snap PatternSnapshot,
) {
	explanation := map[string]any{
		"algorithm":    "isolation_forest_v1",
		"anomaly_type": snap.AnomalyType,
		"anomaly_level": snap.AnomalyLevel,
		"features": map[string]any{
			"ambiguity_score":  bh.AmbiguityScore,
			"total_count":      bh.TotalCount,
			"failed_count":     bh.FailedCount,
			"pending_count":    bh.PendingCount,
			"reversed_count":   bh.ReversedCount,
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
	windowStart, windowEnd time.Time,
) error {
	features := map[string]any{
		"total_count":         bh.TotalCount,
		"ambiguity_score":     bh.AmbiguityScore,
		"failed_ratio":        safeDivide(float64(bh.FailedCount), float64(bh.TotalCount)),
		"pending_ratio":       safeDivide(float64(bh.PendingCount), float64(bh.TotalCount)),
		"reversed_count":      bh.ReversedCount,
		"variance_minor":      bh.TotalVarianceMinor,
		"finality_status":     bh.FinalityStatus,
		"snapshot_id":         snapshotID,
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
		LabelJSON:     nil, // outcome label attached later
		CreatedAt:     time.Now().UTC(),
	})
}

// safeDivide avoids divide-by-zero.
func safeDivide(num, denom float64) float64 {
	if denom == 0 {
		return 0
	}
	return num / denom
}
