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
	registry *models.BusinessIdempotencyEntry,
) (models.CanonicalIntent, error) {

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
			required_field_gap_count, low_confidence_field_count,
			created_at
		) VALUES (
			$1, $2, $3,
			$4, $5, $6,
			$7, $8, $9, $10,
			$11, $12,
			$13
		)`
		_, err = tx.ExecContext(ctx, nirQuery,
			nir.NIRID, nir.EnvelopeID, nir.TenantID,
			nir.DetectedFormat, nir.ProfileID, nir.ProfileVersion,
			nir.FieldsJSON, nir.FieldConfidenceSummary, nir.UnmappedJSON, nir.MappingUncertainFlag,
			nir.RequiredFieldGapCount, nir.LowConfidenceFieldCount,
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
    trace_id, idempotency_key, salient_hash, payload_hash,
    intent_type, canonical_version, schema_version,
    amount, currency, intended_execution_at,
    constraints, beneficiary_type, pii_tokens, beneficiary,
    status, confidence_score,
    canonical_snapshot_ref, nir_snapshot_ref, governance_snapshot_ref, governance_hash,
    canonical_hash,
    created_at,
    client_payout_ref, provider_hint, request_fingerprint, routing_hints_json,
    governance_state, business_state, duplicate_risk_flag,
    mapping_profile_id, mapping_profile_version, source_system, updated_at,
    business_idempotency_key, beneficiary_fingerprint,
    proof_readiness_score, matchability_score, intent_quality_score,
    mapping_confidence_score,
    schema_completeness_score,
    governance_reason_codes_json,
    duplicate_reason_code, client_batch_ref,
	batchid,
    aggregate_confidence_score -- NEW
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
    $26, $27,
    $28,$29,$30,
    $31,$32,$33,
    $34,$35,$36,$37,
    $38,$39,
    $40,$41,$42,
    $43,
    $44, $45,
    $46, $47, $48, $49 -- UPDATED
) `

	_, err = tx.ExecContext(
		ctx,
		query,
		intent.IntentID,                  // $1
		intent.EnvelopeID,                // $2
		intent.TenantID,                  // $3
		intent.ContractID,                // $4
		intent.TraceID,                   // $5
		intent.IdempotencyKey,            // $6
		intent.SalientHash,               // $7
		intent.PayloadHash,               // $8
		intent.IntentType,                // $9
		intent.CanonicalVersion,          // $10
		intent.SchemaVersion,             // $11
		intent.Amount,                    // $12
		intent.Currency,                  // $13
		intent.IntendedExecutionAt,       // $14
		intent.Constraints,               // $15
		intent.BeneficiaryType,           // $16
		intent.PIITokens,                 // $17
		intent.Beneficiary,               // $18
		intent.Status,                    // $19
		intent.ConfidenceScore,           // $20
		intent.CanonicalSnapshotRef,      // $21
		intent.NIRSnapshotRef,            // $22
		intent.GovernanceSnapshotRef,     // $23
		intent.GovernanceHash,            // $24  ← matches column: governance_hash
		intent.CanonicalHash,             // $25  ← matches column: canonical_hash
		intent.CreatedAt,                 // $26  ← matches column: created_at
		intent.ClientPayoutRef,           // $27  ← matches column: client_payout_ref
		intent.ProviderHint,              // $28
		intent.RequestFingerprint,        // $29
		intent.RoutingHintsJSON,          // $30
		intent.GovernanceState,           // $31
		intent.BusinessState,             // $32
		intent.DuplicateRiskFlag,         // $33
		intent.MappingProfileID,          // $34
		intent.MappingProfileVersion,     // $35
		intent.SourceSystem,              // $36
		intent.UpdatedAt,                 // $37
		intent.BusinessIdempotencyKey,    // $38
		intent.BeneficiaryFingerprint,    // $39
		intent.ProofReadinessScore,       // $40
		intent.MatchabilityScore,         // $41
		intent.IntentQualityScore,        // $42
		intent.MappingConfidenceScore,    // $43
		intent.SchemaCompletenessScore,   // $44
		intent.GovernanceReasonCodesJSON, // $45
		intent.DuplicateReasonCode,       // $46
		intent.ClientBatchRef,            // $47
		intent.BatchID,                   // $48
		intent.AggregateConfidenceScore,  // $49 -- NEW
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
    idempotency_key,
    salient_hash,
    intent_type,
    canonical_version,
		intended_execution_at,
    constraints,
    beneficiary_type,
    pii_tokens,
    beneficiary,
    intent_status,
    confidence_score,
    canonical_hash,
    canonical_snapshot_ref,
    nir_snapshot_ref,
    governance_snapshot_ref,
    governance_hash,
    client_payout_ref,
    provider_hint,
    request_fingerprint,
    routing_hints_json,
    governance_state,
    business_state,
    duplicate_risk_flag,
    mapping_profile_id,
    mapping_profile_version,
    source_system,
    business_idempotency_key,
    beneficiary_fingerprint,
    proof_readiness_score,
    matchability_score,
    intent_quality_score,
    mapping_confidence_score,
    schema_completeness_score,
    governance_reason_codes_json,
    duplicate_reason_code,
    client_batch_ref,
    payload,
	payload_hash,
    status,
    retry_count,
    next_attempt_at,
    created_at,
	batchid,
    aggregate_confidence_score -- NEW
) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
    $11,$12,$13,$14,$15,$16,$17,$18,$19,
    $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
    $30,$31,$32,$33,$34,$35,$36,$37,$38,$39,
    $40,$41,$42,$43,$44,$45,$46,$47,$48,$49,
    $50,$51,$52,$53, $54 -- UPDATED
)`

	outbox.ContractID = intent.ContractID

	_, err = tx.ExecContext(
		ctx,
		outboxQuery,
		outbox.TraceID,                   // $1
		outbox.EnvelopeID,                // $2
		outbox.TenantID,                  // $3
		outbox.ContractID,                // $4
		outbox.AggregateType,             // $5
		outbox.AggregateID,               // $6
		outbox.EventType,                 // $7
		outbox.SchemaVersion,             // $8
		outbox.Amount,                    // $9
		outbox.Currency,                  // $10
		outbox.IdempotencyKey,            // $11
		outbox.SalientHash,               // $12
		outbox.IntentType,                // $13
		outbox.CanonicalVersion,          // $14
		outbox.IntendedExecutionAt,       // $15
		outbox.Constraints,               // $16
		outbox.BeneficiaryType,           // $17
		outbox.PIITokens,                 // $18
		outbox.Beneficiary,               // $19
		outbox.IntentStatus,              // $20
		outbox.ConfidenceScore,           // $21
		outbox.CanonicalHash,             // $22
		outbox.CanonicalSnapshotRef,      // $23
		outbox.NIRSnapshotRef,            // $24
		outbox.GovernanceSnapshotRef,     // $25
		outbox.GovernanceHash,            // $26  ← matches column: governance_hash
		outbox.ClientPayoutRef,           // $27  ← matches column: client_payout_ref
		outbox.ProviderHint,              // $28
		outbox.RequestFingerprint,        // $29
		outbox.RoutingHintsJSON,          // $30
		outbox.GovernanceState,           // $31
		outbox.BusinessState,             // $32
		outbox.DuplicateRiskFlag,         // $33
		outbox.MappingProfileID,          // $34
		outbox.MappingProfileVersion,     // $35
		outbox.SourceSystem,              // $36
		outbox.BusinessIdempotencyKey,    // $37
		outbox.BeneficiaryFingerprint,    // $38
		outbox.ProofReadinessScore,       // $39
		outbox.MatchabilityScore,         // $40
		outbox.IntentQualityScore,        // $41
		outbox.MappingConfidenceScore,    // $42
		outbox.SchemaCompletenessScore,   // $43
		outbox.GovernanceReasonCodesJSON, // $44  ← matches column: governance_reason_codes_json (JSON)
		outbox.DuplicateReasonCode,       // $45
		outbox.ClientBatchRef,            // $46
		outbox.Payload,                   // $47  ← matches column: payload (JSON)
		outbox.PayloadHash,               // $48
		outbox.Status,                    // $49
		outbox.RetryCount,                // $50
		outbox.NextRetryAt,               // $51
		outbox.CreatedAt,                 // $52
		outbox.BatchID,                   // $53  ← matches column: batchid
		outbox.AggregateConfidenceScore,  // $54 -- NEW
	)
	if err != nil {
		log.Printf("Repo.Save: INSERT outbox failed: %v", err)
		return intent, err
	}

	if registry != nil {
		registryQuery := `
		INSERT INTO business_idempotency_registry (
			tenant_id, business_idempotency_key, intent_id,
			beneficiary_fingerprint, amount_minor, currency_code,
			time_bucket, duplicate_reason_code, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9
		)`
		_, err = tx.ExecContext(ctx, registryQuery,
			registry.TenantID, registry.BusinessIdempotencyKey, registry.IntentID,
			registry.BeneficiaryFingerprint, registry.AmountMinor, registry.CurrencyCode,
			registry.TimeBucket, registry.DuplicateReasonCode, registry.CreatedAt,
		)
		if err != nil {
			log.Printf("Repo.Save: INSERT business_idempotency_registry failed: %v", err)
			return intent, err
		}
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
		intended_execution_at,
		constraints,
		beneficiary_type,
		pii_tokens,
		beneficiary,
		status,
		confidence_score,
		created_at,
		client_payout_ref,
		provider_hint,
		request_fingerprint,
		routing_hints_json,
		governance_state,
		business_state,
		duplicate_risk_flag,
		mapping_profile_id,
		mapping_profile_version,
		source_system,
		updated_at,
		business_idempotency_key,
		beneficiary_fingerprint,
		proof_readiness_score,
		matchability_score,
		intent_quality_score,
		mapping_confidence_score,
		schema_completeness_score,
		governance_reason_codes_json,
		duplicate_reason_code,
		client_batch_ref,
		canonical_snapshot_ref,
		COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
		COALESCE(governance_hash, '') as governance_hash,
		batchid,
		aggregate_confidence_score -- NEW
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
		&intent.IntendedExecutionAt,
		&intent.Constraints,
		&intent.BeneficiaryType,
		&intent.PIITokens,
		&intent.Beneficiary,
		&intent.Status,
		&intent.ConfidenceScore,
		&intent.CreatedAt,
		&intent.ClientPayoutRef,
		&intent.ProviderHint,
		&intent.RequestFingerprint,
		&intent.RoutingHintsJSON,
		&intent.GovernanceState,
		&intent.BusinessState,
		&intent.DuplicateRiskFlag,
		&intent.MappingProfileID,
		&intent.MappingProfileVersion,
		&intent.SourceSystem,
		&intent.UpdatedAt,
		&intent.BusinessIdempotencyKey,
		&intent.BeneficiaryFingerprint,
		&intent.ProofReadinessScore,
		&intent.MatchabilityScore,
		&intent.IntentQualityScore,
		&intent.MappingConfidenceScore,
		&intent.SchemaCompletenessScore,
		&intent.GovernanceReasonCodesJSON,
		&intent.DuplicateReasonCode,
		&intent.ClientBatchRef,
		&intent.CanonicalSnapshotRef,
		&intent.NIRSnapshotRef,
		&intent.GovernanceSnapshotRef,
		&intent.GovernanceHash,
		&intent.BatchID,
		&intent.AggregateConfidenceScore, // NEW
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

	outboxQuery := `
	UPDATE outbox
	SET canonical_snapshot_ref = $1,
	    nir_snapshot_ref = $2,
	    governance_snapshot_ref = $3,
	    canonical_hash = $4
	WHERE aggregate_id = $5
	`

	if _, err := r.db.ExecContext(ctx, outboxQuery, canonicalRef, nirRef, govRef, hash, intentID); err != nil {
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

func (r *PaymentIntentRepo) FindByBusinessIdempotencyKey(
	ctx context.Context,
	tenantID string,
	key string,
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
		intended_execution_at,
		constraints,
		beneficiary_type,
		pii_tokens,
		beneficiary,
		status,
		confidence_score,
		created_at,
		client_payout_ref,
		provider_hint,
		request_fingerprint,
		routing_hints_json,
		governance_state,
		business_state,
		duplicate_risk_flag,
		mapping_profile_id,
		mapping_profile_version,
		source_system,
		updated_at,
		business_idempotency_key,
		beneficiary_fingerprint,
		proof_readiness_score,
		matchability_score,
		intent_quality_score,
		mapping_confidence_score,
		schema_completeness_score,
		governance_reason_codes_json,
		duplicate_reason_code,
		client_batch_ref,
		canonical_snapshot_ref,
		COALESCE(nir_snapshot_ref, '') as nir_snapshot_ref,
		COALESCE(governance_snapshot_ref, '') as governance_snapshot_ref,
		COALESCE(governance_hash, '') as governance_hash,
		batchid,
		aggregate_confidence_score -- NEW
	FROM payment_intents
	WHERE tenant_id = $1
	  AND business_idempotency_key = $2
	LIMIT 1
	`

	var intent models.CanonicalIntent

	err := r.db.QueryRowContext(
		ctx,
		query,
		tenantID,
		key,
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
		&intent.IntendedExecutionAt,
		&intent.Constraints,
		&intent.BeneficiaryType,
		&intent.PIITokens,
		&intent.Beneficiary,
		&intent.Status,
		&intent.ConfidenceScore,
		&intent.CreatedAt,
		&intent.ClientPayoutRef,
		&intent.ProviderHint,
		&intent.RequestFingerprint,
		&intent.RoutingHintsJSON,
		&intent.GovernanceState,
		&intent.BusinessState,
		&intent.DuplicateRiskFlag,
		&intent.MappingProfileID,
		&intent.MappingProfileVersion,
		&intent.SourceSystem,
		&intent.UpdatedAt,
		&intent.BusinessIdempotencyKey,
		&intent.BeneficiaryFingerprint,
		&intent.ProofReadinessScore,
		&intent.MatchabilityScore,
		&intent.IntentQualityScore,
		&intent.MappingConfidenceScore,
		&intent.SchemaCompletenessScore,
		&intent.GovernanceReasonCodesJSON,
		&intent.DuplicateReasonCode,
		&intent.ClientBatchRef,
		&intent.CanonicalSnapshotRef,
		&intent.NIRSnapshotRef,
		&intent.GovernanceSnapshotRef,
		&intent.GovernanceHash,
		&intent.BatchID,
		&intent.AggregateConfidenceScore, // NEW
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &intent, nil
}

