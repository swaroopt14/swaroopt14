-- ============================================================================
-- ZORD INTENT ENGINE - DATABASE INITIALIZATION SCRIPT
-- This script creates all required tables for the intent processing engine
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PAYMENT INTENTS TABLE
-- Stores canonicalized payment intents after processing
-- ============================================================================
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
    canonical_hash TEXT NOT NULL,
    canonical_snapshot_ref TEXT NOT NULL,
    nir_snapshot_ref TEXT,
    governance_snapshot_ref TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_payout_ref TEXT,
    request_fingerprint TEXT,
    routing_hints_json JSONB,
    governance_state TEXT,
    business_state TEXT,
    duplicate_risk_flag BOOLEAN,
    mapping_profile_version TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()


);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_intents_tenant_id ON payment_intents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_envelope_id ON payment_intents(envelope_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_created_at ON payment_intents(created_at);

-- ============================================================================
-- OUTBOX TABLE
-- Stores events to be published to downstream systems
-- ============================================================================
CREATE TABLE IF NOT EXISTS outbox (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id UUID NOT NULL,
    contract_id UUID NOT NULL,

    -- intent-specific outbox
    aggregate_type TEXT NOT NULL DEFAULT 'intent',
    aggregate_id UUID NOT NULL, -- payment_intents.intent_id

    event_type TEXT NOT NULL,   -- intent.created.v1, intent.updated.v1
    schema_version TEXT,

    payload JSONB NOT NULL,     -- downstream message body (no raw PII)
    payload_hash BYTEA NOT NULL,
    amount NUMERIC,
    currency CHAR(3),

    status TEXT NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    lease_id UUID,
    leased_by TEXT,
    lease_until TIMESTAMPTZ,

    -- tracing / observability
    trace_id UUID NOT NULL,  
    envelope_id UUID NOT NULL,

    CONSTRAINT fk_outbox_intent
        FOREIGN KEY (aggregate_id)
        REFERENCES payment_intents(intent_id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_outbox_status
        CHECK (status IN ('PENDING', 'SENT', 'FAILED')),

    CONSTRAINT chk_outbox_aggregate_type
        CHECK (aggregate_type = 'intent')
);

-- Create indexes for outbox processing
CREATE INDEX IF NOT EXISTS idx_outbox_pending_lease ON outbox(status, lease_until, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_lease_id ON outbox(lease_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_id ON outbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON outbox(created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_next_attempt_at ON outbox(next_attempt_at);

-- ============================================================================
-- DLQ ITEMS TABLE
-- Stores failed processing items for replay and analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS dlq_items (
    dlq_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    envelope_id UUID NOT NULL,

    stage TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    error_detail TEXT,
    replayable BOOLEAN NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for DLQ analysis
CREATE INDEX IF NOT EXISTS idx_dlq_items_tenant_id ON dlq_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlq_items_envelope_id ON dlq_items(envelope_id);
CREATE INDEX IF NOT EXISTS idx_dlq_items_reason_code ON dlq_items(reason_code);
CREATE INDEX IF NOT EXISTS idx_dlq_items_replayable ON dlq_items(replayable);
CREATE INDEX IF NOT EXISTS idx_dlq_items_created_at ON dlq_items(created_at);



-- ============================================================================
-- INTENT VERSIONS TABLE
-- Stores immutable version-chain linkage for intents
-- ============================================================================
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
);

CREATE INDEX IF NOT EXISTS idx_intent_versions_intent_id ON intent_versions(intent_id);
CREATE INDEX IF NOT EXISTS idx_intent_versions_intent_version ON intent_versions(intent_id, version_no);

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these to verify tables were created successfully
-- ============================================================================

-- Check table creation
DO $$
BEGIN
    RAISE NOTICE '✅ Checking table creation...';
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_intents') THEN
        RAISE NOTICE '✅ payment_intents table created successfully';
    ELSE
        RAISE EXCEPTION '❌ payment_intents table creation failed';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'outbox') THEN
        RAISE NOTICE '✅ outbox table created successfully';
    ELSE
        RAISE EXCEPTION '❌ outbox table creation failed';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dlq_items') THEN
        RAISE NOTICE '✅ dlq_items table created successfully';
    ELSE
        RAISE EXCEPTION '❌ dlq_items table creation failed';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'intent_versions') THEN
    RAISE NOTICE '✅ intent_versions table created successfully';
    ELSE
        RAISE EXCEPTION '❌ intent_versions table creation failed';
    END IF;

    RAISE NOTICE '🎉 All zord-intent-engine tables created successfully!';
END $$;

-- Display table information
SELECT 
    schemaname,
    tablename,
    tableowner,
    tablespace,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE tablename IN ('payment_intents', 'intent_versions','outbox', 'dlq_items')
ORDER BY tablename;
