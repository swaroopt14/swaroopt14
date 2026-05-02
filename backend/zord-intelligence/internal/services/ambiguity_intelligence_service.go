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
	"github.com/zord/zord-intelligence/internal/ml/logistic"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// AmbiguityIntelligenceService computes AMBIGUITY snapshots.
type AmbiguityIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
	mlRepo       *persistence.MLFeatureStoreRepo
	predRepo     *persistence.MLPredictionRepo
	lrModel      *logistic.Model // Logistic Regression: predicts ambiguity risk
}

// NewAmbiguityIntelligenceService creates an AmbiguityIntelligenceService.
// On startup it tries to reload previously trained weights from ml_model_registry.
// Falls back to domain-knowledge defaults if no saved model exists yet.
func NewAmbiguityIntelligenceService(
	ctx context.Context,
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	mlRepo *persistence.MLFeatureStoreRepo,
	predRepo *persistence.MLPredictionRepo,
) *AmbiguityIntelligenceService {
	return &AmbiguityIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		mlRepo:       mlRepo,
		predRepo:     predRepo,
		lrModel:      loadOrDefaultAmbiguityModel(ctx, predRepo),
	}
}

// loadOrDefaultAmbiguityModel loads the active AMBIGUITY model from ml_model_registry.
// If none exists (cold start), returns the hardcoded domain-knowledge model.
func loadOrDefaultAmbiguityModel(ctx context.Context, predRepo *persistence.MLPredictionRepo) *logistic.Model {
	record, err := predRepo.GetActiveModel(ctx, "AMBIGUITY")
	if err != nil {
		log.Printf("ambiguity_svc: GetActiveModel failed, using default weights: %v", err)
		return logistic.NewAmbiguityModel()
	}
	if record == nil {
		log.Printf("ambiguity_svc: no saved AMBIGUITY model — using default weights")
		return logistic.NewAmbiguityModel()
	}
	model, err := logistic.FromJSON(record.HyperparametersJSON)
	if err != nil {
		log.Printf("ambiguity_svc: FromJSON failed, using default weights: %v", err)
		return logistic.NewAmbiguityModel()
	}
	log.Printf("ambiguity_svc: loaded saved AMBIGUITY model trained_on=%d", model.TrainedOn)
	return model
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

	// ── ML: Logistic Regression risk prediction ───────────────────────────
	// Answers: "given these batch features, how likely is this to get worse?"
	// RiskPredictionScore: 0.0 (very safe) → 1.0 (almost certainly ambiguous)
	// RiskPredictionLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
	//
	// Unlike RiskTier (which reflects CURRENT ambiguity), this looks FORWARD:
	// even a batch with low current ambiguity can score HIGH here if its
	// feature profile (missing refs, low confidence) historically leads to
	// ambiguity problems later.
	RiskPredictionScore float64 `json:"risk_prediction_score"`
	RiskPredictionLevel string  `json:"risk_prediction_level"`

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

	// Step 2: build deterministic snapshot
	snap := s.buildSnapshot(amb)

	// Step 3: ML — Logistic Regression risk prediction
	// Feed the current ambiguity metrics as a feature vector into the LR model.
	// The model outputs a probability: "how likely is this batch to become ambiguous?"
	// We use 0 for totalIntendedMinor here (tenant-scope doesn't have it directly);
	// the value_at_risk_rate feature will be 0, which is conservative and safe.
	features := logistic.BuildFeatures(
		amb.AmbiguityRate,
		amb.ProviderRefMissingRate,
		amb.AvgAttachmentConfidence,
		amb.ValueAtRiskMinor,
		0, // totalIntendedMinor — not available at tenant scope; feature [3] will be 0
	)
	prob := s.lrModel.Predict(features)
	snap.RiskPredictionScore = prob
	snap.RiskPredictionLevel = logistic.PredictLevel(prob)

	// Step 4: marshal and persist
	projRefs := []string{"ambiguity.summary"}
	projRefsJSON, _ := json.Marshal(projRefs)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("ambiguity_svc.ComputeAndSave marshal tenant=%s: %w", tenantID, err)
	}

	snapID := "snap_" + uuid.New().String()
	modelVer := "logistic_regression_v1"
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

	// Step 5: persist ML features
	if err := s.persistMLFeatures(ctx, tenantID, snapID, amb, windowStart, windowEnd); err != nil {
		log.Printf("ambiguity_svc: persistMLFeatures failed tenant=%s: %v", tenantID, err)
	}

	// Step 6: persist the LR prediction to ml_predictions for audit trail
	s.persistMLPrediction(ctx, tenantID, snapID, features, prob, snap.RiskPredictionLevel)

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

