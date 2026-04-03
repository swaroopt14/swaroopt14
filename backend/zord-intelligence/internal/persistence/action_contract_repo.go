package persistence

// What is this file?
// Reads and writes the action_contracts table.
// IMPORTANT: This table is IMMUTABLE — we only INSERT, never UPDATE or DELETE.
//
// WHO WRITES TO THIS FILE?
//   action_service.go → InsertIfNew() when a policy fires
//
// WHO READS FROM THIS FILE?
//   action_handler.go → List(), GetByID() for the frontend dashboard

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/models"
)

type ActionContractRepo struct {
	pool *pgxpool.Pool
}

func NewActionContractRepo(pool *pgxpool.Pool) *ActionContractRepo {
	return &ActionContractRepo{pool: pool}
}

// InsertIfNew inserts an ActionContract only if the idempotency_key is new.
// If the same key already exists (duplicate event), it silently does nothing
// and returns the existing contract.
//
// WHY IDEMPOTENCY?
// Kafka delivers messages "at least once" — the same message can arrive twice
// if the service restarts mid-processing. Without idempotency, we would create
// two identical ActionContracts for the same event. With it, the second insert
// is ignored automatically by the UNIQUE constraint on idempotency_key.
//
// ON CONFLICT DO NOTHING = "if the unique constraint fires, don't error — just skip"
func (r *ActionContractRepo) InsertIfNew(ctx context.Context, ac models.ActionContract) error {
	// Marshal scope_refs struct to JSON string for storage
	scopeJSON, err := json.Marshal(ac.ScopeRefs)
	if err != nil {
		return fmt.Errorf("action_repo.InsertIfNew marshal scope_refs: %w", err)
	}

	sql := `
		INSERT INTO action_contracts
			(action_id, tenant_id, policy_id, policy_version,
			 scope_refs, input_refs_json, decision, confidence,
			 payload_json, signature, idempotency_key, created_at)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (idempotency_key) DO NOTHING
	`
	_, err = r.pool.Exec(ctx, sql,
		ac.ActionID,
		ac.TenantID,
		ac.PolicyID,
		ac.PolicyVersion,
		string(scopeJSON),   // JSONB column — pass as string
		ac.InputRefsJSON,    // already a JSON string
		string(ac.Decision), // Decision type → string for DB
		ac.Confidence,
		ac.PayloadJSON, // already a JSON string
		ac.Signature,
		ac.IdempotencyKey,
		ac.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("action_repo.InsertIfNew id=%s: %w", ac.ActionID, err)
	}
	return nil
}

// GetByID returns a single ActionContract by its action_id.
// Used by action_handler.go for the detail page.
func (r *ActionContractRepo) GetByID(ctx context.Context, actionID string) (*models.ActionContract, error) {
	sql := `
		SELECT action_id, tenant_id, policy_id, policy_version,
		       scope_refs::text, input_refs_json::text, decision, confidence,
		       payload_json::text, signature, idempotency_key, created_at
		FROM   action_contracts
		WHERE  action_id = $1
	`
	// ::text casts JSONB column to text string so we can scan it into a Go string

	row := r.pool.QueryRow(ctx, sql, actionID)
	return scanActionContract(row.Scan)
}

// List returns recent ActionContracts for a tenant, newest first.
// The frontend uses this for the action dashboard.
//
// limit controls page size (default 50)
// before allows cursor-based pagination: "give me actions before this time"
// Cursor pagination is better than OFFSET for large tables —
// OFFSET gets slower as you go deeper into pages, cursor stays fast.
func (r *ActionContractRepo) List(
	ctx context.Context,
	tenantID string,
	limit int,
	before time.Time,
) ([]models.ActionContract, error) {
	if limit <= 0 || limit > 100 {
		limit = 50 // safe default
	}

	sql := `
		SELECT action_id, tenant_id, policy_id, policy_version,
		       scope_refs::text, input_refs_json::text, decision, confidence,
		       payload_json::text, signature, idempotency_key, created_at
		FROM   action_contracts
		WHERE  tenant_id  = $1
		  AND  created_at < $2
		ORDER  BY created_at DESC
		LIMIT  $3
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, before, limit)
	if err != nil {
		return nil, fmt.Errorf("action_repo.List tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()

	var result []models.ActionContract
	for rows.Next() {
		ac, err := scanActionContract(rows.Scan)
		if err != nil {
			return nil, fmt.Errorf("action_repo.List scan: %w", err)
		}
		result = append(result, *ac)
	}
	return result, nil
}

// ListByScope returns actions related to a specific contract, intent, or corridor.
// Uses the GIN index on scope_refs JSONB for fast lookup.
//
// Example calls from action_handler.go:
//
//	repo.ListByScope(ctx, tenantID, "contract_id", "ctr_01")
//	repo.ListByScope(ctx, tenantID, "corridor_id", "razorpay_UPI")
func (r *ActionContractRepo) ListByScope(
	ctx context.Context,
	tenantID, scopeField, scopeValue string,
) ([]models.ActionContract, error) {
	// Build a JSONB filter: {"contract_id": "ctr_01"}
	// @> is PostgreSQL's "contains" operator for JSONB
	filter := fmt.Sprintf(`{"%s": "%s"}`, scopeField, scopeValue)

	sql := `
		SELECT action_id, tenant_id, policy_id, policy_version,
		       scope_refs::text, input_refs_json::text, decision, confidence,
		       payload_json::text, signature, idempotency_key, created_at
		FROM   action_contracts
		WHERE  tenant_id  = $1
		  AND  scope_refs @> $2::jsonb
		ORDER  BY created_at DESC
		LIMIT  100
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, filter)
	if err != nil {
		return nil, fmt.Errorf("action_repo.ListByScope: %w", err)
	}
	defer rows.Close()

	var result []models.ActionContract
	for rows.Next() {
		ac, err := scanActionContract(rows.Scan)
		if err != nil {
			return nil, fmt.Errorf("action_repo.ListByScope scan: %w", err)
		}
		result = append(result, *ac)
	}
	return result, nil
}

