package handlers

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 5C — ATTACHMENT HANDLER
//
// HTTP boundary for the attachment & variance engine.
//
// Routes (registered in routes/outcome_route.go):
//   POST /v1/attachment/run           — trigger an attachment job
//   GET  /v1/attachment/decision/:id  — fetch decision for one observation
//   GET  /v1/attachment/batch/:ref    — fetch batch attachment summary
//   POST /v1/intent                   — register a canonical intent (test/dev)
// ─────────────────────────────────────────────────────────────────────────────

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
	"zord-outcome-engine/services"
)

// RunAttachmentHandler triggers a Service 5C attachment job.
//
// Body (JSON):
//
//	{
//	  "tenant_id":                "uuid",
//	  "job_scope_type":           "SETTLEMENT_BATCH" | "SINGLE_OBSERVATION",
//	  "settlement_batch_ref":     "batch-ref-string",        // for SETTLEMENT_BATCH
//	  "settlement_observation_id": "uuid"                    // for SINGLE_OBSERVATION
//	}
func (h *Handler) RunAttachmentHandler(c *gin.Context) {
	var req models.AttachmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body: " + err.Error()})
		return
	}

	tenantID, err := uuid.Parse(req.TenantID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}

	engine := &services.AttachmentEngine{}
	var job *models.AttachmentJob

	switch req.JobScopeType {
	case models.JobScopeSettlementBatch:
		if req.SettlementBatchRef == nil || *req.SettlementBatchRef == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "settlement_batch_ref is required for SETTLEMENT_BATCH scope"})
			return
		}
		job, err = engine.RunForBatch(c.Request.Context(), tenantID, *req.SettlementBatchRef)

	case models.JobScopeSingleObservation:
		if req.SettlementObservationID == nil || *req.SettlementObservationID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "settlement_observation_id is required for SINGLE_OBSERVATION scope"})
			return
		}
		obsID, parseErr := uuid.Parse(*req.SettlementObservationID)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid settlement_observation_id"})
			return
		}
		job, err = engine.RunForSingleObservation(c.Request.Context(), tenantID, obsID)

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "job_scope_type must be SETTLEMENT_BATCH or SINGLE_OBSERVATION"})
		return
	}

	if err != nil {
		log.Printf("attachment.handler.run_failed tenant=%s err=%v", tenantID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "attachment job failed: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.AttachmentResponse{
		AttachmentJobID:     job.AttachmentJobID.String(),
		Status:              job.Status,
		ExactMatchCount:     job.ExactMatchCount,
		HighConfidenceCount: job.HighConfidenceCount,
		AmbiguousCount:      job.AmbiguousCount,
		UnresolvedCount:     job.UnresolvedCount,
		ConflictedCount:     job.ConflictedCount,
		Message:             "Attachment job completed",
	})
}

// GetAttachmentDecisionHandler fetches the attachment decision for one settlement observation.
//
// Path: /v1/attachment/decision/:observation_id?tenant_id=uuid
func (h *Handler) GetAttachmentDecisionHandler(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Query("tenant_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}
	obsID, err := uuid.Parse(c.Param("observation_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid observation_id"})
		return
	}

	// Fetch most recent decision for this observation.
	row := db.DB.QueryRowContext(c.Request.Context(), `
		SELECT
			attachment_decision_id, tenant_id,
			settlement_observation_id, intent_id, attachment_job_id,
			decision_type, decision_reason_code, decision_reason_detail_json,
			matching_ruleset_version,
			winning_score, runner_up_score, score_margin,
			confidence_score, ambiguity_score,
			supporting_carriers_json, candidate_set_hash,
			created_at, updated_at
		FROM attachment_decisions
		WHERE tenant_id = $1 AND settlement_observation_id = $2
		ORDER BY created_at DESC
		LIMIT 1`,
		tenantID, obsID,
	)

	var d models.AttachmentDecision
	err = row.Scan(
		&d.AttachmentDecisionID, &d.TenantID,
		&d.SettlementObservationID, &d.IntentID, &d.AttachmentJobID,
		&d.DecisionType, &d.DecisionReasonCode, &d.DecisionReasonDetailJSON,
		&d.MatchingRulesetVersion,
		&d.WinningScore, &d.RunnerUpScore, &d.ScoreMargin,
		&d.ConfidenceScore, &d.AmbiguityScore,
		&d.SupportingCarriersJSON, &d.CandidateSetHash,
		&d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no attachment decision found for this observation"})
		return
	}

	resp := models.AttachmentDecisionResponse{Decision: &d}

	// Attach variance record if present.
	vRow := db.DB.QueryRowContext(c.Request.Context(), `
		SELECT
			variance_record_id, tenant_id, attachment_decision_id,
			intent_id, settlement_observation_id,
			amount_variance, deduction_variance, fee_variance,
			currency_match_flag, status_variance_flag,
			value_date_mismatch_flag, settlement_delay_days, cross_period_flag,
			provider_ref_missing_flag, bank_ref_missing_flag, evidence_gap_flag,
			variance_severity, variance_reason_codes_json, created_at
		FROM variance_records
		WHERE attachment_decision_id = $1
		LIMIT 1`,
		d.AttachmentDecisionID,
	)
	var v models.VarianceRecord
	if err := vRow.Scan(
		&v.VarianceRecordID, &v.TenantID, &v.AttachmentDecisionID,
		&v.IntentID, &v.SettlementObservationID,
		&v.AmountVariance, &v.DeductionVariance, &v.FeeVariance,
		&v.CurrencyMatchFlag, &v.StatusVarianceFlag,
		&v.ValueDateMismatchFlag, &v.SettlementDelayDays, &v.CrossPeriodFlag,
		&v.ProviderRefMissingFlag, &v.BankRefMissingFlag, &v.EvidenceGapFlag,
		&v.VarianceSeverity, &v.VarianceReasonCodesJSON, &v.CreatedAt,
	); err == nil {
		resp.Variance = &v
	}

	c.JSON(http.StatusOK, resp)
}

