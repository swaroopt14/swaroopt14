package services

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT ENGINE
//
// Orchestrates the full intent-to-settlement attachment pipeline:
//   Step 1  Receive attachment work (batch or single observation)
//   Step 2  Load matching ruleset
//   Step 3  Build candidate intent set per observation
//   Step 4  Score every candidate (deterministic, versioned)
//   Step 5  Select decision type
//   Step 6  Compute variance for attached pairs
//   Step 7  Persist all outputs transactionally (job / candidates / decision / variance / batch summary / outbox)
//   Step 8  Emit downstream events
//
// Hard invariants (from spec):
//   • NEVER declare finality on an ambiguously correlated outcome
//   • Attachment truth ≠ finality truth
//   • Every decision must be replayable (full candidate set preserved)
//   • No plaintext PII — only tokens, hashes, fingerprints
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"time"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

// AttachmentEngine is the main service struct for Service 5C.
type AttachmentEngine struct{}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────────

// RunForBatch triggers an attachment job for all canonical settlement observations
// that belong to a given settlement batch reference.
func (e *AttachmentEngine) RunForBatch(
	ctx context.Context,
	tenantID uuid.UUID,
	batchRef string,
) (*models.AttachmentJob, error) {
	log.Printf("attachment.engine.start scope=SETTLEMENT_BATCH tenant=%s batch_ref=%s", tenantID, batchRef)

	// Load observations for this batch.
	observations, err := loadObservationsByBatch(ctx, tenantID, batchRef)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForBatch: load observations: %w", err)
	}
	if len(observations) == 0 {
		return nil, fmt.Errorf("attachment.RunForBatch: no observations found for batch_ref=%s", batchRef)
	}

	return e.runAttachment(ctx, tenantID, models.JobScopeSettlementBatch, batchRef, observations)
}

// RunForSingleObservation triggers an attachment job for one specific observation.
func (e *AttachmentEngine) RunForSingleObservation(
	ctx context.Context,
	tenantID uuid.UUID,
	observationID uuid.UUID,
) (*models.AttachmentJob, error) {
	log.Printf("attachment.engine.start scope=SINGLE_OBSERVATION tenant=%s obs=%s", tenantID, observationID)

	obs, err := loadObservationByID(ctx, tenantID, observationID)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForSingleObservation: %w", err)
	}

	return e.runAttachment(ctx, tenantID, models.JobScopeSingleObservation, observationID.String(), []models.CanonicalSettlementObservation{*obs})
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

