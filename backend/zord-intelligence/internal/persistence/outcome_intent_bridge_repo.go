package persistence

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

type OutcomeCanonicalIntentRecord struct {
	IntentID               string
	TenantID               string
	ContractID             string
	ClientPayoutRef        string
	ClientBatchRef         string
	BusinessIdempotencyKey string
	Amount                 decimal.Decimal
	CurrencyCode           string
	IntendedExecutionAt    *time.Time
	PayoutType             string
	ProviderHint           string
	Corridor               string
	ProofReadinessScore    float64
	MatchabilityScore      float64
	CanonicalHash          string
	GovernanceState        string
	BeneficiaryFingerprint string
	ZordSignatureCarrier   string
	CreatedAt              time.Time
}

type OutcomeIntentBridgeRepo struct {
	pool *pgxpool.Pool
}

func NewOutcomeIntentBridgeRepo(pool *pgxpool.Pool) *OutcomeIntentBridgeRepo {
	return &OutcomeIntentBridgeRepo{pool: pool}
}

func (r *OutcomeIntentBridgeRepo) UpsertBatch(
	ctx context.Context,
	records []OutcomeCanonicalIntentRecord,
) error {
	if r == nil || r.pool == nil || len(records) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, record := range records {
		if record.IntentID == "" || record.TenantID == "" || !record.Amount.IsPositive() {
			continue
		}
		createdAt := record.CreatedAt
		if createdAt.IsZero() {
			createdAt = time.Now().UTC()
		}
		batch.Queue(`
			INSERT INTO canonical_intents (
				intent_id, tenant_id, contract_id,
				client_payout_ref, client_batch_ref, business_idempotency_key,
				amount, currency_code,
				intended_execution_at, payout_type, provider_hint, corridor,
				proof_readiness_score, matchability_score,
				canonical_hash, governance_state, beneficiary_fingerprint, zord_signature_carrier,
				created_at
			) VALUES (
				$1::uuid,
				$2::uuid,
				NULLIF($3, '')::uuid,
				NULLIF($4, ''),
				NULLIF($5, ''),
				NULLIF($6, ''),
				$7,
				$8,
				$9,
				NULLIF($10, ''),
				NULLIF($11, ''),
				NULLIF($12, ''),
				$13,
				$14,
				$15,
				$16,
				NULLIF($17, ''),
				NULLIF($18, ''),
				$19
			)
			ON CONFLICT (intent_id) DO UPDATE SET
				tenant_id                = EXCLUDED.tenant_id,
				contract_id              = EXCLUDED.contract_id,
				client_payout_ref        = EXCLUDED.client_payout_ref,
				client_batch_ref         = EXCLUDED.client_batch_ref,
				business_idempotency_key = EXCLUDED.business_idempotency_key,
				amount                   = EXCLUDED.amount,
				currency_code            = EXCLUDED.currency_code,
				intended_execution_at    = EXCLUDED.intended_execution_at,
				payout_type              = EXCLUDED.payout_type,
				provider_hint            = EXCLUDED.provider_hint,
				corridor                 = EXCLUDED.corridor,
				proof_readiness_score    = EXCLUDED.proof_readiness_score,
				matchability_score       = EXCLUDED.matchability_score,
				canonical_hash           = EXCLUDED.canonical_hash,
				governance_state         = EXCLUDED.governance_state,
				beneficiary_fingerprint  = EXCLUDED.beneficiary_fingerprint,
				zord_signature_carrier   = EXCLUDED.zord_signature_carrier,
				created_at               = LEAST(canonical_intents.created_at, EXCLUDED.created_at)
		`,
			record.IntentID,
			record.TenantID,
			record.ContractID,
			record.ClientPayoutRef,
			record.ClientBatchRef,
			record.BusinessIdempotencyKey,
			record.Amount.String(),
			record.CurrencyCode,
			record.IntendedExecutionAt,
			record.PayoutType,
			record.ProviderHint,
			record.Corridor,
			record.ProofReadinessScore,
			record.MatchabilityScore,
			record.CanonicalHash,
			record.GovernanceState,
			record.BeneficiaryFingerprint,
			record.ZordSignatureCarrier,
			createdAt,
		)
	}

	results := r.pool.SendBatch(ctx, batch)
	defer results.Close()

	for range batch.Len() {
		if _, err := results.Exec(); err != nil {
			return fmt.Errorf("outcome_intent_bridge_repo.UpsertBatch: %w", err)
		}
	}
	return nil
}
