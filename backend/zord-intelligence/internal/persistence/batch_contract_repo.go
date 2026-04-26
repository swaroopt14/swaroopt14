package persistence

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// BatchContractRepo handles all DB operations for the batch_contracts table.
//
// WHAT IS batch_contracts?
// The authoritative pre-aggregated state of each batch of payouts.
// Updated via full-replacement UPSERT every time a BatchSummaryUpdatedEvent arrives.
// Avoids expensive per-request aggregations on projection_state rows.
//
// RELATIONSHIP TO projection_state batch.health.* rows:
//   batch_contracts           = authoritative current state (full replacement upsert)
//   projection_state batch.*  = time-series history (append-only projection windows)
// They are complementary, not redundant. The batch_contracts table is what
// the GET /v1/intelligence/batches/{batch_id} API reads.

// BatchContract mirrors the batch_contracts DB table.
type BatchContract struct {
	BatchID                   string    `json:"batch_id"`
	TenantID                  string    `json:"tenant_id"`
	SourceReference           *string   `json:"source_reference,omitempty"`
	TotalCount                int       `json:"total_count"`
	SuccessCount              int       `json:"success_count"`
	FailedCount               int       `json:"failed_count"`
	PendingCount              int       `json:"pending_count"`
	ReversedCount             int       `json:"reversed_count"`
	PartialReconCount         int       `json:"partial_recon_count"`
	TotalIntendedAmountMinor  int64     `json:"total_intended_amount_minor"`
	TotalConfirmedAmountMinor int64     `json:"total_confirmed_amount_minor"`
	TotalVarianceMinor        int64     `json:"total_variance_minor"`
	BatchFinalityStatus       string    `json:"batch_finality_status"`
	AmbiguityScore            *float64  `json:"ambiguity_score,omitempty"`
	DefensibilityTier         *string   `json:"defensibility_tier,omitempty"`
	LastUpdatedAt             time.Time `json:"last_updated_at"`
	CreatedAt                 time.Time `json:"created_at"`
}

// BatchContractRepo provides Upsert and Read operations for batch_contracts.
type BatchContractRepo struct {
	pool *pgxpool.Pool
}

// NewBatchContractRepo creates a BatchContractRepo.
func NewBatchContractRepo(pool *pgxpool.Pool) *BatchContractRepo {
	return &BatchContractRepo{pool: pool}
}

// Upsert performs a full-replacement upsert of a batch contract row.
//
// Called by Phase 4's HandleBatchSummaryUpdated after receiving a
// BatchSummaryUpdatedEvent from Service 5C. The event contains the
// authoritative aggregate counts — we replace the entire row with the
// new state rather than incrementing individual fields.
//
// WHY FULL REPLACEMENT?
// Service 5C sends a COMPLETE snapshot of the batch state (not a delta).
// Incrementing on top of a full snapshot would double-count everything.
// Full replacement is safe because:
//  1. The upstream event is idempotency-checked before this is called
//  2. The batch_id is the primary key — there is exactly one row per batch
//  3. last_updated_at is always set to now() so we can detect stale views
//
// IMPORTANT: defensibility_tier is NOT set here — it is set by the
// Defensibility intelligence service (Phase 4) once it has scored the batch.
func (r *BatchContractRepo) Upsert(ctx context.Context, bc BatchContract) error {
	sql := `
		INSERT INTO batch_contracts
			(batch_id, tenant_id, source_reference,
			 total_count, success_count, failed_count, pending_count,
			 reversed_count, partial_recon_count,
			 total_intended_amount_minor, total_confirmed_amount_minor, total_variance_minor,
			 batch_finality_status, ambiguity_score,
			 last_updated_at, created_at)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now())
		ON CONFLICT (batch_id) DO UPDATE SET
			source_reference              = EXCLUDED.source_reference,
			total_count                   = EXCLUDED.total_count,
			success_count                 = EXCLUDED.success_count,
			failed_count                  = EXCLUDED.failed_count,
			pending_count                 = EXCLUDED.pending_count,
			reversed_count                = EXCLUDED.reversed_count,
			partial_recon_count           = EXCLUDED.partial_recon_count,
			total_intended_amount_minor   = EXCLUDED.total_intended_amount_minor,
			total_confirmed_amount_minor  = EXCLUDED.total_confirmed_amount_minor,
			total_variance_minor          = EXCLUDED.total_variance_minor,
			batch_finality_status         = EXCLUDED.batch_finality_status,
			ambiguity_score               = EXCLUDED.ambiguity_score,
			last_updated_at               = now()
		-- NOTE: defensibility_tier is deliberately excluded from the ON CONFLICT
		-- update clause. It is computed by the Defensibility service (Phase 4)
		-- and must not be overwritten by incoming batch summary events.
	`
	if _, err := r.pool.Exec(ctx, sql,
		bc.BatchID,
		bc.TenantID,
		bc.SourceReference, // nullable
		bc.TotalCount,
		bc.SuccessCount,
		bc.FailedCount,
		bc.PendingCount,
		bc.ReversedCount,
		bc.PartialReconCount,
		bc.TotalIntendedAmountMinor,
		bc.TotalConfirmedAmountMinor,
		bc.TotalVarianceMinor,
		bc.BatchFinalityStatus,
		bc.AmbiguityScore, // nullable
	); err != nil {
		return fmt.Errorf("batch_contract_repo.Upsert batch_id=%s tenant=%s: %w",
			bc.BatchID, bc.TenantID, err)
	}
	return nil
}

