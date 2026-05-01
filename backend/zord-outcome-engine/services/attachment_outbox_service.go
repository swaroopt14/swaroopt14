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

	"github.com/google/uuid"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
)

// AttachmentOutboxService manages durable event emission for Service 5C.
type AttachmentOutboxService struct{}

// EmitForJob emits all downstream events for a completed attachment job.
func (s *AttachmentOutboxService) EmitForJob(
	ctx context.Context,
	job *models.AttachmentJob,
	decisions []models.AttachmentDecision,
	variances []models.VarianceRecord,
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

	for _, d := range decisions {
		// ── 1. attachment.decision.created ────────────────────────────────
		payload := map[string]interface{}{
			"attachment_decision_id":    d.AttachmentDecisionID,
			"attachment_job_id":         d.AttachmentJobID,
			"tenant_id":                 d.TenantID,
			"settlement_observation_id": d.SettlementObservationID,
			"intent_id":                 d.IntentID,
			"decision_type":             d.DecisionType,
			"decision_reason_code":      d.DecisionReasonCode,
			"confidence_score":          d.ConfidenceScore,
			"ambiguity_score":           d.AmbiguityScore,
			"matching_ruleset_version":  d.MatchingRulesetVersion,
			"winning_score":             d.WinningScore,
			"runner_up_score":           d.RunnerUpScore,
			"score_margin":              d.ScoreMargin,
		}
		// Attach variance summary inline when available (Service 6 convenience).
		if v, ok := varianceByDecision[d.AttachmentDecisionID]; ok {
			payload["variance_summary"] = map[string]interface{}{
				"amount_variance":   v.AmountVariance,
				"variance_severity":       v.VarianceSeverity,
				"value_date_mismatch":     v.ValueDateMismatchFlag,
				"cross_period":            v.CrossPeriodFlag,
				"evidence_gap":            v.EvidenceGapFlag,
			}
		}

		if err := s.insertEvent(ctx, d.TenantID, d.AttachmentJobID,
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
			"variance_record", v.VarianceRecordID,
			"variance.record.created", vPayload); err != nil {
			lastErr = err
		}
	}

	// ── 4. attachment.batch.updated — one per job ─────────────────────────
	batchPayload := map[string]interface{}{
		"attachment_job_id":     job.AttachmentJobID,
		"tenant_id":             job.TenantID,
		"scope_ref":             job.ScopeRef,
		"total_decisions":       decisionCount,
		"exact_match_count":     job.ExactMatchCount,
		"high_confidence_count": job.HighConfidenceCount,
		"ambiguous_count":       ambiguousCount,
		"unresolved_count":      unresolvedCount,
		"conflicted_count":      conflictedCount,
		"status":                job.Status,
	}
	if err := s.insertEvent(ctx, job.TenantID, job.AttachmentJobID,
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
		INSERT INTO attachment_outbox_events (
			outbox_event_id, tenant_id, trace_id, attachment_job_id,
			entity_family, entity_id,
			event_type, payload_json,
			status, attempts, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		uuid.New(), tenantID, uuid.New(), jobID,
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
	EventType               string           `json:"event_type"`
	TenantID                string           `json:"tenant_id"`
	IntentID                string           `json:"intent_id"`
	SettlementObservationID string           `json:"settlement_observation_id"`
	AttachmentJobID         string           `json:"attachment_job_id"`
	DecisionType            string           `json:"decision_type"`
	Leaves                  []leafCandidate  `json:"leaves"`
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

		bundle := leafBundlePayload{
			EventType:               "outcome.leaf_bundle.created",
			TenantID:                d.TenantID.String(),
			IntentID:                d.IntentID.String(),
			SettlementObservationID: d.SettlementObservationID.String(),
			AttachmentJobID:         d.AttachmentJobID.String(),
			DecisionType:            d.DecisionType,
			Leaves:                  leaves,
		}

		bundleJSON, err := json.Marshal(bundle)
		if err != nil {
			log.Printf("leaf_bundle.marshal_failed decision=%s err=%v", d.AttachmentDecisionID, err)
			lastErr = err
			continue
		}

		if err := s.insertOutcomeOutboxEvent(ctx, d, bundleJSON); err != nil {
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

// insertOutcomeOutboxEvent writes one leaf-bundle event to outcome_outbox so
// that zord-relay can pick it up and publish to payments.outcome.events.v1.
func (s *AttachmentOutboxService) insertOutcomeOutboxEvent(
	ctx context.Context,
	d models.AttachmentDecision,
	payloadJSON []byte,
) error {
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO outcome_outbox (
			event_id, envelope_id, trace_id, tenant_id,
			aggregate_type, aggregate_id,
			event_type, schema_version,
			payload, status, retry_count, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		uuid.New(),            // event_id
		d.AttachmentJobID,     // envelope_id  — job that produced this bundle
		uuid.New(),            // trace_id
		d.TenantID,            // tenant_id
		"attachment_leaf_bundle",   // aggregate_type
		d.AttachmentDecisionID,     // aggregate_id
		"outcome.leaf_bundle.created", // event_type
		"v1",                  // schema_version
		payloadJSON,           // payload (JSONB)
		"PENDING",             // status
		0,                     // retry_count
		time.Now().UTC(),      // created_at
	)
	if err != nil {
		log.Printf("leaf_bundle.outbox_insert_failed decision=%s err=%v", d.AttachmentDecisionID, err)
		return fmt.Errorf("outcome_outbox insert failed: %w", err)
	}
	return nil
}
