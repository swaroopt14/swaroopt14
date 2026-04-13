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

	"zord-intent-engine/internal/canonicalizer"
	"zord-intent-engine/internal/models"

	// "zord-intent-engine/internal/pii"
	"zord-intent-engine/internal/guards"
	"zord-intent-engine/internal/validator"
	"zord-intent-engine/internal/vault"
	"zord-intent-engine/storage"

	"github.com/shopspring/decimal"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

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
		return nil, fmt.Errorf("enclave tokenize failed: status=%d body=%s", resp.StatusCode, string(raw))
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

func (s *IntentService) computeBusinessIdempotencyKey(tenantID string, fingerPrint string, amount decimal.Decimal, currency string, timeBucket string) string {
	// FIX: deterministic business idempotency key
	// business_idempotency_key = SHA256(tenant_id + beneficiary_fingerprint + amount_minor + currency + time_bucket)

	// Normalize amount to string (fixed precision)
	amountStr := amount.String()

	raw := tenantID + fingerPrint + amountStr + strings.ToUpper(currency) + timeBucket
	hash := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(hash[:])
}

func (s *IntentService) computeScores(
	intent *models.CanonicalIntent,
	nir *models.NormalizedIngestRecord,
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

	if intent.DuplicateRiskFlag {
		qualityScore -= 0.3
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
		return nil, &models.DLQEntry{ReasonCode: "PAYLOAD_DECRYPTION_FAILED"}, nil
	}

	// -------- STEP 4: Recompute SHA256(raw_bytes) and compare --------
	rawHash := sha256.Sum256(decryptedPayload)
	if len(in.PayloadHash) == 0 {
		log.Printf("⚠️ Missing raw payload hash for EnvelopeID=%s", in.EnvelopeID)
		return nil, &models.DLQEntry{ReasonCode: "MISSING_RAW_PAYLOAD_HASH"}, nil
	}

	if len(in.PayloadHash) != sha256.Size {
		log.Printf("⚠️ Invalid raw payload hash length for EnvelopeID=%s", in.EnvelopeID)
		return nil, &models.DLQEntry{ReasonCode: "INVALID_RAW_PAYLOAD_HASH_LENGTH"}, nil
	}
	if len(in.PayloadHash) > 0 && !bytes.Equal(rawHash[:], in.PayloadHash) {
		log.Printf("⚠️ Raw payload hash mismatch for EnvelopeID=%s", in.EnvelopeID)
		return nil, &models.DLQEntry{ReasonCode: "RAW_PAYLOAD_INTEGRITY_FAILED"}, nil
	}

	var parsed models.ParsedIncomingIntent
	if err := json.Unmarshal(decryptedPayload, &parsed); err != nil {
		return nil, &models.DLQEntry{
			ReasonCode: "INVALID_JSON_PAYLOAD",
		}, nil
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

	fieldsJSON, _ := json.Marshal(fieldsMap)

	profileID := "generic_json_profile"
	if in.SourceSystem != "" {
		profileID = strings.ToLower(in.SourceSystem) + "_json_profile"
	}

	nir := &models.NormalizedIngestRecord{
		NIRID:                   uuid.New(),
		EnvelopeID:              in.EnvelopeID,
		TenantID:                in.TenantID,
		DetectedFormat:          "json",
		ProfileID:               profileID,
		ProfileVersion:          "v1",
		FieldsJSON:              fieldsJSON,
		FieldConfidenceSummary:  json.RawMessage(`{"overall": 1.0}`),
		UnmappedJSON:            json.RawMessage(`{}`),
		MappingUncertainFlag:    false,
		RequiredFieldGapCount:   gapCount,
		LowConfidenceFieldCount: lowConfCount,
		CreatedAt:               time.Now().UTC(),
	}

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

	intent, dlq, err := s.validator.ValidateParsed(
		ctx,
		in.TenantID.String(),
		in.EnvelopeID.String(),
		parsed,
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

	// Score requires partial intent for signals
	tempIntent := &models.CanonicalIntent{
		BeneficiaryFingerprint: bFingerprint,
		Amount:                 amount,
		Currency:               canonicalInput.Amount.Currency,
		TraceID:                in.TraceID.String(),
		EnvelopeID:             in.EnvelopeID.String(),
		ClientPayoutRef:        canonicalInput.IdempotencyKey, // Map from incoming idempotency if applicable
		ClientBatchRef:         canonicalInput.ClientBatchRef,
		CreatedAt:              time.Now().UTC(),
		DuplicateRiskFlag:      dupRisk,
	}
	mapScore, pScore, mScore, iScore, schemaScore := s.computeScores(tempIntent, nir)

	// -------- STEP 9: BUILD CANONICAL INTENT --------

	intentID := uuid.NewString()

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

		Constraints: constraintsJSON,

		BeneficiaryType: canonicalInput.Beneficiary.Instrument.Kind,
		PIITokens:       piiJSON,
		Beneficiary:     beneficiaryJSON,

		Status:    "CREATED",
		CreatedAt: time.Now().UTC(),

		ClientPayoutRef:       "NA",
		RequestFingerprint:    in.IdempotencyKey,
		RoutingHintsJSON:      json.RawMessage(`{}`),
		GovernanceState:       "PENDING",
		BusinessState:         "NEW",
		DuplicateRiskFlag:     dupRisk,
		MappingProfileID:      nir.ProfileID,
		MappingProfileVersion: nir.ProfileVersion,
		SourceSystem:          in.SourceSystem,

		// Service 2 fields
		BusinessIdempotencyKey:  bIdemKey,
		BeneficiaryFingerprint:  bFingerprint,
		ProofReadinessScore:     pScore,
		MatchabilityScore:       mScore,
		IntentQualityScore:      iScore,
		MappingConfidenceScore:  mapScore,
		SchemaCompletenessScore: schemaScore,
		DuplicateReasonCode:     dupReason,

		UpdatedAt: func(t time.Time) *time.Time { return &t }(time.Now().UTC()),
	}

	// -------- STEP 9.1: AGGREGATE GOVERNANCE REASONS --------
	canonical.GovernanceReasonCodesJSON = s.aggregateGovernanceReasons(&canonical, nir)

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

	canonicalRef, hash, _ := s.s3.StoreSnapshot(
		ctx,
		"canonical",
		saved.TenantID,
		saved.IntentID,
		version,
		canonicalBytes,
		prevHash,
	)

	var nirRef string
	nirBytes, _ := json.Marshal(nir)
	nirRef, _, _ = s.s3.StoreSnapshot(ctx, "nir", saved.TenantID, saved.IntentID, version, nirBytes, "")

	govBytes := []byte(`{"state":"` + canonical.GovernanceState + `"}`)
	govRef, _, _ := s.s3.StoreSnapshot(ctx, "governance", saved.TenantID, saved.IntentID, version, govBytes, "")

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

	// -------- Build NIR (Reconstructed for async flow) --------
	fieldsMap := make(map[string]models.NIRField)
	fieldsMap["intent_type"] = models.NIRField{Value: canonicalInput.IntentType, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["amount"] = models.NIRField{Value: canonicalInput.Amount.Value, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["currency"] = models.NIRField{Value: canonicalInput.Amount.Currency, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["beneficiary_name"] = models.NIRField{Value: canonicalInput.Beneficiary.Name, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsMap["client_batch_ref"] = models.NIRField{Value: canonicalInput.ClientBatchRef, SourcePath: "KAFKA_RECONSTRUCTED", ConfidenceScore: 1.0, SensitiveFlag: false, TransformApplied: "NONE", ExtractionNotes: ""}
	fieldsJSON, _ := json.Marshal(fieldsMap)

	profileID := "kafka_async_profile"
	if event.SourceSystem != "" {
		profileID = strings.ToLower(event.SourceSystem) + "_async_profile"
	}

	nir := &models.NormalizedIngestRecord{
		NIRID:                  uuid.New(),
		EnvelopeID:             uuid.MustParse(event.EnvelopeID),
		TenantID:               uuid.MustParse(event.TenantID),
		DetectedFormat:         "json",
		ProfileID:              profileID,
		ProfileVersion:         "v1",
		FieldsJSON:             fieldsJSON,
		FieldConfidenceSummary: json.RawMessage(`{"overall": 0.9}`),
		CreatedAt:              time.Now().UTC(),
	}

	// -------- COMPUTE SCORES & FINGERPRINT --------
	bFingerprint := s.computeBeneficiaryFingerprint(tokenMap)
	timeBucket := time.Now().UTC().Format("2006-01-02")
	bIdemKey := s.computeBusinessIdempotencyKey(event.TenantID, bFingerprint, amount, canonicalInput.Amount.Currency, timeBucket)

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
		ClientPayoutRef:        "KAFKA_ASYNCHRONOUS",
		ClientBatchRef:         canonicalInput.ClientBatchRef,
		CreatedAt:              time.Now().UTC(),
		DuplicateRiskFlag:      dupRisk,
	}
	mapScore, pScore, mScore, iScore, schemaScore := s.computeScores(tempIntent, nir)

	// -------- Build CanonicalIntent --------

	intentID := uuid.NewString()

	if registryEntry != nil {
		registryEntry.IntentID = uuid.MustParse(intentID)
	}

	intent := models.CanonicalIntent{
		TraceID:    event.TraceID,
		IntentID:   intentID,
		EnvelopeID: event.EnvelopeID,
		TenantID:   event.TenantID,

		IntentType:       canonicalInput.IntentType,
		CanonicalVersion: "v1",
		SchemaVersion:    canonicalInput.SchemaVersion,

		Amount:   amount,
		Currency: canonicalInput.Amount.Currency,

		Constraints: constraintsJSON,

		BeneficiaryType: canonicalInput.Beneficiary.Instrument.Kind,
		PIITokens:       piiJSON,
		Beneficiary:     beneficiaryJSON,

		Status:    "CREATED",
		CreatedAt: time.Now().UTC(),

		ClientPayoutRef:       "NA",
		RequestFingerprint:    "KAFKA_TOKENIZED",
		RoutingHintsJSON:      json.RawMessage(`{}`),
		GovernanceState:       "PENDING",
		BusinessState:         "NEW",
		DuplicateRiskFlag:     dupRisk,
		MappingProfileID:      nir.ProfileID,
		MappingProfileVersion: nir.ProfileVersion, // Flowed from async NIR
		SourceSystem:          event.SourceSystem,

		// Service 2 fields
		BusinessIdempotencyKey:  bIdemKey,
		BeneficiaryFingerprint:  bFingerprint,
		ProofReadinessScore:     pScore,
		MatchabilityScore:       mScore,
		IntentQualityScore:      iScore,
		MappingConfidenceScore:  mapScore,
		SchemaCompletenessScore: schemaScore,
		DuplicateReasonCode:     dupReason,

		UpdatedAt: func(t time.Time) *time.Time { return &t }(time.Now().UTC()),
	}

	// -------- AGGREGATE GOVERNANCE REASONS --------
	intent.GovernanceReasonCodesJSON = s.aggregateGovernanceReasons(&intent, nir)

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

		Constraints: json.RawMessage("{}"),
		PIITokens:   json.RawMessage("{}"),
		Beneficiary: json.RawMessage("{}"),

		ClientPayoutRef:       "NA",
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
	var reasons []map[string]any

	if intent.DuplicateRiskFlag {
		reasons = append(reasons, map[string]any{
			"module":   "DUPLICATE_DETECTION",
			"code":     intent.DuplicateReasonCode,
			"severity": "WARNING",
		})
	}

	if nir != nil {
		if nir.MappingUncertainFlag {
			reasons = append(reasons, map[string]any{
				"module":   "NIR_MAPPING",
				"code":     "MAPPING_UNCERTAIN",
				"severity": "WARNING",
			})
		}
		if nir.LowConfidenceFieldCount > 0 {
			reasons = append(reasons, map[string]any{
				"module":   "NIR_MAPPING",
				"code":     "LOW_CONFIDENCE_FIELDS",
				"count":    nir.LowConfidenceFieldCount,
				"severity": "INFO",
			})
		}
		if nir.RequiredFieldGapCount > 0 {
			reasons = append(reasons, map[string]any{
				"module":   "NIR_MAPPING",
				"code":     "REQUIRED_FIELD_GAPS",
				"count":    nir.RequiredFieldGapCount,
				"severity": "WARNING",
			})
		}
	}

	if len(reasons) == 0 {
		return json.RawMessage("[]")
	}

	res, _ := json.Marshal(reasons)
	return res
}
