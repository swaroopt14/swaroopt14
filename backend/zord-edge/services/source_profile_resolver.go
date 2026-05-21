package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"zord-edge/model"

	"github.com/lib/pq"
)

// ResolveProfile looks up the best matching IntentMappingProfile for a file upload.
//
// Selection priority:
//  1. tenant_id + file_format + source_type exact match
//  2. tenant_id + file_format + source_type = '' (tenant default profile)
//  3. nil — caller falls back to GetParserByType
//
// sourceType comes from the X-Zord-Source-System request header.
// If empty, DetectSourceType is called to infer from file headers.
func ResolveProfile(
	ctx context.Context,
	db *sql.DB,
	tenantID string,
	fileFormat string, // "csv" or "xlsx"
	sourceType string, // from X-Zord-Source-System header, may be ""
	fileHeaders []string, // actual column headers read from file
) (*model.IntentMappingProfile, error) {

	// If no source type provided, infer from file headers
	if sourceType == "" {
		sourceType = DetectSourceType(fileHeaders)
	}

	// Priority 1: exact match on tenant + format + source_type
	if sourceType != "" {
		profile, err := loadProfile(ctx, db, tenantID, fileFormat, sourceType)
		if err == nil && profile != nil {
			return profile, nil
		}
	}

	// Priority 2: tenant default (source_type = '')
	profile, err := loadProfile(ctx, db, tenantID, fileFormat, "")
	if err == nil && profile != nil {
		return profile, nil
	}

	// Priority 3: no profile found
	return nil, nil
}

func loadProfile(ctx context.Context, db *sql.DB, tenantID, fileFormat, sourceType string) (*model.IntentMappingProfile, error) {
	const q = `
        SELECT profile_id, profile_version, tenant_id, tenant_name,
               file_format, delimiter, header_row_index,
               column_map, amount_format, date_format,
               required_fields, is_active, parser_class, source_type,
               created_at, updated_at
        FROM   intent_mapping_profiles
        WHERE  tenant_id   = $1
          AND  file_format = $2
          AND  source_type = $3
          AND  is_active   = true
        ORDER BY created_at DESC
        LIMIT 1`

	row := db.QueryRowContext(ctx, q, tenantID, fileFormat, sourceType)

	var p model.IntentMappingProfile
	var columnMapRaw []byte
	var requiredFields pq.StringArray

	err := row.Scan(
		&p.ProfileID, &p.ProfileVersion, &p.TenantID, &p.TenantName,
		&p.FileFormat, &p.Delimiter, &p.HeaderRowIndex,
		&columnMapRaw, (*string)(&p.AmountFormat), &p.DateFormat,
		&requiredFields, &p.IsActive, &p.ParserClass, &p.SourceType,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(columnMapRaw, &p.ColumnMap); err != nil {
		return nil, err
	}
	p.RequiredFields = []string(requiredFields)

	return &p, nil
}

// DetectSourceType infers the source system from the file's column headers.
// This runs when X-Zord-Source-System header is not provided.
//
// Detection is signature-based: each source system has a unique set of
// column names that don't appear in other systems.
func DetectSourceType(headers []string) string {
	// Normalize headers for matching
	normalized := make(map[string]bool, len(headers))
	for _, h := range headers {
		normalized[strings.ToLower(strings.TrimSpace(h))] = true
	}

	// Tally signatures: uses "amt", "ledger name", "voucher type", "vch no"
	tallyScore := 0
	if normalized["amt"] {
		tallyScore++
	}
	if normalized["ledger name"] {
		tallyScore++
	}
	if normalized["voucher type"] {
		tallyScore++
	}
	if normalized["vch no"] {
		tallyScore++
	}
	if normalized["voucher no"] {
		tallyScore++
	}
	if tallyScore >= 2 {
		return model.SourceTypeTally
	}

	// SAP signatures: uses "posting amount", "cost center", "g/l account", "document no"
	sapScore := 0
	if normalized["posting amount"] {
		sapScore++
	}
	if normalized["cost center"] {
		sapScore++
	}
	if normalized["g/l account"] || normalized["gl account"] {
		sapScore++
	}
	if normalized["document no"] || normalized["document number"] {
		sapScore++
	}
	if normalized["company code"] {
		sapScore++
	}
	if sapScore >= 2 {
		return model.SourceTypeSAP
	}

	// QuickBooks signatures
	qbScore := 0
	if normalized["memo"] {
		qbScore++
	}
	if normalized["debit amount"] {
		qbScore++
	}
	if normalized["credit amount"] {
		qbScore++
	}
	if normalized["payee"] {
		qbScore++
	}
	if qbScore >= 2 {
		return model.SourceTypeQuickbooks
	}

	// Generic ERP: has "amount" explicitly (not "amt") with standard names
	if normalized["amount"] && (normalized["beneficiary_name"] || normalized["account_number"]) {
		return model.SourceTypeERP
	}

	return "" // unknown — use tenant default profile
}
