package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/singleflight"

	"zord-intent-engine/internal/canonicalizer"
	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/normalizer"

	// "zord-intent-engine/internal/pii"
	"zord-intent-engine/internal/guards"
	"zord-intent-engine/internal/validator"
	"zord-intent-engine/internal/vault"
	"zord-intent-engine/storage"

	"github.com/shopspring/decimal"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

var batchAggregateGroup singleflight.Group

type IntentService struct {
	validator *validator.Validator
	//tokenizer *pii.Tokenizer
	repo          CanonicalIntentRepository
	s3            *storage.S3Store
	tokenizeQueue *KafkaTokenizeQueue
}

var enclaveHTTPClient = &http.Client{
	Timeout:   10 * time.Second,
	Transport: otelhttp.NewTransport(http.DefaultTransport),
}

// getTenantSynonyms returns tenant-specific synonym overrides from DB.
// Returns empty map if tenant has no custom synonyms — falls back to global dict.
func (s *IntentService) getTenantSynonyms(tenantID uuid.UUID) map[string]string {
	// TODO Phase 2: load from tenant_synonym_profiles table
	// For now return empty — global synonym dict in normalizer package handles everything
	return map[string]string{}
}

// Repository abstraction
type CanonicalIntentRepository interface {
	Save(
		ctx context.Context,
		nir *models.NormalizedIngestRecord,
		intent models.CanonicalIntent,
		outbox models.OutboxEvent,
		registry *models.BusinessIdempotencyEntry,
	) (models.CanonicalIntent, error)

	FindByEnvelope(
		ctx context.Context,
		tenantID string,
		envelopeID string,
	) (*models.CanonicalIntent, error)

	UpdateSnapshotRefs(
		ctx context.Context,
		intentID string,
		canonicalRef string,
		nirRef string,
		govRef string,
		hash string,
		prevHash string,
	) error

	GetPreviousTenantCanonicalHash(
		ctx context.Context,
		tenantID string,
		intentID string,
	) (string, error)

	FindByBusinessIdempotencyKey(
		ctx context.Context,
		tenantID string,
		key string,
	) (*models.CanonicalIntent, error)

	CheckIdempotencyRegistry(
		ctx context.Context,
		tenantID string,
		key string,
	) (*models.BusinessIdempotencyEntry, error)

	UpdateBatchAggregateConfidence(
		ctx context.Context,
		batchID string,
	) (float64, error)
}

func NewIntentService(
	v *validator.Validator,
	//t *pii.Tokenizer,
	r CanonicalIntentRepository,
	s3 *storage.S3Store, // ✅ ADD
	q *KafkaTokenizeQueue,
) *IntentService {
	return &IntentService{
		validator: v,
		//tokenizer: t,
		repo:          r,
		s3:            s3,
		tokenizeQueue: q,
	}
}

/* ---------------- Helpers ---------------- */

func parseAmount(value string) (decimal.Decimal, error) {
	v := strings.TrimSpace(value)
	if v == "" {
		return decimal.Zero, errors.New("amount is required")
	}
	return decimal.NewFromString(v) // exact decimal, no rounding
}

type enclaveTokenizeRequest struct {
	TenantID string            `json:"tenant_id"`
	TraceID  string            `json:"trace_id"`
	PII      map[string]string `json:"pii"`
}

func callEnclaveTokenize(ctx context.Context, req enclaveTokenizeRequest) (map[string]string, error) {
	var lastErr error
	for i := 0; i < 3; i++ {
		tokens, err := callEnclaveTokenizeOnce(ctx, req)
		if err == nil {
			return tokens, nil
		}
		lastErr = err
		backoff := time.Duration(100*(1<<i)) * time.Millisecond
		log.Printf("⚠️ Token enclave call failed (attempt %d/3), retrying in %v: %v", i+1, backoff, err)

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff):
		}
	}
	return nil, fmt.Errorf("enclave tokenize failed after 3 attempts: %w", lastErr)
}

