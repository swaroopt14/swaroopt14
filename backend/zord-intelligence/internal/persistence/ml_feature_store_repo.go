package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MLFeatureStoreRepo handles all DB operations for the ml_feature_store table.
//
// WHAT IS THE ML FEATURE STORE?
// The ML feature store persists engineered feature vectors per entity+window.
// It separates ML concerns from the deterministic projection layer.
//
// WHY PERSIST FEATURES SEPARATELY?
// Two reasons:
//   1. TRAINING DATA: Features computed today become training data for next quarter's
//      model. Without persistence, you cannot retrain without replaying all events.
//   2. AUDIT: Every ML decision must be explainable. Storing the feature vector that
//      caused a risk score lets us answer "why did ZPI flag batch X as high-risk?"
//
// LABEL LIFECYCLE:
//   - feature row is written with label_json = NULL (outcome not yet known)
//   - When the ground truth is observed (e.g. batch finally resolved as FAILED),
//     SetLabel() is called to attach the label to the feature row
//   - Labeled rows are used for supervised model training
//   - Unlabeled rows are used for inference (online scoring)
//
// CURRENT FEATURE FAMILIES (matching ml_feature_store.feature_family CHECK constraint):
//   LEAKAGE   — features for leakage anomaly detection and forecasting
//   AMBIGUITY — features for ambiguity propensity prediction
//   RCA       — features for root cause classification
//   PATTERN   — features for batch quality / duplicate risk scoring
//   SLA       — features for SLA breach prediction

// MLFeatureRow mirrors the ml_feature_store DB table.
type MLFeatureRow struct {
	FeatureRowID  string          `json:"feature_row_id"` // "feat_" + uuid
	TenantID      string          `json:"tenant_id"`
	ScopeType     string          `json:"scope_type"`     // INTENT | BATCH | CORRIDOR | TENANT | PSP
	ScopeRef      string          `json:"scope_ref"`      // the entity ID
	FeatureFamily string          `json:"feature_family"` // LEAKAGE | AMBIGUITY | RCA | PATTERN | SLA
	WindowStart   time.Time       `json:"window_start"`
	WindowEnd     time.Time       `json:"window_end"`
	FeaturesJSON  json.RawMessage `json:"features_json"`           // the feature vector
	LabelJSON     json.RawMessage `json:"label_json,omitempty"`    // ground truth; nil until observed
	ModelVersion  *string         `json:"model_version,omitempty"` // nil for deterministic features
	CreatedAt     time.Time       `json:"created_at"`
}

// MLFeatureStoreRepo provides Insert, Label, and Read operations for ml_feature_store.
type MLFeatureStoreRepo struct {
	pool *pgxpool.Pool
}

// NewMLFeatureStoreRepo creates an MLFeatureStoreRepo.
func NewMLFeatureStoreRepo(pool *pgxpool.Pool) *MLFeatureStoreRepo {
	return &MLFeatureStoreRepo{pool: pool}
}

