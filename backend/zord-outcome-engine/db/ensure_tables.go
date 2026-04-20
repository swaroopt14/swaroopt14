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
		`CREATE TABLE IF NOT EXISTS canonical_intents (
			intent_id                UUID PRIMARY KEY,
			tenant_id                UUID NOT NULL,
			client_payout_ref        TEXT,
			client_batch_ref         TEXT,
			business_idempotency_key TEXT,
			beneficiary_fingerprint  TEXT NOT NULL,
			amount_minor             BIGINT NOT NULL,
			currency_code            TEXT NOT NULL,
			intended_execution_at    TIMESTAMPTZ,
			payout_type              TEXT,
			provider_hint            TEXT,
			corridor                 TEXT,
			proof_readiness_score    NUMERIC(5,4) NOT NULL DEFAULT 0,
			matchability_score       NUMERIC(5,4) NOT NULL DEFAULT 0,
			canonical_hash           TEXT NOT NULL,
			governance_state         TEXT NOT NULL,
			zord_signature_carrier   TEXT,
			created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS canonical_intents_tenant_idx
			ON canonical_intents(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_intents_client_ref_idx
			ON canonical_intents(client_payout_ref) WHERE client_payout_ref IS NOT NULL;`,
		`CREATE INDEX IF NOT EXISTS canonical_intents_beneficiary_idx
			ON canonical_intents(tenant_id, beneficiary_fingerprint);`,
		`CREATE INDEX IF NOT EXISTS canonical_intents_amount_currency_idx
			ON canonical_intents(tenant_id, amount_minor, currency_code);`,
		`CREATE TABLE IF NOT EXISTS dispatch_index(
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
		`
