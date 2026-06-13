package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

type IntentBatchCandidate struct {
	BatchID   string
	TenantID  string
	UpdatedAt time.Time
}

type IntentBatchSnapshot struct {
	BatchID                      string
	TenantID                     string
	SourceSystem                 string
	ReceivedCount                int
	CanonicalizedCount           int
	DLQCount                     int
	ReviewCount                  int
	CanonicalizationSuccessRate  float64
	AvgSchemaCompletenessScore   *float64
	AvgMappingConfidenceScore    *float64
	AvgMatchabilityScore         *float64
	AvgProofReadinessScore       *float64
	AvgIntentQualityScore        *float64
	DuplicateRiskCount           int
	DuplicateRiskAmountMinor     decimal.Decimal
	BatchQualityScore            *float64
	IntentRowCount               int
	IntentTotalAmountMinor       decimal.Decimal
	IntentAmountSquareSum        decimal.Decimal
	IntentMinAmountMinor         decimal.Decimal
	IntentMaxAmountMinor         decimal.Decimal
	ClientPayoutRefPresentCount  int
	FirstIntentCreatedAt         *time.Time
	BusinessBatchAt              *time.Time
	Currency                     string
	IntentType                   string
	Rail                         string
	ProviderKey                  string
	SameBeneficiaryAmountDensity float64
	MaxPairCount                 int
	ParseSuccessRate             *float64
	MissingRequiredFieldRate     *float64
	UnknownColumnCount           *int
	InvalidAmountRate            *float64
	InvalidBeneficiaryRate       *float64
}

type IntentBridgeRepo struct {
	pool *pgxpool.Pool
}

func NewIntentBridgeRepo(pool *pgxpool.Pool) *IntentBridgeRepo {
	return &IntentBridgeRepo{pool: pool}
}

