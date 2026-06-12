package services

import (
	"context"
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/mlclient"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

const leakageFeatureVersion = "leakage_batch_features_v1"
const leakagePredictionModelID = "leakage_prediction_v1"

type LeakagePredictionService struct {
	batchRepo *persistence.BatchContractRepo
	projRepo  *persistence.ProjectionRepo
	mlRepo    *persistence.MLFeatureStoreRepo
	predRepo  *persistence.MLPredictionRepo
	mlClient  *mlclient.Client
}

func NewLeakagePredictionService(
	batchRepo *persistence.BatchContractRepo,
	projRepo *persistence.ProjectionRepo,
	mlRepo *persistence.MLFeatureStoreRepo,
	predRepo *persistence.MLPredictionRepo,
	mlClient *mlclient.Client,
) *LeakagePredictionService {
	return &LeakagePredictionService{
		batchRepo: batchRepo,
		projRepo:  projRepo,
		mlRepo:    mlRepo,
		predRepo:  predRepo,
		mlClient:  mlClient,
	}
}

func (s *LeakagePredictionService) ScoreBatchAsync(
	ctx context.Context,
	tenantID, batchID string,
	windowStart, windowEnd time.Time,
) {
	if s == nil || s.mlClient == nil || tenantID == "" || batchID == "" {
		return
	}

	features, batch, err := s.buildFeatureRow(ctx, tenantID, batchID)
	if err != nil {
		log.Printf("leakage_prediction_svc: buildFeatureRow failed tenant=%s batch=%s: %v", tenantID, batchID, err)
		return
	}
	if batch == nil || batch.IntentRowCount == 0 || batch.IntentTotalAmountMinor.LessThanOrEqual(decimal.Zero) {
		return
	}

	featuresJSON, err := json.Marshal(features)
	if err != nil {
		log.Printf("leakage_prediction_svc: marshal features failed tenant=%s batch=%s: %v", tenantID, batchID, err)
		return
	}

	featureRowID := leakageFeatureRowID(tenantID, batchID)
	modelVersion := leakageFeatureVersion
	if err := s.mlRepo.Upsert(ctx, persistence.MLFeatureRow{
		FeatureRowID:  featureRowID,
		TenantID:      tenantID,
		ScopeType:     "BATCH",
		ScopeRef:      batchID,
		FeatureFamily: "LEAKAGE",
		WindowStart:   windowStart,
		WindowEnd:     windowEnd,
		FeaturesJSON:  featuresJSON,
		ModelVersion:  &modelVersion,
		CreatedAt:     time.Now().UTC(),
	}); err != nil {
		log.Printf("leakage_prediction_svc: feature upsert failed tenant=%s batch=%s: %v", tenantID, batchID, err)
		return
	}

	s.mlClient.InvokeLeakagePredictionAsync(ctx, mlclient.LeakagePredictionRequest{
		TenantID: tenantID,
		BatchID:  batchID,
		Features: features,
	}, func(result mlclient.LeakagePredictionResult, predErr error) {
		if predErr != nil {
			log.Printf("leakage_prediction_svc: predict failed tenant=%s batch=%s: %v", tenantID, batchID, predErr)
		}
		rate := decimal.NewFromFloat(clampLeakage01(result.PredictedLeakageRate))
		amountMinor := decimal.NewFromFloat(result.PredictedLeakageMinor)
		predictedAt := time.Now().UTC()

		if err := s.batchRepo.SetLeakagePrediction(
			ctx, batchID, tenantID, rate, amountMinor, leakagePredictionModelID, predictedAt,
		); err != nil {
			log.Printf("leakage_prediction_svc: SetLeakagePrediction failed tenant=%s batch=%s: %v", tenantID, batchID, err)
			return
		}

		explanationJSON, _ := json.Marshal(map[string]any{
			"algorithm":                leakagePredictionModelID,
			"feature_contract_version": leakageFeatureVersion,
			"risk_tier":                result.RiskTier,
			"features":                 features,
		})
		featureRef := featureRowID
		if err := s.predRepo.InsertPrediction(ctx, persistence.MLPrediction{
			PredictionID:     "pred_" + uuid.New().String(),
			TenantID:         tenantID,
			ModelID:          leakagePredictionModelID,
			ScopeType:        "BATCH",
			ScopeRef:         batchID,
			PredictionFamily: "LEAKAGE",
			PredictionValue:  rate.StringFixed(6),
			PredictionScore:  clampLeakage01(result.PredictedLeakageRate),
			Confidence:       1.0,
			FeatureRowID:     &featureRef,
			ExplanationJSON:  explanationJSON,
			CreatedAt:        predictedAt,
		}); err != nil {
			log.Printf("leakage_prediction_svc: InsertPrediction failed tenant=%s batch=%s: %v", tenantID, batchID, err)
		}
	})
}

func (s *LeakagePredictionService) TrainOnLabel(
	ctx context.Context,
	tenantID, batchID string,
) {
	if s == nil || s.mlClient == nil || tenantID == "" || batchID == "" {
		return
	}

	featureRowID := leakageFeatureRowID(tenantID, batchID)
	featureRow, err := s.mlRepo.GetByID(ctx, featureRowID)
	if err != nil {
		log.Printf("leakage_prediction_svc: GetByID failed tenant=%s batch=%s: %v", tenantID, batchID, err)
		return
	}
	if featureRow == nil || len(featureRow.FeaturesJSON) == 0 || len(featureRow.LabelJSON) > 0 {
		return
	}

	batch, err := s.batchRepo.GetByID(ctx, batchID)
	if err != nil {
		log.Printf("leakage_prediction_svc: GetByID batch failed tenant=%s batch=%s: %v", tenantID, batchID, err)
		return
	}
	if batch == nil {
		return
	}

	totalIntended := batch.TotalIntendedAmountMinor
	if totalIntended.LessThanOrEqual(decimal.Zero) {
		totalIntended = batch.IntentTotalAmountMinor
	}
	if totalIntended.LessThanOrEqual(decimal.Zero) {
		return
	}

	labelAmount := batch.UnmatchedAmountMinor.Add(batch.UnderSettlementAmountMinor).Add(batch.ReversalExposureMinor)
	labelRate := 0.0
	if totalIntended.GreaterThan(decimal.Zero) {
		labelRate = clampLeakage01(labelAmount.Div(totalIntended).InexactFloat64())
	}

	labelPayload, _ := json.Marshal(map[string]any{
		"predicted_leakage_rate":          labelRate,
		"target_leakage_amount_minor":     labelAmount,
		"total_intended_amount_minor":     totalIntended,
		"unmatched_intent_amount_minor":   batch.UnmatchedAmountMinor,
		"under_settlement_amount_minor":   batch.UnderSettlementAmountMinor,
		"confirmed_reversal_amount_minor": batch.ReversalExposureMinor,
		"batch_id":                        batchID,
	})
	if err := s.mlRepo.SetLabel(ctx, featureRowID, labelPayload); err != nil {
		log.Printf("leakage_prediction_svc: SetLabel failed tenant=%s batch=%s: %v", tenantID, batchID, err)
		return
	}

	sourceRefs, _ := json.Marshal(map[string]string{"batch_id": batchID})
	featureRef := featureRowID
	if err := s.predRepo.InsertLabel(ctx, persistence.MLLabel{
		LabelID:         "lbl_" + uuid.New().String(),
		TenantID:        tenantID,
		ScopeType:       "BATCH",
		ScopeRef:        batchID,
		LabelFamily:     "LEAKAGE",
		LabelValue:      labelRate,
		LabelConfidence: 1.0,
		LabelSource:     "batch_finality",
		SourceRefsJSON:  sourceRefs,
		FeatureRowID:    &featureRef,
		CreatedAt:       time.Now().UTC(),
	}); err != nil {
		log.Printf("leakage_prediction_svc: InsertLabel failed tenant=%s batch=%s: %v", tenantID, batchID, err)
	}

	var features map[string]interface{}
	if err := json.Unmarshal(featureRow.FeaturesJSON, &features); err != nil {
		log.Printf("leakage_prediction_svc: unmarshal features failed tenant=%s batch=%s: %v", tenantID, batchID, err)
		return
	}

	s.mlClient.SendLeakageTrain(ctx, mlclient.LeakageTrainRequest{
		TenantID:     tenantID,
		BatchID:      batchID,
		Features:     features,
		LabelRate:    labelRate,
		LabelAmount:  labelAmount.InexactFloat64(),
		SampleWeight: 5.0,
	})
}

func (s *LeakagePredictionService) buildFeatureRow(
	ctx context.Context,
	tenantID, batchID string,
) (map[string]interface{}, *persistence.BatchContract, error) {
	batch, err := s.batchRepo.GetByID(ctx, batchID)
	if err != nil {
		return nil, nil, err
	}
	if batch == nil {
		return nil, nil, nil
	}

	var density models.PatternBatchIntentDensityValue
	_ = s.projRepo.GetValueAs(ctx, tenantID, "pattern.batch_density."+batchID, &density)

	var sourceQuality models.SourceQualityValue
	if batch.BatchSourceSystem != nil && *batch.BatchSourceSystem != "" {
		key := "pattern.source." + sanitizeLeakageProjectionKey(*batch.BatchSourceSystem)
		_ = s.projRepo.GetValueAs(ctx, tenantID, key, &sourceQuality)
	}

	var providerQuality models.ProviderQualityValue
	if batch.BatchProviderKey != nil && *batch.BatchProviderKey != "" {
		key := "pattern.provider." + sanitizeLeakageProjectionKey(*batch.BatchProviderKey)
		_ = s.projRepo.GetValueAs(ctx, tenantID, key, &providerQuality)
	}

	patternSummary, _ := s.projRepo.GetPatternP2P6Summary(ctx, tenantID)

	count := batch.IntentRowCount
	total := batch.IntentTotalAmountMinor
	if count <= 0 || total.LessThanOrEqual(decimal.Zero) {
		return nil, batch, nil
	}

	minAmount := batch.IntentMinAmountMinor
	maxAmount := batch.IntentMaxAmountMinor
	avgAmount := total.Div(decimal.NewFromInt(int64(count)))
	stddev := computeIntentStddev(batch.IntentAmountSquareSum, total, count)
	coverageRate := float64(batch.ClientPayoutRefPresentCount) / float64(count)

	createdAt := time.Now().UTC()
	if batch.FirstIntentCreatedAt != nil {
		createdAt = batch.FirstIntentCreatedAt.UTC()
	}

	parseSuccessRate := fallbackUnitRate(providerQuality.AvgParseConfidence)
	mappingConfidenceScore := fallbackUnitRate(providerQuality.AvgMappingConfidence)
	requiredFieldCompleteness := clampLeakage01(coverageRate)
	missingRequiredFieldRate := clampLeakage01(1.0 - requiredFieldCompleteness)
	canonicalizationErrorRate := clampLeakage01(1.0 - parseSuccessRate)
	invalidAmountRate := 0.0
	invalidBeneficiaryRate := clampLeakage01(sourceQuality.LowMatchabilityRate)
	unknownColumnCount := 0.0

	settlementP50 := 0.0
	settlementP95 := 0.0
	if patternSummary != nil {
		settlementP50 = patternSummary.SettlementDelayP50Days
		settlementP95 = patternSummary.SettlementDelayP95Days
	}

	features := map[string]interface{}{
		"batch_total_intended_amount_minor":     total.InexactFloat64(),
		"batch_intent_count":                    count,
		"batch_avg_amount_minor":                avgAmount.InexactFloat64(),
		"batch_max_amount_minor":                maxAmount.InexactFloat64(),
		"batch_min_amount_minor":                minAmount.InexactFloat64(),
		"batch_amount_stddev":                   stddev,
		"batch_same_beneficiary_amount_density": clampLeakage01(density.SameBeneficiaryAmountDensity),
		"batch_max_pair_count":                  density.MaxPairCount,
		"client_payout_ref_coverage_rate":       clampLeakage01(coverageRate),
		"currency":                              derefOr(batch.BatchCurrency, "UNKNOWN"),
		"source_system":                         derefOr(batch.BatchSourceSystem, "UNKNOWN"),
		"rail":                                  derefOr(batch.BatchRail, "UNKNOWN"),
		"created_hour":                          createdAt.Hour(),
		"created_day_of_week":                   int(createdAt.Weekday()),
		"weekend_flag":                          boolInt(createdAt.Weekday() == time.Saturday || createdAt.Weekday() == time.Sunday),
		"intent_type":                           derefOr(batch.BatchIntentType, "UNKNOWN"),
		"parse_success_rate":                    parseSuccessRate,
		"mapping_confidence_score":              mappingConfidenceScore,
		"required_field_completeness_rate":      requiredFieldCompleteness,
		"canonicalization_error_rate":           canonicalizationErrorRate,
		"missing_required_field_rate":           missingRequiredFieldRate,
		"unknown_column_count":                  unknownColumnCount,
		"invalid_amount_rate":                   invalidAmountRate,
		"invalid_beneficiary_rate":              invalidBeneficiaryRate,
		"provider_key":                          derefOr(batch.BatchProviderKey, "UNKNOWN"),
		"provider_missing_provider_ref_rate":    ratio(providerQuality.MissingProviderRefCount, providerQuality.TotalSettlementCount),
		"provider_missing_client_ref_rate":      ratio(providerQuality.MissingClientRefCount, providerQuality.TotalSettlementCount),
		"provider_settlement_delay_p50_days":    providerQuality.SettlementDelayP50Days,
		"provider_settlement_delay_p95_days":    providerQuality.SettlementDelayP95Days,
		"settlement_delay_p50_days":             settlementP50,
		"settlement_delay_p95_days":             settlementP95,
	}
	return features, batch, nil
}

func leakageFeatureRowID(tenantID, batchID string) string {
	sum := sha1.Sum([]byte(tenantID + "::" + batchID))
	return fmt.Sprintf("feat_leakage_batch_%x", sum[:8])
}

func computeIntentStddev(squareSum decimal.Decimal, total decimal.Decimal, count int) float64 {
	if count <= 1 {
		return 0
	}
	n := decimal.NewFromInt(int64(count))
	mean := total.Div(n)
	variance := squareSum.Div(n).Sub(mean.Mul(mean))
	if variance.IsNegative() {
		return 0
	}
	return math.Sqrt(variance.InexactFloat64())
}

func ratio(numerator, denominator int) float64 {
	if denominator <= 0 {
		return 0
	}
	return clampLeakage01(float64(numerator) / float64(denominator))
}

func fallbackUnitRate(v float64) float64 {
	if v <= 0 {
		return 1.0
	}
	return clampLeakage01(v)
}

func derefOr(v *string, fallback string) string {
	if v == nil || strings.TrimSpace(*v) == "" {
		return fallback
	}
	return *v
}

func sanitizeLeakageProjectionKey(s string) string {
	return strings.NewReplacer(
		" ", "_",
		"%", "_",
		".", "_",
		"/", "_",
		"\\", "_",
	).Replace(strings.ToLower(s))
}

func clampLeakage01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