// SetDefensibilityTier updates ONLY the defensibility_tier for a batch.
//
// Called by the Defensibility intelligence service (Phase 4) once it has
// scored the batch. Separated from Upsert to avoid race conditions where
// a BatchSummaryUpdatedEvent arrives and accidentally clears a tier
// that was just computed.
func (r *BatchContractRepo) SetDefensibilityTier(
	ctx context.Context,
	batchID string,
	tier string, // "STRONG" | "GOOD" | "WEAK" | "FRAGILE"
) error {
	sql := `
		UPDATE batch_contracts
		SET    defensibility_tier = $2,
		       last_updated_at    = now()
		WHERE  batch_id = $1
	`
	tag, err := r.pool.Exec(ctx, sql, batchID, tier)
	if err != nil {
		return fmt.Errorf("batch_contract_repo.SetDefensibilityTier batch_id=%s: %w", batchID, err)
	}
	if tag.RowsAffected() == 0 {
		// Batch does not exist yet — this can happen if the defensibility
		// service processes a governance decision before the first
		// BatchSummaryUpdatedEvent arrives. This is not an error.
		return nil
	}
	return nil
}

// GetByID returns one batch contract by its primary key.
// Returns nil, nil when no row exists.
func (r *BatchContractRepo) GetByID(
	ctx context.Context,
	batchID string,
) (*BatchContract, error) {
	sql := `
		SELECT batch_id, tenant_id, source_reference,
		       total_count, success_count, failed_count, pending_count,
		       reversed_count, partial_recon_count,
		       total_intended_amount_minor, total_confirmed_amount_minor, total_variance_minor,
		       batch_finality_status, ambiguity_score, defensibility_tier,
		       last_updated_at, created_at
		FROM   batch_contracts
		WHERE  batch_id = $1
	`
	row := r.pool.QueryRow(ctx, sql, batchID)
	bc, err := scanBatchContract(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("batch_contract_repo.GetByID batch_id=%s: %w", batchID, err)
	}
	return bc, nil
}

