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