// persistMLPrediction writes the Logistic Regression result to ml_predictions.
// features: the 4-element vector fed to the model (for explainability).
// prob: raw probability output from sigmoid.
// level: human-readable risk level.
func (s *AmbiguityIntelligenceService) persistMLPrediction(
	ctx context.Context,
	tenantID, snapID string,
	features []float64,
	prob float64,
	level string,
) {
	explanation := map[string]any{
		"algorithm": "logistic_regression_v1",
		"features": map[string]any{
			"ambiguity_rate":            features[0],
			"provider_ref_missing_rate": features[1],
			"low_confidence_proxy":      features[2],
			"value_at_risk_rate":        features[3],
		},
		"probability":    prob,
		"risk_level":     level,
		"model_trained_on": s.lrModel.TrainedOn,
	}
	expJSON, _ := json.Marshal(explanation)

	pred := persistence.MLPrediction{
		PredictionID:     "pred_" + uuid.New().String(),
		TenantID:         tenantID,
		ModelID:          "logistic_regression_v1_ambiguity",
		ScopeType:        "TENANT",
		ScopeRef:         tenantID,
		PredictionFamily: "AMBIGUITY",
		PredictionValue:  level,
		PredictionScore:  prob,
		Confidence:       1.0,
		ExplanationJSON:  expJSON,
		SnapshotID:       &snapID,
		CreatedAt:        time.Now().UTC(),
	}
	if err := s.predRepo.InsertPrediction(ctx, pred); err != nil {
		log.Printf("ambiguity_svc: InsertPrediction failed tenant=%s: %v", tenantID, err)
	}
}