func (r *PaymentIntentRepo) CheckIdempotencyRegistry(
	ctx context.Context,
	tenantID string,
	key string,
) (*models.BusinessIdempotencyEntry, error) {

	query := `
	SELECT
		tenant_id,
		business_idempotency_key,
		intent_id,
		beneficiary_fingerprint,
		amount_minor,
		currency_code,
		time_bucket,
		duplicate_reason_code,
		created_at
	FROM business_idempotency_registry
	WHERE tenant_id = $1
	  AND business_idempotency_key = $2
	LIMIT 1
	`

	var entry models.BusinessIdempotencyEntry

	err := r.db.QueryRowContext(
		ctx,
		query,
		tenantID,
		key,
	).Scan(
		&entry.TenantID,
		&entry.BusinessIdempotencyKey,
		&entry.IntentID,
		&entry.BeneficiaryFingerprint,
		&entry.AmountMinor,
		&entry.CurrencyCode,
		&entry.TimeBucket,
		&entry.DuplicateReasonCode,
		&entry.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &entry, nil
}

// UpdateBatchAggregateConfidence computes and persists the average confidence score for a batch.
// After batch processing completes: Compute aggregateConfidence = totalConfidenceScore / totalIntentCount
func (r *PaymentIntentRepo) UpdateBatchAggregateConfidence(ctx context.Context, batchID string) (float64, error) {
	if batchID == "" {
		return 0, nil
	}

	// 1. Compute aggregate confidence
	// Ensure: NULL confidence_score not included, skipped intents excluded, division-by-zero protected
	var avgScore sql.NullFloat64
	err := r.db.QueryRowContext(ctx, `
		SELECT AVG(confidence_score) 
		FROM payment_intents 
		WHERE batchid = $1 AND confidence_score IS NOT NULL
	`, batchID).Scan(&avgScore)

	if err != nil {
		return 0, err
	}

	score := 0.0
	if avgScore.Valid {
		score = avgScore.Float64
	}

	// 2. Update payment_intents
	_, err = r.db.ExecContext(ctx, `
		UPDATE payment_intents 
		SET aggregate_confidence_score = $1 
		WHERE batchid = $2
	`, score, batchID)
	if err != nil {
		return 0, err
	}

	// 3. Update outbox (reused for all intents in same batch)
	// Also need to update the JSON payload to include the aggregate_confidence_score
	_, err = r.db.ExecContext(ctx, `
		UPDATE outbox 
		SET aggregate_confidence_score = $1,
		    payload = jsonb_set(payload, '{aggregate_confidence_score}', to_jsonb($1::numeric))
		WHERE batchid = $2
	`, score, batchID)
	if err != nil {
		return 0, err
	}

	return score, nil
}

