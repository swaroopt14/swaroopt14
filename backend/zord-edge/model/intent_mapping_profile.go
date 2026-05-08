package model

import (
	"time"

	"github.com/google/uuid"
)

// UniversalIntentShape is the canonical nested structure expected by the zord-intent-engine.
// This model is a 1:1 mirror of models.ParsedIncomingIntent in Service 2.
type UniversalIntentShape struct {
	SchemaVersion string `json:"schema_version"`
	IntentType    string `json:"intent_type"`
	AccountNumber string `json:"account_number"` // Top level expected by Service 2

	Amount struct {
		Value    string `json:"value"` // Expected as string for precision
		Currency string `json:"currency"`
	} `json:"amount"`

	Beneficiary struct {
		Name       string `json:"name"`
		Instrument struct {
			Kind string `json:"kind"`
			IFSC string `json:"ifsc,omitempty"`
			VPA  string `json:"vpa,omitempty"`
		} `json:"instrument"`
		Country string `json:"country"`
	} `json:"beneficiary"`

	Remitter struct {
		Phone      string `json:"phone,omitempty"`
		Email      string `json:"email,omitempty"`
		CustomerID string `json:"customer_id,omitempty"`
	} `json:"remitter,omitempty"`

	Constraints map[string]any `json:"constraints,omitempty"`

	PurposeCode     string    `json:"purpose_code"`
	IdempotencyKey  string    `json:"idempotency_key"`
	ClientPayoutRef string    `json:"client_payout_ref,omitempty"`
	ClientBatchRef  string    `json:"client_batch_ref,omitempty"`
	ProviderHint    string    `json:"provider_hint,omitempty"`
	IntendedExecutionAt string `json:"intended_execution_at,omitempty"`

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
