package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"time"
	"zord-evidence/models"
)

type EvidenceRepository struct {
	db *sql.DB
}

func NewEvidenceRepository(db *sql.DB) *EvidenceRepository {
	return &EvidenceRepository{db: db}
}

func (r *EvidenceRepository) SavePack(ctx context.Context, pack *models.EvidencePack, objectRef string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
INSERT INTO evidence_packs(
	evidence_pack_id, tenant_id, intent_id, contract_id, merkle_root,
	ruleset_version, signature_alg, signature_value, object_ref, created_at, updated_at
) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		pack.EvidencePackID,
		pack.TenantID,
		pack.IntentID,
		pack.ContractID,
		pack.MerkleRoot,
		pack.RulesetVersion,
		"ed25519",
		pack.Signatures[0].Sig,
		objectRef,
		pack.CreatedAt,
		pack.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert pack: %w", err)
	}

	for i, item := range pack.Items {
		_, err = tx.ExecContext(ctx, `
INSERT INTO evidence_items(
	evidence_pack_id, position_index, item_type, item_ref, item_hash, leaf_hash, schema_version
) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7)`,
			pack.EvidencePackID,
			i,
			item.Type,
			item.Ref,
			item.Hash,
			item.LeafHash,
			item.SchemaVersion,
		)
		if err != nil {
			return fmt.Errorf("insert evidence item: %w", err)
		}
	}

	for _, sig := range pack.Signatures {
		_, err = tx.ExecContext(ctx, `
INSERT INTO evidence_signatures(evidence_pack_id, signer, alg, signature, signed_at)
VALUES($1::uuid,$2,$3,$4,$5)
`, pack.EvidencePackID, sig.Signer, sig.Alg, sig.Sig, sig.SignedAt)
		if err != nil {
			return fmt.Errorf("insert signature: %w", err)
		}
	}

	return tx.Commit()
}

func (r *EvidenceRepository) GetPackByID(ctx context.Context, packID string) (*models.EvidencePack, string, error) {
	pack := &models.EvidencePack{SchemaVersions: map[string]string{}}
	var objectRef string
	var createdAt time.Time
	var signature string
	var sigAlg string
	q := `SELECT tenant_id, intent_id, contract_id, merkle_root, ruleset_version, signature_alg, signature_value, object_ref, created_at FROM evidence_packs WHERE evidence_pack_id=$1::uuid`
	if err := r.db.QueryRowContext(ctx, q, packID).Scan(&pack.TenantID, &pack.IntentID, &pack.ContractID, &pack.MerkleRoot, &pack.RulesetVersion, &sigAlg, &signature, &objectRef, &createdAt); err != nil {
		return nil, "", err
	}
	pack.EvidencePackID = packID
	pack.CreatedAt = createdAt
	pack.Signatures = []models.Signature{{Signer: "zord_evidence", Alg: sigAlg, Sig: signature, SignedAt: createdAt}}

	rows, err := r.db.QueryContext(ctx, `SELECT item_type, item_ref, item_hash, leaf_hash, schema_version FROM evidence_items WHERE evidence_pack_id=$1::uuid ORDER BY position_index`, packID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	for rows.Next() {
		var item models.EvidenceItem
		if err := rows.Scan(&item.Type, &item.Ref, &item.Hash, &item.LeafHash, &item.SchemaVersion); err != nil {
			return nil, "", err
		}
		pack.Items = append(pack.Items, item)
	}
	return pack, objectRef, nil
}
