package services

import (
	"fmt"
	"zord-edge/model"
)

type BankParser struct {
	baseParser
}

func (p *BankParser) Parse(rows [][]string, headers []string) ([]model.UniversalIntentShape, []ParseRowError) {
	colIndex := p.buildColIndex(headers)
	var shapes []model.UniversalIntentShape
	var errs []ParseRowError

	// Static mapping for BANKS
	mapping := map[string]string{
		"beneficiary_name":       "beneficiary name",
		"beneficiary_account_no": "account number",
		"beneficiary_ifsc":      "ifsc",
		"amount":                 "amount",
		"client_payout_ref":      "transaction id",
		"narration":              "remarks",
	}

	for i, row := range rows {
		rowNum := i + 1
		shape, rowErrs := p.parseRow(rowNum, row, colIndex, mapping)
		if len(rowErrs) > 0 {
			errs = append(errs, rowErrs...)
		} else {
			shapes = append(shapes, shape)
		}
	}
	return shapes, errs
}

func (p *BankParser) parseRow(rowNum int, row []string, colIndex map[string]int, mapping map[string]string) (model.UniversalIntentShape, []ParseRowError) {
	var errs []ParseRowError
	var shape model.UniversalIntentShape

	getValue := func(field string) string {
		header, ok := mapping[field]
		if !ok {
			return ""
		}
		idx, ok := colIndex[header]
		if !ok {
			return ""
		}
		return p.get(row, idx)
	}

	// Populate Nested Structure
	shape.SchemaVersion = "1.0.0"
	shape.IntentType = "PAYOUT"
	
	shape.Beneficiary.Name = getValue("beneficiary_name")
	shape.Beneficiary.Instrument.Kind = "BANK_ACCOUNT"
	shape.Beneficiary.Instrument.AccountNo = getValue("beneficiary_account_no")
	shape.Beneficiary.Instrument.IFSC = getValue("beneficiary_ifsc")
	shape.Beneficiary.Country = "IN"

	shape.ClientPayoutRef = getValue("client_payout_ref")
	shape.PurposeCode = getValue("narration") // using narration as purpose for now
	
	shape.Amount.Currency = "INR"
	amtStr := getValue("amount")
	amt, err := p.parseAmount(amtStr)
	if err != nil {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "amount", Message: err.Error()})
	} else {
		shape.Amount.Value = amt
	}

	// Static validation
	if shape.Beneficiary.Instrument.AccountNo == "" {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "beneficiary_account_no", Message: "missing account number"})
	}

	shape.SourceRowRef = fmt.Sprintf("row:%d", rowNum)
	shape.ParseConfidence = 1.0

	return shape, errs
}
