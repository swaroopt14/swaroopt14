package services

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT OUTBOX SERVICE
//
// Durable event emission for all attachment domain outputs.
// Events feed Service 6 (evidence) and Service 7 (intelligence).
//
// Event types emitted:
//   attachment.decision.created      — every final decision
//   variance.record.created          — every variance record
//   attachment.batch.updated         — batch-level summary
//   attachment.ambiguous.flagged     — every AMBIGUOUS decision (for review/ops)
//   attachment.unresolved.flagged    — every UNRESOLVED decision
//   attachment.review.required       — CONFLICTED decisions (highest urgency)
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"time"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/shopspring/decimal"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// AttachmentOutboxService manages durable event emission for Service 5C.
type AttachmentOutboxService struct{}

// EmitForJob emits all downstream events for a completed attachment job.
func (s *AttachmentOutboxService) EmitForJob(
	ctx context.Context,
	job *models.AttachmentJob,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	obsMap map[uuid.UUID]*models.CanonicalSettlementObservation,
) error {
	log.Printf("attachment.outbox.start job=%s decisions=%d variances=%d",
		job.AttachmentJobID, len(decisions), len(variances))

	var lastErr error

	// Build a quick lookup of variance by decision ID for pairing.
	varianceByDecision := make(map[uuid.UUID]models.VarianceRecord)
	for _, v := range variances {
		varianceByDecision[v.AttachmentDecisionID] = v
	}

	decisionCount := 0
	ambiguousCount := 0
	unresolvedCount := 0
	conflictedCount := 0

	// 1. Fetch intent details for enrichment
	type intentInfo struct {
		IntentID   uuid.UUID
		ContractID uuid.UUID
		CorridorID string
		Currency   string
		Amount     decimal.Decimal
	}
	intentLookup := make(map[uuid.UUID]intentInfo)
	var intentIDs []uuid.UUID
	for _, d := range decisions {
		if d.IntentID != nil {
			intentIDs = append(intentIDs, *d.IntentID)
		}
	}
	if len(intentIDs) > 0 {
		rows, err := db.DB.QueryContext(ctx, `
			SELECT
				ci.intent_id,
				COALESCE(di.contract_id::text, ''),
				COALESCE(di.corridor_id, ci.corridor, ''),
				ci.currency_code,
				ci.amount
			FROM canonical_intents ci
			LEFT JOIN dispatch_index di ON ci.intent_id = di.intent_id
			WHERE ci.intent_id = ANY($1)`, pq.Array(intentIDs))
		if err != nil {
			return fmt.Errorf("failed to lookup intents for outbox: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var idStr, cIDStr, corrID, curr string
			var amt decimal.Decimal
			if err := rows.Scan(&idStr, &cIDStr, &corrID, &curr, &amt); err != nil {
				continue
			}
			id, _ := uuid.Parse(idStr)
			cID, _ := uuid.Parse(cIDStr)
			intentLookup[id] = intentInfo{
				IntentID:   id,
				ContractID: cID,
				CorridorID: corrID,
				Currency:   curr,
				Amount:     amt,
			}
		}
	}

	// 2. Fetch batch summary data for aggregate amounts
	var totalIntendedAmount, totalConfirmedAmount decimal.Decimal
	row := db.DB.QueryRowContext(ctx, `
		SELECT total_intended_amount, total_observed_amount
		FROM batch_attachment_summaries 
		WHERE attachment_job_id = $1 
		LIMIT 1`,
		job.AttachmentJobID,
	)
	_ = row.Scan(&totalIntendedAmount, &totalConfirmedAmount)

	for _, d := range decisions {
		// ── 1. attachment.decision.created ────────────────────────────────
		cID := uuid.Nil
		corrID := ""
		curr := ""
		intendedAmount := decimal.Zero
		settledAmount := decimal.Zero

		if d.IntentID != nil {
			if info, ok := intentLookup[*d.IntentID]; ok {
				cID = info.ContractID
				corrID = info.CorridorID
				curr = info.Currency
				intendedAmount = info.Amount
			}
		}

		bID := ""
		tID := uuid.Nil
		if obs, ok := obsMap[d.SettlementObservationID]; ok {
			bID = obs.ClientBatchID
			if bID == "" && obs.BatchReference != nil {
				bID = *obs.BatchReference
			}
			settledAmount = obs.Amount
			if corrID == "" {
				corrID = obs.CorridorID
			}
			if curr == "" {
				curr = obs.CurrencyCode
			}
			if obs.TraceID != nil {
				tID = *obs.TraceID
			}
		}

		// If IntentID is missing, try to find it by reference from the observation (user request: take from table directly)
		intentID := d.IntentID
		if intentID == nil {
			if obs, ok := obsMap[d.SettlementObservationID]; ok && obs.ClientReferenceCandidate != nil {
				var foundID uuid.UUID
				err := db.DB.QueryRowContext(ctx, `
					SELECT intent_id FROM canonical_intents 
					WHERE client_payout_ref = $1 AND tenant_id = $2 
					LIMIT 1`, *obs.ClientReferenceCandidate, d.TenantID).Scan(&foundID)
				if err == nil {
					intentID = &foundID
					// Re-enrich identifiers from the found intent
					var cIDStr, corrIDStr string
					_ = db.DB.QueryRowContext(ctx, `
						SELECT 
							COALESCE(di.contract_id::text, ''),
							COALESCE(di.corridor_id, ci.corridor, ''),
							ci.currency_code,
							ci.amount
						FROM canonical_intents ci
						LEFT JOIN dispatch_index di ON ci.intent_id = di.intent_id
						WHERE ci.intent_id = $1`, foundID).Scan(&cIDStr, &corrIDStr, &curr, &intendedAmount)
					cID, _ = uuid.Parse(cIDStr)
					corrID = corrIDStr
				}
			}
		}

		// Defensive enrichment for contract_id if still missing
		if cID == uuid.Nil && corrID != "" {
			var fallbackCID uuid.UUID
			_ = db.DB.QueryRowContext(ctx, `SELECT contract_id FROM dispatch_index WHERE corridor_id = $1 LIMIT 1`, corrID).Scan(&fallbackCID)
			if fallbackCID != uuid.Nil {
				cID = fallbackCID
			}
		}

		intentIDStr := ""
		if intentID != nil {
			intentIDStr = intentID.String()
		}
		
		contractIDStr := ""
		if cID != uuid.Nil {
			contractIDStr = cID.String()
		}

		payload := map[string]interface{}{
			"event_id":                  uuid.New().String(),
			"attachment_decision_id":    d.AttachmentDecisionID,
			"attachment_job_id":         d.AttachmentJobID,
			"tenant_id":                 d.TenantID,
			"trace_id":                  tID.String(),
			"occurred_at":               time.Now().UTC().Format(time.RFC3339),
			"settlement_observation_id": d.SettlementObservationID,
			"intent_id":                 intentIDStr,
			"contract_id":               contractIDStr,
			"corridor_id":               corrID,
			"batch_id":                  bID,
			"settled_amount":            settledAmount.String(),
			"intended_amount":           intendedAmount.String(),
			"currency":                  curr,
			"candidate_set_size":        d.CandidateSetSize,
			"decision_type":             d.DecisionType,
			"decision_reason_code":      d.DecisionReasonCode,
			"confidence_score":          d.ConfidenceScore,
			"ambiguity_score":           d.AmbiguityScore,
			"matching_ruleset_version":  d.MatchingRulesetVersion,
			"winning_score":             d.WinningScore,
			"runner_up_score":           d.RunnerUpScore,
			"score_margin":              d.ScoreMargin,
			"candidate_set_hash":        d.CandidateSetHash,
			"supporting_carriers":       d.SupportingCarriersJSON,
		}
		// Attach variance summary inline when available (Service 6 convenience).
		if v, ok := varianceByDecision[d.AttachmentDecisionID]; ok {
			payload["variance_summary"] = map[string]interface{}{
				"amount_variance":     v.AmountVariance,
				"variance_severity":   v.VarianceSeverity,
				"value_date_mismatch": v.ValueDateMismatchFlag,
				"cross_period":        v.CrossPeriodFlag,
				"evidence_gap":        v.EvidenceGapFlag,
			}
		}

		if err := s.insertEvent(ctx, d.TenantID, job.AttachmentJobID,
			cID.String(), bID,
			"attachment_decision", d.AttachmentDecisionID,
			"attachment.decision.created", payload); err != nil {
			lastErr = err
		}
		decisionCount++

		// ── 2. Urgency-scoped flag events ─────────────────────────────────
		switch d.DecisionType {
		case models.DecisionMatchAmbiguous:
			flagPayload := map[string]interface{}{
				"attachment_decision_id":    d.AttachmentDecisionID,
				"tenant_id":                 d.TenantID,
				"settlement_observation_id": d.SettlementObservationID,
				"ambiguity_score":           d.AmbiguityScore,
				"candidate_set_hash":        d.CandidateSetHash,
				"reason_code":               d.DecisionReasonCode,
			}
			if err := s.insertEvent(ctx, d.TenantID, d.AttachmentJobID,
				"", "",
				"attachment_decision", d.AttachmentDecisionID,
				"attachment.ambiguous.flagged", flagPayload); err != nil {
				lastErr = err
			}
			ambiguousCount++

		case models.DecisionMatchUnresolved:
			flagPayload := map[string]interface{}{
				"attachment_decision_id":    d.AttachmentDecisionID,
				"tenant_id":                 d.TenantID,
				"settlement_observation_id": d.SettlementObservationID,
				"reason_code":               d.DecisionReasonCode,
				"ambiguity_score":           d.AmbiguityScore,
			}
			if err := s.insertEvent(ctx, d.TenantID, d.AttachmentJobID,
				"", "",
				"attachment_decision", d.AttachmentDecisionID,
				"attachment.unresolved.flagged", flagPayload); err != nil {
				lastErr = err
			}
			unresolvedCount++

		case models.DecisionMatchConflicted:
			// Highest urgency — conflicting strong carriers require human or ops review.
			reviewPayload := map[string]interface{}{
				"attachment_decision_id":    d.AttachmentDecisionID,
				"tenant_id":                 d.TenantID,
				"settlement_observation_id": d.SettlementObservationID,
				"reason_code":               d.DecisionReasonCode,
				"winning_score":             d.WinningScore,
				"runner_up_score":           d.RunnerUpScore,
				"candidate_set_hash":        d.CandidateSetHash,
				"review_urgency":            "HIGH",
			}
			if err := s.insertEvent(ctx, d.TenantID, d.AttachmentJobID,
				"", "",
				"attachment_decision", d.AttachmentDecisionID,
				"attachment.review.required", reviewPayload); err != nil {
				lastErr = err
			}
			conflictedCount++
		}
	}

	// ── 3. variance.record.created — one per variance record ─────────────
	for _, v := range variances {
		vPayload := map[string]interface{}{
			"variance_record_id":        v.VarianceRecordID,
			"tenant_id":                 v.TenantID,
			"attachment_decision_id":    v.AttachmentDecisionID,
			"intent_id":                 v.IntentID,
			"settlement_observation_id": v.SettlementObservationID,
			"amount_variance":           v.AmountVariance,
			"variance_severity":         v.VarianceSeverity,
			"value_date_mismatch_flag":  v.ValueDateMismatchFlag,
			"settlement_delay_days":     v.SettlementDelayDays,
			"cross_period_flag":         v.CrossPeriodFlag,
			"evidence_gap_flag":         v.EvidenceGapFlag,
			"provider_ref_missing_flag": v.ProviderRefMissingFlag,
			"bank_ref_missing_flag":     v.BankRefMissingFlag,
		}
		if err := s.insertEvent(ctx, v.TenantID, job.AttachmentJobID,
			"", "",
			"variance_record", v.VarianceRecordID,
			"variance.record.created", vPayload); err != nil {
			lastErr = err
		}
	}

	// ── 4. attachment.batch.updated — one per job ─────────────────────────
	var (
		batchID            string
		corridorID         string
		totalCount         int
		successCount       int
		failedCount        int
		pendingCount       int
		reversedCount      int
		totalVariance      decimal.Decimal
		aggregateAmbiguity float64
		finalityStatus     string
	)

	// 1. Fetch batch summary data
	row = db.DB.QueryRowContext(ctx, `
		SELECT 
			batch_id, source_reference, total_intended_amount, 
			total_observed_amount, total_variance, batch_attachment_status,
			ambiguity_score
		FROM batch_attachment_summaries 
		WHERE attachment_job_id = $1 
		LIMIT 1`,
		job.AttachmentJobID,
	)
	var summaryBatchID *string
	var summarySourceRef string
	var summaryAmbiguity float64
	if err := row.Scan(&summaryBatchID, &summarySourceRef, &totalIntendedAmount, &totalConfirmedAmount, &totalVariance, &finalityStatus, &summaryAmbiguity); err == nil {
		if summaryBatchID != nil {
			batchID = *summaryBatchID
		}
		aggregateAmbiguity = summaryAmbiguity
	}

	// 2. Fetch corridor_id from the first observation in this job
	if len(decisions) > 0 {
		firstObsID := decisions[0].SettlementObservationID
		if obs, ok := obsMap[firstObsID]; ok {
			corridorID = obs.CorridorID
		}
	}

	// 3. Fetch batch estimate counts from canonical_settlement_batches
	if job.JobScopeType == models.JobScopeSettlementBatch {
		row = db.DB.QueryRowContext(ctx, `
			SELECT 
				row_count, success_count_estimate, failed_count_estimate, 
				pending_count_estimate, reversal_count_estimate
			FROM canonical_settlement_batches 
			WHERE client_batch_id = $1 AND tenant_id = $2
			LIMIT 1`,
			job.ScopeRef, job.TenantID,
		)
		_ = row.Scan(&totalCount, &successCount, &failedCount, &pendingCount, &reversedCount)
	}

	batchPayload := map[string]interface{}{
		"event_id":                     uuid.New().String(),
		"tenant_id":                    job.TenantID.String(),
		"trace_id":                     uuid.Nil.String(),
		"occurred_at":                  time.Now().UTC().Format(time.RFC3339),
		"batch_id":                     batchID,
		"source_reference":             summarySourceRef,
		"corridor_id":                  corridorID,
		"total_count":                  totalCount,
		"success_count":                successCount,
		"failed_count":                 failedCount,
		"pending_count":                pendingCount,
		"reversed_count":               reversedCount,
		"partial_recon_count":          0,
		"total_intended_amount_minor":  totalIntendedAmount.String(),
		"total_confirmed_amount_minor": totalConfirmedAmount.String(),
		"total_variance_minor":         totalVariance.String(),
		"ambiguity_score":              aggregateAmbiguity,
		"batch_finality_status":        finalityStatus,
	}
	if err := s.insertEvent(ctx, job.TenantID, job.AttachmentJobID,
		"", batchID,
		"attachment_job", job.AttachmentJobID,
		"attachment.batch.updated", batchPayload); err != nil {
		lastErr = err
	}

	log.Printf("attachment.outbox.done job=%s decision_events=%d ambiguous=%d unresolved=%d conflicted=%d variance_events=%d",
		job.AttachmentJobID, decisionCount, ambiguousCount, unresolvedCount, conflictedCount, len(variances))

	return lastErr
}

func (s *AttachmentOutboxService) insertEvent(
	ctx context.Context,
	tenantID uuid.UUID,
	jobID uuid.UUID,
	contractID string,
	batchID string,
	family string,
	entityID uuid.UUID,
	eventType string,
	payload interface{},
) error {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		log.Printf("attachment.outbox.marshal_failed type=%s err=%v", eventType, err)
		return err
	}

	_, err = db.DB.ExecContext(ctx, `
		INSERT INTO outcome_outbox (
			event_id, tenant_id, trace_id, envelope_id,
			contract_id, batchid,
			aggregate_type, aggregate_id,
			event_type, payload,
			status, retry_count, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		uuid.New(), tenantID, uuid.Nil, jobID,
		contractID, batchID,
		family, entityID,
		eventType, payloadJSON,
		"PENDING", 0, time.Now().UTC(),
	)
	if err != nil {
		log.Printf("attachment.outbox.insert_failed type=%s err=%v", eventType, err)
		return fmt.Errorf("attachment outbox insert failed: %w", err)
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// MERKLE LEAF BUNDLE EMISSION
//
// EmitLeafBundlesForJob emits one "outcome.leaf_bundle.created" event per
// attached (winner-resolved) decision into outcome_outbox.  zord-relay picks
// these up and publishes them to payments.outcome.events.v1.  zord-evidence
// consumes that topic and calls GeneratePack() immediately — no buffering
// required because all 4 leaf candidates arrive in a single event.
//
// Leaf types per event:
//   1. RAW_SETTLEMENT_LINE              — from settlement_parsed_rows
//   2. CANONICAL_SETTLEMENT_OBSERVATION — from canonical_settlement_observations
//   3. ATTACHMENT_DECISION              — candidate_set_hash
//   4. VARIANCE_DECISION                — deterministic hash of delta fields
//
// Only decisions with a resolved intent_id (EXACT / HIGH_CONFIDENCE) produce
// a leaf bundle.  AMBIGUOUS / UNRESOLVED / CONFLICTED have no winner, so no
// variance record and no intent_id to key the pack on.
// ─────────────────────────────────────────────────────────────────────────────

// leafCandidate is the wire format for one Merkle leaf inside a bundle event.
type leafCandidate struct {
	Type          string `json:"type"`
	Ref           string `json:"ref"`
	Hash          string `json:"hash"`
	SchemaVersion string `json:"schema_version"`
}

// leafBundlePayload is the full payload of an outcome.leaf_bundle.created event.
type leafBundlePayload struct {
	EventType               string          `json:"event_type"`
	TenantID                string          `json:"tenant_id"`
	IntentID                string          `json:"intent_id"`
	SettlementObservationID string          `json:"settlement_observation_id"`
	AttachmentJobID         string          `json:"attachment_job_id"`
	DecisionType            string          `json:"decision_type"`
	Leaves                  []leafCandidate `json:"leaves"`
}

// EmitLeafBundlesForJob emits outcome_outbox events for all winner-resolved
// decisions produced by a completed attachment job.
//
// obsMap          — map[settlement_observation_id]*CanonicalSettlementObservation
// parsedByRowRef  — map[source_row_ref]*SettlementParsedRow
func (s *AttachmentOutboxService) EmitLeafBundlesForJob(
	ctx context.Context,
	job *models.AttachmentJob,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
	obsMap map[uuid.UUID]*models.CanonicalSettlementObservation,
	parsedByRowRef map[string]*models.SettlementParsedRow,
) error {
	// Build fast lookup: decision_id → variance_record
	vrByDecision := make(map[uuid.UUID]*models.VarianceRecord, len(variances))
	for i := range variances {
		vrByDecision[variances[i].AttachmentDecisionID] = &variances[i]
	}

	var lastErr error
	emitted := 0

	// Build a lookup for ingest_run_id -> file_sha256 to support Leaf 5: RAW_SETTLEMENT_FILE.
	runIDs := make(map[string]bool)
	for _, obs := range obsMap {
		if obs.IngestRunID != "" {
			runIDs[obs.IngestRunID] = true
		}
	}
	shaMap := make(map[string]string)
	if len(runIDs) > 0 {
		var ids []string
		for id := range runIDs {
			ids = append(ids, id)
		}
		rows, err := db.DB.QueryContext(ctx, `SELECT ingest_run_id, file_sha256 FROM settlement_ingest_runs WHERE ingest_run_id = ANY($1)`, pq.Array(ids))
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var rid, sha string
				if err := rows.Scan(&rid, &sha); err == nil {
					shaMap[rid] = sha
				}
			}
		} else {
			log.Printf("leaf_bundle.sha_fetch_failed err=%v", err)
		}
	}

	for _, d := range decisions {
		// Only emit for decisions that resolved to a specific intent.
		if d.IntentID == nil {
			continue
		}

		obs, ok := obsMap[d.SettlementObservationID]
		if !ok {
			log.Printf("leaf_bundle.obs_missing decision=%s obs=%s", d.AttachmentDecisionID, d.SettlementObservationID)
			continue
		}

		// ── Leaf 2: CANONICAL_SETTLEMENT_OBSERVATION ──────────────────────
		leaves := []leafCandidate{
			{
				Type:          "CANONICAL_SETTLEMENT_OBSERVATION",
				Ref:           obs.SettlementObservationID.String(),
				Hash:          obs.CanonicalHash,
				SchemaVersion: "v1",
			},
			// ── Leaf 3: ATTACHMENT_DECISION ───────────────────────────────
			{
				Type:          "ATTACHMENT_DECISION",
				Ref:           d.AttachmentDecisionID.String(),
				Hash:          computeAttachmentDecisionLeafHash(d),
				SchemaVersion: "v1",
			},
		}

		// ── Leaf 1: RAW_SETTLEMENT_LINE ───────────────────────────────────
		// Linked via source_row_ref shared between parsed_rows and observations.
		if pr, ok := parsedByRowRef[obs.SourceRowRef]; ok && pr.RawLineHash != nil && *pr.RawLineHash != "" {
			leaves = append(leaves, leafCandidate{
				Type:          "RAW_SETTLEMENT_LINE",
				Ref:           pr.ParsedRowID.String(),
				Hash:          *pr.RawLineHash,
				SchemaVersion: "v1",
			})
		}

		// ── Leaf 4: VARIANCE_DECISION ─────────────────────────────────────
		if vr, ok := vrByDecision[d.AttachmentDecisionID]; ok {
			leaves = append(leaves, leafCandidate{
				Type:          "VARIANCE_DECISION",
				Ref:           vr.VarianceRecordID.String(),
				Hash:          computeVarianceLeafHash(vr),
				SchemaVersion: "v1",
			})
		}

		// ── Leaf 5: RAW_SETTLEMENT_FILE ──────────────────────────────────
		if sha, ok := shaMap[obs.IngestRunID]; ok && sha != "" {
			leaves = append(leaves, leafCandidate{
				Type:          "RAW_SETTLEMENT_FILE",
				Ref:           obs.IngestRunID,
				Hash:          sha,
				SchemaVersion: "v1",
			})
		}

		bundle := leafBundlePayload{
			EventType:               "outcome.leaf_bundle.created",
			TenantID:                d.TenantID.String(),
			IntentID:                d.IntentID.String(),
			SettlementObservationID: d.SettlementObservationID.String(),
			AttachmentJobID:         d.AttachmentJobID.String(),
			DecisionType:            d.DecisionType,
			Leaves:                  leaves,
		}

		if err := s.insertEvent(ctx, d.TenantID, d.AttachmentJobID,
			"", "",
			"attachment_leaf_bundle", d.AttachmentDecisionID,
			"outcome.leaf_bundle.created", bundle); err != nil {
			lastErr = err
			continue
		}
		emitted++
	}

	log.Printf("leaf_bundle.emitted job=%s count=%d", job.AttachmentJobID, emitted)
	return lastErr
}

// computeAttachmentDecisionLeafHash returns a deterministic SHA-256 hex hash of the
// attachment decision fields that matter for evidence integrity:
//
//	SHA256( selected_intent | settlement_observation | candidate_set | match_score | ruleset_version )
func computeAttachmentDecisionLeafHash(d models.AttachmentDecision) string {
	intent := ""
	if d.IntentID != nil {
		intent = d.IntentID.String()
	}
	raw := fmt.Sprintf("%s|%s|%s|%f|%s",
		intent,
		d.SettlementObservationID.String(),
		d.CandidateSetHash,
		d.WinningScore,
		d.MatchingRulesetVersion,
	)
	sum := sha256.Sum256([]byte(raw))
	return "sha256:" + hex.EncodeToString(sum[:])
}

// computeVarianceLeafHash returns a deterministic SHA-256 hex hash of the
// variance record fields that matter for evidence integrity:
//
//	SHA256( amount_variance | date_variance | status_variance | severity | reason_codes )
func computeVarianceLeafHash(vr *models.VarianceRecord) string {
	raw := fmt.Sprintf("%s|%t|%t|%s|%s",
		vr.AmountVariance.String(),
		vr.ValueDateMismatchFlag,
		vr.StatusVarianceFlag,
		vr.VarianceSeverity,
		string(vr.VarianceReasonCodesJSON),
	)
	sum := sha256.Sum256([]byte(raw))
	return "sha256:" + hex.EncodeToString(sum[:])
}
