package persistence

import (
	"context"
	"database/sql"
	"log"

	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
)

type PaymentIntentRepo struct {
	db *sql.DB
}

func NewPaymentIntentRepo(db *sql.DB) *PaymentIntentRepo {
	return &PaymentIntentRepo{db: db}
}

func (r *PaymentIntentRepo) Save(
	ctx context.Context,
	nir *models.NormalizedIngestRecord,
	intent models.CanonicalIntent, outbox models.OutboxEvent,
) (models.CanonicalIntent, error) {

	// intent.IntentID = uuid.NewString()
	if intent.ContractID == "" {
		intent.ContractID = uuid.NewString()
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return intent, err
	}

	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	if nir != nil {
		nirQuery := `
		INSERT INTO normalized_ingest_records (
			nir_id, envelope_id, tenant_id,
			detected_format, profile_id, profile_version,
			fields_json, field_confidence_summary, unmapped_json, mapping_uncertain_flag,
			created_at
		) VALUES (
			$1, $2, $3,
			$4, $5, $6,
			$7, $8, $9, $10,
			$11
		)`
		_, err = tx.ExecContext(ctx, nirQuery,
			nir.NIRID, nir.EnvelopeID, nir.TenantID,
			nir.DetectedFormat, nir.ProfileID, nir.ProfileVersion,
			nir.FieldsJSON, nir.FieldConfidenceSummary, nir.UnmappedJSON, nir.MappingUncertainFlag,
			nir.CreatedAt,
		)
		if err != nil {
			log.Printf("Repo.Save: INSERT normalized_ingest_records failed: %v", err)
			return intent, err
		}
	}

	query := `
	INSERT INTO payment_intents (
    intent_id, envelope_id, tenant_id, contract_id,
    trace_id, idempotency_key, salient_hash,payload_hash,
    intent_type, canonical_version, schema_version,
    amount, currency, deadline_at,
    constraints, beneficiary_type, pii_tokens, beneficiary,
    status, confidence_score,
    canonical_snapshot_ref, nir_snapshot_ref, governance_snapshot_ref,
    canonical_hash,
    created_at,
    client_payout_ref, request_fingerprint, routing_hints_json,
    governance_state, business_state, duplicate_risk_flag,
    mapping_profile_version, updated_at
)
VALUES (
    $1,$2,$3,$4,
    $5,$6,$7,$8,
    $9,$10,$11,
    $12,$13,$14,
    $15,$16,$17,$18,
    $19,$20,
    $21,$22,$23,
    $24,$25,
    $26,
    $27,$28,$29,
    $30,$31,$32,
    $33
)`

	_, err = tx.ExecContext(
		ctx,
		query,
		intent.IntentID,   // $1
		intent.EnvelopeID, // $2
		intent.TenantID,   // $3
		intent.ContractID, // $4

		intent.TraceID,        // $5
		intent.IdempotencyKey, // $6
		intent.SalientHash,    // $7
		intent.PayloadHash,    // $8

		intent.IntentType,       // $9
		intent.CanonicalVersion, // $10
		intent.SchemaVersion,    // $11

		intent.Amount,     // $12
		intent.Currency,   // $13
		intent.DeadlineAt, // $14

		intent.Constraints,     // $15
		intent.BeneficiaryType, // $16
		intent.PIITokens,       // $17
		intent.Beneficiary,     // $18

		intent.Status,          // $19
		intent.ConfidenceScore, // $20

		intent.CanonicalSnapshotRef,  // $21
		intent.NIRSnapshotRef,        // $22
		intent.GovernanceSnapshotRef, // $23
		intent.CanonicalHash,         // $24

		intent.CreatedAt, // $25

		intent.ClientPayoutRef,       // $26
		intent.RequestFingerprint,    // $27
		intent.RoutingHintsJSON,      // $28
		intent.GovernanceState,       // $29
		intent.BusinessState,         // $30
		intent.DuplicateRiskFlag,     // $31
		intent.MappingProfileVersion, // $32
		intent.UpdatedAt,             // $33
	)

	if err != nil {
		log.Printf("Repo.Save: INSERT payment_intents failed: %v", err)
		return intent, err
	}

	outboxQuery := `
INSERT INTO outbox (
    trace_id,
    envelope_id,
    tenant_id,
    contract_id,
    aggregate_type,
    aggregate_id,
    event_type,
    schema_version,
    amount,
    currency,
    payload,
	payload_hash,
    status,
    retry_count,
    next_attempt_at,
    created_at
) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
)`

	outbox.ContractID = intent.ContractID

	_, err = tx.ExecContext(
		ctx,
		outboxQuery,
		outbox.TraceID,
		outbox.EnvelopeID,
		outbox.TenantID,
		outbox.ContractID,
		outbox.AggregateType,
		outbox.AggregateID,
		outbox.EventType,
		outbox.SchemaVersion,
		outbox.Amount,
		outbox.Currency,
		outbox.Payload,
		outbox.PayloadHash,
		outbox.Status,
		outbox.RetryCount,
		outbox.NextRetryAt,
		outbox.CreatedAt,
	)
	if err != nil {
		log.Printf("Repo.Save: INSERT outbox failed: %v", err)
		return intent, err
	}

	err = tx.Commit()
	if err != nil {
		return intent, err
	}

	return intent, nil
}

