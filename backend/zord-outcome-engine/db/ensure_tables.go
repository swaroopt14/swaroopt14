package db

import (
	"context"
	"database/sql"
	"fmt"
)

var DB *sql.DB

func EnsureTables(ctx context.Context) error {
	if DB == nil {
		return fmt.Errorf("db is nil")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	stmts := []string{
		`
CREATE TABLE IF NOT EXISTS dispatch_index(
	dispatch_id UUID PRIMARY KEY,
	contract_id UUID NOT NULL,
	intent_id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	trace_id UUID NOT NULL,
	connector_id UUID NOT NULL,
	corridor_id TEXT NOT NULL,
	attempt_count INT NOT NULL DEFAULT 0,
	provider_attempt_id TEXT,
	correlation_carriers JSONB,
	provider_ref_hashes TEXT[]
);`,
		`
CREATE TABLE IF NOT EXISTS raw_outcome_envelopes(
	raw_outcome_envelope_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID NOT NULL,
	connector_id UUID NOT NULL,
	source_class TEXT NOT NULL,
	received_at TIMESTAMPTZ NOT NULL,
	raw_bytes_sha256 BYTEA NOT NULL,
	object_store_ref TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS raw_outcome_envelopes_tenant_sha256_uq ON raw_outcome_envelopes(tenant_id, raw_bytes_sha256);`,
		`
CREATE TABLE IF NOT EXISTS canonical_outcome_events(
	event_id UUID PRIMARY KEY,
	raw_outcome_envelope_id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	contract_id UUID,
	intent_id UUID,
	dispatch_id UUID,
	trace_id UUID,
	connector_id UUID NOT NULL,
	corridor_id TEXT,
	source_class TEXT NOT NULL,
	status_candidate TEXT NOT NULL,
	provider_ref_hash TEXT,
	provider_event_id TEXT,
	utr TEXT,
	amount NUMERIC(24,8),
	currency TEXT,
	observed_at TIMESTAMPTZ,
	received_at TIMESTAMPTZ NOT NULL,
	correlation_confidence INT NOT NULL DEFAULT 0,
	dedupe_key TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS canonical_outcome_events_dedupe_key_uq ON canonical_outcome_events(dedupe_key);`,
		`CREATE INDEX IF NOT EXISTS canonical_outcome_events_contract_idx ON canonical_outcome_events(contract_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_outcome_events_dispatch_idx ON canonical_outcome_events(dispatch_id);`,

		`
CREATE TABLE IF NOT EXISTS fused_outcomes(
	contract_id UUID PRIMARY KEY,
	current_state TEXT NOT NULL,
	finality_certificate_id UUID,
	final_state TEXT,
	finality_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	finality_basis TEXT,
	rule_version TEXT NOT NULL,
	divergence_flags JSONB,
	last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`
CREATE TABLE IF NOT EXISTS poll_schedule(
	contract_id UUID PRIMARY KEY,
	dispatch_id UUID NOT NULL,
	next_poll_at TIMESTAMPTZ NOT NULL,
	poll_stage INT NOT NULL,
	last_poll_at TIMESTAMPTZ,
	poll_failures INT NOT NULL DEFAULT 0,
	connector_id UUID NOT NULL,
	corridor_id TEXT NOT NULL
);`,
		`
CREATE TABLE IF NOT EXISTS finality_certificates(
	finality_certificate_id UUID PRIMARY KEY,
	contract_id UUID NOT NULL,
	final_state TEXT NOT NULL,
	confidence INT NOT NULL,
	input_hashes JSONB NOT NULL,
	rule_id TEXT NOT NULL,
	signature TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
	}

	for _, s := range stmts {
		if _, err := DB.ExecContext(ctx, s); err != nil {
			return err
		}
	}
	return nil
}
