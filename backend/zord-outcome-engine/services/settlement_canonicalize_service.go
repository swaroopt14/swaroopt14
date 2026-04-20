package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
)

// SettlementCanonicalizeService converts parsed results into normalized canonical observations.
type SettlementCanonicalizeService struct{}

// RunForJob executes the canonicalization pipeline for a specific ingest job.
// profile is passed so the canonical observations record the correct mapping profile.
// 1. Load all raw parsed rows from the DB.
// 2. Transform each row into a normalized 'Canonical Observation'.
// 3. Compute quality and readiness scores for downstream matching.
// 4. Group observations into batches (e.g. by Razorpay settlement_id).
// 5. Persist everything and trigger the outbox event emission.
func (s *SettlementCanonicalizeService) RunForJob(ctx context.Context, jobID uuid.UUID, tenantID uuid.UUID, profile models.MappingProfile) error {
	log.Printf("settlement.canonicalize.start job_id=%s", jobID)

	// 1. Load all parsed rows for this job.
	rows, err := db.DB.QueryContext(ctx, `
		SELECT 
			parsed_row_id, settlement_envelope_id, source_file_ref, source_row_ref,
			parsed_candidates_json, parse_confidence, parse_warnings_json
		FROM settlement_parsed_rows
		WHERE job_id = $1 AND tenant_id = $2
		ORDER BY source_row_ref::int`,
		jobID, tenantID,
	)
	if err != nil {
		return fmt.Errorf("canonicalize: query failed: %w", err)
	}
	defer rows.Close()

	var (
		observations       []models.CanonicalSettlementObservation
		canonicalized      int
		canonicalizeFailed int
	)

	// Grouping for batch context.
	batchGroups := make(map[string][]models.CanonicalSettlementObservation)

	for rows.Next() {
		var (
			parsedRowID     uuid.UUID
			envelopeID      uuid.UUID
			sourceFileRef   string
			sourceRowRef    string
			shapeJSON       []byte
			parseConfidence float64
			warningsJSON    []byte
		)

		if err := rows.Scan(&parsedRowID, &envelopeID, &sourceFileRef, &sourceRowRef, &shapeJSON, &parseConfidence, &warningsJSON); err != nil {
			log.Printf("settlement.canonicalize.scan_error job_id=%s err=%v", jobID, err)
			continue
		}

		// Unmarshal the shape into UniversalSettlementShape.
		var shape models.UniversalSettlementShape
		if err := json.Unmarshal(shapeJSON, &shape); err != nil {
			log.Printf("settlement.canonicalize.unmarshal_failed job_id=%s row=%s", jobID, sourceRowRef)
			svc := &SettlementIngestService{}
			_ = svc.PersistParseError(ctx, tenantID, jobID, envelopeID, sourceRowRef, "CANONICALIZATION", "SHAPE_UNMARSHAL_FAILED", profile)
			canonicalizeFailed++
			continue
		}

		// 2. Build canonical observation.
		obs := buildCanonicalObservation(tenantID, jobID, parsedRowID, envelopeID, shape, parseConfidence, profile)

		// 3. Insert into Postgres.
		_, err = db.DB.ExecContext(ctx, `
			INSERT INTO canonical_settlement_observations (
				settlement_observation_id, tenant_id, trace_id,
				settlement_envelope_id, job_id,
				source_file_ref, source_row_ref, source_system,
				observation_kind, source_strength_class,
				client_reference_candidate, provider_reference, bank_reference,
				external_reference, batch_reference,
				beneficiary_fingerprint,
				amount_minor, settled_amount_minor, fee_amount_minor, deduction_amount_minor,
				currency_code, settlement_status,
				retry_flag, reversal_flag, return_flag,
				observation_timestamp, value_date,
				provider_ref_status,
				mapping_profile_id, mapping_profile_version,
				parse_confidence, mapping_confidence,
				carrier_richness_score, attachment_readiness_score,
				canonical_hash,
				created_at, updated_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
				$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
				$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
				$31,$32,$33,$34,$35,$36,$37
			) ON CONFLICT (settlement_observation_id) DO NOTHING`,
			obs.SettlementObservationID, obs.TenantID, obs.TraceID,
			obs.SettlementEnvelopeID, obs.JobID,
			obs.SourceFileRef, obs.SourceRowRef, obs.SourceSystem,
			obs.ObservationKind, obs.SourceStrengthClass,
			obs.ClientReferenceCandidate, obs.ProviderReference, obs.BankReference,
			obs.ExternalReference, obs.BatchReference,
			obs.BeneficiaryFingerprint,
			obs.AmountMinor, obs.SettledAmountMinor, obs.FeeAmountMinor, obs.DeductionAmountMinor,
			obs.CurrencyCode, obs.SettlementStatus,
			obs.RetryFlag, obs.ReversalFlag, obs.ReturnFlag,
			obs.ObservationTimestamp, obs.ValueDate,
			obs.ProviderRefStatus,
			obs.MappingProfileID, obs.MappingProfileVersion,
			obs.ParseConfidence, obs.MappingConfidence,
			obs.CarrierRichnessScore, obs.AttachmentReadinessScore,
			obs.CanonicalHash,
			obs.CreatedAt, obs.UpdatedAt,
		)

		if err != nil {
			log.Printf("settlement.canonicalize.insert_failed job_id=%s row=%s err=%v", jobID, sourceRowRef, err)
			svc := &SettlementIngestService{}
			_ = svc.PersistParseError(ctx, tenantID, jobID, envelopeID, sourceRowRef, "CANONICALIZATION", "INSERT_FAILED", profile)
			canonicalizeFailed++
			continue
		}

		canonicalized++
		observations = append(observations, obs)

		// Group valid observations for batch-level summary.
		batchRef := safeDeref(obs.BatchReference)
		if batchRef == "" {
			batchRef = "unknown"
		}
		batchGroups[batchRef] = append(batchGroups[batchRef], obs)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("canonicalize: cursor iteration error: %w", err)
	}

	// ── STEP 4: BATCH AGGREGATION ──────────────────────────────────────────
	// We group the successfully processed observations by their BatchReference 
	// (e.g. settlement_id) to provide a summary view in canonical_settlement_batches.
	for batchRefKey, group := range batchGroups {
		if len(group) == 0 {
			continue
		}

		var (
			sourceBatchRef *string
		)
		if batchRefKey != "unknown" {
			sourceBatchRef = strPtr(batchRefKey)
		}

		var (
			totalAmount        int64
			totalSettledAmount int64
			successCount       int
			reversalCount      int
			parseConfSum       float64
			attachScoreSum     float64
		)

		for _, o := range group {
			totalAmount += o.AmountMinor
			if o.SettledAmountMinor != nil {
				totalSettledAmount += *o.SettledAmountMinor
			}
			if o.ReversalFlag {
				reversalCount++
			} else {
				successCount++
			}
			parseConfSum += o.ParseConfidence
			attachScoreSum += o.AttachmentReadinessScore
		}

		batchID := uuid.New()
		firstObs := group[0]

		_, err = db.DB.ExecContext(ctx, `
			INSERT INTO canonical_settlement_batches (
				settlement_batch_id, tenant_id, job_id,
				source_file_ref, source_system,
				source_batch_ref, artifact_family,
				row_count, success_count_estimate, failed_count_estimate,
				pending_count_estimate, reversal_count_estimate,
				total_amount_minor, total_settled_amount_minor,
				currency_code,
				parse_confidence_overall, attachment_readiness_overall,
				created_at, updated_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
			) ON CONFLICT (job_id, source_batch_ref) DO UPDATE SET
				row_count = EXCLUDED.row_count,
				success_count_estimate = EXCLUDED.success_count_estimate,
				reversal_count_estimate = EXCLUDED.reversal_count_estimate,
				total_amount_minor = EXCLUDED.total_amount_minor,
				total_settled_amount_minor = EXCLUDED.total_settled_amount_minor,
				parse_confidence_overall = EXCLUDED.parse_confidence_overall,
				attachment_readiness_overall = EXCLUDED.attachment_readiness_overall,
				updated_at = EXCLUDED.updated_at`,
			batchID, tenantID, jobID,
			firstObs.SourceFileRef, firstObs.SourceSystem,
			sourceBatchRef, profile.ArtifactFamily,
			len(group), successCount, 0,
			0, reversalCount,
			totalAmount, totalSettledAmount,
			firstObs.CurrencyCode,
			parseConfSum/float64(len(group)), attachScoreSum/float64(len(group)),
			time.Now().UTC(), time.Now().UTC(),
		)
		if err != nil {
			log.Printf("settlement.canonicalize.batch_upsert_failed job_id=%s batch=%s err=%v", jobID, batchRefKey, err)
		}
	}

	// 5. Update job with canonicalization counts.
	_, _ = db.DB.ExecContext(ctx, `
		UPDATE settlement_ingest_jobs
		SET row_count_canonicalized = $1
		WHERE job_id = $2`,
		canonicalized, jobID,
	)

	log.Printf("settlement.canonicalize.done job_id=%s canonicalized=%d failed=%d", jobID, canonicalized, canonicalizeFailed)

	// 6. Trigger outbox events.
	outboxSvc := &SettlementOutboxService{}
	return outboxSvc.EmitForJob(ctx, jobID, tenantID, observations)
}