// ListByTenant returns batches for a tenant ordered by last_updated_at DESC.
// limit controls how many rows to return (max 100).
func (r *BatchContractRepo) ListByTenant(
	ctx context.Context,
	tenantID string,
	limit int,
) ([]BatchContract, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	sql := `
		SELECT batch_id, tenant_id, source_reference,
		       total_count, success_count, failed_count, pending_count,
		       reversed_count, partial_recon_count,
		       total_intended_amount_minor, total_confirmed_amount_minor, total_variance_minor,
		       batch_finality_status, ambiguity_score, defensibility_tier,
		       last_updated_at, created_at
		FROM   batch_contracts
		WHERE  tenant_id = $1
		ORDER  BY last_updated_at DESC
		LIMIT  $2
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, limit)
	if err != nil {
		return nil, fmt.Errorf("batch_contract_repo.ListByTenant tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()

	var result []BatchContract
	for rows.Next() {
		bc, err := scanBatchContractFromRows(rows)
		if err != nil {
			return nil, fmt.Errorf("batch_contract_repo.ListByTenant scan: %w", err)
		}
		result = append(result, *bc)
	}
	return result, nil
}

// ListRequiringReview returns batches that need human review — high ambiguity
// or contains reversals. Used by the ops review queue (Phase 7 API).
func (r *BatchContractRepo) ListRequiringReview(
	ctx context.Context,
	tenantID string,
	limit int,
) ([]BatchContract, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	sql := `
		SELECT batch_id, tenant_id, source_reference,
		       total_count, success_count, failed_count, pending_count,
		       reversed_count, partial_recon_count,
		       total_intended_amount_minor, total_confirmed_amount_minor, total_variance_minor,
		       batch_finality_status, ambiguity_score, defensibility_tier,
		       last_updated_at, created_at
		FROM   batch_contracts
		WHERE  tenant_id = $1
		  AND  (
		           batch_finality_status = 'REQUIRES_REVIEW'
		        OR ambiguity_score > 0.70
		        OR reversed_count  > 0
		  )
		ORDER  BY last_updated_at DESC
		LIMIT  $2
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, limit)
	if err != nil {
		return nil, fmt.Errorf("batch_contract_repo.ListRequiringReview tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()

	var result []BatchContract
	for rows.Next() {
		bc, err := scanBatchContractFromRows(rows)
		if err != nil {
			return nil, fmt.Errorf("batch_contract_repo.ListRequiringReview scan: %w", err)
		}
		result = append(result, *bc)
	}
	return result, nil
}

// ListByFinalityStatus returns batches for a tenant filtered by batch_finality_status.
func (r *BatchContractRepo) ListByFinalityStatus(
	ctx context.Context,
	tenantID string,
	status string,
	limit int,
) ([]BatchContract, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	sql := `
		SELECT batch_id, tenant_id, source_reference,
		       total_count, success_count, failed_count, pending_count,
		       reversed_count, partial_recon_count,
		       total_intended_amount_minor, total_confirmed_amount_minor, total_variance_minor,
		       batch_finality_status, ambiguity_score, defensibility_tier,
		       last_updated_at, created_at
		FROM   batch_contracts
		WHERE  tenant_id = $1
		  AND  batch_finality_status = $2
		ORDER  BY last_updated_at DESC
		LIMIT  $3
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, status, limit)
	if err != nil {
		return nil, fmt.Errorf("batch_contract_repo.ListByFinalityStatus tenant=%s status=%s: %w", tenantID, status, err)
	}
	defer rows.Close()

	var result []BatchContract
	for rows.Next() {
		bc, err := scanBatchContractFromRows(rows)
		if err != nil {
			return nil, fmt.Errorf("batch_contract_repo.ListByFinalityStatus scan: %w", err)
		}
		result = append(result, *bc)
	}
	return result, nil
}

// scanBatchContract scans one row from a QueryRow call.
func scanBatchContract(row pgx.Row) (*BatchContract, error) {
	var bc BatchContract
	err := row.Scan(
		&bc.BatchID,
		&bc.TenantID,
		&bc.SourceReference,
		&bc.TotalCount,
		&bc.SuccessCount,
		&bc.FailedCount,
		&bc.PendingCount,
		&bc.ReversedCount,
		&bc.PartialReconCount,
		&bc.TotalIntendedAmountMinor,
		&bc.TotalConfirmedAmountMinor,
		&bc.TotalVarianceMinor,
		&bc.BatchFinalityStatus,
		&bc.AmbiguityScore,
		&bc.DefensibilityTier,
		&bc.LastUpdatedAt,
		&bc.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &bc, nil
}

// scanBatchContractFromRows scans one row from a Query (rows) call.
func scanBatchContractFromRows(rows pgx.Rows) (*BatchContract, error) {
	var bc BatchContract
	err := rows.Scan(
		&bc.BatchID,
		&bc.TenantID,
		&bc.SourceReference,
		&bc.TotalCount,
		&bc.SuccessCount,
		&bc.FailedCount,
		&bc.PendingCount,
		&bc.ReversedCount,
		&bc.PartialReconCount,
		&bc.TotalIntendedAmountMinor,
		&bc.TotalConfirmedAmountMinor,
		&bc.TotalVarianceMinor,
		&bc.BatchFinalityStatus,
		&bc.AmbiguityScore,
		&bc.DefensibilityTier,
		&bc.LastUpdatedAt,
		&bc.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &bc, nil
}