func callEnclaveTokenizeOnce(ctx context.Context, req enclaveTokenizeRequest) (map[string]string, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("ZORD_PII_ENCLAVE_URL")), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("ZORD_PII_ENCLAVE_URL is not set")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/v1/tokenize", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := enclaveHTTPClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status=%d body=%s", resp.StatusCode, string(raw))
	}

	var out struct {
		Tokens map[string]string `json:"tokens"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out.Tokens, nil
}

func (s *IntentService) computeBeneficiaryFingerprint(tokens map[string]string) string {
	// FIX: deterministic fingerprint using tokens
	// beneficiary_fingerprint = SHA256(account_number_token + ifsc_token + vpa_token)
	raw := tokens["account_number"] + tokens["ifsc"] + tokens["vpa"]
	hash := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(hash[:])
}

func (s *IntentService) isAbnormalAmount(amount decimal.Decimal, currency string) bool {
	threshold := decimal.NewFromInt(1000000) // Default 1M
	if strings.ToUpper(currency) == "INR" {
		threshold = decimal.NewFromInt(10000000) // 10M for INR (1 Crore)
	}
	return amount.GreaterThan(threshold)
}

func (s *IntentService) computeBusinessIdempotencyKey(tenantID string, fingerPrint string, amount decimal.Decimal, currency string, timeBucket string) string {
	// FIX: deterministic business idempotency key
	// business_idempotency_key = SHA256(tenant_id + beneficiary_fingerprint + amount_minor + currency + time_bucket)

	// Normalize amount to string (fixed precision)
	amountStr := amount.String()

	raw := tenantID + fingerPrint + amountStr + strings.ToUpper(currency) + timeBucket
	hash := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(hash[:])
}

func (s *IntentService) computeRequestFingerprint(beneficiaryName string, amount decimal.Decimal, accountNumber string, vpa string, currency string) string {
	// fingerprint must be deterministic hash of: beneficiary, amount, account_number, currency
	raw := strings.TrimSpace(beneficiaryName) +
		amount.String() +
		strings.TrimSpace(accountNumber) +
		strings.TrimSpace(vpa) +
		strings.ToUpper(strings.TrimSpace(currency))

	hash := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(hash[:])
}

func (s *IntentService) computeConfidenceScore(qualityScore float64) float64 {
	// Ensure: confidenceScore := ComputeConfidence(...)
	// if confidenceScore == 0: assign minimum fallback (e.g., 0.5)
	if qualityScore <= 0 {
		return 0.5
	}
	return qualityScore
}

func (s *IntentService) computeScores(
	intent *models.CanonicalIntent,
	nir *models.NormalizedIngestRecord,
	gov models.Governance,
) (mappingScore, proofScore, matchScore, qualityScore, schemaScore float64) {
	// 1. schema_completeness_score
	totalRequired := 5.0 // intent_type, amount, currency, beneficiary_name, idempotency_key
	if nir != nil {
		presentRequired := totalRequired - float64(nir.RequiredFieldGapCount)
		schemaScore = presentRequired / totalRequired
	}

	// 2. mapping_confidence_score
	totalFields := 6.0 // Based on fields added in Step 6
	if totalFields > 0 && nir != nil {
		var confSummary struct {
			AvgConfidence float64 `json:"avg_confidence"`
			Overall       float64 `json:"overall"`
			LowConfCount  int     `json:"low_confidence_field_count"`
		}

		avgConf := 1.0
		lowConfCount := nir.LowConfidenceFieldCount

		if len(nir.FieldConfidenceSummary) > 0 {
			_ = json.Unmarshal(nir.FieldConfidenceSummary, &confSummary)
			if confSummary.AvgConfidence > 0 {
				avgConf = confSummary.AvgConfidence
			} else if confSummary.Overall > 0 {
				avgConf = confSummary.Overall
			}
			if confSummary.LowConfCount > 0 {
				lowConfCount = confSummary.LowConfCount
			}
		}

		// Base mapping on average confidence and high-confidence ratio
		highConfRatio := (totalFields - float64(nir.RequiredFieldGapCount) - float64(lowConfCount)) / totalFields
		mappingScore = (avgConf * 0.6) + (highConfRatio * 0.4)

		// Penalize low confidence and gaps
		// UPDATED: Use Governance signals
		if len(gov.LowConfidenceFields) > 0 {
			mappingScore -= 0.2
		}
		mappingScore -= float64(lowConfCount) * 0.1
		mappingScore -= float64(nir.RequiredFieldGapCount) * 0.2
	}

	// 3. proof_readiness_score
	if intent.BeneficiaryFingerprint != "" {
		proofScore += 0.2
	}
	if !intent.Amount.IsZero() {
		proofScore += 0.2
	}
	if intent.Currency != "" {
		proofScore += 0.1
	}
	if intent.TraceID != "" && intent.EnvelopeID != "" {
		proofScore += 0.2
	}
	if intent.ClientPayoutRef != "" && intent.ClientPayoutRef != "NA" {
		proofScore += 0.2
	}
	if intent.ClientBatchRef != "" && intent.ClientBatchRef != "NA" {
		proofScore += 0.1
	}

	// Weight by schema completeness
	proofScore = proofScore * schemaScore

	// 4. matchability_score
	if intent.BeneficiaryFingerprint != "" {
		matchScore += 0.3
	}
	if !intent.Amount.IsZero() {
		matchScore += 0.2
	}
	if intent.Currency != "" {
		matchScore += 0.1
	}
	if intent.ClientPayoutRef != "" && intent.ClientPayoutRef != "NA" {
		matchScore += 0.2
	}
	// time field (using CreatedAt)
	if !intent.CreatedAt.IsZero() {
		matchScore += 0.1
	}
	if intent.TraceID != "" {
		matchScore += 0.1
	}

	// source_system signal
	if intent.SourceSystem != "" {
		matchScore += 0.1
		if s.isTrustedSystem(intent.SourceSystem) {
			matchScore += 0.1
		}
	}

	// 5. intent_quality_score
	// Baseline from mapping and completeness
	qualityScore = (mappingScore * 0.4) + (schemaScore * 0.6)

	// UPDATED: Use Governance signals
	if !gov.SemanticValid {
		qualityScore -= 0.5
	}
	if gov.DuplicateDetected {
		qualityScore -= 0.4
	}
	if len(gov.MissingFields) > 0 {
		qualityScore -= 0.3
	}

	if intent.DuplicateRiskFlag {
		qualityScore -= 0.3
	}

	// UPDATED: Penalize validation anomalies (Soft policy violations)
	if len(intent.ValidationAnomalies) > 0 {
		qualityScore -= float64(len(intent.ValidationAnomalies)) * 0.1
	}

	if nir != nil {
		// Extract low confidence count again or use the one from NIR directly
		lowConf := nir.LowConfidenceFieldCount
		// Penalize intent quality score based on low confidence fields
		if lowConf > 0 {
			qualityScore -= float64(lowConf) * 0.05
		}
	}

	// Cap all scores between 0 and 1
	capScore := func(v float64) float64 {
		if v < 0 {
			return 0
		}
		if v > 1 {
			return 1
		}
		return v
	}

	mappingScore = capScore(mappingScore)
	proofScore = capScore(proofScore)
	matchScore = capScore(matchScore)
	qualityScore = capScore(qualityScore)
	schemaScore = capScore(schemaScore)

	return
}

func (s *IntentService) isTrustedSystem(source string) bool {
	trusted := map[string]bool{
		"SAP_ERP":      true,
		"CORE_BANKING": true,
		"SWIFT_GPI":    true,
	}
	return trusted[source]
}

func (s *IntentService) ApplyPolicy(nir *models.NormalizedIngestRecord, req models.ParsedIncomingIntent) models.Governance {
	gov := models.Governance{
		SemanticValid:        true,
		RoutingConsistent:    true,
		ExecutionWindowValid: true,
		PolicyFlags:          []string{},
		SemanticErrors:       []string{},
		MissingFields:        []string{},
		LowConfidenceFields:  []string{},
	}

	// ----------------------------------------
	// SEMANTIC POLICY (HARD)
	// ----------------------------------------
	kind := strings.ToUpper(req.Beneficiary.Instrument.Kind)
	isBank := kind == "BANK" || kind == "NEFT" || kind == "IMPS" || kind == "RTGS"
	isUPI := kind == "UPI"

	// BANK requires IFSC
	if isBank && req.Beneficiary.Instrument.IFSC == "" {
		gov.SemanticValid = false
		gov.SemanticErrors = append(gov.SemanticErrors, "BANK_REQUIRES_IFSC")
	}
	// UPI requires VPA
	if isUPI && req.Beneficiary.Instrument.VPA == "" {
		gov.SemanticValid = false
		gov.SemanticErrors = append(gov.SemanticErrors, "UPI_REQUIRES_VPA")
	}
	// BANK + VPA -> error
	if isBank && strings.TrimSpace(req.Beneficiary.Instrument.VPA) != "" {
		gov.SemanticValid = false
		gov.SemanticErrors = append(gov.SemanticErrors, "BANK_WITH_VPA_INVALID")
	}
	// UPI + IFSC -> error
	if isUPI && strings.TrimSpace(req.Beneficiary.Instrument.IFSC) != "" {
		gov.SemanticValid = false
		gov.SemanticErrors = append(gov.SemanticErrors, "UPI_WITH_IFSC_INVALID")
	}

	// source vs provider_hint: UPI -> UPI_RAIL, BANK -> BANK_RAIL
	// REMOVED: Making provider_hint flexible
	/*
		if req.Beneficiary.Instrument.Kind == "UPI" && req.ProviderHint != "" && !strings.Contains(strings.ToUpper(req.ProviderHint), "UPI") {
			gov.RoutingConsistent = false
			gov.SemanticErrors = append(gov.SemanticErrors, "ROUTING_INCONSISTENT_UPI")
		}
		if req.Beneficiary.Instrument.Kind == "BANK" && req.ProviderHint != "" && !strings.Contains(strings.ToUpper(req.ProviderHint), "BANK") {
			gov.RoutingConsistent = false
			gov.SemanticErrors = append(gov.SemanticErrors, "ROUTING_INCONSISTENT_BANK")
		}
	*/

	// execution_window vs intended_execution_at
	if req.IntendedExecutionAt != "" {
		t, err := time.Parse(time.RFC3339, req.IntendedExecutionAt)
		if err != nil {
			gov.SemanticValid = false
			gov.SemanticErrors = append(gov.SemanticErrors, "INVALID_EXECUTION_AT_FORMAT")
		} else {
			if t.Before(time.Now().Add(-1 * time.Hour)) {
				gov.ExecutionWindowValid = false
				gov.SemanticErrors = append(gov.SemanticErrors, "EXECUTION_WINDOW_EXPIRED")
			}
		}
	}

	// required fields validation
	if req.IntentType == "" {
		gov.MissingFields = append(gov.MissingFields, "intent_type")
		gov.SemanticValid = false
	}
	if req.Amount.Value == "" {
		gov.MissingFields = append(gov.MissingFields, "amount.value")
		gov.SemanticValid = false
	}

	// ----------------------------------------
	// DATA QUALITY POLICY
	// ----------------------------------------
	if nir != nil {
		if nir.RequiredFieldGapCount > 0 {
			gov.PolicyFlags = append(gov.PolicyFlags, "REQUIRED_FIELD_GAPS")
		}
		if nir.LowConfidenceFieldCount > 0 {
			gov.LowConfidenceFields = append(gov.LowConfidenceFields, "SEE_NIR_LOGS")
			gov.PolicyFlags = append(gov.PolicyFlags, "LOW_CONFIDENCE_DETECTION")
		}
	}

	return gov
}

/* ---------------- Pipeline ---------------- */

// ProcessIncomingIntent is the ONLY entrypoint.
func (s *IntentService) ProcessIncomingIntent(
	ctx context.Context,
	event *models.Event,
) (*models.CanonicalIntent, *models.DLQEntry, error) {

	//Unmarshal Payload into IncomingIntent struct
	var in *models.IncomingIntent

	in = &models.IncomingIntent{
		TenantID:         event.TenantID,
		EnvelopeID:       event.EnvelopeID,
		TraceID:          event.TraceID,
		Source:           event.Source,
		SourceSystem:     event.SourceSystem,
		ObjectRef:        event.ObjectRef,
		IdempotencyKey:   event.IdempotencyKey,
		EncryptedPayload: event.Payload,
		PayloadHash:      event.PayloadHash,
		ReceivedAt:       event.ReceivedAt,
		BatchID:          event.BatchID,
	}

	// -------- STEP 0: Transport guards --------

	log.Printf("ProcessIncomingIntent: Source=%s EnvelopeID=%s", in.Source, in.EnvelopeID)

	if in.Source == "WEBHOOK" {
		log.Printf("ProcessIncomingIntent: Routing to processWebhook for EnvelopeID=%s", in.EnvelopeID)
		return s.processWebhook(ctx, in)
	}

	if len(in.EncryptedPayload) == 0 {
		return nil, &models.DLQEntry{ReasonCode: "EMPTY_PAYLOAD"}, nil
	}

	if in.TraceID == uuid.Nil {
		return nil, &models.DLQEntry{ReasonCode: "MISSING_TRACE_ID"}, nil
	}

	if in.EnvelopeID == uuid.Nil {
		return nil, &models.DLQEntry{ReasonCode: "MISSING_ENVELOPE_ID"}, nil
	}

	if in.TenantID == uuid.Nil {
		return nil, &models.DLQEntry{ReasonCode: "MISSING_TENANT_ID"}, nil
	}

	if in.ObjectRef == "" {
		return nil, &models.DLQEntry{ReasonCode: "MISSING_OBJECT_REF"}, nil
	}

	// -------- STEP 5: Parse raw payload into domain model --------
	decryptedPayload, err := vault.DecryptPayload(in.EncryptedPayload)
	if err != nil {
		log.Printf("⚠️ Payload decryption failed for EnvelopeID=%s: %v", in.EnvelopeID, err)
		return nil, &models.DLQEntry{Stage: "SECURITY_DLQ", ReasonCode: "PAYLOAD_DECRYPTION_FAILED"}, nil
	}

	// -------- STEP 4: Recompute SHA256(raw_bytes) and compare --------
	rawHash := sha256.Sum256(decryptedPayload)
	hexRawHash := hex.EncodeToString(rawHash[:])
	if in.PayloadHash == "" {
		log.Printf("⚠️ Missing raw payload hash for EnvelopeID=%s", in.EnvelopeID)
		return nil, &models.DLQEntry{Stage: "SECURITY_DLQ", ReasonCode: "MISSING_RAW_PAYLOAD_HASH"}, nil
	}

	if len(in.PayloadHash) != 64 {
		log.Printf("⚠️ Invalid raw payload hash length for EnvelopeID=%s (expected 64, got %d)", in.EnvelopeID, len(in.PayloadHash))
		return nil, &models.DLQEntry{Stage: "SECURITY_DLQ", ReasonCode: "INVALID_RAW_PAYLOAD_HASH_LENGTH"}, nil
	}
	if in.PayloadHash != "" && hexRawHash != in.PayloadHash {
		log.Printf("⚠️ Raw payload hash mismatch for EnvelopeID=%s", in.EnvelopeID)
		return nil, &models.DLQEntry{Stage: "SECURITY_DLQ", ReasonCode: "RAW_PAYLOAD_INTEGRITY_FAILED"}, nil
	}

	// -------- STEP 5.1: Header normalization (ETL 10.1 / 10.2 / 10.3) --------
	// Normalize tenant-specific field names → Zord canonical JSON keys.
	// If payload is already canonical, this is a no-op (fast path).
	normResult, normErr := normalizer.Normalize(decryptedPayload, s.getTenantSynonyms(in.TenantID))
	if normErr != nil {
		log.Printf("⚠️ Normalization failed for EnvelopeID=%s: %v — falling back to raw payload", in.EnvelopeID, normErr)
		// Do NOT DLQ — fall through with original payload (graceful degradation)
	} else {
		decryptedPayload = normResult.NormalizedJSON
		if normResult.WasNormalized {
			log.Printf("ℹ️ Payload normalized for EnvelopeID=%s warnings=%v", in.EnvelopeID, normResult.Warnings)
		}
	}
	// ── END STEP 5.1 ──────────────────────────────────────────────────────────

	var parsed models.ParsedIncomingIntent
	if err := json.Unmarshal(decryptedPayload, &parsed); err != nil {
		return nil, &models.DLQEntry{
			ReasonCode: "INVALID_JSON_PAYLOAD",
		}, nil
	}

	// FIX: Idempotency Key Fallback
	if in.IdempotencyKey == "" {
		in.IdempotencyKey = parsed.IdempotencyKey
		log.Printf("ProcessIncomingIntent: EnvelopeID=%s, falling back to payload idempotency_key=%s", in.EnvelopeID, in.IdempotencyKey)
	}

	// -------- STEP 6: Build NIR --------
	fieldsMap := make(map[string]models.NIRField)
	gapCount := 0
	lowConfCount := 0

	// Helper to add structured field
	addFields := func(name string, value any, path string, required bool) {
		conf := 1.0 // default for direct parse
		if value == "" || value == nil {
			if required {
				gapCount++
			}
			conf = 0.0
		}
		if conf > 0 && conf < 0.8 {
			lowConfCount++
		}
		fieldsMap[name] = models.NIRField{
			Value:            value,
			SourcePath:       path,
			ConfidenceScore:  conf,
			SensitiveFlag:    false,  // Default
			TransformApplied: "NONE", // Default
			ExtractionNotes:  "",     // Default
		}
	}

	addFields("intent_type", parsed.IntentType, "$.intent_type", true)
	addFields("amount", parsed.Amount.Value, "$.amount.value", true)
	addFields("currency", parsed.Amount.Currency, "$.amount.currency", true)
	addFields("beneficiary_name", parsed.Beneficiary.Name, "$.beneficiary.name", true)
	addFields("idempotency_key", parsed.IdempotencyKey, "$.idempotency_key", true)
	addFields("client_batch_ref", parsed.ClientBatchRef, "$.client_batch_ref", false)
	addFields("client_payout_ref", parsed.ClientPayoutRef, "$.client_payout_ref", false)
	addFields("provider_hint", parsed.ProviderHint, "$.provider_hint", false)
	addFields("intended_execution_at", parsed.IntendedExecutionAt, "$.intended_execution_at", false)

	fieldsJSON, _ := json.Marshal(fieldsMap)

	profileID := "generic_json_profile"
	if in.SourceSystem != "" {
		profileID = fmt.Sprintf("%s_%s_json_profile", in.TenantID.String(), strings.ToLower(in.SourceSystem))
	}

	profileVersion := "v1"
	if parsed.SchemaVersion != "" {
		profileVersion = parsed.SchemaVersion
	}

	nir := &models.NormalizedIngestRecord{
		NIRID:                   uuid.New(),
		EnvelopeID:              in.EnvelopeID,
		TenantID:                in.TenantID,
		DetectedFormat:          "json",
		ProfileID:               profileID,
		ProfileVersion:          profileVersion,
		FieldsJSON:              fieldsJSON,
		FieldConfidenceSummary:  json.RawMessage(`{"overall": 1.0}`),
		UnmappedJSON:            json.RawMessage(`{}`),
		MappingUncertainFlag:    false,
		RequiredFieldGapCount:   gapCount,
		LowConfidenceFieldCount: lowConfCount,
		CreatedAt:               time.Now().UTC(),
	}

	if normResult != nil && normResult.WasNormalized {
		unmappedBytes, _ := json.Marshal(normResult.UnmappedFields)
		nir.UnmappedJSON = unmappedBytes
		nir.MappingUncertainFlag = len(normResult.Warnings) > 0

		// Stamp provenance into each NIRField's TransformApplied
		for _, prov := range normResult.FieldProvenance {
			if field, ok := fieldsMap[canonicalPathToFieldName(prov.CanonicalPath)]; ok {
				field.TransformApplied = prov.Transform
				field.ExtractionNotes = prov.MatchMethod
				field.ConfidenceScore = prov.Confidence
				fieldsMap[canonicalPathToFieldName(prov.CanonicalPath)] = field
			}
		}

		// Update FieldsJSON after adding provenance
		updatedFieldsJSON, _ := json.Marshal(fieldsMap)
		nir.FieldsJSON = updatedFieldsJSON
	}

	// -------- STEP 6.5: APPLY GOVERNANCE POLICY (NEW) --------
	governance := s.ApplyPolicy(nir, parsed)
	if !governance.SemanticValid {
		log.Printf("⚠️ Semantic Policy Violation for EnvelopeID=%s: %v", in.EnvelopeID, governance.SemanticErrors)
		return nil, &models.DLQEntry{Stage: "POLICY_DLQ", ReasonCode: "SEMANTIC_INVALID", ErrorDetail: strings.Join(governance.SemanticErrors, ", ")}, nil
	}

	// FIX: Generate IntentID early to include in GovernanceHash (NEW)
	intentID := uuid.NewString()

	// FIX: Compute GovernanceHash early (UPDATED)
	// We need a temporary canonical for reason codes aggregation
	tempGovCanonical := &models.CanonicalIntent{
		IntentID:   intentID,
		Governance: governance,
	}
	governanceJSON := s.aggregateGovernanceReasons(tempGovCanonical, nir)
	governanceHash := s.computeGovernanceHashInternal("VALID", string(governanceJSON), "v1", intentID)

	// -------- STEP 5.5: Idempotency guard --------

	existing, err := s.repo.FindByEnvelope(
		ctx,
		in.TenantID.String(),
		in.EnvelopeID.String(),
	)
	if err != nil {
		return nil, nil, err
	}

	if existing != nil {
		return existing, nil, nil
	}

	// -------- STEP 6: VALIDATION --------
	batchRef := ""
	if in.BatchID != nil {
		batchRef = *in.BatchID
	}
	intent, dlq, err := s.validator.ValidateParsed(
		ctx,
		in.TenantID.String(),
		in.EnvelopeID.String(),
		parsed,
		batchRef,
	)
	if err != nil {
		return nil, nil, err
	}

	if dlq != nil {
		return nil, dlq, nil
	}

	if intent == nil {
		return nil, nil, errors.New("validator returned nil intent")
	}

	// -------- STEP 7: CANONICALIZATION --------

	canonicalInput := canonicalizer.CanonicalizeIntent(*intent)

	// -------- STEP 7.5: PRE-GUARDS --------

	if dlq := guards.RunPreGuards(in, canonicalInput); dlq != nil {
		return nil, dlq, nil
	}

	// Governance hash computed early at step 6.5
	canonicalInput.GovernanceHash = governanceHash
	canonicalInput.IntentID = intentID // Ensure intent_id is passed to Kafka if needed

	// -------- STEP 8: TOKENIZATION --------

	tokenReq := enclaveTokenizeRequest{
		TenantID: in.TenantID.String(),
		TraceID:  in.TraceID.String(),
		PII: map[string]string{
			"account_number": canonicalInput.AccountNumber,
			"ifsc":           canonicalInput.Beneficiary.Instrument.IFSC,
			"vpa":            canonicalInput.Beneficiary.Instrument.VPA,
			"name":           canonicalInput.Beneficiary.Name,
			"phone":          canonicalInput.Remitter.Phone,
			"email":          canonicalInput.Remitter.Email,
		},
	}

	tokenMap, err := callEnclaveTokenize(ctx, tokenReq)

	if err != nil {

		log.Printf("Token enclave unavailable, publishing tokenize request to Kafka: %v", err)

		// -------- KAFKA FALLBACK --------

		if s.tokenizeQueue == nil {
			return nil, nil, err
		}

		req := models.TokenizeRequestEvent{
			EventType:      "PII_TOKENIZE_REQUEST",
			TraceID:        in.TraceID.String(),
			EnvelopeID:     in.EnvelopeID.String(),
			TenantID:       in.TenantID.String(),
			ObjectRef:      in.ObjectRef,
			IdempotencyKey: in.IdempotencyKey,
			Source:         in.Source,
			ReceivedAt:     time.Now().UTC(),
			Canonical:      canonicalInput,
			BatchID:        in.BatchID,
		}

		err = s.tokenizeQueue.PublishTokenizeRequest(ctx, req)
		if err != nil {
			log.Printf("Kafka publish failed: %v", err)
			return nil, nil, err
		}

		log.Printf("Tokenization request queued in Kafka for EnvelopeID=%s", in.EnvelopeID)

		// Stop pipeline for now
		return nil, nil, nil
	}

	// Persist full token map in pii_tokens JSONB
	piiJSON, _ := json.Marshal(tokenMap)

	beneficiaryTokenized := map[string]any{
		"instrument": map[string]any{
			"kind":       canonicalInput.Beneficiary.Instrument.Kind,
			"ifsc_token": tokenMap["ifsc"],
			"vpa_token":  tokenMap["vpa"],
		},
		"name_token": tokenMap["name"],
		"country":    canonicalInput.Beneficiary.Country,
	}

	beneficiaryJSON, _ := json.Marshal(beneficiaryTokenized)
	constraintsJSON, _ := json.Marshal(canonicalInput.Constraints)

	amount, _ := parseAmount(canonicalInput.Amount.Value)

	// -------- STEP 8.5: COMPUTE SCORES & FINGERPRINT --------

	bFingerprint := s.computeBeneficiaryFingerprint(tokenMap)
	timeBucket := time.Now().UTC().Format("2006-01-02")
	bIdemKey := s.computeBusinessIdempotencyKey(in.TenantID.String(), bFingerprint, amount, canonicalInput.Amount.Currency, timeBucket)

	// UPDATED: Abnormal amount detection
	var anomalies []string
	if s.isAbnormalAmount(amount, canonicalInput.Amount.Currency) {
		anomalies = append(anomalies, "ABNORMAL_AMOUNT")
	}

	// -------- STEP 8.7: Business Idempotency Registry Check (NEW) --------
	registryDuplicate, err := s.repo.CheckIdempotencyRegistry(ctx, in.TenantID.String(), bIdemKey)
	if err != nil {
		return nil, nil, err
	}

	dupRisk := false
	dupReason := "NONE"
	var registryEntry *models.BusinessIdempotencyEntry

	if registryDuplicate != nil {
		dupRisk = true
		dupReason = registryDuplicate.DuplicateReasonCode
		if dupReason == "" {
			dupReason = "SAME_BENEFICIARY_AMOUNT_TIME"
		}
	} else {
		// Prepare registry entry for new intent
		registryEntry = &models.BusinessIdempotencyEntry{
			TenantID:               in.TenantID,
			BusinessIdempotencyKey: bIdemKey,
			IntentID:               uuid.Nil, // Will be set after IntentID generated if needed, but here we can use a temp ID or let repo handle it
			BeneficiaryFingerprint: bFingerprint,
			AmountMinor:            amount.Mul(decimal.NewFromInt(100)).IntPart(),
			CurrencyCode:           canonicalInput.Amount.Currency,
			TimeBucket:             timeBucket,
			DuplicateReasonCode:    "NONE",
			CreatedAt:              time.Now().UTC(),
		}
	}

	batchIDStr := ""
	if in.BatchID != nil {
		batchIDStr = *in.BatchID
	}

	// Score requires partial intent for signals
	tempIntent := &models.CanonicalIntent{
		BeneficiaryFingerprint: bFingerprint,
		Amount:                 amount,
		Currency:               canonicalInput.Amount.Currency,
		TraceID:                in.TraceID.String(),
		EnvelopeID:             in.EnvelopeID.String(),
		ClientPayoutRef:        canonicalInput.ClientPayoutRef,
		ClientBatchRef:         batchIDStr,
		ProviderHint:           canonicalInput.ProviderHint,
		CreatedAt:              time.Now().UTC(),
		DuplicateRiskFlag:      dupRisk,
		ValidationAnomalies:    anomalies,
	}

	// Update governance with duplicate detection results
	if dupRisk {
		governance.DuplicateDetected = true
		governance.DuplicateReason = dupReason
	}

	mapScore, pScore, mScore, iScore, schemaScore := s.computeScores(tempIntent, nir, governance)
	confidenceScore := s.computeConfidenceScore(iScore)

	// FIX: Deterministic Request Fingerprint
	reqFingerprint := s.computeRequestFingerprint(
		canonicalInput.Beneficiary.Name,
		amount,
		canonicalInput.AccountNumber,
		canonicalInput.Beneficiary.Instrument.VPA,
		canonicalInput.Amount.Currency,
	)

	log.Printf("Fingerprint=%s IdempotencyKey=%s Confidence=%f", reqFingerprint, in.IdempotencyKey, confidenceScore)

	// -------- STEP 9: BUILD CANONICAL INTENT --------

	var executionAt *time.Time

	if canonicalInput.IntendedExecutionAt != "" {
		t, err := time.Parse(time.RFC3339, canonicalInput.IntendedExecutionAt)
		if err == nil {
			executionAt = &t
		}
	}

	// Link registry entry to intent if it's a new entry
	if registryEntry != nil {
		registryEntry.IntentID = uuid.MustParse(intentID)
	}

	canonical := models.CanonicalIntent{
		TraceID:        in.TraceID.String(),
		IntentID:       intentID,
		EnvelopeID:     in.EnvelopeID.String(),
		TenantID:       in.TenantID.String(),
		IdempotencyKey: in.IdempotencyKey,
		SalientHash:    "NA",
		PayloadHash:    in.PayloadHash,

		IntentType:       canonicalInput.IntentType,
		CanonicalVersion: "v1",
		SchemaVersion:    canonicalInput.SchemaVersion,

		Amount:   amount,
		Currency: canonicalInput.Amount.Currency,

		IntendedExecutionAt: executionAt,
		Constraints:         constraintsJSON,

		BeneficiaryType: canonicalInput.Beneficiary.Instrument.Kind,
		PIITokens:       piiJSON,
		Beneficiary:     beneficiaryJSON,

		Status:    "CREATED",
		CreatedAt: time.Now().UTC(),

		ClientPayoutRef:       canonicalInput.ClientPayoutRef,
		ProviderHint:          canonicalInput.ProviderHint,
		ClientBatchRef:        batchIDStr,
		RequestFingerprint:    reqFingerprint,
		RoutingHintsJSON:      json.RawMessage(`{}`),
		GovernanceState:       "PENDING",
		BusinessState:         "NEW",
		DuplicateRiskFlag:     dupRisk,
		MappingProfileID:      nir.ProfileID,
		MappingProfileVersion: nir.ProfileVersion,
		SourceSystem:          in.SourceSystem,
		GovernanceHash:        governanceHash,

		// Service 2 fields
		BusinessIdempotencyKey:  bIdemKey,
		BeneficiaryFingerprint:  bFingerprint,
		ConfidenceScore:         &confidenceScore,
		ProofReadinessScore:     pScore,
		MatchabilityScore:       mScore,
		IntentQualityScore:      iScore,
		MappingConfidenceScore:  mapScore,
		SchemaCompletenessScore: schemaScore,
		DuplicateReasonCode:     dupReason,

		UpdatedAt:           func(t time.Time) *time.Time { return &t }(time.Now().UTC()),
		BatchID:             in.BatchID,
		ValidationAnomalies: anomalies,
	}

	// -------- STEP 9.1: AGGREGATE GOVERNANCE REASONS --------
	canonical.Governance = governance
	canonical.GovernanceReasonCodesJSON = s.aggregateGovernanceReasons(&canonical, nir)

	// UPDATED: Determine GovernanceState (VALID / INVALID / FLAGGED)
	canonical.GovernanceState = "VALID"
	if canonical.DuplicateRiskFlag || len(canonical.ValidationAnomalies) > 0 {
		canonical.GovernanceState = "FLAGGED"
	}
	if nir.MappingUncertainFlag || nir.RequiredFieldGapCount > 0 {
		canonical.GovernanceState = "FLAGGED"
	}
	if iScore < 0.5 {
		canonical.GovernanceState = "FLAGGED"
	}

	// RE-COMPUTE hash if state changed from VALID to FLAGGED (FIX)
	if canonical.GovernanceState != "VALID" {
		canonical.GovernanceHash = s.computeGovernanceHash(&canonical)
	}

	// -------- STEP 10: OUTBOX + PERSISTENCE (ATOMIC DB) --------

	canonicalPayload, err := json.Marshal(canonical)
	if err != nil {
		log.Printf("⚠️ Failed to marshal canonical intent for EnvelopeID=%s: %v", in.EnvelopeID, err)
		return nil, nil, err
	}

	outbox, err := CanonicalIntentToOutboxEvent(canonical, canonicalPayload, "intent.created.v1")
	if err != nil {
		log.Printf("⚠️ Failed to create outbox event for EnvelopeID=%s: %v", in.EnvelopeID, err)
		return nil, nil, err
	}

	saved, err := s.repo.Save(ctx, nir, canonical, outbox, registryEntry)
	if err != nil {
		log.Printf("⚠️ Repo.Save failed for EnvelopeID=%s: %v", in.EnvelopeID, err)
		return nil, nil, err
	}

	// -------- STEP 11: WORM SNAPSHOT (S3) --------

	version := 1

	prevHash, err := s.repo.GetPreviousTenantCanonicalHash(
		ctx,
		saved.TenantID,
		saved.IntentID,
	)
	if err != nil {
		return nil, nil, err
	}

	canonicalBytes, err := json.Marshal(saved)
	if err != nil {
		return nil, nil, err
	}

	canonicalRef, hash, err := s.s3.StoreSnapshot(
		ctx,
		"canonical",
		saved.TenantID,
		saved.IntentID,
		version,
		canonicalBytes,
		prevHash,
	)
	if err != nil {
		log.Printf("⚠️ S3 Canonical Snapshot failed: %v. Warning: WORM metadata will remain null.", err)
		return &saved, nil, nil
	}

	var nirRef string
	nirBytes, _ := json.Marshal(nir)
	nirRef, _, err = s.s3.StoreSnapshot(ctx, "nir", saved.TenantID, saved.IntentID, version, nirBytes, "")
	if err != nil {
		log.Printf("⚠️ S3 NIR Snapshot failed: %v", err)
	}

	govBytes := []byte(`{"state":"` + canonical.GovernanceState + `"}`)
	govRef, _, err := s.s3.StoreSnapshot(ctx, "governance", saved.TenantID, saved.IntentID, version, govBytes, "")
	if err != nil {
		log.Printf("⚠️ S3 Governance Snapshot failed: %v", err)
	}

	// -------- STEP 12: UPDATE DB WITH WORM METADATA --------

	err = s.repo.UpdateSnapshotRefs(
		ctx,
		saved.IntentID,
		canonicalRef,
		nirRef,
		govRef,
		hash,
		prevHash,
	)
	if err != nil {
		return nil, nil, err
	}

	saved.CanonicalSnapshotRef = canonicalRef
	saved.NIRSnapshotRef = nirRef
	saved.GovernanceSnapshotRef = govRef
	saved.CanonicalHash = hash

	if in.BatchID != nil && *in.BatchID != "" {
		_, err, _ := batchAggregateGroup.Do(*in.BatchID, func() (interface{}, error) {
			return s.repo.UpdateBatchAggregateConfidence(context.Background(), *in.BatchID)
		})
		if err != nil {
			log.Printf("⚠️ Failed to update batch aggregate confidence for batch=%s: %v", *in.BatchID, err)
		}
	}

	return &saved, nil, nil
}

/* ---------------- ASYNC TOKENIZATION RESULT (KAFKA) ---------------- */

// ProcessTokenizeResult resumes the pipeline when tokenization
// result arrives asynchronously from Kafka (pii.tokenize.result)
func (s *IntentService) ProcessTokenizeResult(
	ctx context.Context,
	event *models.TokenizeResultEvent,
) (*models.CanonicalIntent, error) {

	log.Printf("ProcessTokenizeResult: EnvelopeID=%s", event.EnvelopeID)

	tokenMap := event.Tokens
	canonicalInput := event.Canonical

	// -------- JSON fields --------

	piiJSON, err := json.Marshal(tokenMap)
	if err != nil {
		return nil, err
	}

	beneficiaryTokenized := map[string]any{
		"instrument": map[string]any{
			"kind":       canonicalInput.Beneficiary.Instrument.Kind,
			"ifsc_token": tokenMap["ifsc"],
			"vpa_token":  tokenMap["vpa"],
		},
		"name_token": tokenMap["name"],
		"country":    canonicalInput.Beneficiary.Country,
	}

	beneficiaryJSON, err := json.Marshal(beneficiaryTokenized)
	if err != nil {
		return nil, err
	}

	constraintsJSON, err := json.Marshal(canonicalInput.Constraints)
	if err != nil {
		return nil, err
	}

	amount, err := parseAmount(canonicalInput.Amount.Value)
	if err != nil {
		return nil, err
	}

	batchIDStr := ""
	if event.BatchID != nil {
		batchIDStr = *event.BatchID
	}

	// -------- Build NIR (Reconstructed for async flow) --------
	fieldsMap := make(map[string]models.NIRField)
	fieldsMap["intent_type"] = models.NIRField{Value: canonicalInput.IntentType, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["amount"] = models.NIRField{Value: canonicalInput.Amount.Value, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["currency"] = models.NIRField{Value: canonicalInput.Amount.Currency, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["beneficiary_name"] = models.NIRField{Value: canonicalInput.Beneficiary.Name, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["client_batch_ref"] = models.NIRField{Value: canonicalInput.ClientBatchRef, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["client_payout_ref"] = models.NIRField{Value: canonicalInput.ClientPayoutRef, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["provider_hint"] = models.NIRField{Value: canonicalInput.ProviderHint, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["intended_execution_at"] = models.NIRField{Value: canonicalInput.IntendedExecutionAt, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsJSON, _ := json.Marshal(fieldsMap)

	profileID := "kafka_async_profile"
	if event.SourceSystem != "" {
		profileID = fmt.Sprintf("%s_%s_async_profile", event.TenantID, strings.ToLower(event.SourceSystem))
	}

	profileVersion := "v1"
	if canonicalInput.SchemaVersion != "" {
		profileVersion = canonicalInput.SchemaVersion
	}

	nir := &models.NormalizedIngestRecord{
		NIRID:                   uuid.New(),
		EnvelopeID:              uuid.MustParse(event.EnvelopeID),
		TenantID:                uuid.MustParse(event.TenantID),
		DetectedFormat:          "json",
		ProfileID:               profileID,
		ProfileVersion:          profileVersion,
		FieldsJSON:              fieldsJSON,
		FieldConfidenceSummary:  json.RawMessage(`{"overall": 0.9}`),
		UnmappedJSON:            json.RawMessage(`{}`),
		MappingUncertainFlag:    false,
		RequiredFieldGapCount:   0,
		LowConfidenceFieldCount: 0,
		CreatedAt:               time.Now().UTC(),
	}

	// -------- COMPUTE SCORES & FINGERPRINT --------
	// Reconstruct governance for async flow
	governance := s.ApplyPolicy(nir, canonicalInput)

	bFingerprint := s.computeBeneficiaryFingerprint(tokenMap)
	timeBucket := time.Now().UTC().Format("2006-01-02")
	bIdemKey := s.computeBusinessIdempotencyKey(event.TenantID, bFingerprint, amount, canonicalInput.Amount.Currency, timeBucket)

	// UPDATED: Abnormal amount detection
	var anomalies []string
	if s.isAbnormalAmount(amount, canonicalInput.Amount.Currency) {
		anomalies = append(anomalies, "ABNORMAL_AMOUNT")
	}

	// -------- Business Idempotency Registry Check (NEW) --------
	registryDuplicate, err := s.repo.CheckIdempotencyRegistry(ctx, event.TenantID, bIdemKey)
	if err != nil {
		return nil, err
	}

	dupRisk := false
	dupReason := "NONE"
	var registryEntry *models.BusinessIdempotencyEntry

	if registryDuplicate != nil {
		dupRisk = true
		dupReason = registryDuplicate.DuplicateReasonCode
		if dupReason == "" {
			dupReason = "SAME_BENEFICIARY_AMOUNT_TIME"
		}
	} else {
		// Prepare registry entry
		registryEntry = &models.BusinessIdempotencyEntry{
			TenantID:               uuid.MustParse(event.TenantID),
			BusinessIdempotencyKey: bIdemKey,
			IntentID:               uuid.Nil, // Set below
			BeneficiaryFingerprint: bFingerprint,
			AmountMinor:            amount.Mul(decimal.NewFromInt(100)).IntPart(),
			CurrencyCode:           canonicalInput.Amount.Currency,
			TimeBucket:             timeBucket,
			DuplicateReasonCode:    "NONE",
			CreatedAt:              time.Now().UTC(),
		}
	}

	// Score requires partial intent for signals
	tempIntent := &models.CanonicalIntent{
		BeneficiaryFingerprint: bFingerprint,
		Amount:                 amount,
		Currency:               canonicalInput.Amount.Currency,
		TraceID:                event.TraceID,
		EnvelopeID:             event.EnvelopeID,
		ClientPayoutRef:        canonicalInput.ClientPayoutRef,
		ClientBatchRef:         batchIDStr,
		ProviderHint:           canonicalInput.ProviderHint,
		CreatedAt:              time.Now().UTC(),
		DuplicateRiskFlag:      dupRisk,
		ValidationAnomalies:    anomalies,
	}

	// Update governance with duplicate detection results
	if dupRisk {
		governance.DuplicateDetected = true
		governance.DuplicateReason = dupReason
	}

	mapScore, pScore, mScore, iScore, schemaScore := s.computeScores(tempIntent, nir, governance)
	confidenceScore := s.computeConfidenceScore(iScore)

	idempotencyKey := event.IdempotencyKey
	if idempotencyKey == "" {
		idempotencyKey = canonicalInput.IdempotencyKey
	}

	// FIX: Deterministic Request Fingerprint (Replacing KAFKA_TOKENIZED)
	reqFingerprint := s.computeRequestFingerprint(
		canonicalInput.Beneficiary.Name,
		amount,
		canonicalInput.AccountNumber,
		canonicalInput.Beneficiary.Instrument.VPA,
		canonicalInput.Amount.Currency,
	)

	log.Printf("Fingerprint=%s IdempotencyKey=%s Confidence=%f", reqFingerprint, idempotencyKey, confidenceScore)
	// -------- Build CanonicalIntent --------

	intentID := uuid.NewString()

	if registryEntry != nil {
		registryEntry.IntentID = uuid.MustParse(intentID)
	}

	var executionAt *time.Time
	if canonicalInput.IntendedExecutionAt != "" {
		t, err := time.Parse(time.RFC3339, canonicalInput.IntendedExecutionAt)
		if err == nil {
			executionAt = &t
		}
	}

	intent := models.CanonicalIntent{
		TraceID:        event.TraceID,
		IntentID:       intentID,
		EnvelopeID:     event.EnvelopeID,
		TenantID:       event.TenantID,
		IdempotencyKey: idempotencyKey,

		IntentType:       canonicalInput.IntentType,
		CanonicalVersion: "v1",
		SchemaVersion:    canonicalInput.SchemaVersion,

		Amount:   amount,
		Currency: canonicalInput.Amount.Currency,

		IntendedExecutionAt: executionAt,
		Constraints:         constraintsJSON,

		BeneficiaryType: canonicalInput.Beneficiary.Instrument.Kind,
		PIITokens:       piiJSON,
		Beneficiary:     beneficiaryJSON,

		Status:    "CREATED",
		CreatedAt: time.Now().UTC(),

		ClientPayoutRef:         canonicalInput.ClientPayoutRef,
		ProviderHint:            canonicalInput.ProviderHint,
		ClientBatchRef:          batchIDStr,
		RequestFingerprint:      reqFingerprint,
		RoutingHintsJSON:        json.RawMessage(`{}`),
		GovernanceState:         "PENDING",
		BusinessState:           "NEW",
		DuplicateRiskFlag:       dupRisk,
		MappingProfileID:        nir.ProfileID,
		MappingProfileVersion:   nir.ProfileVersion, // Flowed from async NIR
		SourceSystem:            event.SourceSystem,
		GovernanceHash:          event.Canonical.GovernanceHash,
		BusinessIdempotencyKey:  bIdemKey,
		BeneficiaryFingerprint:  bFingerprint,
		ConfidenceScore:         &confidenceScore,
		ProofReadinessScore:     pScore,
		MatchabilityScore:       mScore,
		IntentQualityScore:      iScore,
		MappingConfidenceScore:  mapScore,
		SchemaCompletenessScore: schemaScore,
		DuplicateReasonCode:     dupReason,

		UpdatedAt:           func(t time.Time) *time.Time { return &t }(time.Now().UTC()),
		BatchID:             event.BatchID,
		ValidationAnomalies: anomalies,
	}

	// -------- AGGREGATE GOVERNANCE REASONS --------
	intent.Governance = governance
	intent.GovernanceReasonCodesJSON = s.aggregateGovernanceReasons(&intent, nir)

	// UPDATED: Determine GovernanceState (VALID / INVALID / FLAGGED)
	intent.GovernanceState = "VALID"
	if intent.DuplicateRiskFlag || len(intent.ValidationAnomalies) > 0 {
		intent.GovernanceState = "FLAGGED"
	}
	if nir.MappingUncertainFlag || nir.RequiredFieldGapCount > 0 {
		intent.GovernanceState = "FLAGGED"
	}
	if iScore < 0.5 {
		intent.GovernanceState = "FLAGGED"
	}

	// FIX: Compute deterministic governance_hash (UPDATED)
	intent.GovernanceHash = s.computeGovernanceHash(&intent)

	payload, err := json.Marshal(intent)
	if err != nil {
		return nil, err
	}

	outbox, err := CanonicalIntentToOutboxEvent(intent, payload, "intent.created.v1")
	if err != nil {
		return nil, err
	}

	saved, err := s.repo.Save(ctx, nir, intent, outbox, registryEntry)
	if err != nil {
		return nil, err
	}
	version := 1

	prevHash, err := s.repo.GetPreviousTenantCanonicalHash(
		ctx,
		saved.TenantID,
		saved.IntentID,
	)
	if err != nil {
		return nil, err
	}

	canonicalBytes, err := json.Marshal(saved)
	if err != nil {
		return nil, err
	}

	canonicalRef, hash, err := s.s3.StoreSnapshot(
		ctx,
		"canonical",
		saved.TenantID,
		saved.IntentID,
		version,
		canonicalBytes,
		prevHash,
	)
	if err != nil {
		return nil, err
	}

	nirBytes, _ := json.Marshal(nir)
	nirRef, _, err := s.s3.StoreSnapshot(
		ctx,
		"nir",
		saved.TenantID,
		saved.IntentID,
		version,
		nirBytes,
		"",
	)
	if err != nil {
		return nil, err
	}

	govBytes := []byte(`{"state":"` + intent.GovernanceState + `"}`)
	govRef, _, err := s.s3.StoreSnapshot(
		ctx,
		"governance",
		saved.TenantID,
		saved.IntentID,
		version,
		govBytes,
		"",
	)
	if err != nil {
		return nil, err
	}

	err = s.repo.UpdateSnapshotRefs(
		ctx,
		saved.IntentID,
		canonicalRef,
		nirRef,
		govRef,
		hash,
		prevHash,
	)

	saved.CanonicalSnapshotRef = canonicalRef
	saved.NIRSnapshotRef = nirRef
	saved.GovernanceSnapshotRef = govRef
	saved.CanonicalHash = hash

	if event.BatchID != nil && *event.BatchID != "" {
		_, err, _ := batchAggregateGroup.Do(*event.BatchID, func() (interface{}, error) {
			return s.repo.UpdateBatchAggregateConfidence(context.Background(), *event.BatchID)
		})
		if err != nil {
			log.Printf("⚠️ Failed to update batch aggregate confidence for batch=%s: %v", *event.BatchID, err)
		}
	}

	return &saved, nil
}

/* ---------------- WEBHOOK ---------------- */

func (s *IntentService) processWebhook(
	ctx context.Context,
	in *models.IncomingIntent,
) (*models.CanonicalIntent, *models.DLQEntry, error) {

	canonical := models.CanonicalIntent{
		TraceID:        in.TraceID.String(),
		IntentID:       uuid.NewString(),
		EnvelopeID:     in.EnvelopeID.String(),
		TenantID:       in.TenantID.String(),
		IdempotencyKey: in.IdempotencyKey,
		SalientHash:    "NA",
		IntentType:     "WEBHOOK",
		SchemaVersion:  "v1",
		Amount:         decimal.Zero,
		Currency:       "XXX",
		Status:         "CREATED",
		CreatedAt:      time.Now().UTC(),

		IntendedExecutionAt: nil,
		Constraints:         json.RawMessage("{}"),
		PIITokens:           json.RawMessage("{}"),
		Beneficiary:         json.RawMessage("{}"),

		ClientPayoutRef:       in.IdempotencyKey, // Fallback to idempotency key for webhooks if ref is missing
		RequestFingerprint:    in.IdempotencyKey,
		RoutingHintsJSON:      json.RawMessage(`{}`),
		GovernanceState:       "WEBHOOK",
		BusinessState:         "NEW",
		DuplicateRiskFlag:     false,
		MappingProfileID:      "WEBHOOK_PROFILE",
		MappingProfileVersion: "WEBHOOK",
		UpdatedAt:             func(t time.Time) *time.Time { return &t }(time.Now().UTC()),
	}

	payload := []byte("{}")

	outbox := models.OutboxEvent{
		TraceID:       canonical.TraceID,
		EnvelopeID:    canonical.EnvelopeID,
		TenantID:      canonical.TenantID,
		BatchID:       canonical.BatchID,
		AggregateType: "intent",
		AggregateID:   uuid.MustParse(canonical.IntentID),
		EventType:     "WEBHOOK_RECEIVED",
		Payload:       payload,
		Status:        "PENDING",
		CreatedAt:     time.Now(),
	}

	saved, err := s.repo.Save(ctx, nil, canonical, outbox, nil)
	if err != nil {
		return nil, nil, err
	}

	return &saved, nil, nil
}

func (s *IntentService) aggregateGovernanceReasons(intent *models.CanonicalIntent, nir *models.NormalizedIngestRecord) json.RawMessage {
	// UPDATED: Marshal the full Governance struct instead of manual aggregation
	res, _ := json.Marshal(intent.Governance)
	return res
}

// FIX: New deterministic governance_hash computation (NEW)
func (s *IntentService) computeGovernanceHash(intent *models.CanonicalIntent) string {
	return s.computeGovernanceHashInternal(intent.GovernanceState, string(intent.GovernanceReasonCodesJSON), "v1", intent.IntentID)
}

func (s *IntentService) computeGovernanceHashInternal(state, reasonsJSON, version, intentID string) string {
	// Construct input: governanceState + "|" + normalizedGovernanceJSON + "|" + policyVersion + "|" + intentID
	hashInput := state + "|" +
		reasonsJSON + "|" +
		version + "|" +
		intentID

	hashBytes := sha256.Sum256([]byte(hashInput))
	return hex.EncodeToString(hashBytes[:])
}

func canonicalPathToFieldName(path string) string {
	// "amount.value" → "amount", "beneficiary.name" → "beneficiary_name"
	parts := strings.Split(path, ".")
	if len(parts) == 1 {
		return path
	}
	return strings.Join(parts[:len(parts)-1], "_")
}
