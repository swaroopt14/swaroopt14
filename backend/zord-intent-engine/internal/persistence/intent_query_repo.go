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
		amount, currency, deadline_at,
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
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref
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
			&intent.DeadlineAt,
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
		amount, currency, deadline_at,
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
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref
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
		&intent.DeadlineAt,
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
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.CanonicalIntent{}, errors.New("intent not found")
		}
		return models.CanonicalIntent{}, fmt.Errorf("failed to fetch intent: %w", err)
	}

	return intent, nil
}
