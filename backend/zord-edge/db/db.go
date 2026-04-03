package db

import (
	"database/sql"
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
	}

	return nil
}
