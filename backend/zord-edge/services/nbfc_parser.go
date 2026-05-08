package services

import (
	"fmt"
	"zord-edge/model"
)

type NBFCParser struct {
	baseParser
}

func (p *NBFCParser) Parse(rows [][]string, headers []string) ([]model.UniversalIntentShape, []ParseRowError) {
	colIndex := p.buildColIndex(headers)
	var shapes []model.UniversalIntentShape
	var errs []ParseRowError

	// Static mapping for NBFCs
	mapping := map[string]string{
		"beneficiary_name":       "customer_name",
		"beneficiary_account_no": "loan_account_number",
		"beneficiary_ifsc":      "ifsc_code",
		"amount":                 "disbursal_amount",
		"client_payout_ref":      "loan_id",
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

func (p *NBFCParser) parseRow(rowNum int, row []string, colIndex map[string]int, mapping map[string]string) (model.UniversalIntentShape, []ParseRowError) {
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
	
	shape.Amount.Currency = "INR"
	amtStr := getValue("amount")
	amt, err := p.parseAmount(amtStr)
	if err != nil {
		errs = append(errs, ParseRowError{RowIndex: rowNum, Field: "amount", Message: err.Error()})
	} else {
		shape.Amount.Value = amt
	}

	shape.SourceRowRef = fmt.Sprintf("row:%d", rowNum)
	shape.ParseConfidence = 1.0

	return shape, errs
}
