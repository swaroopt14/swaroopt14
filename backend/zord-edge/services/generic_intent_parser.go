package services

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"

	"zord-edge/model"
)

// GenericColumnMappingParser handles any tenant whose file can be described
// entirely by an IntentMappingProfile ColumnMap. This covers ~90% of tenants.
type GenericColumnMappingParser struct{}

func (p *GenericColumnMappingParser) Parse(
	rows    [][]string,
	headers []string,
	profile *model.IntentMappingProfile,
) ([]model.UniversalIntentShape, []ParseRowError) {

	// Build reverse index: tenant column header → slice position
	// Trim spaces so "  Amount  " and "Amount" both match
	colIndex := make(map[string]int, len(headers))
	for i, h := range headers {
		colIndex[strings.TrimSpace(h)] = i
	}

	var shapes []model.UniversalIntentShape
	var allErrors []ParseRowError

	for rowNum, row := range rows {
		rowNum++ // convert to 1-based

		shape, rowErrors := p.parseRow(rowNum, row, colIndex, profile)
		allErrors = append(allErrors, rowErrors...)

		if len(rowErrors) == 0 {
			shapes = append(shapes, shape)
		}
		// Rows with errors are excluded from shapes; the handler reports them as FAILED
	}

	return shapes, allErrors
}

func (p *GenericColumnMappingParser) parseRow(
	rowNum   int,
	row      []string,
	colIndex map[string]int,
	profile  *model.IntentMappingProfile,
) (model.UniversalIntentShape, []ParseRowError) {

	var errs []ParseRowError

	// get returns the trimmed cell value for the given universal field name.
	// Returns "" if the field is not mapped or column is out of bounds.
	get := func(universalField string) string {
		tenantColName, ok := profile.ColumnMap[universalField]
		if !ok {
			return ""
		}
		idx, ok := colIndex[tenantColName]
		if !ok || idx >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[idx])
	}

	var shape model.UniversalIntentShape

	// — String fields (direct mapping, no transform needed) —
	shape.ClientPayoutRef      = get("client_payout_ref")
	shape.ClientBatchRef       = get("client_batch_ref")
	shape.BeneficiaryName      = get("beneficiary_name")
	shape.BeneficiaryAccountNo = get("beneficiary_account_no")
	shape.BeneficiaryIFSC      = get("beneficiary_ifsc")
	shape.BeneficiaryVPA       = get("beneficiary_vpa")
	shape.BeneficiaryEmail     = get("beneficiary_email")
	shape.BeneficiaryPhone     = get("beneficiary_phone")
	shape.BeneficiaryType      = get("beneficiary_type")
	shape.ProviderHint         = get("provider_hint")
	shape.RailHint             = get("rail_hint")
	shape.PurposeCode          = get("purpose_code")
	shape.Narration            = get("narration")
	shape.InternalRemarks      = get("internal_remarks")

	// — Currency: default to "INR" if tenant file has no currency column —
	shape.Currency = get("currency")
	if shape.Currency == "" {
		shape.Currency = "INR"
	}

	// — Amount: format-aware parsing —
	rawAmt := get("amount")
	amt, err := parseAmountString(rawAmt, profile.AmountFormat)
	if err != nil {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "amount", Message: fmt.Sprintf("cannot parse %q as amount: %v", rawAmt, err)})
	} else if amt <= 0 {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "amount", Message: "amount must be greater than zero"})
	} else {
		shape.Amount = amt
	}

	// — IntendedExecutionAt: parse using profile.DateFormat —
	rawDate := get("intended_execution_at")
	if rawDate != "" {
		t, err := time.Parse(profile.DateFormat, rawDate)
		if err != nil {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "intended_execution_at", Message: fmt.Sprintf("cannot parse %q with format %q: %v", rawDate, profile.DateFormat, err)})
		} else {
			shape.IntendedExecutionAt = t
		}
	}

	// — Required fields check (profile-driven, not hardcoded) —
	for _, requiredField := range profile.RequiredFields {
		if get(requiredField) == "" {
			errs = append(errs, ParseRowError{RowIndex: rowNum, Field: requiredField, Message: "required field is empty or missing"})
		}
	}

	// — Source tracking —
	shape.SourceRowRef    = fmt.Sprintf("row:%d", rowNum)
	shape.ParseConfidence = 1.0
	if len(errs) > 0 {
		shape.ParseConfidence = 0.0
	}

	return shape, errs
}

// parseAmountString handles all four AmountFormat variants.
func parseAmountString(raw string, format model.AmountFormat) (float64, error) {
	if strings.TrimSpace(raw) == "" {
		return 0, fmt.Errorf("amount is empty")
	}

	switch format {

	case model.AmountFormatWithCurrencySymbol, model.AmountFormatIndianComma:
		// Strip everything that is not a digit or decimal point
		cleaned := strings.Map(func(r rune) rune {
			if unicode.IsDigit(r) || r == '.' {
				return r
			}
			return -1
		}, raw)
		return strconv.ParseFloat(cleaned, 64)

	case model.AmountFormatPaise:
		paise, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
		if err != nil {
			return 0, fmt.Errorf("expected integer paise value, got %q", raw)
		}
		return float64(paise) / 100.0, nil

	default: // AmountFormatDecimal
		return strconv.ParseFloat(strings.TrimSpace(raw), 64)
	}
}
