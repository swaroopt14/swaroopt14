package services

import (
	"bytes"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
	"zord-outcome-engine/models"
)

// Razorpay Recon Header Configuration (Reference for 27-column XLSX)
var razorpayHeaders = []string{
	"transaction_entity", "entity_id", "amount", "currency",
	"fee (exclusive tax)", "tax", "debit", "credit",
	"payment_method", "card_type", "issuer_name", "entity_created_at",
	"payment_captured_at", "payment_notes", "refund_notes", "arn",
	"entity_description", "order_id", "order_receipt", "order_notes",
	"dispute_id", "dispute_created_at", "dispute_reason", "settlement_id",
	"settled_at", "settlement_utr", "settled_by",
}

// ParsedRowResult captures the standard output of parsing a single spreadsheet row.
// Used to decouple parsing logic from the database storage layer.
type ParsedRowResult struct {
	RowIndex      int
	Shape         models.UniversalSettlementShape
	RawColumns    map[string]string // Key-value map of original column headers to cell values
	Warnings      []string          // Non-fatal parse issues
	Confidence    float64           // 0.0 to 1.0 scoring based on data richness
	Failed        bool              // Flag for fatal row-level failure
	FailureReason string            // Description if Failed is true
}

// RazorpayParser implements the parser for Razorpay settlement recon sheets.
type RazorpayParser struct{}

// Parse processes the raw XLSX bytes and converts each row into a UniversalSettlementShape.
func (p *RazorpayParser) Parse(fileBytes []byte, sourceFileRef string, envelopeID uuid.UUID) ([]ParsedRowResult, error) {
	// 1. Initialize excelize reader from raw bytes.
	f, err := excelize.OpenReader(bytes.NewReader(fileBytes))
	if err != nil {
		return nil, fmt.Errorf("razorpay parser: corrupt or invalid xlsx: %w", err)
	}
	defer f.Close()

	// 2. Locate the data sheet (default to first sheet).
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("razorpay parser: file has no sheets")
	}

	rows, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, fmt.Errorf("razorpay parser: failed to extract rows: %w", err)
	}

	if len(rows) == 0 {
		return nil, fmt.Errorf("razorpay parser: empty file")
	}

	// 3. Header Validation: Ensure the columns match the expected Razorpay format.
	if err := validateRazorpayHeaders(rows[0]); err != nil {
		return nil, err
	}

	// 4. Row Transformation: Iterate through data rows (skipping header at row 0).
	var results []ParsedRowResult
	for i, row := range rows[1:] {
		rowIndex := i + 1 
		result := parseRazorpayRow(row, rowIndex, sourceFileRef, envelopeID)
		results = append(results, result)
	}
	return results, nil
}

// validateRazorpayHeaders checks for column sequence and count integrity.
func validateRazorpayHeaders(headerRow []string) error {
	if len(headerRow) < len(razorpayHeaders) {
		return fmt.Errorf("header mismatch: expected %d columns, got %d", len(razorpayHeaders), len(headerRow))
	}
	for i, expected := range razorpayHeaders {
		got := strings.TrimSpace(strings.ToLower(headerRow[i]))
		if got != expected {
			return fmt.Errorf("header mismatch: col %d expected %q, got %q", i, expected, got)
		}
	}
	return nil
}