func (r *IntentBridgeRepo) ListRecentBatchCandidates(
	ctx context.Context,
	since time.Time,
	limit int,
) ([]IntentBatchCandidate, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := r.pool.Query(ctx, `
		SELECT batch_id, tenant_id, updated_at
		FROM canonical_batches
		WHERE updated_at >= $1
		ORDER BY updated_at DESC
		LIMIT $2
	`, since, limit)
	if err != nil {
		return nil, fmt.Errorf("intent_bridge_repo.ListRecentBatchCandidates: %w", err)
	}
	defer rows.Close()

	candidates := make([]IntentBatchCandidate, 0, limit)
	for rows.Next() {
		var row IntentBatchCandidate
		if err := rows.Scan(&row.BatchID, &row.TenantID, &row.UpdatedAt); err != nil {
			return nil, fmt.Errorf("intent_bridge_repo.ListRecentBatchCandidates scan: %w", err)
		}
		if row.BatchID == "" || row.TenantID == "" {
			continue
		}
		candidates = append(candidates, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("intent_bridge_repo.ListRecentBatchCandidates rows: %w", err)
	}
	return candidates, nil
}

func (r *IntentBridgeRepo) GetBatchSnapshot(
	ctx context.Context,
	tenantID, batchID string,
) (*IntentBatchSnapshot, error) {
	if tenantID == "" || batchID == "" {
		return nil, nil
	}

	snapshot := &IntentBatchSnapshot{
		BatchID:  batchID,
		TenantID: tenantID,
	}

	if err := r.loadCanonicalBatch(ctx, snapshot); err != nil {
		return nil, err
	}
	if err := r.loadIntentAggregates(ctx, snapshot); err != nil {
		return nil, err
	}
	if snapshot.IntentRowCount == 0 || !snapshot.IntentTotalAmountMinor.IsPositive() {
		return nil, nil
	}
	if err := r.loadPairAggregates(ctx, snapshot); err != nil {
		return nil, err
	}
	if err := r.loadNormalizationAggregates(ctx, snapshot); err != nil {
		return nil, err
	}
	if err := r.loadDLQAggregates(ctx, snapshot); err != nil {
		return nil, err
	}

	if snapshot.SourceSystem == "" {
		snapshot.SourceSystem = "UNKNOWN"
	}
	if snapshot.Currency == "" {
		snapshot.Currency = "INR"
	}
	if snapshot.IntentType == "" {
		snapshot.IntentType = "UNKNOWN"
	}
	if snapshot.Rail == "" {
		snapshot.Rail = "UNKNOWN"
	}
	if snapshot.ProviderKey == "" {
		snapshot.ProviderKey = strings.ToLower(strings.TrimSpace(snapshot.SourceSystem))
	}
	return snapshot, nil
}

func (r *IntentBridgeRepo) ListOutcomeCanonicalIntents(
	ctx context.Context,
	tenantID, batchID string,
) ([]OutcomeCanonicalIntentRecord, error) {
	if tenantID == "" || batchID == "" {
		return nil, nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT
			intent_id::text,
			tenant_id::text,
			contract_id::text,
			COALESCE(client_payout_ref, ''),
			COALESCE(COALESCE(client_batch_ref, batchid), ''),
			COALESCE(business_idempotency_key, ''),
			COALESCE(amount::text, '0'),
			COALESCE(currency, ''),
			intended_execution_at,
			COALESCE(intent_type, ''),
			COALESCE(provider_hint, ''),
			COALESCE(source_system, ''),
			COALESCE(proof_readiness_score::float8, 0),
			COALESCE(matchability_score::float8, 0),
			COALESCE(canonical_hash, ''),
			COALESCE(governance_state, ''),
			COALESCE(beneficiary_fingerprint, ''),
			COALESCE(client_payout_ref, ''),
			created_at
		FROM payment_intents
		WHERE tenant_id = $1
		  AND batchid = $2
		ORDER BY created_at ASC, intent_id ASC
	`, tenantID, batchID)
	if err != nil {
		return nil, fmt.Errorf("intent_bridge_repo.ListOutcomeCanonicalIntents batch=%s: %w", batchID, err)
	}
	defer rows.Close()

	records := make([]OutcomeCanonicalIntentRecord, 0)
	for rows.Next() {
		var (
			record     OutcomeCanonicalIntentRecord
			amountText string
		)
		if err := rows.Scan(
			&record.IntentID,
			&record.TenantID,
			&record.ContractID,
			&record.ClientPayoutRef,
			&record.ClientBatchRef,
			&record.BusinessIdempotencyKey,
			&amountText,
			&record.CurrencyCode,
			&record.IntendedExecutionAt,
			&record.PayoutType,
			&record.ProviderHint,
			&record.Corridor,
			&record.ProofReadinessScore,
			&record.MatchabilityScore,
			&record.CanonicalHash,
			&record.GovernanceState,
			&record.BeneficiaryFingerprint,
			&record.ZordSignatureCarrier,
			&record.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("intent_bridge_repo.ListOutcomeCanonicalIntents scan batch=%s: %w", batchID, err)
		}
		amount, parseErr := decimal.NewFromString(amountText)
		if parseErr != nil {
			return nil, fmt.Errorf("intent_bridge_repo.ListOutcomeCanonicalIntents amount=%q: %w", amountText, parseErr)
		}
		record.Amount = amount
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("intent_bridge_repo.ListOutcomeCanonicalIntents rows batch=%s: %w", batchID, err)
	}
	return records, nil
}

func (r *IntentBridgeRepo) ResolveIntentAmountByIntentID(
	ctx context.Context,
	tenantID, intentID string,
) (decimal.Decimal, bool, error) {
	if tenantID == "" || intentID == "" {
		return decimal.Zero, false, nil
	}
	var amountText string
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(amount::text, '0')
		FROM payment_intents
		WHERE tenant_id = $1
		  AND intent_id = $2::uuid
		LIMIT 1
	`, tenantID, intentID).Scan(&amountText)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return decimal.Zero, false, nil
		}
		return decimal.Zero, false, fmt.Errorf("intent_bridge_repo.ResolveIntentAmountByIntentID intent=%s: %w", intentID, err)
	}
	amount, parseErr := decimal.NewFromString(amountText)
	if parseErr != nil {
		return decimal.Zero, false, fmt.Errorf("intent_bridge_repo.ResolveIntentAmountByIntentID amount=%q: %w", amountText, parseErr)
	}
	return amount, amount.IsPositive(), nil
}