// Insert writes a new feature row to the store.
//
// Called by Phase 3's intelligence layer services whenever they compute
// a new feature vector for a given entity+window.
//
// The feature_row_id must be unique. Callers should use "feat_" + uuid.
// label_json should be nil at insert time — use SetLabel() when the outcome is known.
//
// IDEMPOTENCY: Unlike projections (which use ON CONFLICT UPDATE),
// feature rows are insert-only. If the same feature_row_id is submitted twice,
// Postgres will return a unique violation error. The caller is responsible for
// ensuring feature_row_id uniqueness (use deterministic IDs: hash of scope+window+family
// if you need idempotency, or uuid if each computation is always unique).
func (r *MLFeatureStoreRepo) Insert(ctx context.Context, row MLFeatureRow) error {
	sql := `
		INSERT INTO ml_feature_store
			(feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
			 window_start, window_end, features_json, label_json, model_version, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	if _, err := r.pool.Exec(ctx, sql,
		row.FeatureRowID,
		row.TenantID,
		row.ScopeType,
		row.ScopeRef,
		row.FeatureFamily,
		row.WindowStart,
		row.WindowEnd,
		row.FeaturesJSON,
		row.LabelJSON,    // nullable
		row.ModelVersion, // nullable
		row.CreatedAt,
	); err != nil {
		return fmt.Errorf("ml_feature_store_repo.Insert row_id=%s family=%s: %w",
			row.FeatureRowID, row.FeatureFamily, err)
	}
	return nil
}

// SetLabel attaches a ground-truth label to an existing feature row.
//
// Called when the outcome of the entity is finally known.
// Example: a batch that was flagged as HIGH_RISK eventually resolved as FAILED →
//
//	SetLabel(ctx, feature_row_id, []byte(`{"outcome": "FAILED", "resolved_at": "..."}`) )
//
// This is the mechanism by which ZPI builds a supervised training dataset
// from its own operational outcomes — without requiring any external labeling.
func (r *MLFeatureStoreRepo) SetLabel(
	ctx context.Context,
	featureRowID string,
	labelJSON json.RawMessage,
) error {
	sql := `
		UPDATE ml_feature_store
		SET label_json = $2
		WHERE feature_row_id = $1
		  AND label_json IS NULL
	`
	// AND label_json IS NULL: prevents accidentally overwriting a label that
	// was already set. If the label is already set and a second SetLabel arrives
	// (e.g. Kafka redelivery), we silently skip it.
	tag, err := r.pool.Exec(ctx, sql, featureRowID, labelJSON)
	if err != nil {
		return fmt.Errorf("ml_feature_store_repo.SetLabel row_id=%s: %w", featureRowID, err)
	}
	if tag.RowsAffected() == 0 {
		// Either row not found or label already set — both are non-fatal.
		return nil
	}
	return nil
}

// GetByID returns one feature row by its primary key.
// Returns nil, nil when no row exists.
func (r *MLFeatureStoreRepo) GetByID(
	ctx context.Context,
	featureRowID string,
) (*MLFeatureRow, error) {
	sql := `
		SELECT feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
		       window_start, window_end, features_json, label_json, model_version, created_at
		FROM   ml_feature_store
		WHERE  feature_row_id = $1
	`
	row := r.pool.QueryRow(ctx, sql, featureRowID)
	feat, err := scanMLFeatureRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("ml_feature_store_repo.GetByID row_id=%s: %w", featureRowID, err)
	}
	return feat, nil
}

// ListUnlabeled returns feature rows of a given family that do not yet have labels.
//
// Used by the ML training pipeline to find rows ready for label attachment.
// Also used by the online scoring engine to find features awaiting inference.
// limit controls how many rows to return (max 500 — ML batches can be larger).
func (r *MLFeatureStoreRepo) ListUnlabeled(
	ctx context.Context,
	tenantID string,
	featureFamily string,
	limit int,
) ([]MLFeatureRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	sql := `
		SELECT feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
		       window_start, window_end, features_json, label_json, model_version, created_at
		FROM   ml_feature_store
		WHERE  tenant_id      = $1
		  AND  feature_family = $2
		  AND  label_json     IS NULL
		ORDER  BY created_at DESC
		LIMIT  $3
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, featureFamily, limit)
	if err != nil {
		return nil, fmt.Errorf("ml_feature_store_repo.ListUnlabeled family=%s: %w",
			featureFamily, err)
	}
	defer rows.Close()

	var result []MLFeatureRow
	for rows.Next() {
		feat, err := scanMLFeatureRowFromRows(rows)
		if err != nil {
			return nil, fmt.Errorf("ml_feature_store_repo.ListUnlabeled scan: %w", err)
		}
		result = append(result, *feat)
	}
	return result, nil
}

// ListForTraining returns labeled feature rows for a given family and time window.
//
// Used by the offline training pipeline. Returns only rows where label_json IS NOT NULL
// (i.e. the ground truth outcome is known).
// windowStart/End bounds the created_at timestamp to limit the training window.
func (r *MLFeatureStoreRepo) ListForTraining(
	ctx context.Context,
	tenantID string,
	featureFamily string,
	windowStart, windowEnd time.Time,
	limit int,
) ([]MLFeatureRow, error) {
	if limit <= 0 || limit > 10000 {
		limit = 1000
	}

	sql := `
		SELECT feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
		       window_start, window_end, features_json, label_json, model_version, created_at
		FROM   ml_feature_store
		WHERE  tenant_id      = $1
		  AND  feature_family = $2
		  AND  label_json     IS NOT NULL
		  AND  created_at     >= $3
		  AND  created_at     <  $4
		ORDER  BY created_at ASC
		LIMIT  $5
	`
	rows, err := r.pool.Query(ctx, sql,
		tenantID, featureFamily, windowStart, windowEnd, limit)
	if err != nil {
		return nil, fmt.Errorf("ml_feature_store_repo.ListForTraining family=%s: %w",
			featureFamily, err)
	}
	defer rows.Close()

	var result []MLFeatureRow
	for rows.Next() {
		feat, err := scanMLFeatureRowFromRows(rows)
		if err != nil {
			return nil, fmt.Errorf("ml_feature_store_repo.ListForTraining scan: %w", err)
		}
		result = append(result, *feat)
	}
	return result, nil
}

// scanMLFeatureRow scans one row from a QueryRow call.
func scanMLFeatureRow(row pgx.Row) (*MLFeatureRow, error) {
	var f MLFeatureRow
	err := row.Scan(
		&f.FeatureRowID,
		&f.TenantID,
		&f.ScopeType,
		&f.ScopeRef,
		&f.FeatureFamily,
		&f.WindowStart,
		&f.WindowEnd,
		&f.FeaturesJSON,
		&f.LabelJSON,
		&f.ModelVersion,
		&f.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// scanMLFeatureRowFromRows scans one row from a Query (rows) call.
func scanMLFeatureRowFromRows(rows pgx.Rows) (*MLFeatureRow, error) {
	var f MLFeatureRow
	err := rows.Scan(
		&f.FeatureRowID,
		&f.TenantID,
		&f.ScopeType,
		&f.ScopeRef,
		&f.FeatureFamily,
		&f.WindowStart,
		&f.WindowEnd,
		&f.FeaturesJSON,
		&f.LabelJSON,
		&f.ModelVersion,
		&f.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &f, nil
}