CREATE TABLE IF NOT EXISTS settlement_ingest_jobs(
	job_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	settlement_envelope_id UUID NOT NULL,
	artifact_family TEXT NOT NULL,
	source_system TEXT NOT NULL,
	connector_id UUID,
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	job_status TEXT NOT NULL,
	row_count_expected INT,
	row_count_parsed INT NOT NULL DEFAULT 0,
	row_count_canonicalized INT NOT NULL DEFAULT 0,
	row_count_failed INT NOT NULL DEFAULT 0,
	parse_confidence_overall NUMERIC(5,4) NOT NULL DEFAULT 0,
	started_at TIMESTAMPTZ,
	completed_at TIMESTAMPTZ,
	failure_reason_code TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE INDEX IF NOT EXISTS settlement_ingest_jobs_tenant_idx ON settlement_ingest_jobs(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS settlement_ingest_jobs_envelope_idx ON settlement_ingest_jobs(settlement_envelope_id);`,
		`CREATE INDEX IF NOT EXISTS settlement_ingest_jobs_status_idx ON settlement_ingest_jobs(job_status);`,

		`
CREATE TABLE IF NOT EXISTS settlement_parsed_rows(
	parsed_row_id UUID PRIMARY KEY,
	job_id UUID NOT NULL REFERENCES settlement_ingest_jobs(job_id),
	tenant_id UUID NOT NULL,
	settlement_envelope_id UUID NOT NULL,
	source_file_ref TEXT NOT NULL,
	source_row_ref TEXT NOT NULL,
	raw_line_hash TEXT,
	raw_columns_json JSONB NOT NULL,
	parsed_candidates_json JSONB NOT NULL,
	parse_warnings_json JSONB,
	parse_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE INDEX IF NOT EXISTS settlement_parsed_rows_job_idx ON settlement_parsed_rows(job_id);`,

		`
CREATE TABLE IF NOT EXISTS canonical_settlement_observations(
	settlement_observation_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID NOT NULL,
	settlement_envelope_id UUID NOT NULL,
	job_id UUID NOT NULL REFERENCES settlement_ingest_jobs(job_id),
	source_file_ref TEXT NOT NULL,
	source_row_ref TEXT NOT NULL,
	source_system TEXT NOT NULL,
	connector_id UUID,
	observation_kind TEXT NOT NULL,
	source_strength_class TEXT NOT NULL,
	client_reference_candidate TEXT,
	provider_reference TEXT,
	bank_reference TEXT,
	external_reference TEXT,
	batch_reference TEXT,
	merchant_id_token TEXT,
	seller_id_token TEXT,
	vendor_id_token TEXT,
	beneficiary_fingerprint TEXT,
	amount_minor BIGINT NOT NULL,
	settled_amount_minor BIGINT,
	fee_amount_minor BIGINT,
	deduction_amount_minor BIGINT,
	currency_code TEXT NOT NULL,
	settlement_status TEXT NOT NULL,
	provider_status_code TEXT,
	failure_reason_code TEXT,
	retry_flag BOOLEAN NOT NULL DEFAULT FALSE,
	reversal_flag BOOLEAN NOT NULL DEFAULT FALSE,
	return_flag BOOLEAN NOT NULL DEFAULT FALSE,
	observation_timestamp TIMESTAMPTZ NOT NULL,
	value_date DATE,
	provider_ref_status TEXT NOT NULL,
	provider_ref_first_seen_at TIMESTAMPTZ,
	provider_ref_last_seen_at TIMESTAMPTZ,
	provider_ref_source_set JSONB,
	provider_ref_consistency_flag BOOLEAN,
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	parse_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	mapping_confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
	carrier_richness_score NUMERIC(5,4) NOT NULL DEFAULT 0,
	attachment_readiness_score NUMERIC(5,4) NOT NULL DEFAULT 0,
	canonical_hash TEXT NOT NULL,
	canonical_snapshot_ref TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE INDEX IF NOT EXISTS canonical_settlement_observations_tenant_idx ON canonical_settlement_observations(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_settlement_observations_job_idx ON canonical_settlement_observations(job_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_settlement_observations_envelope_idx ON canonical_settlement_observations(settlement_envelope_id);`,
		`CREATE INDEX IF NOT EXISTS canonical_settlement_observations_trace_idx ON canonical_settlement_observations(trace_id);`,

		`
CREATE TABLE IF NOT EXISTS canonical_settlement_batches(
	settlement_batch_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	job_id UUID NOT NULL REFERENCES settlement_ingest_jobs(job_id),
	source_file_ref TEXT NOT NULL,
	source_system TEXT NOT NULL,
	connector_id UUID,
	source_batch_ref TEXT,
	artifact_family TEXT NOT NULL,
	row_count INT NOT NULL DEFAULT 0,
	success_count_estimate INT NOT NULL DEFAULT 0,
	failed_count_estimate INT NOT NULL DEFAULT 0,
	pending_count_estimate INT NOT NULL DEFAULT 0,
	reversal_count_estimate INT NOT NULL DEFAULT 0,
	total_amount_minor BIGINT NOT NULL,
	total_settled_amount_minor BIGINT NOT NULL,
	currency_code TEXT NOT NULL,
	parse_confidence_overall NUMERIC(5,4) NOT NULL DEFAULT 0,
	attachment_readiness_overall NUMERIC(5,4) NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
		`CREATE UNIQUE INDEX IF NOT EXISTS settlement_batches_job_ref_idx ON canonical_settlement_batches(job_id, source_batch_ref);`,

		`
CREATE TABLE IF NOT EXISTS settlement_parse_errors(
	error_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	job_id UUID NOT NULL REFERENCES settlement_ingest_jobs(job_id),
	settlement_envelope_id UUID NOT NULL,
	source_row_ref TEXT,
	error_stage TEXT NOT NULL,
	reason_code TEXT NOT NULL,
	reason_detail_redacted TEXT,
	severity TEXT NOT NULL,
	mapping_profile_id TEXT NOT NULL,
	mapping_profile_version TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,

		`
CREATE TABLE IF NOT EXISTS settlement_outbox_events(
	outbox_event_id UUID PRIMARY KEY,
	tenant_id UUID NOT NULL,
	trace_id UUID NOT NULL,
	job_id UUID NOT NULL,
	entity_family TEXT NOT NULL,
	entity_id UUID NOT NULL,
	event_type TEXT NOT NULL,
	payload_json JSONB NOT NULL,
	status TEXT NOT NULL,
	attempts INT NOT NULL DEFAULT 0,
	next_retry_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	published_at TIMESTAMPTZ
);`,
		`CREATE INDEX IF NOT EXISTS settlement_outbox_events_status_idx ON settlement_outbox_events(status, next_retry_at);`,

		// ── attachment_jobs ──────────────────────────────────────────────────
		// One row per attachment run (batch or single). Provides replayability
		// and aggregate metrics over a processing cycle.
		`CREATE TABLE IF NOT EXISTS attachment_jobs (
			attachment_job_id        UUID PRIMARY KEY,
			tenant_id                UUID NOT NULL,
			job_scope_type           TEXT NOT NULL,
			scope_ref                TEXT NOT NULL,
			matching_ruleset_version TEXT NOT NULL,
			status                   TEXT NOT NULL,
			candidate_count_total    INT NOT NULL DEFAULT 0,
			exact_match_count        INT NOT NULL DEFAULT 0,
			high_confidence_count    INT NOT NULL DEFAULT 0,
			ambiguous_count          INT NOT NULL DEFAULT 0,
			unresolved_count         INT NOT NULL DEFAULT 0,
			conflicted_count         INT NOT NULL DEFAULT 0,
			started_at               TIMESTAMPTZ,
			completed_at             TIMESTAMPTZ,
			created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS attachment_jobs_tenant_idx
			ON attachment_jobs(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS attachment_jobs_status_idx
			ON attachment_jobs(status);`,

		// ── attachment_candidates ────────────────────────────────────────────
		// Every candidate evaluated for a settlement observation, with per-carrier
		// match flags and score breakdown. Never deleted — required for RCA replay.
		`CREATE TABLE IF NOT EXISTS attachment_candidates (
			candidate_id                UUID PRIMARY KEY,
			attachment_job_id           UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
			tenant_id                   UUID NOT NULL,
			settlement_observation_id   UUID NOT NULL,
			intent_id                   UUID NOT NULL,
			candidate_rank              INT NOT NULL DEFAULT 0,

			-- per-carrier match flags
			exact_ref_match_flag        BOOLEAN NOT NULL DEFAULT FALSE,
			client_ref_match_flag       BOOLEAN NOT NULL DEFAULT FALSE,
			provider_ref_match_flag     BOOLEAN NOT NULL DEFAULT FALSE,
			bank_ref_match_flag         BOOLEAN NOT NULL DEFAULT FALSE,
			batch_match_flag            BOOLEAN NOT NULL DEFAULT FALSE,
			beneficiary_fp_match_flag   BOOLEAN NOT NULL DEFAULT FALSE,
			amount_match_flag           BOOLEAN NOT NULL DEFAULT FALSE,
			currency_match_flag         BOOLEAN NOT NULL DEFAULT FALSE,
			time_window_match_flag      BOOLEAN NOT NULL DEFAULT FALSE,
			source_system_match_flag    BOOLEAN NOT NULL DEFAULT FALSE,
			zord_signature_match_flag   BOOLEAN NOT NULL DEFAULT FALSE,
			composite_match_flag        BOOLEAN NOT NULL DEFAULT FALSE,

			-- scoring
			score_total                 NUMERIC(8,4) NOT NULL DEFAULT 0,
			score_breakdown_json        JSONB NOT NULL,
			confidence_bucket           TEXT NOT NULL,
			created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS attachment_candidates_observation_idx
			ON attachment_candidates(settlement_observation_id);`,
		`CREATE INDEX IF NOT EXISTS attachment_candidates_intent_idx
			ON attachment_candidates(intent_id);`,
		`CREATE INDEX IF NOT EXISTS attachment_candidates_job_idx
			ON attachment_candidates(attachment_job_id);`,

		// ── attachment_decisions ─────────────────────────────────────────────
		// The formal attachment truth artifact. One row per settlement observation
		// per job. Upserted so replays overwrite stale decisions cleanly.
		`CREATE TABLE IF NOT EXISTS attachment_decisions (
			attachment_decision_id      UUID PRIMARY KEY,
			tenant_id                   UUID NOT NULL,
			settlement_observation_id   UUID NOT NULL,
			intent_id                   UUID,
			attachment_job_id           UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),
			decision_type               TEXT NOT NULL,
			decision_reason_code        TEXT NOT NULL,
			decision_reason_detail_json JSONB,
			matching_ruleset_version    TEXT NOT NULL,
			winning_score               NUMERIC(8,4) NOT NULL DEFAULT 0,
			runner_up_score             NUMERIC(8,4),
			score_margin                NUMERIC(8,4),
			confidence_score            NUMERIC(5,4) NOT NULL DEFAULT 0,
			ambiguity_score             NUMERIC(5,4) NOT NULL DEFAULT 0,
			supporting_carriers_json    JSONB,
			candidate_set_hash          TEXT NOT NULL,
			created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		// One authoritative decision per observation. Replays upsert by this key.
		`CREATE UNIQUE INDEX IF NOT EXISTS attachment_decisions_obs_uq
			ON attachment_decisions(settlement_observation_id, attachment_job_id);`,
		`CREATE INDEX IF NOT EXISTS attachment_decisions_intent_idx
			ON attachment_decisions(intent_id) WHERE intent_id IS NOT NULL;`,
		`CREATE INDEX IF NOT EXISTS attachment_decisions_type_idx
			ON attachment_decisions(decision_type);`,

		// ── variance_records ─────────────────────────────────────────────────
		// Intent-vs-observation difference record. Created for every attached pair.
		// Value-date mismatch and cross-period are first-class per the spec.
		`CREATE TABLE IF NOT EXISTS variance_records (
			variance_record_id          UUID PRIMARY KEY,
			tenant_id                   UUID NOT NULL,
			attachment_decision_id      UUID NOT NULL REFERENCES attachment_decisions(attachment_decision_id),
			intent_id                   UUID NOT NULL,
			settlement_observation_id   UUID NOT NULL,

			-- amount deltas
			amount_variance_minor       BIGINT NOT NULL DEFAULT 0,
			deduction_variance_minor    BIGINT,
			fee_variance_minor          BIGINT,

			-- status & timing flags
			currency_match_flag         BOOLEAN NOT NULL DEFAULT TRUE,
			status_variance_flag        BOOLEAN NOT NULL DEFAULT FALSE,
			value_date_mismatch_flag    BOOLEAN NOT NULL DEFAULT FALSE,
			settlement_delay_days       INT NOT NULL DEFAULT 0,
			cross_period_flag           BOOLEAN NOT NULL DEFAULT FALSE,

			-- evidence quality flags
			provider_ref_missing_flag   BOOLEAN NOT NULL DEFAULT FALSE,
			bank_ref_missing_flag       BOOLEAN NOT NULL DEFAULT FALSE,
			evidence_gap_flag           BOOLEAN NOT NULL DEFAULT FALSE,

			-- severity
			variance_severity           TEXT NOT NULL,
			variance_reason_codes_json  JSONB,
			created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS variance_records_decision_idx
			ON variance_records(attachment_decision_id);`,
		`CREATE INDEX IF NOT EXISTS variance_records_intent_idx
			ON variance_records(intent_id);`,
		`CREATE INDEX IF NOT EXISTS variance_records_severity_idx
			ON variance_records(variance_severity);`,

		// ── batch_attachment_summaries ───────────────────────────────────────
		// Derived batch-level view: one row per batch per attachment job.
		`CREATE TABLE IF NOT EXISTS batch_attachment_summaries (
			batch_attachment_summary_id UUID PRIMARY KEY,
			tenant_id                   UUID NOT NULL,
			batch_id                    TEXT,
			source_reference            TEXT NOT NULL,
			attachment_job_id           UUID NOT NULL REFERENCES attachment_jobs(attachment_job_id),

			-- counts
			total_intent_count          INT NOT NULL DEFAULT 0,
			exact_match_count           INT NOT NULL DEFAULT 0,
			high_confidence_count       INT NOT NULL DEFAULT 0,
			ambiguous_count             INT NOT NULL DEFAULT 0,
			unresolved_count            INT NOT NULL DEFAULT 0,
			conflicted_count            INT NOT NULL DEFAULT 0,

			-- amount aggregates
			total_intended_amount_minor BIGINT NOT NULL DEFAULT 0,
			total_observed_amount_minor BIGINT NOT NULL DEFAULT 0,
			total_variance_minor        BIGINT NOT NULL DEFAULT 0,

			-- derived status
			batch_attachment_status     TEXT NOT NULL,
			created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS batch_attachment_summaries_tenant_idx
			ON batch_attachment_summaries(tenant_id);`,
		`CREATE INDEX IF NOT EXISTS batch_attachment_summaries_job_idx
			ON batch_attachment_summaries(attachment_job_id);`,

		// ── attachment_rule_profiles ─────────────────────────────────────────
		// Tenant-scoped matching configuration. Keeps the engine deterministic
		// while allowing per-tenant carrier priorities and time window policies.
		`CREATE TABLE IF NOT EXISTS attachment_rule_profiles (
			profile_id                    TEXT NOT NULL,
			tenant_id                     UUID NOT NULL,
			version                       TEXT NOT NULL,
			exact_ref_priority_json       JSONB,
			carrier_priority_json         JSONB,
			time_window_policy_json       JSONB,
			amount_tolerance_policy_json  JSONB,
			batch_boundary_policy_json    JSONB,
			manual_review_thresholds_json JSONB,
			ambiguity_margin_threshold    NUMERIC(5,4) NOT NULL DEFAULT 0.15,
			requires_bank_ref_for_exact_flag BOOLEAN NOT NULL DEFAULT FALSE,
			status                        TEXT NOT NULL DEFAULT 'ACTIVE',
			created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (profile_id, tenant_id, version)
		);`,

		// ── attachment_outbox_events ─────────────────────────────────────────
		// Durable outbox for Service 5C downstream events.
		// Mirrors settlement_outbox_events but scoped to attachment domain.
		`CREATE TABLE IF NOT EXISTS attachment_outbox_events (
			outbox_event_id   UUID PRIMARY KEY,
			tenant_id         UUID NOT NULL,
			trace_id          UUID NOT NULL,
			attachment_job_id UUID NOT NULL,
			entity_family     TEXT NOT NULL,
			entity_id         UUID NOT NULL,
			event_type        TEXT NOT NULL,
			payload_json      JSONB NOT NULL,
			status            TEXT NOT NULL,
			attempts          INT NOT NULL DEFAULT 0,
			next_retry_at     TIMESTAMPTZ,
			created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			published_at      TIMESTAMPTZ
		);`,
		`CREATE INDEX IF NOT EXISTS attachment_outbox_status_idx
			ON attachment_outbox_events(status, next_retry_at);`,
		`CREATE INDEX IF NOT EXISTS attachment_outbox_job_idx
			ON attachment_outbox_events(attachment_job_id);`,
	}

	for _, s := range stmts {
		if _, err := DB.ExecContext(ctx, s); err != nil {
			return err
		}
	}
	return nil
}
