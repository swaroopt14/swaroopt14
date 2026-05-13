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

	Source          string `json:"source,omitempty"`
	SourceSystem    string `json:"source_system,omitempty"`

	// Internal Audit Metadata (Excluded from the JSON payload sent downstream)
	SourceRowRef    string  `json:"-"`
	ParseConfidence float64 `json:"-"`

	// ── Gateway routing ───────────────────────────────────────────────────────
	GatewayName   string `json:"gateway_name,omitempty"`   // "razorpay" / "cashfree" / "payu"
	FundAccountID string `json:"fund_account_id,omitempty"` // fa_XXXXX — if set, gateway skips bank detail lookup
	ContactID     string `json:"contact_id,omitempty"`      // gateway's existing contact record ID

	// ── GST breakdown ─────────────────────────────────────────────────────────
	TaxableValue  float64 `json:"taxable_value,omitempty"` // base amount before GST
	GSTType       string  `json:"gst_type,omitempty"`      // "IGST" (inter-state) | "CGST_SGST" (intra-state)
	IGSTAmount    float64 `json:"igst_amount,omitempty"`
	CGSTAmount    float64 `json:"cgst_amount,omitempty"`
	SGSTAmount    float64 `json:"sgst_amount,omitempty"`
	GSTRate       float64 `json:"gst_rate,omitempty"`       // 5 / 12 / 18 / 28
	VendorGSTIN   string  `json:"vendor_gstin,omitempty"`   // 15-char GSTIN of the vendor
	HSNSACCode    string  `json:"hsn_sac_code,omitempty"`   // HSN (goods) or SAC (services) code
	ReverseCharge bool    `json:"reverse_charge,omitempty"` // if true, buyer pays GST — vendor doesn't charge it

	// ── TDS ───────────────────────────────────────────────────────────────────
	TDSSection    string  `json:"tds_section,omitempty"`     // "194C" / "194J" / "194H" / "192" etc.
	TDSRate       float64 `json:"tds_rate,omitempty"`        // percentage e.g. 2.0
	TDSAmount     float64 `json:"tds_amount,omitempty"`      // deducted before transfer
	NetPayable    float64 `json:"net_payable,omitempty"`     // TaxableValue + GSTAmount - TDSAmount
	PANNumber     string  `json:"pan_number,omitempty"`      // mandatory for TDS reporting
	TANOfDeductor string  `json:"tan_of_deductor,omitempty"` // tenant's TAN for Form 26Q filing

	// ── Product / Invoice context ─────────────────────────────────────────────
	InvoiceNumber string    `json:"invoice_number,omitempty"`
	InvoiceDate   time.Time `json:"invoice_date,omitempty"`
	PONumber      string    `json:"po_number,omitempty"` // Purchase Order this invoice is against
	ProductID     string    `json:"product_id,omitempty"` // SKU / internal item code
	ProductDesc   string    `json:"product_desc,omitempty"`
	MCCCode       string    `json:"mcc_code,omitempty"`       // Merchant Category Code — merchant rows only
	PayoutPurpose string    `json:"payout_purpose,omitempty"` // "refund" / "cashback" / "payout" / "salary"

	// ── KYC / Compliance ──────────────────────────────────────────────────────
	VendorType     string     `json:"vendor_type,omitempty"`      // "INDIVIDUAL" / "PROPRIETORSHIP" / "PVT_LTD" / "LLP" / "PARTNERSHIP"
	KYCStatus      string     `json:"kyc_status,omitempty"`       // "verified" / "pending" / "re_kyc_required" / "suspended"
	KYCPolicyClass string     `json:"kyc_policy_class,omitempty"` // "simplified" / "standard" / "enhanced"
	KYCVerifiedAt  *time.Time `json:"kyc_verified_at,omitempty"`
	BankVerified   bool       `json:"bank_verified,omitempty"`
	CINNumber      string     `json:"cin_number,omitempty"`  // Corporate Identification Number
	MSMENumber     string     `json:"msme_number,omitempty"` // Udyam registration e.g. "UDYAM-MH-00-0000001"

	// Internal
	Warnings []string `json:"-"`
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
	ParserClass    string            `db:"parser_class"` // "generic" / "merchant" / "vendor"
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