func (r *IntentBridgeRepo) ResolveIntentAmountByClientPayoutRef(
	ctx context.Context,
	tenantID, batchID, clientPayoutRef string,
) (decimal.Decimal, bool, error) {
	clientPayoutRef = strings.TrimSpace(clientPayoutRef)
	if tenantID == "" || clientPayoutRef == "" {
		return decimal.Zero, false, nil
	}

	var (
		amountText string
		err        error
	)
	if batchID != "" {
		err = r.pool.QueryRow(ctx, `
			SELECT COALESCE(amount::text, '0')
			FROM payment_intents
			WHERE tenant_id = $1
			  AND batchid = $2
			  AND client_payout_ref = $3
			ORDER BY created_at ASC
			LIMIT 1
		`, tenantID, batchID, clientPayoutRef).Scan(&amountText)
	} else {
		err = r.pool.QueryRow(ctx, `
			SELECT COALESCE(amount::text, '0')
			FROM payment_intents
			WHERE tenant_id = $1
			  AND client_payout_ref = $2
			ORDER BY created_at DESC
			LIMIT 1
		`, tenantID, clientPayoutRef).Scan(&amountText)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return decimal.Zero, false, nil
		}
		return decimal.Zero, false, fmt.Errorf("intent_bridge_repo.ResolveIntentAmountByClientPayoutRef ref=%s: %w", clientPayoutRef, err)
	}
	amount, parseErr := decimal.NewFromString(amountText)
	if parseErr != nil {
		return decimal.Zero, false, fmt.Errorf("intent_bridge_repo.ResolveIntentAmountByClientPayoutRef amount=%q: %w", amountText, parseErr)
	}
	return amount, amount.IsPositive(), nil
}

