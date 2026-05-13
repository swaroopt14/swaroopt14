package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

func Connect(dsn string) (*sql.DB, error) {
	database, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	database.SetMaxOpenConns(1000)
	database.SetMaxIdleConns(500)
	database.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := database.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return database, nil
}

// EnsureTables creates all Service 6 tables if they do not already exist.
// Schema is aligned with the Intelligence Pivot spec §14.1–14.5.
func EnsureTables(ctx context.Context, d *sql.DB) error {
	stmts := []string{
		// Internal buffer for Merkle leaf candidates before pack generation
		`CREATE TABLE IF NOT EXISTS pending_leaf_candidates (
			id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id      TEXT        NOT NULL,
			intent_id      TEXT,       -- NULL initially for edge events
			envelope_id    TEXT,       -- Used to correlate edge events
			contract_id    TEXT,       -- Buffering contract_id
			batch_id       TEXT,       -- Buffering batch_id
			leaf_type      TEXT        NOT NULL,
			item_ref       TEXT,       -- The reference for the item (e.g. variance_record_id)
			hash           TEXT        NOT NULL,
			schema_version TEXT        NOT NULL DEFAULT 'v1',
			source_topic   TEXT        NOT NULL,
			created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS plc_intent_type_idx ON pending_leaf_candidates(tenant_id, intent_id, leaf_type) WHERE intent_id IS NOT NULL;`,
		`CREATE UNIQUE INDEX IF NOT EXISTS plc_envelope_type_idx ON pending_leaf_candidates(tenant_id, envelope_id, leaf_type) WHERE intent_id IS NULL;`,
		`CREATE UNIQUE INDEX IF NOT EXISTS plc_batch_type_idx ON pending_leaf_candidates(tenant_id, batch_id, leaf_type) WHERE batch_id IS NOT NULL;`,

		// §14.1 — main metadata table
		`CREATE TABLE IF NOT EXISTS evidence_packs (
			evidence_pack_id      TEXT PRIMARY KEY,
			tenant_id             TEXT NOT NULL,
			intent_id             TEXT,
			contract_id           TEXT,
			batch_id              TEXT,
			mode                  TEXT NOT NULL,
			pack_status           TEXT NOT NULL DEFAULT 'ACTIVE',
			merkle_root           TEXT NOT NULL,
			ruleset_version       TEXT NOT NULL,
			schema_versions_json  JSONB,
			signature_alg         TEXT NOT NULL,
			signature_value       TEXT NOT NULL,
			object_ref            TEXT NOT NULL,
			supersedes_pack_id    TEXT,
			replay_equivalence_status TEXT,
			replay_notes          TEXT,
			created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS evidence_packs_tenant_contract_idx ON evidence_packs(tenant_id, contract_id)`,
		`CREATE INDEX IF NOT EXISTS evidence_packs_tenant_intent_idx   ON evidence_packs(tenant_id, intent_id)`,
		`CREATE INDEX IF NOT EXISTS evidence_packs_tenant_batch_idx    ON evidence_packs(tenant_id, batch_id)`,

		// §14.2 — leaf composition table
		`CREATE TABLE IF NOT EXISTS evidence_items (
			evidence_pack_id TEXT NOT NULL,
			position_index   INT  NOT NULL,
			item_type        TEXT NOT NULL,
			item_ref         TEXT NOT NULL,
			item_hash        TEXT,
			leaf_hash        TEXT NOT NULL,
			schema_version   TEXT NOT NULL,
			PRIMARY KEY(evidence_pack_id, position_index)
		)`,
		`CREATE INDEX IF NOT EXISTS evidence_items_pack_idx ON evidence_items(evidence_pack_id)`,

		// signatures sub-table
		`CREATE TABLE IF NOT EXISTS evidence_signatures (
			evidence_pack_id TEXT NOT NULL,
			signer           TEXT NOT NULL,
			alg              TEXT NOT NULL,
			signature        TEXT NOT NULL,
			signed_at        TIMESTAMPTZ NOT NULL,
			PRIMARY KEY(evidence_pack_id, signer, alg)
		)`,

		// §14.3 — immutable archive body metadata
		`CREATE TABLE IF NOT EXISTS evidence_archives (
			archive_id        TEXT PRIMARY KEY,
			evidence_pack_id  TEXT NOT NULL,
			tenant_id         TEXT NOT NULL,
			object_ref        TEXT NOT NULL,
			encryption_key_id TEXT,
			archive_hash      TEXT NOT NULL,
			archive_version   TEXT NOT NULL DEFAULT 'v1',
			created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS evidence_archives_pack_idx ON evidence_archives(evidence_pack_id)`,

		// §14.4 — Merkle inclusion proofs (selective disclosure)
		`CREATE TABLE IF NOT EXISTS merkle_inclusion_proofs (
			evidence_pack_id TEXT NOT NULL,
			leaf_hash        TEXT NOT NULL,
			proof_path_json  JSONB NOT NULL,
			created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY(evidence_pack_id, leaf_hash)
		)`,

		// §14.5 — replay job tracking
		`CREATE TABLE IF NOT EXISTS evidence_replay_jobs (
			replay_job_id           TEXT PRIMARY KEY,
			tenant_id               TEXT NOT NULL,
			source_evidence_pack_id TEXT NOT NULL,
			intent_id               TEXT,
			contract_id             TEXT,
			ruleset_version         TEXT NOT NULL,
			mapping_versions_json   JSONB,
			requested_by            TEXT,
			status                  TEXT NOT NULL DEFAULT 'PENDING',
			new_evidence_pack_id    TEXT,
			equivalence_result      TEXT,
			difference_summary_json JSONB,
			created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			completed_at            TIMESTAMPTZ
		)`,
		`CREATE INDEX IF NOT EXISTS evidence_replay_jobs_tenant_idx ON evidence_replay_jobs(tenant_id, source_evidence_pack_id)`,
		`CREATE INDEX IF NOT EXISTS evidence_replay_jobs_status_idx ON evidence_replay_jobs(status)`,

		// outbox for relay polling
		`CREATE TABLE IF NOT EXISTS evidence_outbox_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id TEXT,
    envelope_id TEXT,
    tenant_id TEXT NOT NULL,
    contract_id TEXT,
    aggregate_type TEXT NOT NULL DEFAULT 'evidence_pack',
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,   -- evidence.pack.created
    schema_version TEXT DEFAULT 'v1',
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    lease_id UUID,
    leased_by TEXT,
    lease_until TIMESTAMPTZ
);`,
		`CREATE INDEX IF NOT EXISTS idx_evidence_outbox_pending_lease ON evidence_outbox_events(status, lease_until, created_at);`,
		`CREATE INDEX IF NOT EXISTS idx_evidence_outbox_lease_id ON evidence_outbox_events(lease_id);`,
		`CREATE INDEX IF NOT EXISTS idx_evidence_outbox_status ON evidence_outbox_events(status);`,
		`CREATE INDEX IF NOT EXISTS idx_evidence_outbox_tenant_id ON evidence_outbox_events(tenant_id);`,
	}

	for _, s := range stmts {
		if _, err := d.ExecContext(ctx, s); err != nil {
			return fmt.Errorf("ensure table: %w (stmt: %.80s)", err, s)
		}
	}
	return nil
}
