package services

import (
	"fmt"
	"strings"

	"zord-edge/model"
)

// GenericSourceParser handles any tenant whose file can be described entirely
// by an IntentMappingProfile ColumnMap.
// It does NOT use getFromCandidates — every column name comes from the profile.
// This covers all source-type specific tenants (Tally, SAP, ERP, QuickBooks, Custom).
type GenericSourceParser struct {
	baseParser
	profile *model.IntentMappingProfile
}

func NewGenericSourceParser(profile *model.IntentMappingProfile) *GenericSourceParser {
	return &GenericSourceParser{profile: profile}
}

func (p *GenericSourceParser) Parse(rows [][]string, headers []string) ([]model.UniversalIntentShape, []ParseRowError) {
	// Build colIndex from actual file headers (lowercase)
	colIndex := p.buildColIndex(headers)

	var shapes []model.UniversalIntentShape
	var errs []ParseRowError

	for i, row := range rows {
		rowNum := i + 1
		shape, rowErrs := p.parseRow(rowNum, row, colIndex)
		if len(rowErrs) > 0 {
			errs = append(errs, rowErrs...)
		} else {
			shapes = append(shapes, shape)
		}
	}
	return shapes, errs
}

// parseAmount overrides baseParser.parseAmount to support specific profile formats like PAISE.
func (p *GenericSourceParser) parseAmount(raw string) (float64, error) {
	val, err := p.baseParser.parseAmount(raw)
	if err != nil {
		return 0, err
	}
	if p.profile.AmountFormat == model.AmountFormatPaise {
		return val / 100.0, nil
	}
	return val, nil
}

// getField returns the cell value for a universal field name using the profile's ColumnMap.
// Returns "" if the field has no mapping or the column is absent from the file.
func (p *GenericSourceParser) getField(row []string, colIndex map[string]int, universalField string) string {
	tenantColName, ok := p.profile.ColumnMap[universalField]
	if !ok {
		return ""
	}
	idx, ok := colIndex[strings.ToLower(strings.TrimSpace(tenantColName))]
	if !ok || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func (p *GenericSourceParser) parseRow(rowNum int, row []string, colIndex map[string]int) (model.UniversalIntentShape, []ParseRowError) {
	var errs []ParseRowError
	var shape model.UniversalIntentShape

	get := func(field string) string {
		return p.getField(row, colIndex, field)
	}

	// Identity
	shape.SchemaVersion = "1.0.0"
	shape.IntentType = get("intent_type")
	if shape.IntentType == "" {
		shape.IntentType = "PAYOUT"
	}
	shape.AccountNumber = get("account_number")

	// Beneficiary
	shape.Beneficiary.Name = get("beneficiary.name")
	shape.Beneficiary.Instrument.Kind = get("beneficiary.instrument.kind")
	shape.Beneficiary.Instrument.IFSC = get("beneficiary.instrument.ifsc")
	shape.Beneficiary.Instrument.VPA = get("beneficiary.instrument.vpa")
	shape.Beneficiary.Country = get("beneficiary.country")

	// Remitter
	shape.Remitter.Phone = get("remitter.phone")
	shape.Remitter.Email = get("remitter.email")
	shape.Remitter.CustomerID = get("remitter.customer_id")

	// References
	shape.ClientPayoutRef = get("client_payout_ref")
	shape.ClientBatchRef = get("client_batch_ref")
	shape.IdempotencyKey = get("idempotency_key")
	shape.PurposeCode = get("purpose_code")
	shape.ProviderHint = get("provider_hint")
	shape.IntendedExecutionAt = get("intended_execution_at")
	shape.Source = get("source")
	shape.SourceSystem = get("source_system")

	// Amount — use profile's AmountFormat
	shape.Amount.Currency = get("amount.currency")
	if shape.Amount.Currency == "" {
		shape.Amount.Currency = "INR" // only default applied here — transparent, not silent
	}
	amtStr := get("amount.value")
	amt, err := p.parseAmount(amtStr)
	if err != nil {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "amount", Message: err.Error()})
	} else {
		shape.Amount.Value = fmt.Sprintf("%.2f", amt)
	}

	// Constraints
	shape.Constraints = make(map[string]any)
	if window := get("constraints.execution_window"); window != "" {
		shape.Constraints["execution_window"] = window
	}

	// Required fields check from profile
	for _, required := range p.profile.RequiredFields {
		if get(required) == "" {
			errs = append(errs, ParseRowError{
				RowIndex: rowNum,
				Field:    required,
				Message:  fmt.Sprintf("required field %q is empty or missing from file", required),
			})
		}
	}

	// Structural check
	if shape.AccountNumber == "" && shape.Beneficiary.Instrument.VPA == "" {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "account_number", Message: "missing account number or vpa"})
	}

	shape.SourceRowRef = fmt.Sprintf("row:%d", rowNum)
	shape.ParseConfidence = 1.0

	return shape, errs
}
