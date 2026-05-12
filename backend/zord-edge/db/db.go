package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"

	"zord-edge/auth/workspacecode"
)

var DB *sql.DB

func CreateTable() error {
	_, err := DB.Exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`)
	if err != nil {
		log.Fatal(err)
		return err
	}

	tenant :=
		`CREATE TABLE IF NOT EXISTS "tenants" (
    tenant_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_name TEXT NOT NULL UNIQUE,
    workspace_code TEXT UNIQUE,
    key_prefix  TEXT NOT NULL UNIQUE,
    key_hash    TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
	);`
	_, err = DB.Exec(tenant)
	if err != nil {
		log.Fatal(err)
		return err
	}

	if err := backfillWorkspaceCodes(); err != nil {
		log.Fatal(err)
		return err
	}

	idempotencyKeys :=
		`CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	tenant_id UUID NOT NULL,
	idempotency_key TEXT NOT NULL,
	first_envelope_id  UUID NULL,
	status TEXT NOT NULL DEFAULT 'RESERVED',
	request_fingerprint BYTEA,
	first_seen_at TIMESTAMPTZ DEFAULT now(),
	last_seen_at TIMESTAMPTZ DEFAULT now(),
	resolution_type TEXT NOT NULL DEFAULT 'CREATED',
	expires_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ DEFAULT now(),
	updated_at TIMESTAMPTZ DEFAULT now(),
	PRIMARY KEY (tenant_id, idempotency_key),
	UNIQUE (tenant_id, idempotency_key)
);`

	_, err = DB.Exec(idempotencyKeys)
	if err != nil {
		log.Fatal(err)
	}

	ingress_envelope :=
		`CREATE TABLE IF NOT EXISTS "ingress_envelopes"(
	trace_id UUID NOT NULL,
	envelope_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	source TEXT NOT NULL,
	source_system TEXT NOT NULL,
	content_type TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	payload_size INT NOT NULL,
	payload_hash BYTEA NOT NULL,
	envelope_hash BYTEA NOT NULL,
	envelope_signature BYTEA NOT NULL,
	vault_object_ref TEXT,
	request_headers_hash BYTEA,
	schema_hint TEXT,
	encryption_key_id TEXT,
	object_store_version TEXT,
	idempotency_reservation_status TEXT,
	principal_id UUID,
	auth_method TEXT,
	received_at TIMESTAMPTZ NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending'
	--error_code TEXT,
    --error_detail TEXT
	);`

	_, err = DB.Exec(ingress_envelope)
	if err != nil {
		log.Fatal(err)
	}

	rawEnvelopeIndexes := `
	CREATE INDEX IF NOT EXISTS idx_raw_env_tenant_time
	ON ingress_envelopes (tenant_id, received_at DESC);

	CREATE INDEX IF NOT EXISTS idx_raw_env_status
	ON ingress_envelopes (status, received_at);`

	_, err = DB.Exec(rawEnvelopeIndexes)
	if err != nil {
		log.Fatal(err)
	}

	ingress_outbox :=
		`CREATE TABLE IF NOT EXISTS "ingress_outbox"(
	outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	trace_id UUID NOT NULL,
	envelope_id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	object_ref TEXT NOT NULL,
	received_at TIMESTAMPTZ NOT NULL,
	source TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	encrypted_payload BYTEA NOT NULL,
	payload_hash BYTEA NOT NULL,
	topic TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'PENDING',
	attempts INT NOT NULL DEFAULT 0,
	next_retry_at TIMESTAMPTZ
	);`

	_, err = DB.Exec(ingress_outbox)
	if err != nil {
		log.Fatal(err)
	}

	connectors := `
	CREATE TABLE IF NOT EXISTS "connectors" (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	tenant_id UUID NOT NULL,
	provider TEXT NOT NULL,
	connector_id TEXT NOT NULL,
	secret_ref TEXT,
	secret TEXT,
	active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ DEFAULT now(),
	updated_at TIMESTAMPTZ DEFAULT now(),
	CONSTRAINT unique_provider_connector UNIQUE (provider, connector_id),
	CONSTRAINT unique_tenant_connector UNIQUE (tenant_id, provider, connector_id)
);`

	_, err = DB.Exec(connectors)
	if err != nil {
		log.Fatal(err)
		return err
	}

	authUsers := `
	CREATE TABLE IF NOT EXISTS auth_users (
		user_id UUID PRIMARY KEY,
		tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
		email TEXT NOT NULL,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'ACTIVE',
		failed_login_attempts INT NOT NULL DEFAULT 0,
		locked_until TIMESTAMPTZ NULL,
		last_login_at TIMESTAMPTZ NULL,
		mfa_enabled BOOLEAN NOT NULL DEFAULT false,
		name TEXT NOT NULL,
		created_by UUID NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		UNIQUE (tenant_id, email)
	);`
	_, err = DB.Exec(authUsers)
	if err != nil {
		log.Fatal(err)
		return err
	}

	authRefreshTokens := `
	CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
		token_id UUID PRIMARY KEY,
		user_id UUID NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
		tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
		session_id UUID NOT NULL,
		token_hash TEXT NOT NULL UNIQUE,
		expires_at TIMESTAMPTZ NOT NULL,
		revoked_at TIMESTAMPTZ NULL,
		replaced_by_token_id TEXT NULL,
		created_ip TEXT NULL,
		created_user_agent TEXT NULL,
		last_used_at TIMESTAMPTZ NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);`
	_, err = DB.Exec(authRefreshTokens)
	if err != nil {
		log.Fatal(err)
		return err
	}

	authAuditEvents := `
	CREATE TABLE IF NOT EXISTS auth_audit_events (
		event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		tenant_id UUID NULL REFERENCES tenants(tenant_id) ON DELETE SET NULL,
		user_id UUID NULL REFERENCES auth_users(user_id) ON DELETE SET NULL,
		event_type TEXT NOT NULL,
		ip TEXT NULL,
		user_agent TEXT NULL,
		metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);`
	_, err = DB.Exec(authAuditEvents)
	if err != nil {
		log.Fatal(err)
		return err
	}

	authIndexes := `
	CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users (email);
	CREATE INDEX IF NOT EXISTS idx_auth_users_tenant_role ON auth_users (tenant_id, role);
	CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_session ON auth_refresh_tokens (session_id);
	CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_id ON auth_refresh_tokens (user_id);
	CREATE INDEX IF NOT EXISTS idx_auth_audit_events_tenant_time ON auth_audit_events (tenant_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_auth_audit_events_user_time ON auth_audit_events (user_id, created_at DESC);`
	_, err = DB.Exec(authIndexes)
	if err != nil {
		log.Fatal(err)
		return err
	}
	return nil
}

func backfillWorkspaceCodes() error {
	rows, err := DB.Query(`SELECT tenant_id::text, tenant_name, COALESCE(workspace_code, '') FROM tenants ORDER BY created_at ASC`)
	if err != nil {
		return fmt.Errorf("query tenants for workspace code backfill: %w", err)
	}
	defer rows.Close()

	type tenantRecord struct {
		TenantID      string
		TenantName    string
		WorkspaceCode string
	}

	records := []tenantRecord{}
	for rows.Next() {
		var record tenantRecord
		if err := rows.Scan(&record.TenantID, &record.TenantName, &record.WorkspaceCode); err != nil {
			return fmt.Errorf("scan tenant for workspace code backfill: %w", err)
		}
		record.WorkspaceCode = strings.ToLower(strings.TrimSpace(record.WorkspaceCode))
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate tenants for workspace code backfill: %w", err)
	}

	usedCodes := make(map[string]struct{})
	for _, record := range records {
		desiredCode := record.WorkspaceCode
		if desiredCode == "" {
			desiredCode = workspacecode.Sanitize(record.TenantName)
		}

		baseCode := workspacecode.Sanitize(record.TenantName)
		if _, exists := usedCodes[desiredCode]; exists {
			// We only add the deterministic suffix when needed so friendly codes stay short,
			// but repeated runs still produce the same fallback for the same tenant.
			desiredCode = workspacecode.WithDeterministicSuffix(baseCode, record.TenantID)
		}

		if record.WorkspaceCode != desiredCode {
			if _, err := DB.Exec(`UPDATE tenants SET workspace_code = $2 WHERE tenant_id::text = $1`, record.TenantID, desiredCode); err != nil {
				return fmt.Errorf("update workspace code for tenant %s: %w", record.TenantID, err)
			}
		}

		if _, exists := usedCodes[desiredCode]; exists {
			return fmt.Errorf("workspace code collision remained for tenant %s", record.TenantID)
		}
		usedCodes[desiredCode] = struct{}{}
	}

	return nil
}

func UpsertIngestRun(
	ctx context.Context,
	db *sql.DB,
	runID, batchID, tenantID, profileID, fileName, fileHash string,
	total, accepted, failed, duplicate int,
	status string,
) error {
	const q = `
		INSERT INTO intent_ingest_runs
		    (run_id, batch_id, tenant_id, profile_id, file_name, file_hash,
		     total_rows, accepted_rows, failed_rows, duplicate_rows, status, completed_at)
		VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''), NULLIF($6,''),
		        $7, $8, $9, $10, $11, now())
		ON CONFLICT (batch_id) DO UPDATE SET
		    total_rows     = EXCLUDED.total_rows,
		    accepted_rows  = EXCLUDED.accepted_rows,
		    failed_rows    = EXCLUDED.failed_rows,
		    duplicate_rows = EXCLUDED.duplicate_rows,
		    status         = EXCLUDED.status,
		    completed_at   = now()`

	_, err := db.ExecContext(ctx, q,
		runID, batchID, tenantID, profileID, fileName, fileHash,
		total, accepted, failed, duplicate, status,
	)
	if err != nil {
		return fmt.Errorf("UpsertIngestRun: %w", err)
	}
	return nil
}
