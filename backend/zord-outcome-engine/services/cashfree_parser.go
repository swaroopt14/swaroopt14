package services

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"zord-outcome-engine/models"
)

// CashfreeParser implements SettlementParser for Cashfree settlement CSV exports.
// The file is a standard CSV delivered from Cashfree's merchant dashboard.
// If Cashfree export has different columns, update cashfreeHeaders and the column index constants below.
type CashfreeParser struct{}

// Column index constants for the Cashfree settlement CSV.
// Update these if Cashfree changes their export format.
// Original CSV columns: settlement_id, cf_payment_id, order_id, order_amount, merchant_settlement_utr,
// settled_amount, service_charge, service_tax, settlement_date, transaction_type.
const (
	cfColSettlementID   = 0
	cfColPaymentID      = 1
	cfColOrderID        = 2
	cfColOrderAmount    = 3
	cfColUTR            = 4
	cfColSettledAmount  = 5
	cfColServiceCharge  = 6
	cfColServiceTax     = 7
	cfColSettlementDate = 8
	cfColTxType         = 9
)

var cashfreeHeaders = []string{
	"settlement_id", "cf_payment_id", "order_id", "order_amount", "merchant_settlement_utr",
	"settled_amount", "service_charge", "service_tax", "settlement_date", "transaction_type",
}

// Parse reads raw file bytes and returns one ParsedRowResult per data row.
func (p *CashfreeParser) Parse(fileBytes []byte, sourceFileRef string, envelopeID uuid.UUID) ([]ParsedRowResult, error) {
	reader := csv.NewReader(bytes.NewReader(fileBytes))
	
	// Read header and validate
	header, err := reader.Read()
	if err != nil {
		if err == io.EOF {
			return nil, fmt.Errorf("cashfree parser: header mismatch: expected cashfree settlement format")
		}
		return nil, fmt.Errorf("cashfree parser: failed to read csv: %w", err)
	}

	if len(header) < len(cashfreeHeaders) {
		return nil, fmt.Errorf("cashfree parser: header mismatch: expected cashfree settlement format")
	}

	for i, expected := range cashfreeHeaders {
		got := strings.TrimSpace(strings.ToLower(header[i]))
		if got != expected {
			return nil, fmt.Errorf("cashfree parser: header mismatch: expected cashfree settlement format")
		}
	}

	var results []ParsedRowResult
	// rowIndex tracks the 1-based data row number (header = 0, first data row = 1).
	// Incrementing before parseCashfreeRow ensures the first data row is always 1,
	// consistent with the Razorpay parser's numbering.
	rowIndex := 0
	for {
		row, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			// Track malformed rows as failed results.
			rowIndex++
			results = append(results, ParsedRowResult{
				RowIndex:      rowIndex,
				Failed:        true,
				FailureReason: fmt.Sprintf("csv parse error at row %d: %v", rowIndex, err),
			})
			continue
		}
		rowIndex++

		result := parseCashfreeRow(row, rowIndex, sourceFileRef, envelopeID)
		results = append(results, result)
	}

	return results, nil
}

func parseCashfreeRow(row []string, rowIndex int, sourceFileRef string, envelopeID uuid.UUID) ParsedRowResult {
	confidence := 1.0
	var warnings []string

	rawCols := make(map[string]string, len(cashfreeHeaders))
	for i, h := range cashfreeHeaders {
		rawCols[h] = cellStr(row, i)
	}

	orderAmount := parseDecimal(cellStr(row, cfColOrderAmount))
	settledAmount := parseDecimal(cellStr(row, cfColSettledAmount))
	serviceCharge := parseDecimal(cellStr(row, cfColServiceCharge))
	serviceTax := parseDecimal(cellStr(row, cfColServiceTax))

	dateStr := cellStr(row, cfColSettlementDate)
	var observationTS time.Time
	var tsWarning string

	if t, err := time.Parse("2006-01-02", dateStr); err == nil {
		observationTS = t.UTC()
	} else {
		observationTS, tsWarning = parseSettlementDate(dateStr)
	}
	
	if tsWarning != "" {
		warnings = append(warnings, "observation_timestamp: "+tsWarning)
		confidence -= 0.1
	}
	valueDate := observationTS

	providerRef := cellStr(row, cfColPaymentID)
	bankRef := cellStr(row, cfColUTR)
	extRef := cellStr(row, cfColOrderID)
	batchRef := cellStr(row, cfColSettlementID)

	if bankRef == "" {
		confidence -= 0.1
		warnings = append(warnings, "missing bank_reference (merchant_settlement_utr)")
	}
	if providerRef == "" {
		confidence -= 0.1
		warnings = append(warnings, "missing provider_reference (cf_payment_id)")
	}
	if confidence < 0.0 { confidence = 0.0 }

	txType := strings.ToUpper(strings.TrimSpace(cellStr(row, cfColTxType)))
	observationKind := "OUTCOME_EXPORT"
	statusCandidate := ""

	switch txType {
	case "SETTLEMENT":
		observationKind = "SETTLEMENT"
		statusCandidate = "SETTLED"
	case "REFUND":
		observationKind = "REVERSAL"
		statusCandidate = "REVERSED"
	default:
		// Unknown transaction types are stored as OUTCOME_EXPORT with UNKNOWN status.
		// This prevents empty settlement_status which breaks downstream intelligence.
		// Add new cases above as Cashfree introduces new transaction_type values.
		observationKind = "OUTCOME_EXPORT"
		statusCandidate = "UNKNOWN"
	}

	settledMinor := int64(math.Round(settledAmount * 100))
	feeMinor := int64(math.Round(serviceCharge * 100))
	taxMinor := int64(math.Round(serviceTax * 100))

	shape := models.UniversalSettlementShape{
		ArtifactFamily:           "PSP_SETTLEMENT_RECON",
		SourceSystem:             "cashfree",
		SourceStrengthClass:      "PSP_REPORT",
		SourceFileRef:            sourceFileRef,
		SourceRowRef:             strconv.Itoa(rowIndex),
		ProviderReference:        strPtr(providerRef),
		BankReference:            strPtr(bankRef),
		ExternalReference:        strPtr(extRef),
		ClientReferenceCandidate: strPtr(batchRef),
		BatchReference:           strPtr(batchRef),
		AmountMinor:              int64(math.Round(orderAmount * 100)),
		SettledAmountMinor:       &settledMinor,
		FeeAmountMinor:           &feeMinor,
		DeductionAmountMinor:     &taxMinor,
		// Cashfree India settlement exports do not include a currency column.
		// All domestic Cashfree settlements are in Indian Rupees.
		// When multi-currency support is needed, add currency to the profile config.
		CurrencyCode:             "INR",
		StatusCandidate:          statusCandidate,
		ObservationKind:          observationKind,
		ReversalFlag:             txType == "REFUND",
		ObservationTimestamp:     observationTS,
		ValueDate:                &valueDate,
		ParseConfidence:          confidence,
		RawEnvelopeRef:           envelopeID,
		CarrierCandidates:        make(map[string]interface{}),
		PartyReferenceCandidates: make(map[string]interface{}),
		BeneficiaryIdentityCandidates: make(map[string]interface{}),
	}

	return ParsedRowResult{
		RowIndex:   rowIndex,
		Shape:      shape,
		RawColumns: rawCols,
		Warnings:   warnings,
		Confidence: confidence,
	}
}