func (r *IntentBridgeRepo) ResolveBatchIDByIntentID(
	ctx context.Context,
	tenantID, intentID string,
) (string, bool, error) {
	if tenantID == "" || intentID == "" {
		return "", false, nil
	}
	var batchID string
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(batchid, '')
		FROM payment_intents
		WHERE tenant_id = $1
		  AND intent_id = $2::uuid
		LIMIT 1
	`, tenantID, intentID).Scan(&batchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("intent_bridge_repo.ResolveBatchIDByIntentID intent=%s: %w", intentID, err)
	}
	batchID = strings.TrimSpace(batchID)
	if batchID == "" {
		return "", false, nil
	}
	return batchID, true, nil
}

func (r *IntentBridgeRepo) loadCanonicalBatch(ctx context.Context, snapshot *IntentBatchSnapshot) error {
	var (
		dupRiskAmount string
		avgSchema     *float64
		avgMapping    *float64
		avgMatch      *float64
		avgProof      *float64
		avgQuality    *float64
		batchQuality  *float64
	)
	err := r.pool.QueryRow(ctx, `
		SELECT
			COALESCE(source_system, ''),
			received_count,
			canonicalized_count,
			dlq_count,
			review_count,
			canonicalization_success_rate,
			avg_schema_completeness_score,
			avg_mapping_confidence_score,
			avg_matchability_score,
			avg_proof_readiness_score,
			avg_intent_quality_score,
			duplicate_risk_count,
			COALESCE(duplicate_risk_amount_minor::text, '0'),
			batch_quality_score
		FROM canonical_batches
		WHERE tenant_id = $1 AND batch_id = $2
	`, snapshot.TenantID, snapshot.BatchID).Scan(
		&snapshot.SourceSystem,
		&snapshot.ReceivedCount,
		&snapshot.CanonicalizedCount,
		&snapshot.DLQCount,
		&snapshot.ReviewCount,
		&snapshot.CanonicalizationSuccessRate,
		&avgSchema,
		&avgMapping,
		&avgMatch,
		&avgProof,
		&avgQuality,
		&snapshot.DuplicateRiskCount,
		&dupRiskAmount,
		&batchQuality,
	)
	if err != nil {
		return fmt.Errorf("intent_bridge_repo.loadCanonicalBatch batch=%s: %w", snapshot.BatchID, err)
	}
	var parseErr error
	snapshot.DuplicateRiskAmountMinor, parseErr = decimal.NewFromString(dupRiskAmount)
	if parseErr != nil {
		return fmt.Errorf("intent_bridge_repo.loadCanonicalBatch duplicate_risk_amount_minor=%q: %w", dupRiskAmount, parseErr)
	}
	snapshot.AvgSchemaCompletenessScore = avgSchema
	snapshot.AvgMappingConfidenceScore = avgMapping
	snapshot.AvgMatchabilityScore = avgMatch
	snapshot.AvgProofReadinessScore = avgProof
	snapshot.AvgIntentQualityScore = avgQuality
	snapshot.BatchQualityScore = batchQuality
	return nil
}

func (r *IntentBridgeRepo) loadIntentAggregates(ctx context.Context, snapshot *IntentBatchSnapshot) error {
	var (
		totalText  string
		squareText string
		minText    string
		maxText    string
		createdAt  *time.Time
		businessAt *time.Time
		avgMapping *float64
		avgSchema  *float64
	)
	err := r.pool.QueryRow(ctx, `
		WITH base AS (
			SELECT
				amount,
				currency,
				COALESCE(intended_execution_at, created_at) AS business_ts,
				created_at,
				COALESCE(provider_hint, '') AS provider_hint,
				COALESCE(source_system, '') AS source_system,
				COALESCE(intent_type, '') AS intent_type,
				COALESCE(beneficiary_type, '') AS beneficiary_type,
				COALESCE(beneficiary_fingerprint, '') AS beneficiary_fingerprint,
				COALESCE(client_payout_ref, '') AS client_payout_ref,
				mapping_confidence_score,
				schema_completeness_score
			FROM payment_intents
			WHERE tenant_id = $1
			  AND batchid = $2
		),
		top_currency AS (
			SELECT currency FROM base WHERE currency <> '' GROUP BY currency ORDER BY count(*) DESC, currency LIMIT 1
		),
		top_source AS (
			SELECT source_system FROM base WHERE source_system <> '' GROUP BY source_system ORDER BY count(*) DESC, source_system LIMIT 1
		),
		top_intent_type AS (
			SELECT intent_type FROM base WHERE intent_type <> '' GROUP BY intent_type ORDER BY count(*) DESC, intent_type LIMIT 1
		),
		top_rail AS (
			SELECT beneficiary_type FROM base WHERE beneficiary_type <> '' GROUP BY beneficiary_type ORDER BY count(*) DESC, beneficiary_type LIMIT 1
		),
		top_provider AS (
			SELECT provider_hint FROM base WHERE provider_hint <> '' GROUP BY provider_hint ORDER BY count(*) DESC, provider_hint LIMIT 1
		)
		SELECT
			COUNT(*)::int,
			COALESCE(SUM(amount)::text, '0'),
			COALESCE(SUM(amount * amount)::text, '0'),
			COALESCE(MIN(amount)::text, '0'),
			COALESCE(MAX(amount)::text, '0'),
			COALESCE(SUM(CASE WHEN client_payout_ref <> '' THEN 1 ELSE 0 END), 0)::int,
			MIN(created_at),
			MIN(business_ts),
			COALESCE((SELECT currency FROM top_currency), ''),
			COALESCE((SELECT source_system FROM top_source), ''),
			COALESCE((SELECT intent_type FROM top_intent_type), ''),
			COALESCE((SELECT beneficiary_type FROM top_rail), ''),
			COALESCE((SELECT provider_hint FROM top_provider), ''),
			AVG(mapping_confidence_score),
			AVG(schema_completeness_score)
		FROM base
	`, snapshot.TenantID, snapshot.BatchID).Scan(
		&snapshot.IntentRowCount,
		&totalText,
		&squareText,
		&minText,
		&maxText,
		&snapshot.ClientPayoutRefPresentCount,
		&createdAt,
		&businessAt,
		&snapshot.Currency,
		&snapshot.SourceSystem,
		&snapshot.IntentType,
		&snapshot.Rail,
		&snapshot.ProviderKey,
		&avgMapping,
		&avgSchema,
	)
	if err != nil {
		return fmt.Errorf("intent_bridge_repo.loadIntentAggregates batch=%s: %w", snapshot.BatchID, err)
	}
	var parseErr error
	if snapshot.IntentTotalAmountMinor, parseErr = decimal.NewFromString(totalText); parseErr != nil {
		return fmt.Errorf("intent_bridge_repo.loadIntentAggregates total=%q: %w", totalText, parseErr)
	}
	if snapshot.IntentAmountSquareSum, parseErr = decimal.NewFromString(squareText); parseErr != nil {
		return fmt.Errorf("intent_bridge_repo.loadIntentAggregates square_sum=%q: %w", squareText, parseErr)
	}
	if snapshot.IntentMinAmountMinor, parseErr = decimal.NewFromString(minText); parseErr != nil {
		return fmt.Errorf("intent_bridge_repo.loadIntentAggregates min=%q: %w", minText, parseErr)
	}
	if snapshot.IntentMaxAmountMinor, parseErr = decimal.NewFromString(maxText); parseErr != nil {
		return fmt.Errorf("intent_bridge_repo.loadIntentAggregates max=%q: %w", maxText, parseErr)
	}
	snapshot.FirstIntentCreatedAt = createdAt
	snapshot.BusinessBatchAt = businessAt
	if snapshot.AvgMappingConfidenceScore == nil {
		snapshot.AvgMappingConfidenceScore = avgMapping
	}
	if snapshot.AvgSchemaCompletenessScore == nil {
		snapshot.AvgSchemaCompletenessScore = avgSchema
	}
	return nil
}

func (r *IntentBridgeRepo) loadPairAggregates(ctx context.Context, snapshot *IntentBatchSnapshot) error {
	var (
		repeatedAmountText string
		maxPairCount       int
	)
	err := r.pool.QueryRow(ctx, `
		WITH base AS (
			SELECT amount, COALESCE(beneficiary_fingerprint, '') AS beneficiary_fingerprint
			FROM payment_intents
			WHERE tenant_id = $1
			  AND batchid = $2
		),
		benef AS (
			SELECT beneficiary_fingerprint, COUNT(*)::int AS benef_count
			FROM base
			WHERE beneficiary_fingerprint <> ''
			GROUP BY beneficiary_fingerprint
		),
		pairs AS (
			SELECT beneficiary_fingerprint, amount, COUNT(*)::int AS pair_count
			FROM base
			WHERE beneficiary_fingerprint <> ''
			GROUP BY beneficiary_fingerprint, amount
		)
		SELECT
			COALESCE(SUM(CASE WHEN benef.benef_count > 1 THEN base.amount ELSE 0 END)::text, '0'),
			COALESCE(MAX(pairs.pair_count), 0)::int
		FROM base
		LEFT JOIN benef
		  ON benef.beneficiary_fingerprint = base.beneficiary_fingerprint
		LEFT JOIN pairs
		  ON pairs.beneficiary_fingerprint = base.beneficiary_fingerprint
		 AND pairs.amount = base.amount
	`, snapshot.TenantID, snapshot.BatchID).Scan(&repeatedAmountText, &maxPairCount)
	if err != nil {
		return fmt.Errorf("intent_bridge_repo.loadPairAggregates batch=%s: %w", snapshot.BatchID, err)
	}
	repeatedAmount, parseErr := decimal.NewFromString(repeatedAmountText)
	if parseErr != nil {
		return fmt.Errorf("intent_bridge_repo.loadPairAggregates repeated_amount=%q: %w", repeatedAmountText, parseErr)
	}
	snapshot.MaxPairCount = maxPairCount
	if snapshot.IntentTotalAmountMinor.IsPositive() {
		snapshot.SameBeneficiaryAmountDensity = repeatedAmount.Div(snapshot.IntentTotalAmountMinor).InexactFloat64()
	}
	return nil
}

func (r *IntentBridgeRepo) loadNormalizationAggregates(ctx context.Context, snapshot *IntentBatchSnapshot) error {
	var (
		parseSuccessRate         *float64
		missingRequiredFieldRate *float64
		unknownColumnCount       *int
	)
	err := r.pool.QueryRow(ctx, `
		WITH batch_norm AS (
			SELECT unmapped_json, required_field_gap_count
			FROM normalized_ingest_records
			WHERE tenant_id = $1
			  AND COALESCE(NULLIF(fields_json->>'client_batch_ref', ''), '') = $2
		),
		unknown_keys AS (
			SELECT DISTINCT key
			FROM batch_norm
			CROSS JOIN LATERAL jsonb_object_keys(COALESCE(unmapped_json, '{}'::jsonb)) AS key
		)
		SELECT
			AVG(CASE WHEN required_field_gap_count = 0 THEN 1.0 ELSE 0.0 END),
			AVG(CASE WHEN required_field_gap_count > 0 THEN 1.0 ELSE 0.0 END),
			(SELECT COUNT(*)::int FROM unknown_keys)
		FROM batch_norm
	`, snapshot.TenantID, snapshot.BatchID).Scan(&parseSuccessRate, &missingRequiredFieldRate, &unknownColumnCount)
	if err != nil {
		return fmt.Errorf("intent_bridge_repo.loadNormalizationAggregates batch=%s: %w", snapshot.BatchID, err)
	}
	snapshot.ParseSuccessRate = parseSuccessRate
	snapshot.MissingRequiredFieldRate = missingRequiredFieldRate
	snapshot.UnknownColumnCount = unknownColumnCount
	return nil
}

func (r *IntentBridgeRepo) loadDLQAggregates(ctx context.Context, snapshot *IntentBatchSnapshot) error {
	var invalidAmountCount int
	var invalidBeneficiaryCount int
	var missingRequiredCount int
	err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE UPPER(reason_code) = 'INVALID_AMOUNT')::int,
			COUNT(*) FILTER (
				WHERE UPPER(reason_code) IN ('INVALID_INSTRUMENT', 'INVALID_BENEFICIARY')
				   OR POSITION('beneficiary' IN LOWER(COALESCE(error_detail, ''))) > 0
			)::int,
			COUNT(*) FILTER (
				WHERE POSITION('required' IN LOWER(COALESCE(error_detail, ''))) > 0
				   OR POSITION('missing' IN LOWER(COALESCE(error_detail, ''))) > 0
				   OR UPPER(reason_code) LIKE 'MISSING_%'
			)::int
		FROM dlq_items d
		LEFT JOIN normalized_ingest_records n
		  ON n.tenant_id = d.tenant_id
		 AND n.envelope_id = d.envelope_id
		WHERE d.tenant_id = $1
		  AND COALESCE(
				NULLIF(d.client_batch_ref, ''),
				NULLIF(d.batch_id, ''),
				NULLIF(n.fields_json->>'client_batch_ref', '')
		  ) = $2
	`, snapshot.TenantID, snapshot.BatchID).Scan(&invalidAmountCount, &invalidBeneficiaryCount, &missingRequiredCount)
	if err != nil {
		return fmt.Errorf("intent_bridge_repo.loadDLQAggregates batch=%s: %w", snapshot.BatchID, err)
	}
	receivedCount := snapshot.ReceivedCount
	if receivedCount <= 0 {
		receivedCount = snapshot.IntentRowCount + snapshot.DLQCount
	}
	if receivedCount > 0 {
		invalidAmountRate := float64(invalidAmountCount) / float64(receivedCount)
		invalidBeneficiaryRate := float64(invalidBeneficiaryCount) / float64(receivedCount)
		snapshot.InvalidAmountRate = &invalidAmountRate
		snapshot.InvalidBeneficiaryRate = &invalidBeneficiaryRate
		if snapshot.MissingRequiredFieldRate == nil {
			missingRequiredRate := float64(missingRequiredCount) / float64(receivedCount)
			snapshot.MissingRequiredFieldRate = &missingRequiredRate
		}
	}
	return nil
}

