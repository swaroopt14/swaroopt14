package persistence

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"zord-intent-engine/internal/models"
)

// NEW INTERFACE FOR API ENDPOINTS

type IntentQueryRepository interface {
	ListIntents(ctx context.Context, filter IntentFilter) ([]models.CanonicalIntent, int, error)
	GetIntentByID(ctx context.Context, intentID string) (models.CanonicalIntent, error)
	ListBatchesForSidebar(ctx context.Context, tenantID string) ([]models.BatchSidebarItem, error)

	ListPaymentIntentsByBatch(ctx context.Context, tenantID, batchID string, page, pageSize int) ([]models.CanonicalIntent, int, error)
	ListDLQItemsByBatch(ctx context.Context, tenantID, batchID string, page, pageSize int) ([]models.DLQEntry, int, error)
}

// FILTER STRUCT
type IntentFilter struct {
	TenantID   string
	Status     string
	IntentType string
	Page       int
	PageSize   int
}

//  NEW POSTGRES IMPLEMENTATION

type IntentQueryRepo struct {
	db *sql.DB
}

// NewIntentQueryRepo creates a new query repository for API endpoints
// This is SEPARATE from NewPaymentIntentRepo - both can coexist!
func NewIntentQueryRepo(db *sql.DB) *IntentQueryRepo {
	return &IntentQueryRepo{db: db}
}

// LIST INTENTS
func (r *IntentQueryRepo) ListIntents(
	ctx context.Context,
	filter IntentFilter,
) ([]models.CanonicalIntent, int, error) {

	// Build dynamic WHERE clause
	var conditions []string
	var args []interface{}
	argPosition := 1

	if filter.TenantID != "" {
		conditions = append(conditions, fmt.Sprintf("tenant_id = $%d", argPosition))
		args = append(args, filter.TenantID)
		argPosition++
	}

	if filter.Status != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argPosition))
		args = append(args, filter.Status)
		argPosition++
	}

	if filter.IntentType != "" {
		conditions = append(conditions, fmt.Sprintf("intent_type = $%d", argPosition))
		args = append(args, filter.IntentType)
		argPosition++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Get total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM payment_intents %s", whereClause)

	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count intents: %w", err)
	}

	// Fetch paginated results
	offset := (filter.Page - 1) * filter.PageSize

	dataQuery := fmt.Sprintf(`
	SELECT 
		intent_id, envelope_id, tenant_id, contract_id,
		intent_type, canonical_version, 
		COALESCE(schema_version, '') as schema_version,
		amount, currency, intended_execution_at,
		COALESCE(constraints, '{}'::jsonb) as constraints, 
		COALESCE(beneficiary_type, '') as beneficiary_type,
		COALESCE(pii_tokens, '{}'::jsonb) as pii_tokens,
		COALESCE(beneficiary, '{}'::jsonb) as beneficiary,
		status, confidence_score, created_at,
		COALESCE(client_payout_ref, '') as client_payout_ref,
		COALESCE(request_fingerprint, '') as request_fingerprint,
		COALESCE(routing_hints_json, '{}'::jsonb) as routing_hints_json,
		COALESCE(governance_state, '') as governance_state,
		COALESCE(business_state, '') as business_state,
		COALESCE(duplicate_risk_flag, false) as duplicate_risk_flag,
		COALESCE(mapping_profile_version, '') as mapping_profile_version,
		updated_at,
		canonical_snapshot_ref,
		COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
		COALESCE(governance_hash, '') as governance_hash,
		aggregate_confidence_score -- NEW
	FROM payment_intents
	%s
	ORDER BY created_at DESC
	LIMIT $%d OFFSET $%d
`, whereClause, argPosition, argPosition+1)

	args = append(args, filter.PageSize, offset)

	rows, err := r.db.QueryContext(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch intents: %w", err)
	}
	defer rows.Close()

	var intents []models.CanonicalIntent

	for rows.Next() {
		var intent models.CanonicalIntent

		err := rows.Scan(
			&intent.IntentID,
			&intent.EnvelopeID,
			&intent.TenantID,
			&intent.ContractID,
			&intent.IntentType,
			&intent.CanonicalVersion,
			&intent.SchemaVersion,
			&intent.Amount,
			&intent.Currency,
			&intent.IntendedExecutionAt,
			&intent.Constraints,
			&intent.BeneficiaryType,
			&intent.PIITokens,
			&intent.Beneficiary,
			&intent.Status,
			&intent.ConfidenceScore,
			&intent.CreatedAt,
			&intent.ClientPayoutRef,
			&intent.RequestFingerprint,
			&intent.RoutingHintsJSON,
			&intent.GovernanceState,
			&intent.BusinessState,
			&intent.DuplicateRiskFlag,
			&intent.MappingProfileVersion,
			&intent.UpdatedAt,
			&intent.CanonicalSnapshotRef,
			&intent.NIRSnapshotRef,
			&intent.GovernanceSnapshotRef,
			&intent.GovernanceHash,
			&intent.AggregateConfidenceScore, // NEW
		)

		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan intent: %w", err)
		}

		intents = append(intents, intent)
	}

	if err = rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating intents: %w", err)
	}

	return intents, total, nil
}