func (r *PaymentIntentRepo) FindByEnvelope(
	ctx context.Context,
	tenantID string,
	envelopeID string,
) (*models.CanonicalIntent, error) {

	query := `
	SELECT
		intent_id,
		envelope_id,
		tenant_id,
		contract_id,
		intent_type,
		canonical_version,
		schema_version,
		amount,
		currency,
		deadline_at,
		constraints,
		beneficiary_type,
		pii_tokens,
		beneficiary,
		status,
		confidence_score,
		created_at,
		client_payout_ref,
		request_fingerprint,
		routing_hints_json,
		governance_state,
		business_state,
		duplicate_risk_flag,
		mapping_profile_version,
		updated_at,
		canonical_snapshot_ref,
		COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref
	FROM payment_intents
	WHERE tenant_id = $1
	  AND envelope_id = $2
	LIMIT 1
	`

	var intent models.CanonicalIntent

	err := r.db.QueryRowContext(
		ctx,
		query,
		tenantID,
		envelopeID,
	).Scan(
		&intent.IntentID,
		&intent.EnvelopeID,
		&intent.TenantID,
		&intent.ContractID,
		&intent.IntentType,
		&intent.CanonicalVersion,
		&intent.SchemaVersion,
		&intent.Amount,
		&intent.Currency,
		&intent.DeadlineAt,
		&intent.Constraints,
		&intent.BeneficiaryType,
		&intent.PIITokens,
		&intent.Beneficiary,
		&intent.Status,
		&intent.ConfidenceScore,
		&intent.CreatedAt,
		&intent.ClientPayoutRef,
		&intent.RequestFingerprint,
		&intent.RoutingHintsJSON,
		&intent.GovernanceState,
		&intent.BusinessState,
		&intent.DuplicateRiskFlag,
		&intent.MappingProfileVersion,
		&intent.UpdatedAt,
		&intent.CanonicalSnapshotRef,
		&intent.NIRSnapshotRef,
		&intent.GovernanceSnapshotRef,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &intent, nil
}

func (r *PaymentIntentRepo) UpdateSnapshotRefs(
	ctx context.Context,
	intentID string,
	canonicalRef string,
	nirRef string,
	govRef string,
	hash string,
	prevHash string,
) error {
	query := `
	UPDATE payment_intents
	SET canonical_snapshot_ref = $1,
	    nir_snapshot_ref = $2,
	    governance_snapshot_ref = $3,
	    canonical_hash = $4
	WHERE intent_id = $5
	`

	if _, err := r.db.ExecContext(ctx, query, canonicalRef, nirRef, govRef, hash, intentID); err != nil {
		return err
	}

	insertVersionQuery := `
	INSERT INTO intent_versions (intent_id, version_no, prev_hash, created_at)
	VALUES ($1, $2, $3, now())
	ON CONFLICT (intent_id, version_no) DO NOTHING
	`

	_, err := r.db.ExecContext(ctx, insertVersionQuery, intentID, 1, prevHash)

	return err
}
func (r *PaymentIntentRepo) GetPreviousTenantCanonicalHash(
	ctx context.Context,
	tenantID string,
	intentID string,
) (string, error) {
	var prevHash string

	err := r.db.QueryRowContext(ctx, `
		SELECT canonical_hash
		FROM payment_intents
		WHERE tenant_id = $1
		  AND intent_id <> $2
		  AND canonical_hash IS NOT NULL
		  AND canonical_hash <> ''
		ORDER BY created_at DESC
		LIMIT 1
	`, tenantID, intentID).Scan(&prevHash)

	if err == sql.ErrNoRows {
		return "GENESIS", nil
	}
	if err != nil {
		return "", err
	}

	return prevHash, nil
}