// buildCanonicalObservation maps the raw UniversalSettlementShape to a CanonicalSettlementObservation.
// profile provides the mapping_profile_id and version stored on the observation,
// ensuring each canonical record is traceable to the exact parser version that produced it.
func buildCanonicalObservation(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	parsedRowID uuid.UUID,
	envelopeID uuid.UUID,
	shape models.UniversalSettlementShape,
	parseConfidence float64,
	profile models.MappingProfile, // NEW
) models.CanonicalSettlementObservation {
	obs := models.CanonicalSettlementObservation{
		SettlementObservationID:  uuid.New(),
		TenantID:                 tenantID,
		TraceID:                  uuid.New(),
		SettlementEnvelopeID:     envelopeID,
		JobID:                    jobID,
		SourceFileRef:            shape.SourceFileRef,
		SourceRowRef:             shape.SourceRowRef,
		SourceSystem:             shape.SourceSystem,
		ObservationKind:          shape.ObservationKind,
		SourceStrengthClass:      shape.SourceStrengthClass,
		ClientReferenceCandidate: shape.ClientReferenceCandidate,
		ProviderReference:        shape.ProviderReference,
		BankReference:            shape.BankReference,
		ExternalReference:        shape.ExternalReference,
		BatchReference:           shape.BatchReference,
		BeneficiaryFingerprint:   computeBeneficiaryFingerprint(shape),
		AmountMinor:              shape.AmountMinor,
		SettledAmountMinor:       shape.SettledAmountMinor,
		FeeAmountMinor:           shape.FeeAmountMinor,
		DeductionAmountMinor:     shape.DeductionAmountMinor,
		CurrencyCode:             shape.CurrencyCode,
		SettlementStatus:         shape.StatusCandidate,
		RetryFlag:                shape.RetryFlag,
		ReversalFlag:             shape.ReversalFlag,
		ReturnFlag:               shape.ReturnFlag,
		ObservationTimestamp:     shape.ObservationTimestamp,
		ValueDate:                shape.ValueDate,
		ProviderRefStatus:        computeProviderRefStatus(shape),
		MappingProfileID:         profile.ProfileID,
		MappingProfileVersion:    profile.ProfileVersion,
		ParseConfidence:          parseConfidence,
		MappingConfidence:        computeMappingConfidence(shape),
		CarrierRichnessScore:     computeCarrierRichnessScore(shape),
		AttachmentReadinessScore: computeAttachmentReadinessScore(shape),
		CreatedAt:                time.Now().UTC(),
		UpdatedAt:                time.Now().UTC(),
	}
	obs.CanonicalHash = computeCanonicalHash(tenantID, obs.SettlementObservationID, shape)
	return obs
}

