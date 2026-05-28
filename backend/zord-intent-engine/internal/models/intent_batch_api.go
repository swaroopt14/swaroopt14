package models

import "time"

type BatchIDItem struct {
	BatchID string `json:"batch_id"`
}

type PaymentIntentLite struct {
	TenantID            string     `json:"tenant_id"`
	Amount              string     `json:"amount"`
	Currency            string     `json:"currency"`
	IntendedExecutionAt *time.Time `json:"intended_execution_at"`
	ProviderHint        string     `json:"provider_hint"`
	IntentQualityScore  *float64   `json:"intent_quality_score"`
}
