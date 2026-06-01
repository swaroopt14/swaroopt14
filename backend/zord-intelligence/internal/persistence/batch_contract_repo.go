package persistence

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
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
	BatchID                   string          `json:"batch_id"`
	TenantID                  string          `json:"tenant_id"`
	SourceReference           *string         `json:"source_reference,omitempty"`
	TotalCount                int             `json:"total_count"`
	SuccessCount              int             `json:"success_count"`
	FailedCount               int             `json:"failed_count"`
	PendingCount              int             `json:"pending_count"`
	ReversedCount             int             `json:"reversed_count"`
	PartialReconCount         int             `json:"partial_recon_count"`
	TotalIntendedAmountMinor  decimal.Decimal `json:"total_intended_amount_minor"`
	TotalConfirmedAmountMinor decimal.Decimal `json:"total_confirmed_amount_minor"`
	TotalVarianceMinor        decimal.Decimal `json:"total_variance_minor"`
	BatchFinalityStatus       string          `json:"batch_finality_status"`
	AmbiguityScore            *float64        `json:"ambiguity_score,omitempty"`
	DefensibilityTier         *string         `json:"defensibility_tier,omitempty"`
	LastUpdatedAt             time.Time       `json:"last_updated_at"`
	CreatedAt                 time.Time       `json:"created_at"`

	// ── Per-batch risk attribution (Pattern Intelligence) ─────────────────────
	// Incremented by individual event handlers — NOT reset by BatchSummaryUpdatedEvent.
	UnmatchedAmountMinor         decimal.Decimal `json:"unmatched_amount_minor"`
	ReversalExposureMinor        decimal.Decimal `json:"reversal_exposure_minor"`
	OrphanAmountMinor            decimal.Decimal `json:"orphan_amount_minor"`
	DuplicateRiskExposureMinor   decimal.Decimal `json:"duplicate_risk_exposure_minor"`
	MissingRefCount              int             `json:"missing_ref_count"`
	UnexplainedVarianceMinor     decimal.Decimal `json:"unexplained_variance_minor"`
	WhitelistedDeductionMinor    decimal.Decimal `json:"whitelisted_deduction_minor"`
}

// BatchContractRepo provides Upsert and Read operations for batch_contracts.
type BatchContractRepo struct {
	pool *pgxpool.Pool
	bw   *BatchWriter // optional; nil = direct pool.Exec (default)
}

// NewBatchContractRepo creates a BatchContractRepo.
func NewBatchContractRepo(pool *pgxpool.Pool) *BatchContractRepo {
	return &BatchContractRepo{pool: pool}
}

