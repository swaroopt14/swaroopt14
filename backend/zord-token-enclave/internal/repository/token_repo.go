package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"zord-token-enclave/internal/models"

	"github.com/google/uuid"
)

type TokenRepository struct {
	db *sql.DB
}

func NewTokenRepository(db *sql.DB) *TokenRepository {
	return &TokenRepository{db: db}
}

// ✅ Updated: now also inserts audit record
func (r *TokenRepository) Insert(ctx context.Context, t models.TokenRecord) error {

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert token_map
	_, err = tx.ExecContext(ctx, `
		INSERT INTO token_map 
		(token_id, tenant_id, kind, ciphertext, nonce, encryption_key_id, key_version, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`,
		t.TokenID,
		t.TenantID,
		t.Kind,
		t.Ciphertext,
		t.Nonce,
		t.EncryptionKeyID,
		t.KeyVersion,
		t.Status,
		time.Now().UTC(),
	)
	if err != nil {
		return err
	}

	// Insert token_audit
	_, err = tx.ExecContext(ctx, `
		INSERT INTO token_audit
		(audit_id, token_id, tenant_id, actor, action, purpose, decision, trace_id, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`,
		uuid.New().String(),
		t.TokenID,
		t.TenantID,
		"service-2",         // actor
		"TOKENIZE",          // action
		"INTENT_PROCESSING", // purpose
		"ALLOW",             // decision
		"",                  // trace_id (can upgrade later)
		time.Now().UTC(),
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (r *TokenRepository) Get(ctx context.Context, tokenID string) (*models.TokenRecord, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT token_id, tenant_id, kind, ciphertext, nonce, encryption_key_id, key_version, status, created_at
		FROM token_map
		WHERE token_id = $1
	`, tokenID)

	var t models.TokenRecord
	err := row.Scan(
		&t.TokenID,
		&t.TenantID,
		&t.Kind,
		&t.Ciphertext,
		&t.Nonce,
		&t.EncryptionKeyID,
		&t.KeyVersion,
		&t.Status,
		&t.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TokenRepository) GetActiveKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error) {

	query := `
	SELECT key_id, tenant_id, key_version, encrypted_key, status, active_from
	FROM token_encryption_keys
	WHERE tenant_id = $1 AND status = 'ACTIVE'
	LIMIT 1
	`

	var k models.EncryptionKey
	var encryptedKey []byte

	err := r.db.QueryRowContext(ctx, query, tenantID).Scan(
		&k.KeyID,
		&k.TenantID,
		&k.Version,
		&encryptedKey,
		&k.Status,
		&k.ActiveFrom,
	)
	if err != nil {
		return nil, err
	}

	k.RawKey = encryptedKey

	return &k, nil
}

func (r *TokenRepository) GetKeyByID(ctx context.Context, keyID string) (*models.EncryptionKey, error) {

	query := `
	SELECT key_id, tenant_id, key_version, encrypted_key, status, active_from
	FROM token_encryption_keys
	WHERE key_id = $1
	`

	var k models.EncryptionKey
	var encryptedKey []byte

	err := r.db.QueryRowContext(ctx, query, keyID).Scan(
		&k.KeyID,
		&k.TenantID,
		&k.Version,
		&encryptedKey,
		&k.Status,
		&k.ActiveFrom,
	)
	if err != nil {
		return nil, err
	}

	k.RawKey = encryptedKey

	return &k, nil
}

func (r *TokenRepository) RotateKey(ctx context.Context, tenantID string, newKeyID string, newKey []byte, createdBy string) error {

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 🚨 SAFETY CHECK: prevent multiple migrations
	var count int

	err = tx.QueryRowContext(ctx, `
	SELECT COUNT(*) 
	FROM token_encryption_keys 
	WHERE tenant_id = $1 AND status = 'RETIRING'
`, tenantID).Scan(&count)

	if err != nil {
		return err
	}

	if count > 0 {
		return fmt.Errorf("migration already in progress for tenant %s", tenantID)
	}

	// 1️⃣ Mark current ACTIVE key as RETIRING
	_, err = tx.ExecContext(ctx, `
		UPDATE token_encryption_keys
		SET status = 'RETIRING', retire_from = now()
		WHERE tenant_id = $1 AND status = 'ACTIVE'
	`, tenantID)
	if err != nil {
		return err
	}

	// 2️⃣ Insert new ACTIVE key (V2)
	_, err = tx.ExecContext(ctx, `
		INSERT INTO token_encryption_keys
		(key_id, tenant_id, key_version, encrypted_key, status, active_from, created_by)
		VALUES ($1, $2, $3, $4, 'ACTIVE', now(), $5)
	`,
		newKeyID,
		tenantID,
		getNextVersion(ctx, tx, tenantID), // helper (below)
		newKey,
		createdBy,
	)
	if err != nil {
		return err
	}

	return tx.Commit()

}

func getNextVersion(ctx context.Context, tx *sql.Tx, tenantID string) int {

	var version int

	err := tx.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(key_version), 0) + 1
		FROM token_encryption_keys
		WHERE tenant_id = $1
	`, tenantID).Scan(&version)

	if err != nil {
		return 1
	}

	return version
}

func (r *TokenRepository) GetRetiringKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error) {

	var k models.EncryptionKey
	var raw []byte

	err := r.db.QueryRowContext(ctx, `
		SELECT key_id, tenant_id, key_version, encrypted_key, status
		FROM token_encryption_keys
		WHERE tenant_id = $1 AND status = 'RETIRING'
		LIMIT 1
	`, tenantID).Scan(
		&k.KeyID,
		&k.TenantID,
		&k.Version,
		&raw,
		&k.Status,
	)

	if err != nil {
		return nil, err
	}

	k.RawKey = raw
	return &k, nil
}

