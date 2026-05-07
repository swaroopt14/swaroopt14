package mlclient

import "time"

// Event type constants — must match Python app/schemas.py exactly.
const (
	EventIFScore   = "ISOLATION_FOREST_SCORE"
	EventZScore    = "ZSCORE_DETECT"
	EventLRPredict = "LOGISTIC_REGRESSION_PREDICT"
	EventLRTrain   = "LOGISTIC_REGRESSION_TRAIN"
)

// MLRequest is the envelope published to ml.request.events.
type MLRequest struct {
	EventID   string                 `json:"event_id"`
	EventType string                 `json:"event_type"`
	TenantID  string                 `json:"tenant_id"`
	Payload   map[string]interface{} `json:"payload"`
	Timestamp int64                  `json:"timestamp"`
}

// MLResult is the envelope consumed from ml.result.events.
type MLResult struct {
	EventID      string                 `json:"event_id"`
	EventType    string                 `json:"event_type"`
	TenantID     string                 `json:"tenant_id"`
	ModelOutputs map[string]interface{} `json:"model_outputs"`
	ModelVersion string                 `json:"model_version"`
	ProcessedAt  int64                  `json:"processed_at"`
	Error        string                 `json:"error,omitempty"`
}

// ── Per-model typed request/result structs ────────────────────────────────────

// IFRequest carries inputs for Isolation Forest scoring.
// History is a slice of pre-built 5-element feature vectors from ml_feature_store.
type IFRequest struct {
	TenantID        string
	AmbiguityRate   float64
	VarianceRate    float64
	SettlementRatio float64
	UnresolvedRatio float64
	MissingRefRate  float64
	History         [][]float64
}

// IFResult mirrors isolation.Result from the old Go implementation.
type IFResult struct {
	Score       float64
	Level       string
	AnomalyType string
}

// ZScoreRequest carries inputs for Z-score anomaly detection.
type ZScoreRequest struct {
	TenantID     string
	CurrentValue float64
	History      []float64
}

// ZScoreResult mirrors zscore.Result from the old Go implementation.
type ZScoreResult struct {
	Score  float64
	Level  string
	ZScore float64
	Mean   float64
	StdDev float64
}

// LRRequest carries inputs for Logistic Regression prediction.
type LRRequest struct {
	TenantID               string
	AmbiguityRate          float64
	ProviderRefMissingRate float64
	AvgConfidence          float64
	ValueAtRiskMinor       float64
	TotalIntendedMinor     float64
}

// LRResult mirrors logistic.Model.Predict output from the old Go implementation.
type LRResult struct {
	Probability float64
	Level       string
}

// LRTrainRequest carries inputs for one online SGD training step (fire-and-forget).
type LRTrainRequest struct {
	TenantID     string
	Features     []float64 // 4-element vector, already built via BuildLRFeatures
	Label        float64
	LearningRate float64
}

// BuildLRFeatures constructs the 4-element logistic regression feature vector.
// Exact port of Go logistic.BuildFeatures — kept here so the logistic package
// can be fully removed from the service layer.
//
// Feature order (must match Python logistic_regression.build_features):
//
//	[0] ambiguity_rate
//	[1] provider_ref_missing_rate
//	[2] low_confidence_proxy = 1 - avg_confidence  (inverted: higher = worse)
//	[3] value_at_risk_rate   = value_at_risk_minor / total_intended_minor
func BuildLRFeatures(
	ambiguityRate float64,
	providerRefMissingRate float64,
	avgConfidence float64,
	valueAtRiskMinor float64,
	totalIntendedMinor float64,
) []float64 {
	f3 := 0.0
	if totalIntendedMinor > 0 {
		f3 = clamp(valueAtRiskMinor / totalIntendedMinor)
	}
	return []float64{
		clamp(ambiguityRate),
		clamp(providerRefMissingRate),
		clamp(1.0 - avgConfidence),
		f3,
	}
}

func clamp(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

func nowUnix() int64 {
	return time.Now().Unix()
}
