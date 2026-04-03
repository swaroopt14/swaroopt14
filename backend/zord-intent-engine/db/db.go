package db

import (
	"database/sql"
	"log"
)

var DB *sql.DB

func CreateTables() error {

	paymentIntents := `
	CREATE TABLE IF NOT EXISTS payment_intents (
		intent_id UUID PRIMARY KEY,
		trace_id UUID NOT NULL,
		envelope_id UUID NOT NULL,
		tenant_id UUID NOT NULL,
		contract_id UUID NOT NULL,
    idempotency_key TEXT,
    salient_hash TEXT NOT NULL,
	payload_hash BYTEA NOT NULL, 
    intent_type TEXT NOT NULL,
    canonical_version TEXT NOT NULL,
    schema_version TEXT,
    amount NUMERIC NOT NULL,
    currency CHAR(3) NOT NULL,
    deadline_at TIMESTAMPTZ,
    constraints JSONB,
    beneficiary_type TEXT,
    pii_tokens JSONB,
    beneficiary JSONB,
    status TEXT NOT NULL,
    confidence_score NUMERIC(5,2),
    -- 🆕 WORM / Tamper-evidence fields
    canonical_hash TEXT NOT NULL,
    canonical_snapshot_ref TEXT NOT NULL,
    nir_snapshot_ref TEXT,
    governance_snapshot_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 🆕 Additional Canonical Schema fields
    client_payout_ref TEXT,
    request_fingerprint TEXT,
    routing_hints_json JSONB,
    governance_state TEXT,
    business_state TEXT,
    duplicate_risk_flag BOOLEAN,
    mapping_profile_version TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);`

	if _, err := DB.Exec(paymentIntents); err != nil {
		return err
	}

	// Optimized lookup for idempotency guard (tenant_id + envelope_id)
	if _, err := DB.Exec(`
	CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant_envelope
	    ON payment_intents (tenant_id, envelope_id);
	`); err != nil {
		return err
	}

	//Outbox (OWNED)
	outbox := `
	CREATE TABLE IF NOT EXISTS outbox (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	trace_id UUID NOT NULL,  
    envelope_id UUID NOT NULL, 
    tenant_id UUID NOT NULL,
    contract_id UUID NOT NULL,
	lease_id UUID, leased_by TEXT, lease_until TIMESTAMPTZ,
    -- intent-specific outbox
    aggregate_type TEXT NOT NULL DEFAULT 'intent',
    aggregate_id UUID NOT NULL, -- payment_intents.intent_id
    event_type TEXT NOT NULL,   -- intent.created.v1, intent.updated.v1
	schema_version TEXT,
	amount NUMERIC,
	currency CHAR(3),
   	payload JSONB NOT NULL,     -- downstream message body (no raw PII)
	payload_hash BYTEA NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    CONSTRAINT fk_outbox_intent
        FOREIGN KEY (aggregate_id)
        REFERENCES payment_intents(intent_id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_outbox_status
        CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    CONSTRAINT chk_outbox_aggregate_type
        CHECK (aggregate_type = 'intent')
);
`

	if _, err := DB.Exec(outbox); err != nil {
		return err
	}
	// // Ensure lease columns exist for internal outbox pull API
	// if _, err := DB.Exec(`
	// 	ALTER TABLE outbox
	// 	ADD COLUMN IF NOT EXISTS lease_id UUID,
	// 	ADD COLUMN IF NOT EXISTS leased_by TEXT,
	// 	ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;
	// `); err != nil {
	// 	return err
	// }

	// Indexes for lease scanning and ack/nack operations
	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_outbox_pending_lease
		ON outbox (status, lease_until, created_at);
	`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_outbox_lease_id
		ON outbox (lease_id);
	`); err != nil {
		return err
	}

	// DLQ ITEMS (OWNED)
	dlqItems := `
	CREATE TABLE IF NOT EXISTS dlq_items (
		dlq_id UUID PRIMARY KEY,
		tenant_id UUID NOT NULL,
		envelope_id UUID NOT NULL,
		stage TEXT NOT NULL,
		reason_code TEXT NOT NULL,
		error_detail TEXT,
		replayable BOOLEAN NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);`

	if _, err := DB.Exec(dlqItems); err != nil {
		return err
	}

	// NORMALIZED INGEST RECORDS TABLE
	normalizedIngestRecords := `
	CREATE TABLE IF NOT EXISTS normalized_ingest_records (
		nir_id UUID PRIMARY KEY,
		envelope_id UUID NOT NULL,
		tenant_id UUID NOT NULL,
		detected_format TEXT,
		profile_id TEXT,
		profile_version TEXT,
		fields_json JSONB,
		field_confidence_summary JSONB,
		unmapped_json JSONB,
		mapping_uncertain_flag BOOLEAN,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	);`

	if _, err := DB.Exec(normalizedIngestRecords); err != nil {
		return err
	}

	if _, err := DB.Exec(`CREATE INDEX IF NOT EXISTS idx_nirs_tenant_id ON normalized_ingest_records(tenant_id);`); err != nil {
		return err
	}

	if _, err := DB.Exec(`CREATE INDEX IF NOT EXISTS idx_nirs_envelope_id ON normalized_ingest_records(envelope_id);`); err != nil {
		return err
	}
	intentVersions := `
CREATE TABLE IF NOT EXISTS intent_versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL,
    version_no INT NOT NULL,
    prev_hash TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_intent_versions_intent
        FOREIGN KEY (intent_id)
        REFERENCES payment_intents(intent_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_intent_versions_intent_version
        UNIQUE (intent_id, version_no)
);`

	if _, err := DB.Exec(intentVersions); err != nil {
		return err
	}

	if _, err := DB.Exec(`
CREATE INDEX IF NOT EXISTS idx_intent_versions_intent_id
    ON intent_versions (intent_id);
`); err != nil {
		return err
	}

	if _, err := DB.Exec(`
CREATE INDEX IF NOT EXISTS idx_intent_versions_intent_version
    ON intent_versions (intent_id, version_no);
`); err != nil {
		return err
	}

	log.Println("✅ Canonical Intent Engine tables ensured")
	return nil
}