func (r *TokenRepository) GetTokensByKey(ctx context.Context, keyID string, limit int) ([]models.TokenRecord, error) {

	rows, err := r.db.QueryContext(ctx, `
	SELECT token_id, tenant_id, kind, ciphertext, nonce, encryption_key_id, key_version, status, created_at
	FROM token_map
	WHERE encryption_key_id = $1
	ORDER BY created_at
	LIMIT $2
`, keyID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []models.TokenRecord

	for rows.Next() {
		var t models.TokenRecord

		err := rows.Scan(
			&t.TokenID,
			&t.TenantID,
			&t.Kind,
			&t.Ciphertext,
			&t.Nonce,
			&t.EncryptionKeyID,
			&t.KeyVersion,
			&t.Status,
			&t.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		tokens = append(tokens, t)
	}

	return tokens, nil
}

func (r *TokenRepository) UpdateTokenKey(
	ctx context.Context,
	tokenID string,
	ciphertext, nonce []byte,
	newKeyID string,
	newVersion int,
) error {

	_, err := r.db.ExecContext(ctx, `
		UPDATE token_map
		SET ciphertext = $1,
		    nonce = $2,
		    encryption_key_id = $3,
		    key_version = $4
		WHERE token_id = $5
	`, ciphertext, nonce, newKeyID, newVersion, tokenID)

	return err
}

func (r *TokenRepository) CountTokensByKey(ctx context.Context, keyID string) (int, error) {

	var count int

	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*)
		FROM token_map
		WHERE encryption_key_id = $1
	`, keyID).Scan(&count)

	return count, err
}

func (r *TokenRepository) MarkKeyRetired(ctx context.Context, keyID string) error {

	_, err := r.db.ExecContext(ctx, `
		UPDATE token_encryption_keys
		SET status = 'RETIRED',
		    fully_retired_at = now()
		WHERE key_id = $1
	`, keyID)

	return err
}

func (r *TokenRepository) GetAllTenants(ctx context.Context) ([]string, error) {

	rows, err := r.db.QueryContext(ctx, `
		SELECT DISTINCT tenant_id FROM token_encryption_keys
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tenants []string

	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		tenants = append(tenants, t)
	}

	return tenants, nil
}
