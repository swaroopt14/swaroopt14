package db

import "database/sql"

func CreateTables(db *sql.DB) error {

	tokenMap := `
	CREATE TABLE IF NOT EXISTS token_map (
		token_id UUID PRIMARY KEY,
		tenant_id UUID NOT NULL,
		kind TEXT NOT NULL,

		ciphertext BYTEA NOT NULL,
		nonce BYTEA NOT NULL,

		encryption_key_id VARCHAR NOT NULL, -- 🔥 NEW

		key_version INT NOT NULL,
		status TEXT NOT NULL DEFAULT 'ACTIVE',
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);`

	tokenAudit := `
	CREATE TABLE IF NOT EXISTS token_audit (
		audit_id UUID PRIMARY KEY,
		token_id UUID,
		tenant_id UUID,
		actor TEXT NOT NULL,
		action TEXT NOT NULL,
		purpose TEXT NOT NULL,
		decision TEXT NOT NULL,
		trace_id TEXT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);`

	// 🔥 NEW TABLE: KEY REGISTRY
	tokenKeys := `
	CREATE TABLE IF NOT EXISTS token_encryption_keys (
		key_id VARCHAR PRIMARY KEY,
		tenant_id UUID NOT NULL,

		key_version INT NOT NULL,
		algorithm VARCHAR DEFAULT 'AES-256-GCM',

		encrypted_key BYTEA NOT NULL,

		status VARCHAR CHECK (status IN ('ACTIVE', 'RETIRING', 'RETIRED')),

		active_from TIMESTAMPTZ,
		retire_from TIMESTAMPTZ,
		fully_retired_at TIMESTAMPTZ,

		created_by VARCHAR,
		created_at TIMESTAMPTZ DEFAULT now()
	);`

	index := `
		CREATE INDEX IF NOT EXISTS idx_token_key
		ON token_map(encryption_key_id);
		`
	uniqueIndex := `
		CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_key_per_tenant
		ON token_encryption_keys(tenant_id)
		WHERE status = 'ACTIVE';
		`

	// 🔧 EXECUTION
	if _, err := db.Exec(tokenMap); err != nil {
		return err
	}

	if _, err := db.Exec(tokenAudit); err != nil {
		return err
	}

	if _, err := db.Exec(tokenKeys); err != nil {
		return err
	}

	if _, err := db.Exec(index); err != nil {
		return err
	}

	if _, err := db.Exec(uniqueIndex); err != nil {
		return err
	}

	return nil
}