// SetBatchWriter enables write-batching for Upsert calls.
func (r *BatchContractRepo) SetBatchWriter(bw *BatchWriter) {
	r.bw = bw
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
	args := []any{
		bc.BatchID, bc.TenantID, bc.SourceReference,
		bc.TotalCount, bc.SuccessCount, bc.FailedCount, bc.PendingCount,
		bc.ReversedCount, bc.PartialReconCount,
		bc.TotalIntendedAmountMinor.String(),
		bc.TotalConfirmedAmountMinor.String(),
		bc.TotalVarianceMinor.String(),
		bc.BatchFinalityStatus, bc.AmbiguityScore,
	}
	var err error
	if r.bw != nil {
		err = r.bw.Exec(ctx, sql, args...)
	} else {
		_, err = r.pool.Exec(ctx, sql, args...)
	}
	if err != nil {
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
		       total_intended_amount_minor::text, total_confirmed_amount_minor::text, total_variance_minor::text,
		       batch_finality_status, ambiguity_score, defensibility_tier,
		       last_updated_at, created_at,
		       unmatched_amount_minor::text, reversal_exposure_minor::text,
		       orphan_amount_minor::text, duplicate_risk_exposure_minor::text,
		       missing_ref_count,
		       unexplained_variance_minor::text, whitelisted_deduction_minor::text
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
		       total_intended_amount_minor::text, total_confirmed_amount_minor::text, total_variance_minor::text,
		       batch_finality_status, ambiguity_score, defensibility_tier,
		       last_updated_at, created_at,
		       unmatched_amount_minor::text, reversal_exposure_minor::text,
		       orphan_amount_minor::text, duplicate_risk_exposure_minor::text,
		       missing_ref_count,
		       unexplained_variance_minor::text, whitelisted_deduction_minor::text
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

// ListTopByAmount returns the top N batches for a tenant sorted by
// total_intended_amount_minor DESC directly in the DB.
//
// This is the heatmap query path. The DB-level sort + limit means we never
// fetch more rows than we display, regardless of how many batches the tenant has.
// The query is covered by idx_batch_tenant_amount (tenant_id, total_intended_amount_minor DESC).
//
// limit is clamped to [1, 20] — the heatmap never shows more than 20 rows.
func (r *BatchContractRepo) ListTopByAmount(
	ctx context.Context,
	tenantID string,
	limit int,
) ([]BatchContract, error) {
	if limit < 1 {
		limit = 10
	}
	if limit > 20 {
		limit = 20
	}

	sql := `
		SELECT batch_id, tenant_id, source_reference,
		       total_count, success_count, failed_count, pending_count,
		       reversed_count, partial_recon_count,
		       total_intended_amount_minor::text, total_confirmed_amount_minor::text, total_variance_minor::text,
		       batch_finality_status, ambiguity_score, defensibility_tier,
		       last_updated_at, created_at,
		       unmatched_amount_minor::text, reversal_exposure_minor::text,
		       orphan_amount_minor::text, duplicate_risk_exposure_minor::text,
		       missing_ref_count,
		       unexplained_variance_minor::text, whitelisted_deduction_minor::text
		FROM   batch_contracts
		WHERE  tenant_id = $1
		ORDER  BY batch_contracts.total_intended_amount_minor DESC NULLS LAST
		LIMIT  $2
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, limit)
	if err != nil {
		return nil, fmt.Errorf("batch_contract_repo.ListTopByAmount tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()

	var result []BatchContract
	for rows.Next() {
		bc, err := scanBatchContractFromRows(rows)
		if err != nil {
			return nil, fmt.Errorf("batch_contract_repo.ListTopByAmount scan: %w", err)
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
		       total_intended_amount_minor::text, total_confirmed_amount_minor::text, total_variance_minor::text,
		       batch_finality_status, ambiguity_score, defensibility_tier,
		       last_updated_at, created_at,
		       unmatched_amount_minor::text, reversal_exposure_minor::text,
		       orphan_amount_minor::text, duplicate_risk_exposure_minor::text,
		       missing_ref_count,
		       unexplained_variance_minor::text, whitelisted_deduction_minor::text
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
		       total_intended_amount_minor::text, total_confirmed_amount_minor::text, total_variance_minor::text,
		       batch_finality_status, ambiguity_score, defensibility_tier,
		       last_updated_at, created_at,
		       unmatched_amount_minor::text, reversal_exposure_minor::text,
		       orphan_amount_minor::text, duplicate_risk_exposure_minor::text,
		       missing_ref_count,
		       unexplained_variance_minor::text, whitelisted_deduction_minor::text
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
	var intended, confirmed, variance string
	var unmatched, reversal, orphan, dupRisk, unexplained, whitelisted string
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
		&intended,
		&confirmed,
		&variance,
		&bc.BatchFinalityStatus,
		&bc.AmbiguityScore,
		&bc.DefensibilityTier,
		&bc.LastUpdatedAt,
		&bc.CreatedAt,
		&unmatched,
		&reversal,
		&orphan,
		&dupRisk,
		&bc.MissingRefCount,
		&unexplained,
		&whitelisted,
	)
	if err != nil {
		return nil, err
	}
	var parseErr error
	bc.TotalIntendedAmountMinor, parseErr = decimal.NewFromString(intended)
	if parseErr != nil {
		return nil, fmt.Errorf("scanBatchContract: invalid total_intended_amount_minor %q: %w", intended, parseErr)
	}
	bc.TotalConfirmedAmountMinor, parseErr = decimal.NewFromString(confirmed)
	if parseErr != nil {
		return nil, fmt.Errorf("scanBatchContract: invalid total_confirmed_amount_minor %q: %w", confirmed, parseErr)
	}
	bc.TotalVarianceMinor, parseErr = decimal.NewFromString(variance)
	if parseErr != nil {
		return nil, fmt.Errorf("scanBatchContract: invalid total_variance_minor %q: %w", variance, parseErr)
	}
	if bc.UnmatchedAmountMinor, parseErr = decimal.NewFromString(unmatched); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContract: invalid unmatched_amount_minor %q: %w", unmatched, parseErr)
	}
	if bc.ReversalExposureMinor, parseErr = decimal.NewFromString(reversal); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContract: invalid reversal_exposure_minor %q: %w", reversal, parseErr)
	}
	if bc.OrphanAmountMinor, parseErr = decimal.NewFromString(orphan); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContract: invalid orphan_amount_minor %q: %w", orphan, parseErr)
	}
	if bc.DuplicateRiskExposureMinor, parseErr = decimal.NewFromString(dupRisk); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContract: invalid duplicate_risk_exposure_minor %q: %w", dupRisk, parseErr)
	}
	if bc.UnexplainedVarianceMinor, parseErr = decimal.NewFromString(unexplained); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContract: invalid unexplained_variance_minor %q: %w", unexplained, parseErr)
	}
	if bc.WhitelistedDeductionMinor, parseErr = decimal.NewFromString(whitelisted); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContract: invalid whitelisted_deduction_minor %q: %w", whitelisted, parseErr)
	}
	return &bc, nil
}

// scanBatchContractFromRows scans one row from a Query (rows) call.
func scanBatchContractFromRows(rows pgx.Rows) (*BatchContract, error) {
	var bc BatchContract
	var intended, confirmed, variance string
	var unmatched, reversal, orphan, dupRisk, unexplained, whitelisted string
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
		&intended,
		&confirmed,
		&variance,
		&bc.BatchFinalityStatus,
		&bc.AmbiguityScore,
		&bc.DefensibilityTier,
		&bc.LastUpdatedAt,
		&bc.CreatedAt,
		&unmatched,
		&reversal,
		&orphan,
		&dupRisk,
		&bc.MissingRefCount,
		&unexplained,
		&whitelisted,
	)
	if err != nil {
		return nil, err
	}
	var parseErr error
	bc.TotalIntendedAmountMinor, parseErr = decimal.NewFromString(intended)
	if parseErr != nil {
		return nil, fmt.Errorf("scanBatchContractFromRows: invalid total_intended_amount_minor %q: %w", intended, parseErr)
	}
	bc.TotalConfirmedAmountMinor, parseErr = decimal.NewFromString(confirmed)
	if parseErr != nil {
		return nil, fmt.Errorf("scanBatchContractFromRows: invalid total_confirmed_amount_minor %q: %w", confirmed, parseErr)
	}
	bc.TotalVarianceMinor, parseErr = decimal.NewFromString(variance)
	if parseErr != nil {
		return nil, fmt.Errorf("scanBatchContractFromRows: invalid total_variance_minor %q: %w", variance, parseErr)
	}
	if bc.UnmatchedAmountMinor, parseErr = decimal.NewFromString(unmatched); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContractFromRows: invalid unmatched_amount_minor %q: %w", unmatched, parseErr)
	}
	if bc.ReversalExposureMinor, parseErr = decimal.NewFromString(reversal); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContractFromRows: invalid reversal_exposure_minor %q: %w", reversal, parseErr)
	}
	if bc.OrphanAmountMinor, parseErr = decimal.NewFromString(orphan); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContractFromRows: invalid orphan_amount_minor %q: %w", orphan, parseErr)
	}
	if bc.DuplicateRiskExposureMinor, parseErr = decimal.NewFromString(dupRisk); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContractFromRows: invalid duplicate_risk_exposure_minor %q: %w", dupRisk, parseErr)
	}
	if bc.UnexplainedVarianceMinor, parseErr = decimal.NewFromString(unexplained); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContractFromRows: invalid unexplained_variance_minor %q: %w", unexplained, parseErr)
	}
	if bc.WhitelistedDeductionMinor, parseErr = decimal.NewFromString(whitelisted); parseErr != nil {
		return nil, fmt.Errorf("scanBatchContractFromRows: invalid whitelisted_deduction_minor %q: %w", whitelisted, parseErr)
	}
	return &bc, nil
}

// ── Per-batch risk attribution atomic increments ──────────────────────────────
//
// Each method safely increments ONE risk field on the batch_contracts row.
// Uses INSERT ... ON CONFLICT DO UPDATE so it is safe to call even before the
// first BatchSummaryUpdatedEvent has created the row (the row will be created
// with all other columns at their DEFAULT values).
//
// IMPORTANT: None of these methods touch the fields managed by Upsert()
// (total_count, success_count, total_intended_amount_minor, etc.).
// The two write paths are completely orthogonal.

// AtomicAddBatchUnmatchedAmount increments unmatched_amount_minor for a batch.
// Called from HandleAttachmentDecision when DecisionType = MATCH_UNRESOLVED.
func (r *BatchContractRepo) AtomicAddBatchUnmatchedAmount(
	ctx context.Context,
	batchID, tenantID string,
	amountMinor decimal.Decimal,
) error {
	if batchID == "" || !amountMinor.IsPositive() {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO batch_contracts (batch_id, tenant_id, unmatched_amount_minor)
		VALUES ($1, $2, $3)
		ON CONFLICT (batch_id) DO UPDATE SET
			unmatched_amount_minor = batch_contracts.unmatched_amount_minor + EXCLUDED.unmatched_amount_minor,
			last_updated_at        = now()
	`, batchID, tenantID, amountMinor.String())
	if err != nil {
		return fmt.Errorf("batch_contract_repo.AtomicAddBatchUnmatchedAmount batch=%s: %w", batchID, err)
	}
	return nil
}

// AtomicAddBatchReversalExposure increments reversal_exposure_minor for a batch.
// Called from HandleVarianceRecord when VarianceType = REVERSAL.
func (r *BatchContractRepo) AtomicAddBatchReversalExposure(
	ctx context.Context,
	batchID, tenantID string,
	amountMinor decimal.Decimal,
) error {
	if batchID == "" || !amountMinor.IsPositive() {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO batch_contracts (batch_id, tenant_id, reversal_exposure_minor)
		VALUES ($1, $2, $3)
		ON CONFLICT (batch_id) DO UPDATE SET
			reversal_exposure_minor = batch_contracts.reversal_exposure_minor + EXCLUDED.reversal_exposure_minor,
			last_updated_at         = now()
	`, batchID, tenantID, amountMinor.String())
	if err != nil {
		return fmt.Errorf("batch_contract_repo.AtomicAddBatchReversalExposure batch=%s: %w", batchID, err)
	}
	return nil
}

// AtomicAddBatchOrphanAmount increments orphan_amount_minor for a batch.
// Called from HandleSettlementCreated when orphan settlement is detected.
func (r *BatchContractRepo) AtomicAddBatchOrphanAmount(
	ctx context.Context,
	batchID, tenantID string,
	amountMinor decimal.Decimal,
) error {
	if batchID == "" || !amountMinor.IsPositive() {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO batch_contracts (batch_id, tenant_id, orphan_amount_minor)
		VALUES ($1, $2, $3)
		ON CONFLICT (batch_id) DO UPDATE SET
			orphan_amount_minor = batch_contracts.orphan_amount_minor + EXCLUDED.orphan_amount_minor,
			last_updated_at     = now()
	`, batchID, tenantID, amountMinor.String())
	if err != nil {
		return fmt.Errorf("batch_contract_repo.AtomicAddBatchOrphanAmount batch=%s: %w", batchID, err)
	}
	return nil
}

// AtomicAddBatchDuplicateRiskExposure increments duplicate_risk_exposure_minor.
// Called from HandleIntentCreated when DuplicateRiskFlag = true.
func (r *BatchContractRepo) AtomicAddBatchDuplicateRiskExposure(
	ctx context.Context,
	batchID, tenantID string,
	amountMinor decimal.Decimal,
) error {
	if batchID == "" || !amountMinor.IsPositive() {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO batch_contracts (batch_id, tenant_id, duplicate_risk_exposure_minor)
		VALUES ($1, $2, $3)
		ON CONFLICT (batch_id) DO UPDATE SET
			duplicate_risk_exposure_minor = batch_contracts.duplicate_risk_exposure_minor + EXCLUDED.duplicate_risk_exposure_minor,
			last_updated_at               = now()
	`, batchID, tenantID, amountMinor.String())
	if err != nil {
		return fmt.Errorf("batch_contract_repo.AtomicAddBatchDuplicateRiskExposure batch=%s: %w", batchID, err)
	}
	return nil
}

// AtomicAddBatchVarianceBreakdown increments the explained/unexplained variance
// split and missing ref count for a batch.
// Called from HandleVarianceRecord for every non-REVERSAL, non-OVER_SETTLEMENT variance.
//
//   isWhitelisted=true  → increments whitelisted_deduction_minor (PSP fees, TDS)
//   isWhitelisted=false → increments unexplained_variance_minor (real leakage candidates)
//   missingRef=true     → increments missing_ref_count by 1
func (r *BatchContractRepo) AtomicAddBatchVarianceBreakdown(
	ctx context.Context,
	batchID, tenantID string,
	amountMinor decimal.Decimal,
	isWhitelisted bool,
	missingRef bool,
) error {
	if batchID == "" {
		return nil
	}

	whitelisted := decimal.Zero
	unexplained := decimal.Zero
	if isWhitelisted {
		whitelisted = amountMinor
	} else {
		unexplained = amountMinor
	}
	missingRefIncr := 0
	if missingRef {
		missingRefIncr = 1
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO batch_contracts
			(batch_id, tenant_id, whitelisted_deduction_minor, unexplained_variance_minor, missing_ref_count)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (batch_id) DO UPDATE SET
			whitelisted_deduction_minor = batch_contracts.whitelisted_deduction_minor + EXCLUDED.whitelisted_deduction_minor,
			unexplained_variance_minor  = batch_contracts.unexplained_variance_minor  + EXCLUDED.unexplained_variance_minor,
			missing_ref_count           = batch_contracts.missing_ref_count           + EXCLUDED.missing_ref_count,
			last_updated_at             = now()
	`, batchID, tenantID, whitelisted.String(), unexplained.String(), missingRefIncr)
	if err != nil {
		return fmt.Errorf("batch_contract_repo.AtomicAddBatchVarianceBreakdown batch=%s: %w", batchID, err)
	}
	return nil
}

// AtomicIncrementBatchMissingRef increments missing_ref_count by 1 for a batch.
// Called from HandleIntentCreated when ClientPayoutRef is empty,
// and from HandleVarianceRecord when ProviderRefMissingFlag or BankRefMissingFlag is true.
func (r *BatchContractRepo) AtomicIncrementBatchMissingRef(
	ctx context.Context,
	batchID, tenantID string,
	count int,
) error {
	if batchID == "" || count <= 0 {
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO batch_contracts (batch_id, tenant_id, missing_ref_count)
		VALUES ($1, $2, $3)
		ON CONFLICT (batch_id) DO UPDATE SET
			missing_ref_count = batch_contracts.missing_ref_count + EXCLUDED.missing_ref_count,
			last_updated_at   = now()
	`, batchID, tenantID, count)
	if err != nil {
		return fmt.Errorf("batch_contract_repo.AtomicIncrementBatchMissingRef batch=%s: %w", batchID, err)
	}
	return nil
}
