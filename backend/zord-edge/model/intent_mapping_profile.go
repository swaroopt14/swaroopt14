package model

import (
	"time"

	"github.com/google/uuid"
)

type AmountFormat string

const (
	AmountFormatDecimal            AmountFormat = "DECIMAL"              // "1200.00"
	AmountFormatWithCurrencySymbol AmountFormat = "WITH_CURRENCY_SYMBOL" // "₹1,200.00"
	AmountFormatPaise              AmountFormat = "PAISE"                // "120000" (divide by 100)
	AmountFormatIndianComma        AmountFormat = "INDIAN_COMMA"         // "1,20,000.00"
)

// UniversalIntentShape is the canonical output every parser must produce.
// Downstream systems only ever see this shape — never raw tenant column names.
type UniversalIntentShape struct {
	ClientPayoutRef      string
	ClientBatchRef       string
	BeneficiaryName      string
	BeneficiaryAccountNo string
	BeneficiaryIFSC      string
	BeneficiaryVPA       string
	BeneficiaryEmail     string
	BeneficiaryPhone     string
	BeneficiaryType      string    // VENDOR / EMPLOYEE / CUSTOMER / PARTNER
	Amount               float64
	Currency             string    // ISO 4217, e.g. "INR"
	ProviderHint         string    // "razorpay" / "cashfree"
	RailHint             string    // "NEFT" / "IMPS" / "UPI"
	IntendedExecutionAt  time.Time
	SLADeadlineAt        *time.Time
	PurposeCode          string
	Narration            string
	InternalRemarks      string
	SourceRowRef         string    // e.g. "row:5" — set by parser
	SourceFileRef        string    // S3 path of raw file — set by handler
	ParseConfidence      float64   // 1.0 = clean parse, 0.0 = had errors
	Warnings             []string  // non-fatal issues found during parse
}

// IntentMappingProfile is the tenant-specific configuration stored in DB.
// One row per tenant per file format. The generic parser reads this at runtime.
type IntentMappingProfile struct {
	ProfileID      string            `db:"profile_id"`       // e.g. "meesho-vendor-payout-v1"
	ProfileVersion string            `db:"profile_version"`  // "1.0.0"
	TenantID       uuid.UUID         `db:"tenant_id"`
	TenantName     string            `db:"tenant_name"`
	FileFormat     string            `db:"file_format"`      // "csv" or "xlsx"
	Delimiter      string            `db:"delimiter"`        // "," or "|" or "\t"
	HeaderRowIndex int               `db:"header_row_index"` // usually 0

	// ColumnMap: universal field name → tenant's actual column header string
	// Example: {"client_payout_ref": "Order Reference", "amount": "Payout Amount"}
	ColumnMap      map[string]string `db:"column_map"` // stored as JSONB in DB

	AmountFormat   AmountFormat `db:"amount_format"`
	DateFormat     string       `db:"date_format"`      // Go reference time layout, e.g. "02/01/2006"

	RequiredFields []string `db:"required_fields"` // stored as TEXT[] in DB
	IsActive       bool     `db:"is_active"`
	CreatedAt      time.Time `db:"created_at"`
	UpdatedAt      time.Time `db:"updated_at"`
}