func (s *AmbiguityIntelligenceService) persistMLFeatures(
	ctx context.Context,
	tenantID, snapshotID string,
	av *models.AmbiguityValue,
	windowStart, windowEnd time.Time,
) error {
	features := map[string]any{
		"ambiguity_rate":              av.AmbiguityRate,
		"avg_attachment_confidence":   av.AvgAttachmentConfidence,
		"provider_ref_missing_rate":   av.ProviderRefMissingRate,
		"value_at_risk_minor":         av.ValueAtRiskMinor,
		"total_decisions":             av.TotalDecisions,
		"ambiguous_intent_count":      av.AmbiguousIntentCount,
		"unresolved_settlement_count": av.UnresolvedSettlementCount,
		"snapshot_id":                 snapshotID,
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

// ── Training loop ─────────────────────────────────────────────────────────────

// TrainOnLabel is called when a batch reaches a terminal state (FULLY_SETTLED or
// FAILED). At that point the true ambiguity outcome is known and we can:
//
//  1. Label the feature row that was written on Day 0 (when decisions arrived)
//  2. Write a row to ml_labels for audit/offline use
//  3. Run one online SGD step on the in-memory LR model
//  4. Every 10 training examples: persist the updated weights to ml_model_registry
//
// This is a best-effort operation — failures are logged but never returned as
// errors to the caller, since they must not block the batch finality flow.
func (s *AmbiguityIntelligenceService) TrainOnLabel(
	ctx context.Context,
	tenantID, batchID string,
	finalAmbiguityScore float64,
	windowStart, windowEnd time.Time,
) {
	// Step 1: find the most recent unlabeled AMBIGUITY feature row for this tenant.
	// We take limit=1 (most recent) — that row represents the tenant state at the
	// time the batch's attachment decisions were arriving.
	rows, err := s.mlRepo.ListUnlabeled(ctx, tenantID, "AMBIGUITY", 1)
	if err != nil {
		log.Printf("ambiguity_svc.TrainOnLabel: ListUnlabeled failed tenant=%s: %v", tenantID, err)
		return
	}
	if len(rows) == 0 {
		// No unlabeled feature row — either cold start or already labeled.
		return
	}
	featRow := rows[0]

	// Step 2: compute binary label.
	// label=1 means "this batch had real ambiguity that required intervention".
	// threshold 0.20 aligns with ambiguityRiskTier MEDIUM boundary.
	labelValue := 0.0
	labelConf := 1.0
	if finalAmbiguityScore > 0.20 {
		labelValue = 1.0
	}
	if finalAmbiguityScore > 0.10 && finalAmbiguityScore <= 0.20 {
		labelConf = 0.7 // borderline — lower confidence
	}

	// Step 3: stamp the label onto the feature row in ml_feature_store.
	labelPayload, _ := json.Marshal(map[string]any{
		"label":                 labelValue,
		"final_ambiguity_score": finalAmbiguityScore,
		"batch_id":              batchID,
	})
	if err := s.mlRepo.SetLabel(ctx, featRow.FeatureRowID, labelPayload); err != nil {
		log.Printf("ambiguity_svc.TrainOnLabel: SetLabel failed tenant=%s: %v", tenantID, err)
		return
	}

	// Step 4: write an audit row to ml_labels.
	sourceRefs, _ := json.Marshal(map[string]string{"batch_id": batchID})
	featRowID := featRow.FeatureRowID
	if err := s.predRepo.InsertLabel(ctx, persistence.MLLabel{
		LabelID:         "lbl_" + uuid.New().String(),
		TenantID:        tenantID,
		ScopeType:       "TENANT",
		ScopeRef:        tenantID,
		LabelFamily:     "AMBIGUITY",
		LabelValue:      labelValue,
		LabelConfidence: labelConf,
		LabelSource:     "batch_finality",
		SourceRefsJSON:  sourceRefs,
		FeatureRowID:    &featRowID,
		CreatedAt:       time.Now().UTC(),
	}); err != nil {
		log.Printf("ambiguity_svc.TrainOnLabel: InsertLabel failed tenant=%s: %v", tenantID, err)
	}

	// Step 5: rebuild the feature vector from the stored JSON so we can train.
	features := rebuildFeaturesFromJSON(featRow.FeaturesJSON)
	if features == nil {
		log.Printf("ambiguity_svc.TrainOnLabel: could not rebuild features tenant=%s", tenantID)
		return
	}

	// Step 6: one online SGD step — update in-memory model weights.
	const learningRate = 0.01
	s.lrModel.Train(features, labelValue, learningRate)
	log.Printf("ambiguity_svc.TrainOnLabel: trained tenant=%s ambiguity_score=%.2f label=%.0f trained_on=%d",
		tenantID, finalAmbiguityScore, labelValue, s.lrModel.TrainedOn)

	// Step 7: persist weights every 10 training examples so restarts don't lose progress.
	if s.lrModel.TrainedOn%10 == 0 {
		s.saveModelWeights(ctx)
	}
}

// saveModelWeights serializes the current LR weights and upserts them to
// ml_model_registry as the ACTIVE AMBIGUITY model.
// The unique index on (model_family) WHERE status='ACTIVE' ensures only one
// active model exists at a time — the ON CONFLICT clause in UpsertModel handles rotation.
func (s *AmbiguityIntelligenceService) saveModelWeights(ctx context.Context) {
	weights, err := s.lrModel.ToJSON()
	if err != nil {
		log.Printf("ambiguity_svc.saveModelWeights: ToJSON failed: %v", err)
		return
	}
	metrics, _ := json.Marshal(map[string]any{"trained_on": s.lrModel.TrainedOn})
	now := time.Now().UTC()
	if err := s.predRepo.UpsertModel(ctx, persistence.MLModelRecord{
		ModelID:             "logistic_regression_v1_ambiguity",
		ModelName:           "ambiguity_logistic_v1",
		ModelFamily:         "AMBIGUITY",
		Algorithm:           "logistic_regression_v1",
		TargetLabel:         "AMBIGUITY",
		FeatureVersion:      "v1",
		TrainingWindowEnd:   &now,
		HyperparametersJSON: weights,
		MetricsJSON:         metrics,
		Status:              "ACTIVE",
		CreatedAt:           now,
		ActivatedAt:         &now,
	}); err != nil {
		log.Printf("ambiguity_svc.saveModelWeights: UpsertModel failed trained_on=%d: %v",
			s.lrModel.TrainedOn, err)
		return
	}
	log.Printf("ambiguity_svc.saveModelWeights: weights saved to registry trained_on=%d", s.lrModel.TrainedOn)
}

// rebuildFeaturesFromJSON extracts the four LR features from a stored feature row's JSON.
// Returns nil if the JSON cannot be parsed — caller should bail gracefully.
func rebuildFeaturesFromJSON(featJSON json.RawMessage) []float64 {
	var m map[string]any
	if err := json.Unmarshal(featJSON, &m); err != nil {
		return nil
	}
	getFloat := func(key string) float64 {
		v, ok := m[key]
		if !ok {
			return 0
		}
		switch val := v.(type) {
		case float64:
			return val
		case json.Number:
			f, _ := val.Float64()
			return f
		}
		return 0
	}
	return logistic.BuildFeatures(
		getFloat("ambiguity_rate"),
		getFloat("provider_ref_missing_rate"),
		getFloat("avg_attachment_confidence"),
		int64(getFloat("value_at_risk_minor")),
		0, // totalIntendedMinor not stored at tenant scope; feature [3] stays 0
	)
}