// scanActionContract is a private helper that converts one DB row
// into an ActionContract struct. Used by GetByID and List above.
//
// WHY A SEPARATE FUNCTION?
// Both GetByID and List have the exact same column list and scan logic.
// Putting it here avoids copy-pasting the same 15 lines twice.
//
// The parameter type "func(...any) error" accepts both:
//
//	row.Scan   (single row from QueryRow)
//	rows.Scan  (row from Query loop)
//
// This works because both have the same function signature.
func scanActionContract(scan func(...any) error) (*models.ActionContract, error) {
	var ac models.ActionContract
	var decision string
	var scopeRefsJSON string

	err := scan(
		&ac.ActionID,
		&ac.TenantID,
		&ac.PolicyID,
		&ac.PolicyVersion,
		&scopeRefsJSON,
		&ac.InputRefsJSON,
		&decision,
		&ac.Confidence,
		&ac.PayloadJSON,
		&ac.Signature,
		&ac.IdempotencyKey,
		&ac.CreatedAt,
	)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}

	// Convert string back to typed Decision
	ac.Decision = models.Decision(decision)

	// Unmarshal scope_refs JSON back into the ScopeRefs struct
	if err := json.Unmarshal([]byte(scopeRefsJSON), &ac.ScopeRefs); err != nil {
		return nil, fmt.Errorf("unmarshal scope_refs: %w", err)
	}

	return &ac, nil
}

// ── Transaction-aware method (Gap #3) ────────────────────────────────────────

// InsertIfNewTx is identical to InsertIfNew but runs inside a pgx.Tx transaction.
//
// WHY pgx.Tx INSTEAD OF A CUSTOM INTERFACE?
// ───────────────────────────────────────────
// A previous version defined a custom interface for the tx parameter:
//
//   interface{ Exec(...) (interface{RowsAffected() int64}, error) }
//
// This caused a compile error because pgx.Tx.Exec actually returns:
//
//   (pgconn.CommandTag, error)
//
// NOT (interface{RowsAffected() int64}, error).
// So pgx.Tx did NOT satisfy that custom interface → compile error.
//
// THE FIX: accept pgx.Tx directly.
// pgx.Tx is the real transaction type. No interface gymnastics needed.
// We import "github.com/jackc/pgx/v5" to get it.
//
// HOW TO CALL THIS:
//   tx, _ := pool.Begin(ctx)             // pool returns a pgx.Tx
//   actionRepo.InsertIfNewTx(ctx, tx, contract)
//   tx.Commit(ctx)
func (r *ActionContractRepo) InsertIfNewTx(
	ctx context.Context,
	tx pgx.Tx,
	ac models.ActionContract,
) (bool, error) {
	scopeJSON, err := json.Marshal(ac.ScopeRefs)
	if err != nil {
		return false, fmt.Errorf("action_repo.InsertIfNewTx marshal scope_refs: %w", err)
	}

	sql := `
		INSERT INTO action_contracts
			(action_id, tenant_id, policy_id, policy_version,
			 scope_refs, input_refs_json, decision, confidence,
			 payload_json, signature, idempotency_key, created_at)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (idempotency_key) DO NOTHING
	`
	tag, err := tx.Exec(ctx, sql,
		ac.ActionID, ac.TenantID, ac.PolicyID, ac.PolicyVersion,
		string(scopeJSON), ac.InputRefsJSON, string(ac.Decision), ac.Confidence,
		ac.PayloadJSON, ac.Signature, ac.IdempotencyKey, ac.CreatedAt,
	)
	if err != nil {
		return false, fmt.Errorf("action_repo.InsertIfNewTx id=%s: %w", ac.ActionID, err)
	}
	return tag.RowsAffected() > 0, nil
}
