package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"zord-evidence/models"
)

type PendingLeafRepository interface {
	UpsertLeaf(ctx context.Context, leaf *models.PendingLeafCandidate) error
	LinkEnvelopeToIntent(ctx context.Context, tenantID, envelopeID, intentID, contractID string) error
	GetLeavesForIntent(ctx context.Context, tenantID, intentID string) ([]models.PendingLeafCandidate, error)
	GetLeavesForBatch(ctx context.Context, tenantID, batchID string) ([]models.PendingLeafCandidate, error)
	DeleteForIntent(ctx context.Context, tenantID, intentID string) error
	DeleteForBatch(ctx context.Context, tenantID, batchID string) error
	ResolveIntentID(ctx context.Context, tenantID, envelopeID string) (string, error)
}

type PostgresPendingLeafRepo struct {
	db *sql.DB
}

func NewPendingLeafRepository(db *sql.DB) *PostgresPendingLeafRepo {
	return &PostgresPendingLeafRepo{db: db}
}

func (r *PostgresPendingLeafRepo) UpsertLeaf(ctx context.Context, leaf *models.PendingLeafCandidate) error {
	query := `
INSERT INTO pending_leaf_candidates (
	tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
ON CONFLICT (tenant_id, intent_id, leaf_type) WHERE intent_id IS NOT NULL 
DO UPDATE SET 
	item_ref = EXCLUDED.item_ref,
	hash = EXCLUDED.hash,
	contract_id = COALESCE(EXCLUDED.contract_id, pending_leaf_candidates.contract_id),
	batch_id = COALESCE(EXCLUDED.batch_id, pending_leaf_candidates.batch_id),
	source_topic = EXCLUDED.source_topic,
	updated_at = NOW()
`
	// Handle the envelope-only conflict separately because PostgreSQL doesn't support multiple partial unique indexes in a single ON CONFLICT easily if they differ in the WHERE clause significantly.
	// Actually, I can use two separate statements or a more complex one.
	// For simplicity and correctness with the specific indexes I created:
	
	if leaf.IntentID == nil && leaf.EnvelopeID != nil {
		query = `
INSERT INTO pending_leaf_candidates (
	tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
ON CONFLICT (tenant_id, envelope_id, leaf_type) WHERE intent_id IS NULL AND batch_id IS NULL
DO UPDATE SET 
	item_ref = EXCLUDED.item_ref,
	hash = EXCLUDED.hash,
	contract_id = COALESCE(EXCLUDED.contract_id, pending_leaf_candidates.contract_id),
	batch_id = COALESCE(EXCLUDED.batch_id, pending_leaf_candidates.batch_id),
	source_topic = EXCLUDED.source_topic,
	updated_at = NOW()
`
	} else if leaf.BatchID != nil {
		query = `
INSERT INTO pending_leaf_candidates (
	tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
ON CONFLICT (tenant_id, batch_id, leaf_type) WHERE batch_id IS NOT NULL
DO UPDATE SET 
	item_ref = EXCLUDED.item_ref,
	hash = EXCLUDED.hash,
	contract_id = COALESCE(EXCLUDED.contract_id, pending_leaf_candidates.contract_id),
	batch_id = COALESCE(EXCLUDED.batch_id, pending_leaf_candidates.batch_id),
	source_topic = EXCLUDED.source_topic,
	updated_at = NOW()
`
	}

	_, err := r.db.ExecContext(ctx, query,
		leaf.TenantID,
		leaf.IntentID,
		leaf.EnvelopeID,
		leaf.ContractID,
		leaf.BatchID,
		leaf.LeafType,
		leaf.ItemRef,
		leaf.Hash,
		leaf.SchemaVersion,
		leaf.SourceTopic,
	)
	if err != nil {
		return fmt.Errorf("upsert leaf candidate: %w", err)
	}
	return nil
}

func (r *PostgresPendingLeafRepo) LinkEnvelopeToIntent(ctx context.Context, tenantID, envelopeID, intentID, contractID string) error {
	// Link any existing envelope-keyed leaves to this intent_id and contract_id
	query := `
UPDATE pending_leaf_candidates
SET intent_id = $3, contract_id = COALESCE($4, contract_id), updated_at = NOW()
WHERE tenant_id = $1 AND envelope_id = $2 AND intent_id IS NULL
`
	_, err := r.db.ExecContext(ctx, query, tenantID, envelopeID, intentID, contractID)
	if err != nil {
		return fmt.Errorf("link envelope to intent: %w", err)
	}
	return nil
}

func (r *PostgresPendingLeafRepo) GetLeavesForIntent(ctx context.Context, tenantID, intentID string) ([]models.PendingLeafCandidate, error) {
	query := `
SELECT id, tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic, created_at, updated_at
FROM pending_leaf_candidates
WHERE tenant_id = $1 AND intent_id = $2
`
	rows, err := r.db.QueryContext(ctx, query, tenantID, intentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var leaves []models.PendingLeafCandidate
	for rows.Next() {
		var l models.PendingLeafCandidate
		if err := rows.Scan(
			&l.ID, &l.TenantID, &l.IntentID, &l.EnvelopeID, &l.ContractID, &l.BatchID, &l.LeafType, &l.ItemRef, &l.Hash, &l.SchemaVersion, &l.SourceTopic, &l.CreatedAt, &l.UpdatedAt,
		); err != nil {
			return nil, err
		}
		leaves = append(leaves, l)
	}
	return leaves, nil
}

func (r *PostgresPendingLeafRepo) GetLeavesForBatch(ctx context.Context, tenantID, batchID string) ([]models.PendingLeafCandidate, error) {
	query := `
SELECT id, tenant_id, intent_id, envelope_id, contract_id, batch_id, leaf_type, item_ref, hash, schema_version, source_topic, created_at, updated_at
FROM pending_leaf_candidates
WHERE tenant_id = $1 AND batch_id = $2
`
	rows, err := r.db.QueryContext(ctx, query, tenantID, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var leaves []models.PendingLeafCandidate
	for rows.Next() {
		var l models.PendingLeafCandidate
		if err := rows.Scan(
			&l.ID, &l.TenantID, &l.IntentID, &l.EnvelopeID, &l.ContractID, &l.BatchID, &l.LeafType, &l.ItemRef, &l.Hash, &l.SchemaVersion, &l.SourceTopic, &l.CreatedAt, &l.UpdatedAt,
		); err != nil {
			return nil, err
		}
		leaves = append(leaves, l)
	}
	return leaves, nil
}

func (r *PostgresPendingLeafRepo) DeleteForIntent(ctx context.Context, tenantID, intentID string) error {
	query := `DELETE FROM pending_leaf_candidates WHERE tenant_id = $1 AND intent_id = $2`
	_, err := r.db.ExecContext(ctx, query, tenantID, intentID)
	return err
}

func (r *PostgresPendingLeafRepo) DeleteForBatch(ctx context.Context, tenantID, batchID string) error {
	query := `DELETE FROM pending_leaf_candidates WHERE tenant_id = $1 AND batch_id = $2`
	_, err := r.db.ExecContext(ctx, query, tenantID, batchID)
	return err
}

func (r *PostgresPendingLeafRepo) ResolveIntentID(ctx context.Context, tenantID, envelopeID string) (string, error) {
	query := `
SELECT intent_id 
FROM pending_leaf_candidates 
WHERE tenant_id = $1 AND envelope_id = $2 AND intent_id IS NOT NULL 
LIMIT 1
`
	var intentID string
	err := r.db.QueryRowContext(ctx, query, tenantID, envelopeID).Scan(&intentID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return intentID, err
}