func (s *IntentBatchSnapshot) ToBatchContract() BatchContract {
	createdAt := time.Now().UTC()
	if s.FirstIntentCreatedAt != nil {
		createdAt = s.FirstIntentCreatedAt.UTC()
	}
	currency := s.Currency
	sourceSystem := s.SourceSystem
	rail := s.Rail
	intentType := s.IntentType
	providerKey := s.ProviderKey
	firstIntentCreatedAt := s.FirstIntentCreatedAt
	return BatchContract{
		BatchID:                     s.BatchID,
		TenantID:                    s.TenantID,
		TotalCount:                  s.IntentRowCount,
		SuccessCount:                0,
		FailedCount:                 0,
		PendingCount:                s.IntentRowCount,
		ReversedCount:               0,
		PartialReconCount:           0,
		TotalIntendedAmountMinor:    s.IntentTotalAmountMinor,
		TotalConfirmedAmountMinor:   decimal.Zero,
		TotalVarianceMinor:          decimal.Zero,
		BatchFinalityStatus:         "PROCESSING",
		LastUpdatedAt:               time.Now().UTC(),
		CreatedAt:                   createdAt,
		IntentRowCount:              s.IntentRowCount,
		IntentTotalAmountMinor:      s.IntentTotalAmountMinor,
		IntentAmountSquareSum:       s.IntentAmountSquareSum,
		IntentMinAmountMinor:        s.IntentMinAmountMinor,
		IntentMaxAmountMinor:        s.IntentMaxAmountMinor,
		ClientPayoutRefPresentCount: s.ClientPayoutRefPresentCount,
		BatchCurrency:               &currency,
		BatchSourceSystem:           &sourceSystem,
		BatchRail:                   &rail,
		BatchIntentType:             &intentType,
		BatchProviderKey:            &providerKey,
		FirstIntentCreatedAt:        firstIntentCreatedAt,
	}
}

func snapshotPointer[T any](value T) *T {
	return &value
}

func cloneFloat(value *float64) *float64 {
	if value == nil {
		return nil
	}
	return snapshotPointer(*value)
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	return snapshotPointer(*value)
}

func (s *IntentBatchSnapshot) ToFeatureJSON() []byte {
	body, _ := json.Marshal(map[string]any{
		"source_system":  s.SourceSystem,
		"received_count": s.ReceivedCount,
	})
	return body
}