func computeBeneficiaryFingerprint(shape models.UniversalSettlementShape) string {
	parts := []string{
		shape.SourceSystem,
		safeDeref(shape.ProviderReference),
		safeDeref(shape.BatchReference),
	}
	combined := strings.Join(parts, "|")
	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:])
}

func safeDeref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func computeProviderRefStatus(shape models.UniversalSettlementShape) string {
	if shape.BankReference != nil && *shape.BankReference != "" {
		return "OBSERVED"
	}
	return "MISSING"
}

func computeMappingConfidence(shape models.UniversalSettlementShape) float64 {
	score := 1.0
	if shape.ProviderReference == nil {
		score -= 0.15
	}
	if shape.BankReference == nil {
		score -= 0.20
	}
	if shape.CurrencyCode == "" {
		score -= 0.15
	}
	if shape.AmountMinor == 0 {
		score -= 0.10
	}
	if shape.ObservationKind == "" {
		score -= 0.10
	}
	if score < 0 {
		score = 0
	}
	return score
}

func computeCarrierRichnessScore(shape models.UniversalSettlementShape) float64 {
	count := 0
	if shape.ProviderReference != nil {
		count++
	}
	if shape.BankReference != nil {
		count++
	}
	if shape.ExternalReference != nil {
		count++
	}
	if shape.ClientReferenceCandidate != nil {
		count++
	}
	if shape.BatchReference != nil {
		count++
	}
	if shape.AmountMinor > 0 {
		count++
	}
	return float64(count) / 6.0
}

func computeAttachmentReadinessScore(shape models.UniversalSettlementShape) float64 {
	score := 0.0
	if shape.BankReference != nil {
		score += 0.30
	}
	if shape.ProviderReference != nil {
		score += 0.25
	}
	if shape.ExternalReference != nil {
		score += 0.15
	}
	if shape.AmountMinor > 0 && shape.CurrencyCode != "" {
		score += 0.15
	}
	if !shape.ObservationTimestamp.IsZero() {
		score += 0.10
	}
	if shape.BatchReference != nil {
		score += 0.05
	}
	return score
}

func computeCanonicalHash(tenantID uuid.UUID, obsID uuid.UUID, shape models.UniversalSettlementShape) string {
	parts := []string{
		tenantID.String(),
		obsID.String(),
		fmt.Sprintf("%d", shape.AmountMinor),
		shape.CurrencyCode,
		safeDeref(shape.BankReference),
		shape.ObservationTimestamp.UTC().Format(time.RFC3339),
	}
	combined := strings.Join(parts, "|")
	hash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(hash[:])
}