// GET BY ID
func (r *IntentQueryRepo) GetIntentByID(
	ctx context.Context,
	intentID string,
) (models.CanonicalIntent, error) {

	query := `
	SELECT 
		intent_id, envelope_id, tenant_id, contract_id,
		intent_type, canonical_version,
		COALESCE(schema_version, '') as schema_version,
		amount, currency, intended_execution_at,
		COALESCE(constraints, '{}'::jsonb) as constraints,
		COALESCE(beneficiary_type, '') as beneficiary_type,
		COALESCE(pii_tokens, '{}'::jsonb) as pii_tokens,
		COALESCE(beneficiary, '{}'::jsonb) as beneficiary,
		status, confidence_score, created_at,
		COALESCE(client_payout_ref, '') as client_payout_ref,
		COALESCE(request_fingerprint, '') as request_fingerprint,
		COALESCE(routing_hints_json, '{}'::jsonb) as routing_hints_json,
		COALESCE(governance_state, '') as governance_state,
		COALESCE(business_state, '') as business_state,
		COALESCE(duplicate_risk_flag, false) as duplicate_risk_flag,
		COALESCE(mapping_profile_version, '') as mapping_profile_version,
		updated_at,
		canonical_snapshot_ref,
		COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
		COALESCE(governance_hash, '') as governance_hash,
		aggregate_confidence_score
	FROM payment_intents
	WHERE intent_id = $1
`

	var intent models.CanonicalIntent

	err := r.db.QueryRowContext(ctx, query, intentID).Scan(
		&intent.IntentID,
		&intent.EnvelopeID,
		&intent.TenantID,
		&intent.ContractID,
		&intent.IntentType,
		&intent.CanonicalVersion,
		&intent.SchemaVersion,
		&intent.Amount,
		&intent.Currency,
		&intent.IntendedExecutionAt,
		&intent.Constraints,
		&intent.BeneficiaryType,
		&intent.PIITokens,
		&intent.Beneficiary,
		&intent.Status,
		&intent.ConfidenceScore,
		&intent.CreatedAt,
		&intent.ClientPayoutRef,
		&intent.RequestFingerprint,
		&intent.RoutingHintsJSON,
		&intent.GovernanceState,
		&intent.BusinessState,
		&intent.DuplicateRiskFlag,
		&intent.MappingProfileVersion,
		&intent.UpdatedAt,
		&intent.CanonicalSnapshotRef,
		&intent.NIRSnapshotRef,
		&intent.GovernanceSnapshotRef,
		&intent.GovernanceHash,
		&intent.AggregateConfidenceScore, // NEW
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.CanonicalIntent{}, errors.New("intent not found")
		}
		return models.CanonicalIntent{}, fmt.Errorf("failed to fetch intent: %w", err)
	}

	return intent, nil
}
func (r *IntentQueryRepo) ListBatchesForSidebar(
	ctx context.Context,
	tenantID string,
) ([]models.BatchSidebarItem, error) {
	const primaryQuery = `
		SELECT
			pi.batchid,
			pi.intent_type,
			COALESCE(SUM(pi.amount), 0)::text AS total_value,
			COUNT(*) AS transactions,
			COUNT(*) AS confirmed_count,
			MAX(pi.aggregate_confidence_score) AS high_confidence_count,
			SUM(CASE WHEN pi.duplicate_risk_flag = true THEN 1 ELSE 0 END) AS mismatch_count,
			(
				SELECT COUNT(*)
				FROM dlq_items d
				WHERE d.tenant_id = $1
				  AND d.client_batch_ref = pi.batchid
			) AS unresolved_count
		FROM payment_intents pi
		WHERE pi.tenant_id = $1
		  AND pi.batchid IS NOT NULL
		  AND pi.batchid <> ''
		GROUP BY pi.batchid, pi.intent_type
		ORDER BY MAX(pi.created_at) DESC
	`

	scanRows := func(rows *sql.Rows) ([]models.BatchSidebarItem, error) {
		defer rows.Close()

		items := make([]models.BatchSidebarItem, 0)
		for rows.Next() {
			var item models.BatchSidebarItem
			var highConfidence sql.NullFloat64

			if err := rows.Scan(
				&item.BatchID,
				&item.Type,
				&item.TotalValue,
				&item.Transactions,
				&item.ConfirmedCount,
				&highConfidence,
				&item.MismatchCount,
				&item.UnresolvedCount,
			); err != nil {
				return nil, fmt.Errorf("failed to scan batch sidebar row: %w", err)
			}

			if highConfidence.Valid {
				v := highConfidence.Float64
				item.HighConfidenceCount = &v
			} else {
				zero := 0.0
				item.HighConfidenceCount = &zero
			}

			items = append(items, item)
		}

		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("error iterating batch sidebar rows: %w", err)
		}
		return items, nil
	}

	// 1) Primary source: payment_intents
	rows, err := r.db.QueryContext(ctx, primaryQuery, tenantID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch batches sidebar data: %w", err)
	}

	items, err := scanRows(rows)
	if err != nil {
		return nil, err
	}
	if len(items) > 0 {
		return items, nil
	}

	// 2) Fallback source: dlq_items + normalized_ingest_records (NIR join)
	// Batch precedence: DLQ client_batch_ref first, then NIR fields_json->client_batch_ref
	const fallbackQuery = `
		WITH dlq_join AS (
			SELECT
				COALESCE(NULLIF(d.client_batch_ref, ''), NULLIF(n.fields_json->>'client_batch_ref', '')) AS batch_id,
				COALESCE(NULLIF(n.fields_json->>'intent_type', ''), 'UNKNOWN') AS intent_type,
				CASE
					WHEN (n.fields_json->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
						THEN (n.fields_json->>'amount')::numeric
					ELSE 0::numeric
				END AS amount_num
			FROM dlq_items d
			LEFT JOIN normalized_ingest_records n
				ON n.tenant_id = d.tenant_id
			   AND n.envelope_id = d.envelope_id
			WHERE d.tenant_id = $1
		)
		SELECT
			j.batch_id AS batchid,
			j.intent_type,
			COALESCE(SUM(j.amount_num), 0)::text AS total_value,
			COUNT(*) AS transactions,
			0::bigint AS confirmed_count,
			0::float8 AS high_confidence_count,
			0::bigint AS mismatch_count,
			COUNT(*) AS unresolved_count
		FROM dlq_join j
		WHERE j.batch_id IS NOT NULL
		  AND j.batch_id <> ''
		GROUP BY j.batch_id, j.intent_type
		ORDER BY COUNT(*) DESC
	`

	fallbackRows, err := r.db.QueryContext(ctx, fallbackQuery, tenantID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch fallback batches sidebar data: %w", err)
	}

	fallbackItems, err := scanRows(fallbackRows)
	if err != nil {
		return nil, err
	}

	return fallbackItems, nil
}
func (r *IntentQueryRepo) ListPaymentIntentsByBatch(
	ctx context.Context,
	tenantID, batchID string,
	page, pageSize int,
) ([]models.CanonicalIntent, int, error) {

	offset := (page - 1) * pageSize

	const countQ = `
		SELECT COUNT(*)
		FROM payment_intents
		WHERE tenant_id = $1
		  AND batchid = $2
	`
	var total int
	if err := r.db.QueryRowContext(ctx, countQ, tenantID, batchID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count payment intents by batch: %w", err)
	}

	const dataQ = `
		SELECT 
			intent_id, envelope_id, tenant_id, contract_id,trace_id,
			intent_type, canonical_version,
			COALESCE(schema_version, '') as schema_version,
			amount, currency, intended_execution_at,
			COALESCE(constraints, '{}'::jsonb) as constraints,
			COALESCE(beneficiary_type, '') as beneficiary_type,
			COALESCE(pii_tokens, '{}'::jsonb) as pii_tokens,
			COALESCE(beneficiary, '{}'::jsonb) as beneficiary,
			status, confidence_score, created_at,
			COALESCE(client_payout_ref, '') as client_payout_ref,
			COALESCE(request_fingerprint, '') as request_fingerprint,
			COALESCE(routing_hints_json, '{}'::jsonb) as routing_hints_json,
			COALESCE(governance_state, '') as governance_state,
			COALESCE(business_state, '') as business_state,
			COALESCE(duplicate_risk_flag, false) as duplicate_risk_flag,
			COALESCE(mapping_profile_version, '') as mapping_profile_version,
			updated_at,
			canonical_snapshot_ref,
			COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
			COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
			COALESCE(governance_hash, '') as governance_hash,
			aggregate_confidence_score
		FROM payment_intents
		WHERE tenant_id = $1
		  AND batchid = $2
		ORDER BY created_at DESC, intent_id DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := r.db.QueryContext(ctx, dataQ, tenantID, batchID, pageSize, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch payment intents by batch: %w", err)
	}
	defer rows.Close()

	items := make([]models.CanonicalIntent, 0)
	for rows.Next() {
		var intent models.CanonicalIntent
		if err := rows.Scan(
			&intent.IntentID,
			&intent.EnvelopeID,
			&intent.TenantID,
			&intent.ContractID,
			&intent.TraceID,
			&intent.IntentType,
			&intent.CanonicalVersion,
			&intent.SchemaVersion,
			&intent.Amount,
			&intent.Currency,
			&intent.IntendedExecutionAt,
			&intent.Constraints,
			&intent.BeneficiaryType,
			&intent.PIITokens,
			&intent.Beneficiary,
			&intent.Status,
			&intent.ConfidenceScore,
			&intent.CreatedAt,
			&intent.ClientPayoutRef,
			&intent.RequestFingerprint,
			&intent.RoutingHintsJSON,
			&intent.GovernanceState,
			&intent.BusinessState,
			&intent.DuplicateRiskFlag,
			&intent.MappingProfileVersion,
			&intent.UpdatedAt,
			&intent.CanonicalSnapshotRef,
			&intent.NIRSnapshotRef,
			&intent.GovernanceSnapshotRef,
			&intent.GovernanceHash,
			&intent.AggregateConfidenceScore,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan payment intent detail row: %w", err)
		}
		items = append(items, intent)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating payment intent detail rows: %w", err)
	}

	return items, total, nil
}

func (r *IntentQueryRepo) ListDLQItemsByBatch(
	ctx context.Context,
	tenantID, batchID string,
	page, pageSize int,
) ([]models.DLQEntry, int, error) {

	offset := (page - 1) * pageSize

	const countQ = `
		SELECT COUNT(*)
		FROM dlq_items
		WHERE tenant_id = $1
		  AND (client_batch_ref = $2 OR batch_id = $2)
	`
	var total int
	if err := r.db.QueryRowContext(ctx, countQ, tenantID, batchID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count dlq items by batch: %w", err)
	}

	const dataQ = `
		SELECT
			dlq_id,
			tenant_id,
			envelope_id,
			stage,
			reason_code,
			error_detail,
			replayable,
			client_batch_ref,
			created_at,
			COALESCE(batch_id, '')
		FROM dlq_items
		WHERE tenant_id = $1
		  AND (client_batch_ref = $2 OR batch_id = $2)
		ORDER BY created_at DESC, dlq_id DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := r.db.QueryContext(ctx, dataQ, tenantID, batchID, pageSize, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch dlq items by batch: %w", err)
	}
	defer rows.Close()

	items := make([]models.DLQEntry, 0)
	for rows.Next() {
		var e models.DLQEntry
		if err := rows.Scan(
			&e.DLQID,
			&e.TenantID,
			&e.EnvelopeID,
			&e.Stage,
			&e.ReasonCode,
			&e.ErrorDetail,
			&e.Replayable,
			&e.ClientBatchRef,
			&e.CreatedAt,
			&e.BatchID,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan dlq detail row: %w", err)
		}
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating dlq detail rows: %w", err)
	}

	return items, total, nil
}
