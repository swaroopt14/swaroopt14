package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"
)

var DB *sql.DB

func CreateTable() error {

	tenant :=
		`CREATE TABLE IF NOT EXISTS "tenants" (
    tenant_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    tenant_name TEXT NOT NULL UNIQUE,                     
    key_prefix  TEXT NOT NULL UNIQUE,                      
    key_hash    TEXT NOT NULL,                             
    is_active   BOOLEAN NOT NULL DEFAULT true,            
    created_at  TIMESTAMPTZ DEFAULT now()                 
	);`
	_, err := DB.Exec(tenant)
	if err != nil {
		log.Fatal(err)
		return err
	}

	idempotencyKeys :=
		`CREATE TABLE IF NOT EXISTS "idempotency_keys" (
	tenant_id UUID NOT NULL,
	idempotency_key TEXT NOT NULL,
	first_envelope_id  UUID NULL,
	status TEXT NOT NULL DEFAULT 'RESERVED',
	request_fingerprint TEXT,
	first_seen_at TIMESTAMPTZ DEFAULT now(),
	last_seen_at TIMESTAMPTZ DEFAULT now(),
	resolution_type TEXT NOT NULL DEFAULT 'CREATED',
	expires_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ DEFAULT now(),
	updated_at TIMESTAMPTZ DEFAULT now(),
	response_snapshot_json TEXT,
	conflict_count INT DEFAULT 0,
	last_conflict_at TIMESTAMPTZ,
	principal_id_first_seen UUID,
	source_class_first_seen TEXT,
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
	ingress_channel TEXT NOT NULL,
	source_class TEXT NOT NULL,
	source_system TEXT NOT NULL,
	content_type TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	payload_size INT NOT NULL,
	payload_hash TEXT NOT NULL,
	envelope_hash TEXT NOT NULL,
	envelope_signature TEXT NOT NULL,
	vault_object_ref TEXT,
	request_headers_hash TEXT,
	schema_hint TEXT,
	mapping_profile_hint TEXT,
	object_encryption_alg TEXT,
	kms_key_version TEXT,
	parser_classification TEXT,
	transport_request_id TEXT,
	client_reference_hint TEXT,
	source_system_hint TEXT,
	ingress_api_version TEXT,
	retention_policy_class TEXT,
	webhook_provider_id TEXT,
	connector_binding_id TEXT,
	encryption_key_id TEXT,
	object_store_version TEXT,
	idempotency_reservation_status TEXT,
	principal_id UUID,
	auth_method TEXT,
	received_at TIMESTAMPTZ NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	file_name TEXT,
	file_size_bytes BIGINT,
	file_content_hash TEXT,
	row_count_estimate INT,
	file_upload_channel TEXT,
	batchid TEXT
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
	ingress_channel TEXT NOT NULL,
	source TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	encrypted_payload BYTEA NOT NULL,
	payload_hash TEXT NOT NULL,
	envelope_hash TEXT NOT NULL,
	envelope_signature BYTEA NOT NULL,
	topic TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'PENDING',
	attempts INT NOT NULL DEFAULT 0,
	next_retry_at TIMESTAMPTZ,
	lease_id UUID,
	leased_by TEXT,
	event_type TEXT NOT NULL,
	lease_until TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL,
	updated_at TIMESTAMPTZ,
	published_at TIMESTAMPTZ,
	failure_reason_code TEXT,
	batchid TEXT
	);`

	_, err = DB.Exec(ingress_outbox)
	if err != nil {
		log.Fatal(err)
	}

	// Indexes for lease scanning and ack/nack operations
	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_outbox_pending_lease
		ON ingress_outbox (status, lease_until, created_at);
	`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_outbox_lease_id
		ON ingress_outbox (lease_id);
	`); err != nil {
		return err
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
	}

	// ── Mapping profiles ─────────────────────────────────────────────────────
	mappingProfiles := `
	CREATE TABLE IF NOT EXISTS intent_mapping_profiles (
	    profile_id       TEXT PRIMARY KEY,
	    profile_version  TEXT NOT NULL DEFAULT '1.0.0',
	    tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id),
	    tenant_name      TEXT NOT NULL,
	    file_format      TEXT NOT NULL CHECK (file_format IN ('csv', 'xlsx')),
	    delimiter        TEXT NOT NULL DEFAULT ',',
	    header_row_index INT  NOT NULL DEFAULT 0,
	    column_map       JSONB NOT NULL DEFAULT '{}',
	    amount_format    TEXT NOT NULL DEFAULT 'DECIMAL',
	    date_format      TEXT NOT NULL DEFAULT '2006-01-02',
	    required_fields  TEXT[] NOT NULL DEFAULT '{}',
	    is_active        BOOLEAN NOT NULL DEFAULT true,
	    created_at       TIMESTAMPTZ DEFAULT now(),
	    updated_at       TIMESTAMPTZ DEFAULT now(),
	    UNIQUE (tenant_id, file_format, profile_version)
	);`

	_, err = DB.Exec(mappingProfiles)
	if err != nil {
		log.Fatal(err)
	}

	// ── Ingest run audit trail ────────────────────────────────────────────────
	ingestRuns := `
	CREATE TABLE IF NOT EXISTS intent_ingest_runs (
	    run_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	    batch_id       TEXT NOT NULL UNIQUE,
	    tenant_id      UUID NOT NULL,
	    profile_id     TEXT REFERENCES intent_mapping_profiles(profile_id),
	    file_name      TEXT,
	    file_hash      TEXT,
	    total_rows     INT  DEFAULT 0,
	    accepted_rows  INT  DEFAULT 0,
	    failed_rows    INT  DEFAULT 0,
	    duplicate_rows INT  DEFAULT 0,
	    status         TEXT NOT NULL DEFAULT 'PROCESSING',
	    started_at     TIMESTAMPTZ DEFAULT now(),
	    completed_at   TIMESTAMPTZ
	);`

	_, err = DB.Exec(ingestRuns)
	if err != nil {
		log.Fatal(err)
	}

	return nil
}

// UpsertIngestRun inserts or updates an intent_ingest_runs row at the end of
// a bulk ingest. It uses ON CONFLICT on batch_id to update run stats atomically.
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
