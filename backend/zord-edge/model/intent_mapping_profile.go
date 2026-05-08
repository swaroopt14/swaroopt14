package model

import (
	"time"

	"github.com/google/uuid"
)

// UniversalIntentShape is the canonical nested structure expected by the zord-intent-engine.
// It uses nested structs and JSON tags to match the exact schema requirements.
type UniversalIntentShape struct {
	SchemaVersion string `json:"schema_version"`
	IntentType    string `json:"intent_type"`

	Amount struct {
		Value    float64 `json:"value"`
		Currency string  `json:"currency"`
	} `json:"amount"`

	Beneficiary struct {
		Name       string `json:"name"`
		Instrument struct {
			Kind      string `json:"kind"`
			IFSC      string `json:"ifsc,omitempty"`
			VPA       string `json:"vpa,omitempty"`
			AccountNo string `json:"account_number,omitempty"`
		} `json:"instrument"`
		Country string `json:"country"`
	} `json:"beneficiary"`

	Remitter struct {
		Phone      string `json:"phone"`
		Email      string `json:"email"`
		CustomerID string `json:"customer_id"`
	} `json:"remitter"`

	Constraints struct {
		ExecutionWindow string `json:"execution_window"`
	} `json:"constraints"`

	PurposeCode     string    `json:"purpose_code"`
	Source          string    `json:"source"`
	SourceSystem    string    `json:"source_system"`
	ClientPayoutRef     string    `json:"client_payout_ref"`
	ClientBatchRef      string    `json:"client_batch_ref"`
	ProviderHint        string    `json:"provider_hint"`
	IntendedExecutionAt time.Time `json:"intended_execution_at"`

	// Internal Audit Metadata (Excluded from the JSON payload sent downstream)
	SourceRowRef    string  `json:"-"`
	ParseConfidence float64 `json:"-"`
}

type AmountFormat string

const (
	AmountFormatDecimal            AmountFormat = "DECIMAL"              // "1200.00"
	AmountFormatWithCurrencySymbol AmountFormat = "WITH_CURRENCY_SYMBOL" // "₹1,200.00"
	AmountFormatPaise              AmountFormat = "PAISE"                // "120000" (divide by 100)
	AmountFormatIndianComma        AmountFormat = "INDIAN_COMMA"         // "1,20,000.00"
)

// IntentMappingProfile is the tenant-specific configuration stored in DB.
// Note: In the static parser model, this is used primarily for DELIMITER and generic fallback.
type IntentMappingProfile struct {
	ProfileID      string            `db:"profile_id"`
	ProfileVersion string            `db:"profile_version"`
	TenantID       uuid.UUID         `db:"tenant_id"`
	TenantName     string            `db:"tenant_name"`
	FileFormat     string            `db:"file_format"`
	Delimiter      string            `db:"delimiter"`
	HeaderRowIndex int               `db:"header_row_index"`
	ColumnMap      map[string]string `db:"column_map"`
	AmountFormat   AmountFormat      `db:"amount_format"`
	DateFormat     string            `db:"date_format"`
	RequiredFields []string          `db:"required_fields"`
	IsActive       bool              `db:"is_active"`
	CreatedAt      time.Time         `db:"created_at"`
	UpdatedAt      time.Time         `db:"updated_at"`
}
