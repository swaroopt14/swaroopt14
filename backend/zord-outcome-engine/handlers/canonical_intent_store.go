package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
)

func upsertCanonicalIntent(ctx context.Context, intent models.CanonicalIntent) error {
	if ctx == nil {
		ctx = context.Background()
	}
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO canonical_intents (
			intent_id, tenant_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			beneficiary_fingerprint, amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state, zord_signature_carrier,
			created_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
		) ON CONFLICT (intent_id) DO UPDATE SET
			client_payout_ref       = EXCLUDED.client_payout_ref,
			client_batch_ref        = EXCLUDED.client_batch_ref,
			business_idempotency_key= EXCLUDED.business_idempotency_key,
			beneficiary_fingerprint = EXCLUDED.beneficiary_fingerprint,
			amount                  = EXCLUDED.amount,
			currency_code           = EXCLUDED.currency_code,
			intended_execution_at   = EXCLUDED.intended_execution_at,
			payout_type             = EXCLUDED.payout_type,
			provider_hint           = EXCLUDED.provider_hint,
			corridor                = EXCLUDED.corridor,
			proof_readiness_score   = EXCLUDED.proof_readiness_score,
			matchability_score      = EXCLUDED.matchability_score,
			canonical_hash          = EXCLUDED.canonical_hash,
			governance_state        = EXCLUDED.governance_state,
			zord_signature_carrier  = EXCLUDED.zord_signature_carrier`,
		intent.IntentID, intent.TenantID,
		intent.ClientPayoutRef, intent.ClientBatchRef, intent.BusinessIdempotencyKey,
		intent.BeneficiaryFingerprint, intent.Amount, intent.CurrencyCode,
		intent.IntendedExecutionAt, intent.PayoutType, intent.ProviderHint, intent.Corridor,
		intent.ProofReadinessScore, intent.MatchabilityScore,
		intent.CanonicalHash, intent.GovernanceState, intent.ZordSignatureCarrier,
		intent.CreatedAt,
	)
	return err
}

func validateAmount(amount string) (decimal.Decimal, error) {
	trimmed := strings.TrimSpace(amount)
	if trimmed == "" {
		return decimal.Zero, fmt.Errorf("amount is empty")
	}
	val, err := decimal.NewFromString(trimmed)
	if err != nil {
		return decimal.Zero, fmt.Errorf("invalid amount format: %w", err)
	}
	return val, nil
}

func canonicalIntentFromPayload(payload models.IntentPayload) (models.CanonicalIntent, error) {
	intentID, err := parseRequiredUUID(payload.IntentID, "intent_id")
	if err != nil {
		return models.CanonicalIntent{}, err
	}
	tenantID, err := parseRequiredUUID(payload.TenantID, "tenant_id")
	if err != nil {
		return models.CanonicalIntent{}, err
	}
	amount, err := validateAmount(payload.Amount)
	if err != nil {
		return models.CanonicalIntent{}, err
	}
	if strings.TrimSpace(payload.Currency) == "" {
		return models.CanonicalIntent{}, fmt.Errorf("currency is required")
	}
	if strings.TrimSpace(payload.BeneficiaryFingerprint) == "" {
		return models.CanonicalIntent{}, fmt.Errorf("beneficiary_fingerprint is required")
	}
	createdAt := payload.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}

	var payoutType *string
	if payload.IntentType != "" {
		payoutType = &payload.IntentType
	}
	var providerHint *string
	if payload.SourceSystem != "" {
		providerHint = &payload.SourceSystem
	}
	var signatureCarrier *string
	if payload.CanonicalSnapshotRef != "" {
		signatureCarrier = &payload.CanonicalSnapshotRef
	}
	var clientPayoutRef *string
	if payload.ClientPayoutRef != "" {
		clientPayoutRef = &payload.ClientPayoutRef
	}
	var clientBatchRef *string
	if payload.ClientBatchRef != "" {
		clientBatchRef = &payload.ClientBatchRef
	}
	var bizIdemKey *string
	if payload.BusinessIdempotencyKey != "" {
		bizIdemKey = &payload.BusinessIdempotencyKey
	}

	return models.CanonicalIntent{
		IntentID:               intentID,
		TenantID:               tenantID,
		ClientPayoutRef:        clientPayoutRef,
		ClientBatchRef:         clientBatchRef,
		BusinessIdempotencyKey: bizIdemKey,
		BeneficiaryFingerprint: payload.BeneficiaryFingerprint,
		Amount:                 amount,
		CurrencyCode:           payload.Currency,
		IntendedExecutionAt:    payload.DeadlineAt,
		PayoutType:             payoutType,
		ProviderHint:           providerHint,
		ProofReadinessScore:    payload.ProofReadinessScore,
		MatchabilityScore:      payload.MatchabilityScore,
		CanonicalHash:          payload.CanonicalHash,
		GovernanceState:        payload.GovernanceState,
		ZordSignatureCarrier:   signatureCarrier,
		CreatedAt:              createdAt,
	}, nil
}
