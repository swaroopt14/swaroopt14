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
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
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

// RunForJob triggers an attachment job for all canonical settlement observations
// produced by one settlement ingest job.
func (e *AttachmentEngine) RunForJob(
	ctx context.Context,
	tenantID uuid.UUID,
	jobID string,
) (*models.AttachmentJob, error) {
	log.Printf("attachment.engine.start scope=INGEST_JOB tenant=%s job_id=%s", tenantID, jobID)

	observations, err := loadObservationsByJobID(ctx, tenantID, jobID)
	if err != nil {
		return nil, fmt.Errorf("attachment.RunForJob: load observations: %w", err)
	}
	if len(observations) == 0 {
		return nil, fmt.Errorf("attachment.RunForJob: no observations found for job_id=%s", jobID)
	}

	// Scope type stays batch for reporting compatibility; scope_ref stores job_id.
	return e.runAttachment(ctx, tenantID, models.JobScopeSettlementBatch, jobID, observations)
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

	// Use the observation's batch_reference as the scope ref so that
	// GET /v1/attachment/batch/:batch_ref resolves correctly.
	// Fall back to the observation UUID when no batch ref is present.
	scopeRef := observationID.String()
	if obs.BatchReference != nil && *obs.BatchReference != "" {
		scopeRef = *obs.BatchReference
	}

	return e.runAttachment(ctx, tenantID, models.JobScopeSingleObservation, scopeRef, []models.CanonicalSettlementObservation{*obs})
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

	// ── Distributed lock: prevent concurrent jobs for the same scope ──────
	// Two simultaneous requests for the same (tenant, scope_ref) would both
	// call findCandidateIntents, score the same intents, and both persist a
	// winning decision — double-attaching the same intent to two observations.
	//
	// PostgreSQL advisory locks are session-scoped and require no extra
	// infrastructure. We derive a stable int64 key from the tenant UUID and
	// scope_ref string so the same logical job always maps to the same lock slot.
	//
	// pg_try_advisory_lock returns false immediately if another session holds
	// the lock; we return a clear error rather than queuing silently.
	lockKey := advisoryLockKey(tenantID, scopeRef)
	var acquired bool
	if err := db.DB.QueryRowContext(ctx,
		`SELECT pg_try_advisory_lock($1)`, lockKey,
	).Scan(&acquired); err != nil {
		return nil, fmt.Errorf("attachment.engine: advisory lock query: %w", err)
	}
	if !acquired {
		return nil, fmt.Errorf("attachment.engine: concurrent job already running for tenant=%s scope_ref=%s — try again shortly", tenantID, scopeRef)
	}
	// Always release on return. pg_advisory_unlock is a no-op if the lock was
	// already released or was never held.
	defer func() {
		if _, unlockErr := db.DB.ExecContext(ctx, `SELECT pg_advisory_unlock($1)`, lockKey); unlockErr != nil {
			log.Printf("attachment.engine.advisory_unlock_warn tenant=%s scope_ref=%s err=%v", tenantID, scopeRef, unlockErr)
		}
	}()

	// ── Step 2: Load matching ruleset ─────────────────────────────────────
	profile, err := loadRuleProfile(ctx, tenantID)
	if err != nil {
		// Non-fatal: fall back to defaults if no profile is configured yet.
		log.Printf("attachment.engine.no_profile tenant=%s err=%v — using defaults", tenantID, err)
		profile = defaultRuleProfile(tenantID)
	}
	// Parse the policy once so we can pass it through to scoring functions
	// without re-parsing on every call.
	policy := parseRuleProfile(profile)

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

	// ── Reverse scan setup: load master intent list for batch scope ───────
	// Per PDF review (section 10): we must also scan from the intent side to
	// detect intents that were never matched by any observation.
	// Only performed for SETTLEMENT_BATCH scope — a single ad-hoc observation
	// check has no defined "expected population" to compare against.
	var masterIntentMap map[uuid.UUID]models.CanonicalIntent
	if scopeType == models.JobScopeSettlementBatch {
		masterIntentMap, err = loadMasterIntentsByBatchRef(ctx, tenantID, scopeRef)
		if err != nil {
			// Non-fatal: log and continue. Reverse scan will be skipped below.
			log.Printf("attachment.engine.master_intent_load_warn job=%s err=%v (reverse scan skipped)", job.AttachmentJobID, err)
			masterIntentMap = map[uuid.UUID]models.CanonicalIntent{}
		}
	}

	// matchedIntentIDs tracks every intent that won a MATCH_EXACT or
	// MATCH_HIGH_CONFIDENCE decision in this job.  Used by performReverseScan
	// after the main loop to identify intents with no strong observation match.
	matchedIntentIDs := make(map[uuid.UUID]bool)

	// intentDecisionTypes tracks all decision types an intent appeared in as
	// a candidate (winning or losing).  Used to produce granular reason codes
	// in the reverse scan (e.g. ONLY_AMBIGUOUS_CANDIDATES_FOUND).
	intentDecisionTypes := make(map[uuid.UUID][]string)

	// ── Steps 3-7: Process each observation ──────────────────────────────
	var (
		allDecisions        []models.AttachmentDecision
		allVariances        []models.VarianceRecord
		allCandidates       []models.AttachmentCandidate
		totalIntendedAmount decimal.Decimal
		clientBatchRef      *string
		intentsMap          = make(map[uuid.UUID]*models.CanonicalIntent)
		claimedIntentIDs    = make(map[uuid.UUID]bool)
		// allScannedIntentsMap accumulates every intent seen as a candidate
		// during the forward scan. Used as a fallback for the reverse scan
		// when loadMasterIntentsByBatchRef returns nothing (e.g. batch-ref
		// mismatch between canonical_intents and the observations table).
		allScannedIntentsMap = make(map[uuid.UUID]models.CanonicalIntent)
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

		// Collect all candidate intents for reverse-scan fallback.
		for _, intent := range intents {
			allScannedIntentsMap[intent.IntentID] = intent
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

		// Step 5: Select decision type.
		// IMPORTANT: SelectDecisionType must be called BEFORE buildCandidateRows.
		// It calls ClassifyConfidenceContext which sets ConfidenceBucket on the top
		// candidate. If we call buildCandidateRows first, every row is persisted with
		// an empty ConfidenceBucket string.
		decisionType, reasonCode := SelectDecisionType(scored, profile)

		// Back-fill ConfidenceBucket for ALL candidates in the ranked set.
		// SelectDecisionType only classifies the top (index 0) candidate.
		// Runner-up candidates need their own bucket so the DB row is meaningful.
		// We use margin = 0 for every non-top candidate (they lost the contest).
		if len(scored) > 0 {
			policy := parseRuleProfile(profile)
			// Top candidate: margin vs runner-up (already set by SelectDecisionType,
			// but we re-derive here to guarantee consistency for all paths).
			topMargin := 0.0
			if len(scored) > 1 {
				topMargin = scored[0].Total - scored[1].Total
			}
			scored[0].ConfidenceBucket = ClassifyConfidenceContext(scored[0], scored, policy.ManualReviewThresholds)
			_ = topMargin // used implicitly inside ClassifyConfidenceContext via ranked slice
			// Runner-ups: evaluate independently with margin = 0 so they get their
			// own honest bucket rather than inheriting the winner's context.
			for i := 1; i < len(scored); i++ {
				singleRanked := []CandidateScore{scored[i]}
				scored[i].ConfidenceBucket = ClassifyConfidenceContext(scored[i], singleRanked, policy.ManualReviewThresholds)
			}
		}

		// Build candidate rows for persistence (full set, not just winner).
		// Called AFTER confidence buckets are classified so every row is complete.
		candidates := buildCandidateRows(tenantID, job.AttachmentJobID, obs.SettlementObservationID, scored, intents)
		allCandidates = append(allCandidates, candidates...)


		// Updated signatures: pass obs and policy so scores reflect candidate
		// set size, source strength, carrier richness, and parse/mapping quality.
		ambiguityScore := ComputeAmbiguityScore(scored, decisionType, obs, policy)

		var (
			winnerIntentID *uuid.UUID
			winningScore   float64
			runnerUpScore  *float64
			scoreMargin    *float64
			confScore      float64
			relMargin      *float64
		)

		if len(scored) > 0 {
			topID := scored[0].IntentID.(uuid.UUID)
			winnerIntentID = &topID
			winningScore = scored[0].Total
			// Updated signature: pass full ranked list, obs, and policy.
			confScore = ComputeConfidenceScore(scored[0], decisionType, scored, obs, policy)
		}

		// For AMBIGUOUS / CONFLICTED decisions — do NOT set winnerIntentID.
		if decisionType == models.DecisionMatchAmbiguous ||
			decisionType == models.DecisionMatchConflicted {
			winnerIntentID = nil
		}

		// INTRA-JOB DEDUPLICATION:
		// If the winner has already been claimed by another observation in this job,
		// we must demote this match to prevent double-attachment.
		if winnerIntentID != nil && claimedIntentIDs[*winnerIntentID] {
			log.Printf("attachment.engine.double_match_detected obs=%s intent=%s - demoting to AMBIGUOUS",
				obs.SettlementObservationID, *winnerIntentID)
			decisionType = models.DecisionMatchAmbiguous
			reasonCode = "INTENT_ALREADY_CLAIMED_IN_JOB"
			winnerIntentID = nil
		}

		if len(scored) > 1 {
			s := scored[1].Total
			runnerUpScore = &s
			m := winningScore - s
			scoreMargin = &m
			rm := m / max(winningScore, 1.0)
			relMargin = &rm
		}

		// Track decision types per candidate intent for the reverse scan.
		for _, cs := range scored {
			intentID := cs.IntentID.(uuid.UUID)
			intentDecisionTypes[intentID] = append(intentDecisionTypes[intentID], decisionType)
		}

		// Mark winner as matched (only for strong decisions).
		if winnerIntentID != nil &&
			(decisionType == models.DecisionMatchExact || decisionType == models.DecisionMatchHighConfidence) {
			matchedIntentIDs[*winnerIntentID] = true
			claimedIntentIDs[*winnerIntentID] = true
		}

		// Build supporting carriers summary.
		carriers := buildSupportingCarriers(obs)
		carriersJSON, _ := json.Marshal(carriers)

		// Candidate set hash — deterministic fingerprint of the full candidate set for audit integrity.
		candidateSetHash := computeCandidateSetHash(obs.SettlementObservationID, RulesetVersion, scored)

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
			RelativeScoreMargin:      relMargin,
			ConfidenceScore:          confScore,
			AmbiguityScore:           ambiguityScore,
			SupportingCarriersJSON:   carriersJSON,
			CandidateSetHash:         candidateSetHash,
			CandidateSetSnapshotRef:  fmt.Sprintf("zord://audit/candidate-snapshots/%s", candidateSetHash),
			CandidateSetSize:         len(scored),
			CreatedAt:                time.Now().UTC(),
			UpdatedAt:                time.Now().UTC(),
		}
		allDecisions = append(allDecisions, decision)

		// Step 6: Compute variance for attached pairs only.
		if winnerIntentID != nil {
			winnerIntent := findIntentByID(intents, *winnerIntentID)
			if winnerIntent != nil {
				intentsMap[*winnerIntentID] = winnerIntent
				if clientBatchRef == nil && winnerIntent.ClientBatchRef != nil {
					clientBatchRef = winnerIntent.ClientBatchRef
				}
				totalIntendedAmount = totalIntendedAmount.Add(winnerIntent.Amount)
				amtVariance, feeVar, dedVar, severity, flags, reasons := ComputeVariance(VarianceInputs{
					Intent:      *winnerIntent,
					Observation: obs,
				})
				delayDays := computeDelayDays(*winnerIntent, obs)
				reasonsJSON, _ := json.Marshal(reasons)

				// Derive variance_type from the computed flags and amounts.
				varianceType := classifyVarianceType(amtVariance, flags, obs)

				vr := models.VarianceRecord{
					VarianceRecordID:        uuid.New(),
					TenantID:                tenantID,
					AttachmentDecisionID:    decision.AttachmentDecisionID,
					IntentID:                *winnerIntentID,
					SettlementObservationID: obs.SettlementObservationID,
					AmountVariance:          amtVariance,
					FeeVariance:             feeVar,
					DeductionVariance:       dedVar,
					CurrencyMatchFlag:       flags["currency_match"],
					StatusVarianceFlag:      flags["status_variance"],
					ValueDateMismatchFlag:   flags["value_date_mismatch"],
					SettlementDelayDays:     delayDays,
					CrossPeriodFlag:         flags["cross_period"],
					ProviderRefMissingFlag:  flags["provider_ref_missing"],
					BankRefMissingFlag:      flags["bank_ref_missing"],
					EvidenceGapFlag:         flags["evidence_gap"],
					VarianceType:            varianceType,
					VarianceSeverity:        severity,
					VarianceReasonCodesJSON: reasonsJSON,
					// Whitelist fields default to false/nil — a separate whitelist
					// policy service populates these in a subsequent pass.
					IsWhitelisted:          false,
					WhitelistPolicyID:      nil,
					WhitelistPolicyVersion: nil,
					WhitelistReasonCode:    nil,
					WhitelistExplanation:   nil,
					CreatedAt:              time.Now().UTC(),
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

	// ── Reverse scan: find intents with no strong observation match ───────
	// Only runs for SETTLEMENT_BATCH scope.
	//
	// Fallback: if the DB-based masterIntentMap is empty (e.g. client_batch_ref
	// on canonical_intents does not match the scopeRef), fall back to every
	// intent that appeared as a candidate during the forward scan. This ensures
	// ambiguous / conflicted / low-confidence intents still generate
	// UnresolvedIntentRecords even when the batch-ref lookup fails.
	if scopeType == models.JobScopeSettlementBatch && len(masterIntentMap) == 0 && len(allScannedIntentsMap) > 0 {
		log.Printf("attachment.engine.reverse_scan_fallback job=%s: masterIntentMap empty, using %d forward-scan intents as fallback",
			job.AttachmentJobID, len(allScannedIntentsMap))
		masterIntentMap = allScannedIntentsMap
	}

	var allUnresolvedIntents []models.UnresolvedIntentRecord
	if scopeType == models.JobScopeSettlementBatch && len(masterIntentMap) > 0 {
		allUnresolvedIntents = performReverseScan(
			tenantID,
			job.AttachmentJobID,
			scopeRef,
			masterIntentMap,
			matchedIntentIDs,
			intentDecisionTypes,
			policy,
		)
	}

	// ── Step 7: Persist all outputs transactionally ───────────────────────
	// Batch summary is computed here and passed into the transaction so it is
	// written atomically with candidates, decisions, variances, and the job
	// status update. No separate call after commit.
	batchSummary := computeBatchSummary(tenantID, job.AttachmentJobID, scopeRef, clientBatchRef, observations, allDecisions, allVariances, totalIntendedAmount)
	if err := persistAttachmentOutputs(
		ctx, job,
		allCandidates, allDecisions, allVariances, allUnresolvedIntents,
		batchSummary,
		counters.exact, counters.high, counters.ambiguous, counters.unresolved, counters.conflicted,
	); err != nil {
		return nil, fmt.Errorf("attachment.engine: persist outputs: %w", err)
	}

	// Build observation map keyed by settlement_observation_id.
	obsMap := make(map[uuid.UUID]*models.CanonicalSettlementObservation, len(observations))
	rowRefs := make([]string, 0, len(observations))
	for i := range observations {
		obsMap[observations[i].SettlementObservationID] = &observations[i]
		rowRefs = append(rowRefs, observations[i].SourceRowRef)
	}

	// ── Step 8: Emit downstream events (internal ops topics) ────────────

	// ── Step 8b: Emit Merkle leaf bundles for zord-evidence ───────────────
	// Load corresponding parsed rows so we can include raw_line_hash in Leaf 1.
	parsedByRowRef, err := loadParsedRowsBySourceRowRefs(ctx, tenantID, rowRefs)
	if err != nil {
		log.Printf("attachment.engine.parsed_rows_load_warn job=%s err=%v (leaf 1 may be absent)", job.AttachmentJobID, err)
		parsedByRowRef = map[string]*models.SettlementParsedRow{}
	}

	// ── Step 8a: Emit downstream events (internal ops topics) ────────────
	outboxSvc := &AttachmentOutboxService{}
	if err := outboxSvc.EmitForJob(ctx, job, allDecisions, allVariances, obsMap, parsedByRowRef); err != nil {
		log.Printf("attachment.engine.outbox_failed job=%s err=%v", job.AttachmentJobID, err)
	}

	if err := outboxSvc.EmitLeafBundlesForJob(ctx, job, allDecisions, allVariances, obsMap, parsedByRowRef); err != nil {
		log.Printf("attachment.engine.leaf_bundle_failed job=%s err=%v", job.AttachmentJobID, err)
	}

	log.Printf("attachment.engine.done job=%s exact=%d high=%d ambiguous=%d unresolved=%d conflicted=%d reverse_scan_unresolved=%d",
		job.AttachmentJobID, counters.exact, counters.high, counters.ambiguous, counters.unresolved, counters.conflicted, len(allUnresolvedIntents))

	return job, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// REVERSE SCAN
// ─────────────────────────────────────────────────────────────────────────────

// performReverseScan iterates every intent in the master list and produces an
// UnresolvedIntentRecord for any intent that was not strongly matched
// (MATCH_EXACT or MATCH_HIGH_CONFIDENCE) during this job.
//
// Reason code logic (PDF review section 10):
//   - If the intent appeared as a candidate in at least one MATCH_AMBIGUOUS
//     decision → ONLY_AMBIGUOUS_CANDIDATES_FOUND
//   - If the intent appeared as a candidate in at least one MATCH_CONFLICTED
//     decision → ONLY_CONFLICTED_CANDIDATES_FOUND
//   - Otherwise → NO_SETTLEMENT_OBSERVATION_FOUND
func performReverseScan(
	tenantID uuid.UUID,
	jobID uuid.UUID,
	batchRef string,
	masterIntentMap map[uuid.UUID]models.CanonicalIntent,
	matchedIntentIDs map[uuid.UUID]bool,
	intentDecisionTypes map[uuid.UUID][]string,
	policy AttachmentPolicyConfig,
) []models.UnresolvedIntentRecord {
	var records []models.UnresolvedIntentRecord

	windowHours := policy.TimeWindow.MaxHoursDifference
	if windowHours <= 0 {
		windowHours = 72
	}

	for intentID, intent := range masterIntentMap {
		if matchedIntentIDs[intentID] {
			// This intent was strongly matched — nothing to record.
			continue
		}

		// Determine reason code from candidate-level decision types.
		reasonCode := models.UnresolvedReasonNoSettlementObservationFound
		decisionTypes := intentDecisionTypes[intentID]
		hasAmbiguous := false
		hasConflicted := false
		for _, dt := range decisionTypes {
			switch dt {
			case models.DecisionMatchAmbiguous:
				hasAmbiguous = true
			case models.DecisionMatchConflicted:
				hasConflicted = true
			}
		}
		// CONFLICTED takes precedence over AMBIGUOUS.
		switch {
		case hasConflicted:
			reasonCode = models.UnresolvedReasonOnlyConflictedCandidatesFound
		case hasAmbiguous:
			reasonCode = models.UnresolvedReasonOnlyAmbiguousCandidatesFound
		}

		// expected_window_end = intent.IntendedExecutionAt + time window hours.
		// If the intent has no IntendedExecutionAt, leave the field nil.
		var expectedWindowEnd *time.Time
		if intent.IntendedExecutionAt != nil {
			t := intent.IntendedExecutionAt.Add(time.Duration(windowHours) * time.Hour)
			expectedWindowEnd = &t
		}

		batchID := &batchRef

		records = append(records, models.UnresolvedIntentRecord{
			UnresolvedID:      uuid.New(),
			TenantID:          tenantID,
			AttachmentJobID:   jobID,
			IntentID:          intentID,
			BatchID:           batchID,
			ExpectedWindowEnd: expectedWindowEnd,
			ReasonCode:        reasonCode,
			Amount:            intent.Amount,
			CurrencyCode:      intent.CurrencyCode,
			CreatedAt:         time.Now().UTC(),
		})
	}

	return records
}

// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATE DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────

// findCandidateIntents builds the candidate intent set for one settlement observation.
// Multi-index search: tenant + references, source system, and amount/currency/time.
func findCandidateIntents(
	ctx context.Context,
	tenantID uuid.UUID,
	obs models.CanonicalSettlementObservation,
) ([]models.CanonicalIntent, error) {

	// Build a union query that finds intents matching ANY of:
	//   (a) same client_payout_ref
	//   (b) same client_batch_ref
	//   (c) same amount + currency (within time window)
	//   (d) same source system hint (provider_hint)
	// Deduplication is handled via DISTINCT on intent_id.

	query := `
		SELECT DISTINCT
			intent_id, tenant_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
 			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			beneficiary_fingerprint, zord_signature_carrier,
			created_at
		FROM canonical_intents ci
		WHERE tenant_id = $1
		  AND NOT EXISTS (
		      SELECT 1 FROM attachment_decisions ad 
		      WHERE ad.intent_id = ci.intent_id 
		        AND ad.decision_type IN ('MATCH_EXACT', 'MATCH_HIGH_CONFIDENCE')
		  )
		  AND (
		    ($2 != '' AND client_payout_ref = $2)
		    OR ($3 != '' AND client_batch_ref = $3)
		    OR ($8 != '' AND provider_hint = $8)
		    OR (
		      amount = $4
		      AND currency_code = $5
		      AND (intended_execution_at IS NULL
		           OR intended_execution_at BETWEEN $6 AND $7)
		    )
		  )
		ORDER BY intent_id
		LIMIT 200`

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
	rows, err := db.DB.QueryContext(ctx, query,
		tenantID,
		clientRef,
		batchRef,
		obs.Amount,
		obs.CurrencyCode,
		windowStart,
		windowEnd,
		obs.SourceSystem,
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
			&intent.Amount, &intent.CurrencyCode,
			&intent.IntendedExecutionAt, &intent.PayoutType, &intent.ProviderHint, &intent.Corridor,
			&intent.ProofReadinessScore, &intent.MatchabilityScore,
			&intent.CanonicalHash, &intent.GovernanceState,
			&intent.BeneficiaryFingerprint, &intent.ZordSignatureCarrier,
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

// loadMasterIntentsByBatchRef fetches all canonical intents for a given
// client_batch_ref.  Used by the reverse scan to build the complete expected
// population of intents for a batch.
func loadMasterIntentsByBatchRef(
	ctx context.Context,
	tenantID uuid.UUID,
	batchRef string,
) (map[uuid.UUID]models.CanonicalIntent, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			intent_id, tenant_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state,
			beneficiary_fingerprint, zord_signature_carrier,
			created_at
		FROM canonical_intents
		WHERE tenant_id = $1 AND LOWER(client_batch_ref) = LOWER($2)
		ORDER BY intent_id`,
		// ↑ case-insensitive match: observations may carry a different case
		// for the batch ref than the intents table.
		tenantID, batchRef,
	)
	if err != nil {
		return nil, fmt.Errorf("loadMasterIntentsByBatchRef: query: %w", err)
	}
	defer rows.Close()

	result := make(map[uuid.UUID]models.CanonicalIntent)
	for rows.Next() {
		var intent models.CanonicalIntent
		if err := rows.Scan(
			&intent.IntentID, &intent.TenantID,
			&intent.ClientPayoutRef, &intent.ClientBatchRef, &intent.BusinessIdempotencyKey,
			&intent.Amount, &intent.CurrencyCode,
			&intent.IntendedExecutionAt, &intent.PayoutType, &intent.ProviderHint, &intent.Corridor,
			&intent.ProofReadinessScore, &intent.MatchabilityScore,
			&intent.CanonicalHash, &intent.GovernanceState,
			&intent.BeneficiaryFingerprint, &intent.ZordSignatureCarrier,
			&intent.CreatedAt,
		); err != nil {
			log.Printf("loadMasterIntentsByBatchRef: scan: %v", err)
			continue
		}
		result[intent.IntentID] = intent
	}
	return result, rows.Err()
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
		"amount":                obs.Amount,
		"currency_code":         obs.CurrencyCode,
		"attachment_readiness":  obs.AttachmentReadinessScore,
		"carrier_richness":      obs.CarrierRichnessScore,
		"source_strength_class": obs.SourceStrengthClass,
		"parse_confidence":      obs.ParseConfidence,
		"observation_timestamp": obs.ObservationTimestamp,
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
	if obs.BeneficiaryFingerprint != nil {
		carriers["beneficiary_fingerprint"] = *obs.BeneficiaryFingerprint
	}
	if obs.ZordSignatureCarrier != nil {
		carriers["zord_signature_carrier"] = *obs.ZordSignatureCarrier
	}
	return carriers
}

func computeCandidateSetHash(obsID uuid.UUID, rulesetVersion string, scored []CandidateScore) string {
	// Sort by score DESC, then intentID ASC for determinism
	sort.Slice(scored, func(i, j int) bool {
		if scored[i].Total != scored[j].Total {
			return scored[i].Total > scored[j].Total
		}
		idI := fmt.Sprintf("%v", scored[i].IntentID)
		idJ := fmt.Sprintf("%v", scored[j].IntentID)
		return idI < idJ
	})

	type candidateJSON struct {
		IntentID       string      `json:"intent_id"`
		ScoreTotal     float64     `json:"score_total"`
		ScoreBreakdown interface{} `json:"score_breakdown"`
	}

	type fullSnapshot struct {
		SettlementObservationID string          `json:"settlement_observation_id"`
		MatchingRulesetVersion  string          `json:"matching_ruleset_version"`
		Candidates              []candidateJSON `json:"candidates"`
	}

	snapshot := fullSnapshot{
		SettlementObservationID: obsID.String(),
		MatchingRulesetVersion:  rulesetVersion,
		Candidates:              make([]candidateJSON, len(scored)),
	}

	for i, cs := range scored {
		snapshot.Candidates[i] = candidateJSON{
			IntentID:       fmt.Sprintf("%v", cs.IntentID),
			ScoreTotal:     cs.Total,
			ScoreBreakdown: cs.Breakdown,
		}
	}

	data, _ := json.Marshal(snapshot)
	h := sha256.Sum256(data)
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
	clientBatchRef *string,
	observations []models.CanonicalSettlementObservation,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	totalIntendedAmount decimal.Decimal,
) models.BatchAttachmentSummary {

	summary := models.BatchAttachmentSummary{
		BatchAttachmentSummaryID: uuid.New(),
		TenantID:                 tenantID,
		BatchID:                  clientBatchRef,
		SourceReference:          scopeRef,
		AttachmentJobID:          jobID,
		TotalIntentCount:         len(observations),
		TotalIntendedAmount:      totalIntendedAmount,
		CreatedAt:                time.Now().UTC(),
		UpdatedAt:                time.Now().UTC(),
	}

	for _, d := range decisions {
		summary.AggregateScore += d.ConfidenceScore
		summary.AmbiguityScore += d.AmbiguityScore
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
		// Only add to TotalObservedAmount if this observation was successfully matched to an intent.
		// We can check this by looking for a variance record (which only exists for attached pairs).
		isAttached := false
		for _, v := range variances {
			if v.SettlementObservationID == obs.SettlementObservationID {
				isAttached = true
				break
			}
		}
		if isAttached {
			summary.TotalObservedAmount = summary.TotalObservedAmount.Add(*obs.SettledAmount)
		}
	}

	// TotalVariance is the net difference between what was intended and what was observed for this batch.
	summary.TotalVariance = summary.TotalIntendedAmount.Sub(summary.TotalObservedAmount).Abs()

	// Derive batch status.
	total := len(decisions)
	if total == 0 {
		summary.BatchAttachmentStatus = models.BatchStatusFailed
		summary.AggregateScore = 0
		summary.AmbiguityScore = 0
	} else {
		summary.AggregateScore = summary.AggregateScore / float64(total)
		summary.AmbiguityScore = summary.AmbiguityScore / float64(total)
		strongCount := summary.ExactMatchCount + summary.HighConfidenceCount
		ratio := float64(strongCount) / float64(total)
		switch {
		case summary.ConflictedCount > 0:
			summary.BatchAttachmentStatus = models.BatchStatusRequiresReview
		case ratio >= 0.9:
			summary.BatchAttachmentStatus = models.BatchStatusFullySettled
		case strongCount > 0:
			summary.BatchAttachmentStatus = models.BatchStatusPartiallySettled
		default:
			summary.BatchAttachmentStatus = models.BatchStatusFailed
		}
	}
	return summary
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE LAYER
// ─────────────────────────────────────────────────────────────────────────────

// advisoryLockKey derives a stable int64 advisory lock key from the combination
// of tenant UUID and scope_ref string. We XOR the high and low halves of a
// SHA-256 hash so collisions are astronomically unlikely across tenants.
func advisoryLockKey(tenantID uuid.UUID, scopeRef string) int64 {
	h := sha256.Sum256([]byte(tenantID.String() + "|" + scopeRef))
	// Fold the 32-byte hash into a signed int64 via XOR of four 8-byte words.
	var key uint64
	for i := 0; i < 32; i += 8 {
		var word uint64
		for j := 0; j < 8; j++ {
			word = (word << 8) | uint64(h[i+j])
		}
		key ^= word
	}
	return int64(key)
}

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
	unresolvedIntents []models.UnresolvedIntentRecord,
	batchSummary models.BatchAttachmentSummary,
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
				bank_ref_match_flag, batch_match_flag,
				amount_match_flag, currency_match_flag, time_window_match_flag,
				source_system_match_flag, zord_signature_match_flag, composite_match_flag,
				score_total, score_breakdown_json, confidence_bucket, created_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
			) ON CONFLICT DO NOTHING`,
			c.CandidateID, c.AttachmentJobID, c.TenantID,
			c.SettlementObservationID, c.IntentID, c.CandidateRank,
			c.ExactRefMatchFlag, c.ClientRefMatchFlag, c.ProviderRefMatchFlag,
			c.BankRefMatchFlag, c.BatchMatchFlag,
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
				winning_score, runner_up_score, score_margin,relative_score_margin,
				confidence_score, ambiguity_score,
				supporting_carriers_json, candidate_set_hash,
				created_at, updated_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
			) ON CONFLICT (settlement_observation_id, attachment_job_id) DO UPDATE SET
				decision_type              = EXCLUDED.decision_type,
				decision_reason_code       = EXCLUDED.decision_reason_code,
				decision_reason_detail_json = EXCLUDED.decision_reason_detail_json,
				winning_score              = EXCLUDED.winning_score,
				runner_up_score            = EXCLUDED.runner_up_score,
				score_margin               = EXCLUDED.score_margin,
				relative_score_margin      = EXCLUDED.relative_score_margin,
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
			d.WinningScore, d.RunnerUpScore, d.ScoreMargin, d.RelativeScoreMargin,
			d.ConfidenceScore, d.AmbiguityScore,
			d.SupportingCarriersJSON, d.CandidateSetHash,
			d.CreatedAt, d.UpdatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert decision: %w", err)
		}
	}

	// Persist variance records (includes new variance_type and whitelist columns).
	for _, v := range variances {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO variance_records (
				variance_record_id, tenant_id,
				attachment_decision_id, intent_id, settlement_observation_id,
				amount_variance, deduction_variance, fee_variance,
				currency_match_flag, status_variance_flag,
				value_date_mismatch_flag, settlement_delay_days, cross_period_flag,
				provider_ref_missing_flag, bank_ref_missing_flag, evidence_gap_flag,
				variance_type,
				variance_severity, variance_reason_codes_json,
				is_whitelisted, whitelist_policy_id, whitelist_policy_version,
				whitelist_reason_code, whitelist_explanation,
				created_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
			) ON CONFLICT DO NOTHING`,
			v.VarianceRecordID, v.TenantID,
			v.AttachmentDecisionID, v.IntentID, v.SettlementObservationID,
			v.AmountVariance, v.DeductionVariance, v.FeeVariance,
			v.CurrencyMatchFlag, v.StatusVarianceFlag,
			v.ValueDateMismatchFlag, v.SettlementDelayDays, v.CrossPeriodFlag,
			v.ProviderRefMissingFlag, v.BankRefMissingFlag, v.EvidenceGapFlag,
			v.VarianceType,
			v.VarianceSeverity, v.VarianceReasonCodesJSON,
			v.IsWhitelisted, v.WhitelistPolicyID, v.WhitelistPolicyVersion,
			v.WhitelistReasonCode, v.WhitelistExplanation,
			v.CreatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert variance: %w", err)
		}
	}

	// Persist unresolved intent records (reverse scan output).
	for _, u := range unresolvedIntents {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO unresolved_intent_records (
				unresolved_id, tenant_id, attachment_job_id,
				intent_id, batch_id, expected_window_end,
				reason_code, amount, currency_code, created_at
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10
			) ON CONFLICT DO NOTHING`,
			u.UnresolvedID, u.TenantID, u.AttachmentJobID,
			u.IntentID, u.BatchID, u.ExpectedWindowEnd,
			u.ReasonCode, u.Amount, u.CurrencyCode, u.CreatedAt,
		); err != nil {
			return fmt.Errorf("persistAttachmentOutputs: insert unresolved intent: %w", err)
		}
	}

	// Persist batch summary atomically with all other outputs.
	// This was previously a separate db.DB.ExecContext call after tx.Commit(),
	// meaning a crash between commit and summary insert left the job COMPLETED
	// with no batch summary — permanently lost. Moving it inside the transaction
	// guarantees both succeed or both roll back together.
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO batch_attachment_summaries (
			batch_attachment_summary_id, tenant_id, batch_id, source_reference,
			attachment_job_id,
			total_intent_count, exact_match_count, high_confidence_count,
			ambiguous_count, unresolved_count, conflicted_count,
			total_intended_amount, total_observed_amount, total_variance,
			batch_attachment_status, aggregate_score, ambiguity_score, created_at, updated_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
		) ON CONFLICT DO NOTHING`,
		batchSummary.BatchAttachmentSummaryID, batchSummary.TenantID, batchSummary.BatchID, batchSummary.SourceReference,
		batchSummary.AttachmentJobID,
		batchSummary.TotalIntentCount, batchSummary.ExactMatchCount, batchSummary.HighConfidenceCount,
		batchSummary.AmbiguousCount, batchSummary.UnresolvedCount, batchSummary.ConflictedCount,
		batchSummary.TotalIntendedAmount, batchSummary.TotalObservedAmount, batchSummary.TotalVariance,
		batchSummary.BatchAttachmentStatus, batchSummary.AggregateScore, batchSummary.AmbiguityScore,
		batchSummary.CreatedAt, batchSummary.UpdatedAt,
	); err != nil {
		return fmt.Errorf("persistAttachmentOutputs: insert batch summary: %w", err)
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

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADERS
// ─────────────────────────────────────────────────────────────────────────────

func loadObservationsByBatch(ctx context.Context, tenantID uuid.UUID, batchRef string) ([]models.CanonicalSettlementObservation, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			settlement_observation_id, tenant_id, trace_id,
			settlement_envelope_id, ingest_run_id,
			source_file_ref, source_row_ref, source_system,
			observation_kind, source_strength_class,
			client_reference_candidate, provider_reference, bank_reference,
			external_reference, batch_reference,
			amount, settled_amount, fee_amount, deduction_amount,
			currency_code, settlement_status,
			retry_flag, reversal_flag, return_flag,
			observation_timestamp, value_date,
			provider_ref_status,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, mapping_confidence,
			carrier_richness_score, attachment_readiness_score,
			canonical_hash, client_batch_id, COALESCE(corridor_id, ''),
			beneficiary_fingerprint, zord_signature_carrier,
			created_at, updated_at
		FROM canonical_settlement_observations
		WHERE tenant_id = $1 AND (LOWER(batch_reference) = LOWER($2) OR LOWER(client_batch_id) = LOWER($2) OR LOWER(settlement_batch_id) = LOWER($2))
		ORDER BY observation_timestamp`,
		tenantID, batchRef,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanObservations(rows)
}

func loadObservationsByJobID(ctx context.Context, tenantID uuid.UUID, jobID string) ([]models.CanonicalSettlementObservation, error) {
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			settlement_observation_id, tenant_id, trace_id,
			settlement_envelope_id, ingest_run_id,
			source_file_ref, source_row_ref, source_system,
			observation_kind, source_strength_class,
			client_reference_candidate, provider_reference, bank_reference,
			external_reference, batch_reference,
			amount, settled_amount, fee_amount, deduction_amount,
			currency_code, settlement_status,
			retry_flag, reversal_flag, return_flag,
			observation_timestamp, value_date,
			provider_ref_status,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, mapping_confidence,
			carrier_richness_score, attachment_readiness_score,
			canonical_hash, client_batch_id, COALESCE(corridor_id, ''),
			beneficiary_fingerprint, zord_signature_carrier,
			created_at, updated_at
		FROM canonical_settlement_observations
		WHERE tenant_id = $1 AND ingest_run_id = $2
		ORDER BY observation_timestamp`,
		tenantID, jobID,
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
			settlement_envelope_id, ingest_run_id,
			source_file_ref, source_row_ref, source_system,
			observation_kind, source_strength_class,
			client_reference_candidate, provider_reference, bank_reference,
			external_reference, batch_reference,
			amount, settled_amount, fee_amount, deduction_amount,
			currency_code, settlement_status,
			retry_flag, reversal_flag, return_flag,
			observation_timestamp, value_date,
			provider_ref_status,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, mapping_confidence,
			carrier_richness_score, attachment_readiness_score,
			canonical_hash, client_batch_id, COALESCE(corridor_id, ''),
		beneficiary_fingerprint, zord_signature_carrier,
		created_at, updated_at
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
			&o.SettlementEnvelopeID, &o.IngestRunID,
			&o.SourceFileRef, &o.SourceRowRef, &o.SourceSystem,
			&o.ObservationKind, &o.SourceStrengthClass,
			&o.ClientReferenceCandidate, &o.ProviderReference, &o.BankReference,
			&o.ExternalReference, &o.BatchReference,
			&o.Amount, &o.SettledAmount, &o.FeeAmount, &o.DeductionAmount,
			&o.CurrencyCode, &o.SettlementStatus,
			&o.RetryFlag, &o.ReversalFlag, &o.ReturnFlag,
			&o.ObservationTimestamp, &o.ValueDate,
			&o.ProviderRefStatus,
			&o.MappingProfileID, &o.MappingProfileVersion,
			&o.ParseConfidence, &o.MappingConfidence,
			&o.CarrierRichnessScore, &o.AttachmentReadinessScore,
			&o.CanonicalHash, &o.ClientBatchID, &o.CorridorID,
			&o.BeneficiaryFingerprint, &o.ZordSignatureCarrier,
			&o.CreatedAt, &o.UpdatedAt,
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

// loadParsedRowsBySourceRowRefs fetches settlement_parsed_rows for all given
// source_row_ref values in a single query and returns a map keyed by source_row_ref.
// This avoids N+1 queries when building leaf bundles after an attachment run.
func loadParsedRowsBySourceRowRefs(
	ctx context.Context,
	tenantID uuid.UUID,
	rowRefs []string,
) (map[string]*models.SettlementParsedRow, error) {
	if len(rowRefs) == 0 {
		return map[string]*models.SettlementParsedRow{}, nil
	}

	// Build a parameterised ANY($2) query.
	rows, err := db.DB.QueryContext(ctx, `
		SELECT
			parsed_row_id, tenant_id, settlement_envelope_id,
			source_file_ref, source_row_ref,
			raw_line_hash,
			mapping_profile_id, mapping_profile_version,
			parse_confidence, created_at
		FROM settlement_parsed_rows
		WHERE tenant_id = $1
		  AND source_row_ref = ANY($2)`,
		tenantID,
		pq.Array(rowRefs),
	)
	if err != nil {
		return nil, fmt.Errorf("loadParsedRowsBySourceRowRefs: query: %w", err)
	}
	defer rows.Close()

	result := make(map[string]*models.SettlementParsedRow)
	for rows.Next() {
		pr := &models.SettlementParsedRow{}
		if err := rows.Scan(
			&pr.ParsedRowID, &pr.TenantID, &pr.SettlementEnvelopeID,
			&pr.SourceFileRef, &pr.SourceRowRef,
			&pr.RawLineHash,
			&pr.MappingProfileID, &pr.MappingProfileVersion,
			&pr.ParseConfidence, &pr.CreatedAt,
		); err != nil {
			log.Printf("loadParsedRowsBySourceRowRefs: scan: %v", err)
			continue
		}
		result[pr.SourceRowRef] = pr
	}
	return result, rows.Err()
}