// parseRazorpayRow performs the actual field mapping and normalization for a single row.
func parseRazorpayRow(row []string, rowIndex int, sourceFileRef string, envelopeID uuid.UUID) ParsedRowResult {
	confidence := 1.0
	var warnings []string

	// Capture Raw Columns for audit transparency.
	rawCols := make(map[string]string, len(razorpayHeaders))
	for i, h := range razorpayHeaders {
		rawCols[h] = cellStr(row, i)
	}

	// Handle Amount Conversion: Convert decimal string to Minor units (int64).
	amount := parseDecimal(cellStr(row, 2))
	fee := parseDecimal(cellStr(row, 4))
	tax := parseDecimal(cellStr(row, 5))
	debit := parseDecimal(cellStr(row, 6))
	credit := parseDecimal(cellStr(row, 7))

	// Handle Date Normalization: Try multiple formats, fallback to Now() if missing/corrupt.
	observationTS, tsWarning := parseSettlementDate(cellStr(row, 12)) // payment_captured_at
	if tsWarning != "" {
		warnings = append(warnings, "observation_timestamp: "+tsWarning)
		confidence -= 0.1
	}

	valueDate, vdWarning := parseSettlementDate(cellStr(row, 24)) // settled_at
	if vdWarning != "" {
		warnings = append(warnings, "value_date: "+vdWarning)
		// We don't necessarily penalize confidence for value_date if observationTS is present,
		// but we should definitely track the warning as requested.
	}

	// Extract References.
	providerRef := cellStr(row, 1)    // entity_id
	bankRef := cellStr(row, 25)        // settlement_utr
	extRef := cellStr(row, 17)         // order_id
	clientRefCand := cellStr(row, 18)  // order_receipt
	batchRef := cellStr(row, 23)       // settlement_id

	// Calculate Confidence based on key identifier presence.
	if bankRef == "" {
		confidence -= 0.1
		warnings = append(warnings, "missing bank_reference (settlement_utr)")
	}
	if providerRef == "" {
		confidence -= 0.1
		warnings = append(warnings, "missing provider_reference (entity_id)")
	}
	if confidence < 0.0 { confidence = 0.0 }

	// Determine Observation Kind based on Razorpay's entity type.
	txEntity := strings.ToLower(strings.TrimSpace(cellStr(row, 0)))
	observationKind := "OUTCOME_EXPORT"
	switch txEntity {
	case "payment": observationKind = "SETTLEMENT"
	case "refund":  observationKind = "REVERSAL"
	}

	// Determine Status based on directional credit/debit.
	statusCandidate := "SETTLED"
	if debit > 0 { statusCandidate = "REVERSED" }

	// Construct the Universal Shape.
	creditMinor := int64(math.Round(credit * 100))
	feeMinor := int64(math.Round(fee * 100))
	taxMinor := int64(math.Round(tax * 100))

	shape := models.UniversalSettlementShape{
		ArtifactFamily:      "PSP_SETTLEMENT_RECON",
		SourceSystem:        "razorpay",
		SourceStrengthClass: "PSP_REPORT",
		SourceFileRef:       sourceFileRef,
		SourceRowRef:        strconv.Itoa(rowIndex),
		ProviderReference:   strPtr(providerRef),
		BankReference:       strPtr(bankRef),
		ExternalReference:   strPtr(extRef),
		ClientReferenceCandidate: strPtr(clientRefCand),
		BatchReference:      strPtr(batchRef),
		AmountMinor:         int64(math.Round(amount * 100)),
		SettledAmountMinor:  &creditMinor,
		FeeAmountMinor:      &feeMinor,
		DeductionAmountMinor: &taxMinor,
		CurrencyCode:        cellStr(row, 3),
		StatusCandidate:     statusCandidate,
		ObservationKind:     observationKind,
		ReversalFlag:        debit > 0,
		ObservationTimestamp: observationTS,
		ValueDate:           &valueDate,
		ParseConfidence:     confidence,
		RawEnvelopeRef:      envelopeID,
		CarrierCandidates:   map[string]interface{}{},
	}

	if shape.CarrierCandidates == nil {
		shape.CarrierCandidates = make(map[string]interface{})
	}
	shape.PartyReferenceCandidates = make(map[string]interface{})
	shape.BeneficiaryIdentityCandidates = make(map[string]interface{})

	return ParsedRowResult{
		RowIndex:   rowIndex,
		Shape:      shape,
		RawColumns: rawCols,
		Warnings:   warnings,
		Confidence: confidence,
	}
}

func cellStr(row []string, idx int) string {
	if idx < 0 || idx >= len(row) { return "" }
	return strings.TrimSpace(row[idx])
}

func parseDecimal(s string) float64 {
	if s == "" { return 0 }
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func parseSettlementDate(s string) (time.Time, string) {
	if s == "" { return time.Now().UTC(), "empty" }
	// Common Razorpay recon date formats.
	layouts := []string{"02/01/2006 15:04:05", "2006-01-02 15:04:05"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), ""
		}
	}
	return time.Now().UTC(), "format error"
}