func (e *AttachmentEngine) runAttachment(
	ctx context.Context,
	tenantID uuid.UUID,
	scopeType string,
	scopeRef string,
	observations []models.CanonicalSettlementObservation,
) (*models.AttachmentJob, error) {

	// ── Step 2: Load matching ruleset ─────────────────────────────────────
	profile, err := loadRuleProfile(ctx, tenantID)
	if err != nil {
		// Non-fatal: fall back to defaults if no profile is configured yet.
		log.Printf("attachment.engine.no_profile tenant=%s err=%v — using defaults", tenantID, err)
		profile = defaultRuleProfile(tenantID)
	}

	// ── Step 1 (continued): Register attachment job ───────────────────────
	job := &models.AttachmentJob{
		AttachmentJobID:        uuid.New(),
		TenantID:               tenantID,
		JobScopeType:           scopeType,
		ScopeRef:               scopeRef,
		MatchingRulesetVersion: RulesetVersion,
		Status:                 "RUNNING",
		CreatedAt:              time.Now().UTC(),
	}
	now := time.Now().UTC()
	job.StartedAt = &now

	if err := insertAttachmentJob(ctx, job); err != nil {
		return nil, fmt.Errorf("attachment.engine: insert job: %w", err)
	}

	// ── Steps 3-7: Process each observation ──────────────────────────────
	var (
		allDecisions  []models.AttachmentDecision
		allVariances  []models.VarianceRecord
		allCandidates []models.AttachmentCandidate
	)

	counters := struct {
		exact, high, ambiguous, unresolved, conflicted int
	}{}

	for _, obs := range observations {

		// Step 3: Build candidate intent set.
		intents, err := findCandidateIntents(ctx, tenantID, obs)
		if err != nil {
			log.Printf("attachment.engine.candidate_lookup_failed obs=%s err=%v", obs.SettlementObservationID, err)
			// Record as unresolved — do not drop silently.
			decision := buildUnresolvedDecision(tenantID, obs.SettlementObservationID, job.AttachmentJobID, "CANDIDATE_LOOKUP_FAILED")
			allDecisions = append(allDecisions, decision)
			counters.unresolved++
			continue
		}

		// Step 4: Score every candidate.
		var scored []CandidateScore
		for _, intent := range intents {
			cs := ScoreCandidate(obs, intent, profile)
			cs.IntentID = intent.IntentID
			scored = append(scored, cs)
		}

		// Sort descending by total score.
		sort.Slice(scored, func(i, j int) bool {
			return scored[i].Total > scored[j].Total
		})

		// Build candidate rows for persistence (full set, not just winner).
		candidates := buildCandidateRows(tenantID, job.AttachmentJobID, obs.SettlementObservationID, scored, intents)
		allCandidates = append(allCandidates, candidates...)

		// Step 5: Select decision type.
		decisionType, reasonCode := SelectDecisionType(scored, profile)
		ambiguityScore := ComputeAmbiguityScore(scored, decisionType)

		var (
			winnerIntentID *uuid.UUID
			winningScore   float64
			runnerUpScore  *float64
			scoreMargin    *float64
			confScore      float64
		)

		if len(scored) > 0 {
			topID := scored[0].IntentID.(uuid.UUID)
			winnerIntentID = &topID
			winningScore = scored[0].Total
			confScore = ComputeConfidenceScore(scored[0], decisionType)
		}

		// For AMBIGUOUS / CONFLICTED decisions — do NOT set winnerIntentID.
		if decisionType == models.DecisionMatchAmbiguous ||
			decisionType == models.DecisionMatchConflicted {
			winnerIntentID = nil
		}

		if len(scored) > 1 {
			s := scored[1].Total
			runnerUpScore = &s
			m := winningScore - s
			scoreMargin = &m
		}

		// Build supporting carriers summary.
		carriers := buildSupportingCarriers(obs)
		carriersJSON, _ := json.Marshal(carriers)

		// Candidate set hash — deterministic fingerprint of the full candidate set.
		candidateSetHash := computeCandidateSetHash(scored)

		// Decision reason detail.
		reasonDetail := map[string]interface{}{
			"candidate_count": len(scored),
			"decision_type":   decisionType,
			"reason_code":     reasonCode,
		}
		if len(scored) > 0 {
			reasonDetail["top_score"] = scored[0].Total
			reasonDetail["top_confidence_bucket"] = scored[0].ConfidenceBucket
		}
		reasonDetailJSON, _ := json.Marshal(reasonDetail)

		decision := models.AttachmentDecision{
			AttachmentDecisionID:     uuid.New(),
			TenantID:                 tenantID,
			SettlementObservationID:  obs.SettlementObservationID,
			IntentID:                 winnerIntentID,
			AttachmentJobID:          job.AttachmentJobID,
			DecisionType:             decisionType,
			DecisionReasonCode:       reasonCode,
			DecisionReasonDetailJSON: reasonDetailJSON,
			MatchingRulesetVersion:   RulesetVersion,
			WinningScore:             winningScore,
			RunnerUpScore:            runnerUpScore,
			ScoreMargin:              scoreMargin,
			ConfidenceScore:          confScore,
			AmbiguityScore:           ambiguityScore,
			SupportingCarriersJSON:   carriersJSON,
			CandidateSetHash:         candidateSetHash,
			CreatedAt:                time.Now().UTC(),
			UpdatedAt:                time.Now().UTC(),
		}
		allDecisions = append(allDecisions, decision)

		// Step 6: Compute variance for attached pairs only.
		if winnerIntentID != nil {
			winnerIntent := findIntentByID(intents, *winnerIntentID)
			if winnerIntent != nil {
				amtVariance, severity, flags, reasons := ComputeVariance(VarianceInputs{
					Intent:      *winnerIntent,
					Observation: obs,
				})
				delayDays := computeDelayDays(*winnerIntent, obs)
				reasonsJSON, _ := json.Marshal(reasons)

				vr := models.VarianceRecord{
					VarianceRecordID:        uuid.New(),
					TenantID:                tenantID,
					AttachmentDecisionID:    decision.AttachmentDecisionID,
					IntentID:                *winnerIntentID,
					SettlementObservationID: obs.SettlementObservationID,
					AmountVariance:          amtVariance,
					CurrencyMatchFlag:       flags["currency_match"],
					StatusVarianceFlag:      flags["status_variance"],
					ValueDateMismatchFlag:   flags["value_date_mismatch"],
					SettlementDelayDays:     delayDays,
					CrossPeriodFlag:         flags["cross_period"],
					ProviderRefMissingFlag:  flags["provider_ref_missing"],
					BankRefMissingFlag:      flags["bank_ref_missing"],
					EvidenceGapFlag:         flags["evidence_gap"],
					VarianceSeverity:        severity,
					VarianceReasonCodesJSON: reasonsJSON,
					CreatedAt:               time.Now().UTC(),
				}
				allVariances = append(allVariances, vr)
			}
		}

		// Update counters.
		switch decisionType {
		case models.DecisionMatchExact:
			counters.exact++
		case models.DecisionMatchHighConfidence:
			counters.high++
		case models.DecisionMatchAmbiguous:
			counters.ambiguous++
		case models.DecisionMatchUnresolved:
			counters.unresolved++
		case models.DecisionMatchConflicted:
			counters.conflicted++
		}
	}

	// ── Step 7: Persist all outputs transactionally ───────────────────────
	if err := persistAttachmentOutputs(ctx, job, allCandidates, allDecisions, allVariances, counters.exact, counters.high, counters.ambiguous, counters.unresolved, counters.conflicted); err != nil {
		return nil, fmt.Errorf("attachment.engine: persist outputs: %w", err)
	}

	// Compute and persist batch attachment summary.
	batchSummary := computeBatchSummary(tenantID, job.AttachmentJobID, scopeRef, observations, allDecisions, allVariances)
	if err := insertBatchSummary(ctx, batchSummary); err != nil {
		log.Printf("attachment.engine.batch_summary_failed job=%s err=%v", job.AttachmentJobID, err)
	}

	// ── Step 8: Emit downstream events ───────────────────────────────────
	outboxSvc := &AttachmentOutboxService{}
	if err := outboxSvc.EmitForJob(ctx, job, allDecisions, allVariances); err != nil {
		log.Printf("attachment.engine.outbox_failed job=%s err=%v", job.AttachmentJobID, err)
	}

	log.Printf("attachment.engine.done job=%s exact=%d high=%d ambiguous=%d unresolved=%d conflicted=%d",
		job.AttachmentJobID, counters.exact, counters.high, counters.ambiguous, counters.unresolved, counters.conflicted)

	return job, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATE DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────

// findCandidateIntents builds the candidate intent set for one settlement observation.
// Multi-index search: tenant + beneficiary fingerprint, amount, currency, client ref, batch ref.
func findCandidateIntents(
	ctx context.Context,
	tenantID uuid.UUID,
	obs models.CanonicalSettlementObservation,
) ([]models.CanonicalIntent, error) {

	// Build a union query that finds intents matching ANY of:
	//   (a) same client_payout_ref
	//   (b) same client_batch_ref
	//   (c) same beneficiary_fingerprint + amount + currency (within time window)
	// Deduplication is handled via DISTINCT on intent_id.

	query := `
		SELECT DISTINCT
			intent_id, tenant_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			beneficiary_fingerprint, amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			created_at
		FROM canonical_intents
		WHERE tenant_id = $1
		  AND (
		    ($2 != '' AND client_payout_ref = $2)
		    OR ($3 != '' AND client_batch_ref = $3)
		    OR ($9 != '' AND provider_hint = $9)
		    OR (
		      beneficiary_fingerprint = $4
		      AND amount = $5
		      AND currency_code = $6
		      AND (intended_execution_at IS NULL
		           OR intended_execution_at BETWEEN $7 AND $8)
		    )
		  )
		ORDER BY intent_id
		LIMIT 20`

	windowStart := obs.ObservationTimestamp.Add(-72 * time.Hour)
	windowEnd := obs.ObservationTimestamp.Add(72 * time.Hour)

	clientRef := ""
	if obs.ClientReferenceCandidate != nil {
		clientRef = *obs.ClientReferenceCandidate
	}
	batchRef := ""
	if obs.BatchReference != nil {
		batchRef = *obs.BatchReference
	}
	providerRef := ""
	if obs.ProviderReference != nil {
		providerRef = *obs.ProviderReference
	}

	rows, err := db.DB.QueryContext(ctx, query,
		tenantID,
		clientRef,
		batchRef,
		obs.BeneficiaryFingerprint,
		obs.Amount,
		obs.CurrencyCode,
		windowStart,
		windowEnd,
		providerRef,
	)
	if err != nil {
		return nil, fmt.Errorf("findCandidateIntents: query: %w", err)
	}
	defer rows.Close()

	var intents []models.CanonicalIntent
	for rows.Next() {
		var intent models.CanonicalIntent
		err := rows.Scan(
			&intent.IntentID, &intent.TenantID,
			&intent.ClientPayoutRef, &intent.ClientBatchRef, &intent.BusinessIdempotencyKey,
			&intent.BeneficiaryFingerprint, &intent.Amount, &intent.CurrencyCode,
			&intent.IntendedExecutionAt, &intent.PayoutType, &intent.ProviderHint, &intent.Corridor,
			&intent.ProofReadinessScore, &intent.MatchabilityScore,
			&intent.CanonicalHash, &intent.GovernanceState, 
			&intent.CreatedAt,
		)
		if err != nil {
			log.Printf("attachment.engine.intent_scan_err: %v", err)
			continue
		}
		intents = append(intents, intent)
	}
	return intents, rows.Err()
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

func buildCandidateRows(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	obsID uuid.UUID,
	scored []CandidateScore,
	intents []models.CanonicalIntent,
) []models.AttachmentCandidate {
	candidates := make([]models.AttachmentCandidate, 0, len(scored))
	for rank, cs := range scored {
		breakdownJSON, _ := json.Marshal(cs.Breakdown)
		intentID := cs.IntentID.(uuid.UUID)
		candidates = append(candidates, models.AttachmentCandidate{
			CandidateID:             uuid.New(),
			AttachmentJobID:         jobID,
			TenantID:                tenantID,
			SettlementObservationID: obsID,
			IntentID:                intentID,
			CandidateRank:           rank + 1,
			ExactRefMatchFlag:       cs.ExactRefMatch,
			ClientRefMatchFlag:      cs.ClientRefMatch,
			ProviderRefMatchFlag:    cs.ProviderRefMatch,
			BankRefMatchFlag:        cs.BankRefMatch,
			BatchMatchFlag:          cs.BatchMatch,
			BeneficiaryFpMatchFlag:  cs.BeneficiaryFpMatch,
			AmountMatchFlag:         cs.AmountMatch,
			CurrencyMatchFlag:       cs.CurrencyMatch,
			TimeWindowMatchFlag:     cs.TimeWindowMatch,
			SourceSystemMatchFlag:   cs.SourceSystemMatch,
			ZordSignatureMatchFlag:  cs.ZordSignatureMatch,
			CompositeMatchFlag:      cs.CompositeMatch,
			ScoreTotal:              cs.Total,
			ScoreBreakdownJSON:      breakdownJSON,
			ConfidenceBucket:        cs.ConfidenceBucket,
			CreatedAt:               time.Now().UTC(),
		})
	}
	return candidates
}

func buildUnresolvedDecision(tenantID uuid.UUID, obsID uuid.UUID, jobID uuid.UUID, reasonCode string) models.AttachmentDecision {
	detail, _ := json.Marshal(map[string]string{"reason": reasonCode})
	return models.AttachmentDecision{
		AttachmentDecisionID:     uuid.New(),
		TenantID:                 tenantID,
		SettlementObservationID:  obsID,
		AttachmentJobID:          jobID,
		DecisionType:             models.DecisionMatchUnresolved,
		DecisionReasonCode:       reasonCode,
		DecisionReasonDetailJSON: detail,
		MatchingRulesetVersion:   RulesetVersion,
		AmbiguityScore:           1.0,
		CandidateSetHash:         "empty",
		CreatedAt:                time.Now().UTC(),
		UpdatedAt:                time.Now().UTC(),
	}
}

func buildSupportingCarriers(obs models.CanonicalSettlementObservation) map[string]interface{} {
	carriers := map[string]interface{}{
		"beneficiary_fingerprint": obs.BeneficiaryFingerprint,
		"amount":                  obs.Amount,
		"currency_code":           obs.CurrencyCode,
		"attachment_readiness":    obs.AttachmentReadinessScore,
		"carrier_richness":        obs.CarrierRichnessScore,
		"source_strength_class":   obs.SourceStrengthClass,
		"parse_confidence":        obs.ParseConfidence,
		"observation_timestamp":   obs.ObservationTimestamp,
	}
	if obs.ClientReferenceCandidate != nil {
		carriers["client_reference_candidate"] = *obs.ClientReferenceCandidate
	}
	if obs.ProviderReference != nil {
		carriers["provider_reference"] = *obs.ProviderReference
	}
	if obs.BankReference != nil {
		carriers["bank_reference"] = *obs.BankReference
	}
	if obs.BatchReference != nil {
		carriers["batch_reference"] = *obs.BatchReference
	}
	return carriers
}

func computeCandidateSetHash(scored []CandidateScore) string {
	ids := make([]string, len(scored))
	for i, cs := range scored {
		ids[i] = fmt.Sprintf("%v:%.2f", cs.IntentID, cs.Total)
	}
	raw := fmt.Sprintf("%v", ids)
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

func findIntentByID(intents []models.CanonicalIntent, id uuid.UUID) *models.CanonicalIntent {
	for i := range intents {
		if intents[i].IntentID == id {
			return &intents[i]
		}
	}
	return nil
}

func computeDelayDays(intent models.CanonicalIntent, obs models.CanonicalSettlementObservation) int {
	if intent.IntendedExecutionAt == nil || obs.ValueDate == nil {
		return 0
	}
	intentDay := intent.IntendedExecutionAt.Truncate(24 * time.Hour)
	settleDay := obs.ValueDate.Truncate(24 * time.Hour)
	return int(settleDay.Sub(intentDay).Hours() / 24)
}

func computeBatchSummary(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	scopeRef string,
	observations []models.CanonicalSettlementObservation,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
) models.BatchAttachmentSummary {

	summary := models.BatchAttachmentSummary{
		BatchAttachmentSummaryID: uuid.New(),
		TenantID:                 tenantID,
		SourceReference:          scopeRef,
		AttachmentJobID:          jobID,
		TotalIntentCount:         len(observations),
		CreatedAt:                time.Now().UTC(),
		UpdatedAt:                time.Now().UTC(),
	}

	for _, d := range decisions {
		switch d.DecisionType {
		case models.DecisionMatchExact:
			summary.ExactMatchCount++
		case models.DecisionMatchHighConfidence:
			summary.HighConfidenceCount++
		case models.DecisionMatchAmbiguous:
			summary.AmbiguousCount++
		case models.DecisionMatchUnresolved:
			summary.UnresolvedCount++
		case models.DecisionMatchConflicted:
			summary.ConflictedCount++
		}
	}

	for _, obs := range observations {
		summary.TotalObservedAmount = summary.TotalObservedAmount.Add(obs.Amount)
	}
	for _, v := range variances {
		summary.TotalVariance = summary.TotalVariance.Add(v.AmountVariance.Abs())
	}

	// Derive batch status.
	total := len(decisions)
	if total == 0 {
		summary.BatchAttachmentStatus = models.BatchStatusUnattached
	} else {
		strongCount := summary.ExactMatchCount + summary.HighConfidenceCount
		ratio := float64(strongCount) / float64(total)
		switch {
		case summary.ConflictedCount > 0:
			summary.BatchAttachmentStatus = models.BatchStatusException
		case ratio >= 0.9:
			summary.BatchAttachmentStatus = models.BatchStatusStrong
		case strongCount > 0:
			summary.BatchAttachmentStatus = models.BatchStatusPartial
		default:
			summary.BatchAttachmentStatus = models.BatchStatusUnattached
		}
	}
	return summary
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE LAYER
// ─────────────────────────────────────────────────────────────────────────────

func insertAttachmentJob(ctx context.Context, job *models.AttachmentJob) error {
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO attachment_jobs (
			attachment_job_id, tenant_id, job_scope_type, scope_ref,
			matching_ruleset_version, status,
			candidate_count_total, exact_match_count, high_confidence_count,
			ambiguous_count, unresolved_count, conflicted_count,
			started_at, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		job.AttachmentJobID, job.TenantID, job.JobScopeType, job.ScopeRef,
		job.MatchingRulesetVersion, job.Status,
		0, 0, 0, 0, 0, 0,
		job.StartedAt, job.CreatedAt,
	)
	return err
}

func persistAttachmentOutputs(
	ctx context.Context,
	job *models.AttachmentJob,
	candidates []models.AttachmentCandidate,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	exact, high, ambiguous, unresolved, conflicted int,
) error {
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("persistAttachmentOutputs: begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	// Persist candidates.
	for _, c := range candidates {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO attachment_candidates (
				candidate_id, attachment_job_id, tenant_id,
				settlement_observation_id, intent_id, candidate_rank,
				exact_ref_match_flag, client_ref_match_flag, provider_ref_match_flag,
				bank_ref_match_flag, batch_match_flag, beneficiary_fp_match_flag,
				amount_match_flag, currency_match_flag, time_window_match_flag,
				source_system_match_flag, zord_signature_match_flag, composite_match_flag,
				score_total, score_breakdown_json, confidence_bucket, created_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
			) ON CONFLICT DO NOTHING`,
			c.CandidateID, c.AttachmentJobID, c.TenantID,
			c.SettlementObservationID, c.IntentID, c.CandidateRank,
			c.ExactRefMatchFlag, c.ClientRefMatchFlag, c.ProviderRefMatchFlag,
			c.BankRefMatchFlag, c.BatchMatchFlag, c.BeneficiaryFpMatchFlag,
			c.AmountMatchFlag, c.CurrencyMatchFlag, c.TimeWindowMatchFlag,
			c.SourceSystemMatchFlag, c.ZordSignatureMatchFlag, c.CompositeMatchFlag,
			c.ScoreTotal, c.ScoreBreakdownJSON, c.ConfidenceBucket, c.CreatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert candidate: %w", err)
		}
	}

	// Persist decisions (upsert by observation+job to allow replays).
	for _, d := range decisions {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO attachment_decisions (
				attachment_decision_id, tenant_id,
				settlement_observation_id, intent_id, attachment_job_id,
				decision_type, decision_reason_code, decision_reason_detail_json,
				matching_ruleset_version,
				winning_score, runner_up_score, score_margin,
				confidence_score, ambiguity_score,
				supporting_carriers_json, candidate_set_hash,
				created_at, updated_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
			) ON CONFLICT (settlement_observation_id, attachment_job_id) DO UPDATE SET
				decision_type              = EXCLUDED.decision_type,
				decision_reason_code       = EXCLUDED.decision_reason_code,
				decision_reason_detail_json = EXCLUDED.decision_reason_detail_json,
				winning_score              = EXCLUDED.winning_score,
				runner_up_score            = EXCLUDED.runner_up_score,
				score_margin               = EXCLUDED.score_margin,
				confidence_score           = EXCLUDED.confidence_score,
				ambiguity_score            = EXCLUDED.ambiguity_score,
				supporting_carriers_json   = EXCLUDED.supporting_carriers_json,
				candidate_set_hash         = EXCLUDED.candidate_set_hash,
				intent_id                  = EXCLUDED.intent_id,
				updated_at                 = EXCLUDED.updated_at`,
			d.AttachmentDecisionID, d.TenantID,
			d.SettlementObservationID, d.IntentID, d.AttachmentJobID,
			d.DecisionType, d.DecisionReasonCode, d.DecisionReasonDetailJSON,
			d.MatchingRulesetVersion,
			d.WinningScore, d.RunnerUpScore, d.ScoreMargin,
			d.ConfidenceScore, d.AmbiguityScore,
			d.SupportingCarriersJSON, d.CandidateSetHash,
			d.CreatedAt, d.UpdatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert decision: %w", err)
		}
	}

	// Persist variance records.
	for _, v := range variances {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO variance_records (
				variance_record_id, tenant_id,
				attachment_decision_id, intent_id, settlement_observation_id,
				amount_variance, deduction_variance, fee_variance,
				currency_match_flag, status_variance_flag,
				value_date_mismatch_flag, settlement_delay_days, cross_period_flag,
				provider_ref_missing_flag, bank_ref_missing_flag, evidence_gap_flag,
				variance_severity, variance_reason_codes_json, created_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
			) ON CONFLICT DO NOTHING`,
			v.VarianceRecordID, v.TenantID,
			v.AttachmentDecisionID, v.IntentID, v.SettlementObservationID,
			v.AmountVariance, v.DeductionVariance, v.FeeVariance,
			v.CurrencyMatchFlag, v.StatusVarianceFlag,
			v.ValueDateMismatchFlag, v.SettlementDelayDays, v.CrossPeriodFlag,
			v.ProviderRefMissingFlag, v.BankRefMissingFlag, v.EvidenceGapFlag,
			v.VarianceSeverity, v.VarianceReasonCodesJSON, v.CreatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert variance: %w", err)
		}
	}

	// Update job counters and mark complete.
	completedAt := time.Now().UTC()
	if _, err = tx.ExecContext(ctx, `
		UPDATE attachment_jobs SET
			status                = 'COMPLETED',
			candidate_count_total = $1,
			exact_match_count     = $2,
			high_confidence_count = $3,
			ambiguous_count       = $4,
			unresolved_count      = $5,
			conflicted_count      = $6,
			completed_at          = $7
		WHERE attachment_job_id = $8`,
		len(candidates), exact, high, ambiguous, unresolved, conflicted,
		completedAt, job.AttachmentJobID,
	); err != nil {
		return fmt.Errorf("persistAttachmentOutputs: update job: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("persistAttachmentOutputs: commit: %w", err)
	}

	// Update in-memory job for caller.
	job.Status = "COMPLETED"
	job.ExactMatchCount = exact
	job.HighConfidenceCount = high
	job.AmbiguousCount = ambiguous
	job.UnresolvedCount = unresolved
	job.ConflictedCount = conflicted
	job.CompletedAt = &completedAt
	return nil
}

func insertBatchSummary(ctx context.Context, s models.BatchAttachmentSummary) error {
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO batch_attachment_summaries (
			batch_attachment_summary_id, tenant_id, batch_id, source_reference,
			attachment_job_id,
			total_intent_count, exact_match_count, high_confidence_count,
			ambiguous_count, unresolved_count, conflicted_count,
			total_intended_amount, total_observed_amount, total_variance,
			batch_attachment_status, created_at, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
		) ON CONFLICT DO NOTHING`,
		s.BatchAttachmentSummaryID, s.TenantID, s.BatchID, s.SourceReference,
		s.AttachmentJobID,
		s.TotalIntentCount, s.ExactMatchCount, s.HighConfidenceCount,
		s.AmbiguousCount, s.UnresolvedCount, s.ConflictedCount,
		s.TotalIntendedAmount, s.TotalObservedAmount, s.TotalVariance,
		s.BatchAttachmentStatus, s.CreatedAt, s.UpdatedAt,
	)
	return err
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADERS
// ─────────────────────────────────────────────────────────────────────────────

func loadObservationsByBatch(ctx context.Context, tenantID uuid.UUID, batchRef string) ([]models.CanonicalSettlementObservation, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			settlement_observation_id, tenant_id, trace_id,
			settlement_envelope_id, job_id,
			source_file_ref, source_row_ref, source_system,
			observation_kind, source_strength_class,
			client_reference_candidate, provider_reference, bank_reference,
			external_reference, batch_reference,
			beneficiary_fingerprint,
			amount, settled_amount, fee_amount, deduction_amount,
			currency_code, settlement_status,
			retry_flag, reversal_flag, return_flag,
			observation_timestamp, value_date,
			provider_ref_status,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, mapping_confidence,
			carrier_richness_score, attachment_readiness_score,
			canonical_hash, created_at, updated_at
		FROM canonical_settlement_observations
		WHERE tenant_id = $1 AND batch_reference = $2
		ORDER BY observation_timestamp`,
		tenantID, batchRef,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanObservations(rows)
}

func loadObservationByID(ctx context.Context, tenantID uuid.UUID, obsID uuid.UUID) (*models.CanonicalSettlementObservation, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
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
			canonical_hash, created_at, updated_at
		FROM canonical_settlement_observations
		WHERE tenant_id = $1 AND settlement_observation_id = $2`,
		tenantID, obsID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	obs, err := scanObservations(rows)
	if err != nil {
		return nil, err
	}
	if len(obs) == 0 {
		return nil, fmt.Errorf("observation not found: %s", obsID)
	}
	return &obs[0], nil
}

func scanObservations(rows *sql.Rows) ([]models.CanonicalSettlementObservation, error) {
	var result []models.CanonicalSettlementObservation
	for rows.Next() {
		var o models.CanonicalSettlementObservation
		err := rows.Scan(
			&o.SettlementObservationID, &o.TenantID, &o.TraceID,
			&o.SettlementEnvelopeID, &o.JobID,
			&o.SourceFileRef, &o.SourceRowRef, &o.SourceSystem,
			&o.ObservationKind, &o.SourceStrengthClass,
			&o.ClientReferenceCandidate, &o.ProviderReference, &o.BankReference,
			&o.ExternalReference, &o.BatchReference,
			&o.BeneficiaryFingerprint,
			&o.Amount, &o.SettledAmount, &o.FeeAmount, &o.DeductionAmount,
			&o.CurrencyCode, &o.SettlementStatus,
			&o.RetryFlag, &o.ReversalFlag, &o.ReturnFlag,
			&o.ObservationTimestamp, &o.ValueDate,
			&o.ProviderRefStatus,
			&o.MappingProfileID, &o.MappingProfileVersion,
			&o.ParseConfidence, &o.MappingConfidence,
			&o.CarrierRichnessScore, &o.AttachmentReadinessScore,
			&o.CanonicalHash, &o.CreatedAt, &o.UpdatedAt,
		)
		if err != nil {
			log.Printf("attachment.engine.scan_err: %v", err)
			continue
		}
		result = append(result, o)
	}
	return result, rows.Err()
}

func loadRuleProfile(ctx context.Context, tenantID uuid.UUID) (*models.AttachmentRuleProfile, error) {
	row := db.DB.QueryRowContext(ctx, `
		SELECT
			profile_id, tenant_id, version,
			exact_ref_priority_json, carrier_priority_json,
			time_window_policy_json, amount_tolerance_policy_json,
			batch_boundary_policy_json, manual_review_thresholds_json,
			ambiguity_margin_threshold, requires_bank_ref_for_exact_flag,
			status, created_at, updated_at
		FROM attachment_rule_profiles
		WHERE tenant_id = $1 AND status = 'ACTIVE'
		ORDER BY version DESC
		LIMIT 1`,
		tenantID,
	)
	var p models.AttachmentRuleProfile
	err := row.Scan(
		&p.ProfileID, &p.TenantID, &p.Version,
		&p.ExactRefPriorityJSON, &p.CarrierPriorityJSON,
		&p.TimeWindowPolicyJSON, &p.AmountTolerancePolicyJSON,
		&p.BatchBoundaryPolicyJSON, &p.ManualReviewThresholdsJSON,
		&p.AmbiguityMarginThreshold, &p.RequiresBankRefForExact,
		&p.Status, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func defaultRuleProfile(tenantID uuid.UUID) *models.AttachmentRuleProfile {
	return &models.AttachmentRuleProfile{
		ProfileID:                "default",
		TenantID:                 tenantID,
		Version:                  RulesetVersion,
		AmbiguityMarginThreshold: 0.15, // stored as 0-1; engine converts to raw points
		RequiresBankRefForExact:  false,
		Status:                   "ACTIVE",
	}
}

// strPtr and safeDeref are defined in settlement_ingest_service.go (same package).
