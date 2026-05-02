package models

// Governance captures policy decisions and signals for an intent
type Governance struct {
	SemanticValid        bool     `json:"semantic_valid"`
	SemanticErrors       []string `json:"semantic_errors"`
	DuplicateDetected    bool     `json:"duplicate_detected"`
	DuplicateReason      string   `json:"duplicate_reason"`
	MissingFields        []string `json:"missing_fields"`
	LowConfidenceFields  []string `json:"low_confidence_fields"`
	RoutingConsistent    bool     `json:"routing_consistent"`
	ExecutionWindowValid bool     `json:"execution_window_valid"`
	PolicyFlags          []string `json:"policy_flags"`
}

type Scores struct {
	MappingConfidenceScore  float64 `json:"mapping_confidence_score"`
	ProofReadinessScore     float64 `json:"proof_readiness_score"`
	MatchabilityScore       float64 `json:"matchability_score"`
	IntentQualityScore      float64 `json:"intent_quality_score"`
	SchemaCompletenessScore float64 `json:"schema_completeness_score"`
}