// GetBatchAttachmentSummaryHandler returns the attachment summary for a settlement batch.
//
// Path: /v1/attachment/batch/:batch_ref?tenant_id=uuid
func (h *Handler) GetBatchAttachmentSummaryHandler(c *gin.Context) {
	tenantID, err := uuid.Parse(c.Query("tenant_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}
	batchRef := c.Param("batch_ref")
	if batchRef == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batch_ref is required"})
		return
	}

	row := db.DB.QueryRowContext(c.Request.Context(), `
		SELECT
			batch_attachment_summary_id, tenant_id, batch_id, source_reference,
			attachment_job_id,
			total_intent_count, exact_match_count, high_confidence_count,
			ambiguous_count, unresolved_count, conflicted_count,
			total_intended_amount, total_observed_amount, total_variance,
			batch_attachment_status, aggregate_score, created_at, updated_at
		FROM batch_attachment_summaries
		WHERE tenant_id = $1 AND (batch_id = $2 OR source_reference = $2)
		ORDER BY created_at DESC
		LIMIT 1`,
		tenantID, batchRef,
	)

	var s models.BatchAttachmentSummary
	if err = row.Scan(
		&s.BatchAttachmentSummaryID, &s.TenantID, &s.BatchID, &s.SourceReference,
		&s.AttachmentJobID,
		&s.TotalIntentCount, &s.ExactMatchCount, &s.HighConfidenceCount,
		&s.AmbiguousCount, &s.UnresolvedCount, &s.ConflictedCount,
		&s.TotalIntendedAmount, &s.TotalObservedAmount, &s.TotalVariance,
		&s.BatchAttachmentStatus, &s.AggregateScore, &s.CreatedAt, &s.UpdatedAt,
	); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no batch summary found"})
		return
	}

	c.JSON(http.StatusOK, s)
}

// RegisterIntentHandler allows registering a canonical intent for matching.
// This endpoint exists so the attachment engine has intents to match against.
// In production this data would be replicated from Service 2.
//
// Body (JSON): models.CanonicalIntent
func (h *Handler) RegisterIntentHandler(c *gin.Context) {
	var intent models.CanonicalIntent
	if err := c.ShouldBindJSON(&intent); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body: " + err.Error()})
		return
	}

	if intent.IntentID == uuid.Nil {
		intent.IntentID = uuid.New()
	}
	if intent.TenantID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id is required"})
		return
	}

	intent.CreatedAt = time.Now().UTC()

	_, err := db.DB.ExecContext(c.Request.Context(), `
		INSERT INTO canonical_intents (
			intent_id, tenant_id,
			client_payout_ref, client_batch_ref, business_idempotency_key,
			amount, currency_code,
			intended_execution_at, payout_type, provider_hint, corridor,
			proof_readiness_score, matchability_score,
			canonical_hash, governance_state, 
			created_at
		) VALUES (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
		) ON CONFLICT (intent_id) DO UPDATE SET
			client_payout_ref       = EXCLUDED.client_payout_ref,
			client_batch_ref        = EXCLUDED.client_batch_ref,
			amount                  = EXCLUDED.amount,
			currency_code           = EXCLUDED.currency_code,
			governance_state        = EXCLUDED.governance_state`,
		intent.IntentID, intent.TenantID,
		intent.ClientPayoutRef, intent.ClientBatchRef, intent.BusinessIdempotencyKey,
		intent.Amount, intent.CurrencyCode,
		intent.IntendedExecutionAt, intent.PayoutType, intent.ProviderHint, intent.Corridor,
		intent.ProofReadinessScore, intent.MatchabilityScore,
		intent.CanonicalHash, intent.GovernanceState, 
		intent.CreatedAt,
	)
	if err != nil {
		log.Printf("attachment.handler.register_intent_failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register intent: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"intent_id": intent.IntentID,
		"status":    "registered",
	})
}
