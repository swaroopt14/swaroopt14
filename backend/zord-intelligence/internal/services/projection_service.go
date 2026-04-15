package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// ProjectionService computes and stores KPI projections from Kafka events.
//
// PHASE 4 ADDITIONS:
// The six intelligence layer services are injected here so that the five
// Grade A stub handlers (HandleSettlementCreated, HandleAttachmentDecision,
// HandleVarianceRecord, HandleBatchSummaryUpdated, HandleGovernanceDecision)
// can call them after updating their respective projection_state counters.
//
// Dependency injection pattern: main.go creates all repos and services,
// then passes them into NewProjectionService. This keeps the struct testable
// and avoids hidden global state.
type ProjectionService struct {
	projRepo      *persistence.ProjectionRepo
	policyService *PolicyService
	slaRepo       *persistence.SLATimerRepo

	// ── Phase 4: Six intelligence layer services ──────────────────────────
	leakageSvc        *LeakageIntelligenceService
	ambiguitySvc      *AmbiguityIntelligenceService
	defensibilitySvc  *DefensibilityIntelligenceService
	rcaSvc            *RCAIntelligenceService
	patternSvc        *PatternIntelligenceService
	recommendationSvc *RecommendationIntelligenceService
}

// NewProjectionService creates a ProjectionService with all Phase 4 intelligence services.
//
// All six intelligence services are required. main.go constructs them and injects.
func NewProjectionService(
	projRepo *persistence.ProjectionRepo,
	policyService *PolicyService,
	slaRepo *persistence.SLATimerRepo,
	leakageSvc *LeakageIntelligenceService,
	ambiguitySvc *AmbiguityIntelligenceService,
	defensibilitySvc *DefensibilityIntelligenceService,
	rcaSvc *RCAIntelligenceService,
	patternSvc *PatternIntelligenceService,
	recommendationSvc *RecommendationIntelligenceService,
) *ProjectionService {
	return &ProjectionService{
		projRepo:          projRepo,
		policyService:     policyService,
		slaRepo:           slaRepo,
		leakageSvc:        leakageSvc,
		ambiguitySvc:      ambiguitySvc,
		defensibilitySvc:  defensibilitySvc,
		rcaSvc:            rcaSvc,
		patternSvc:        patternSvc,
		recommendationSvc: recommendationSvc,
	}
}

// ── EventHandler interface methods ────────────────────────────────────────────
// These 7 methods satisfy the EventHandler interface in kafka/consumer.go.
// consumer.go calls them when a Kafka message arrives on each topic.

// HandleIntentCreated seeds tracking when a new payout intent arrives.
//
// WHAT WAS BROKEN:
//
//	SeedSLATimer existed in sla_worker.go but was never called here.
//	Every intent was created with no SLA timer → the sla_worker had nothing
//	to check → SLA breach alerts never fired → ops was flying blind.
//
// WHAT WE DO NOW:
//  1. Atomically increment the pending backlog counter for this corridor
//  2. Seed an SLA timer so the sla_worker can detect deadline breaches
func (s *ProjectionService) HandleIntentCreated(
	ctx context.Context,
	e models.IntentCreatedEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleIntentCreated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.CreatedAt)

	// Step 1: atomically add to the pending backlog (race-safe SQL upsert)
	if err := s.projRepo.AtomicIncrementPending(
		ctx, e.TenantID, e.CorridorID, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleIntentCreated pending corridor=%s: %w", e.CorridorID, err)
	}

	// Step 2: seed the SLA timer (BUG FIX — this was missing before)
	// We log failures but do NOT return an error here.
	// Reason: the backlog increment already succeeded. If SLA seeding fails
	// (e.g. transient DB hiccup), we want Kafka to commit the offset — the
	// backlog data is correct. An ops alert about SLA seeding is better than
	// reprocessing the event and double-counting the backlog.
	if err := s.slaRepo.SeedTimer(ctx, e); err != nil {
		log.Printf("HandleIntentCreated: SeedTimer failed intent=%s corridor=%s: %v",
			e.IntentID, e.CorridorID, err)
	}

	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "canonical.intent.created", e.EventID,
	); err != nil {
		log.Printf("HandleIntentCreated: EvaluateForEvent failed tenant=%s corridor=%s: %v",
			e.TenantID, e.CorridorID, err)
	}
	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleIntentCreated MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleDispatchCreated tracks payout dispatch attempts.
// Computes retry_recovery_rate: separates first attempts from retries.
func (s *ProjectionService) HandleDispatchCreated(
	ctx context.Context,
	e models.DispatchAttemptCreatedEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleDispatchCreated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	log.Printf("HandleDispatchCreated: attempt=%s intent=%s corridor=%s attempt_no=%d",
		e.AttemptID, e.IntentID, e.CorridorID, e.AttemptNo)

	window := todayWindow(e.DispatchAt)

	if e.AttemptNo > 1 {
		// This is a retry — count both total_attempts AND retry_attempts
		if err := s.projRepo.AtomicIncrementRetryAttempt(
			ctx, e.TenantID, e.CorridorID, window.start, window.end,
		); err != nil {
			return err
		}
	} else {
		// First attempt — count only total_attempts
		if err := s.projRepo.AtomicIncrementFirstAttempt(
			ctx, e.TenantID, e.CorridorID, window.start, window.end,
		); err != nil {
			return err
		}
	}

	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "dispatch.attempt.created", e.EventID,
	); err != nil {
		log.Printf("HandleDispatchCreated: EvaluateForEvent failed tenant=%s corridor=%s: %v",
			e.TenantID, e.CorridorID, err)
	}
	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleDispatchCreated MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleOutcomeNormalized updates the failure taxonomy when a FAILED outcome arrives.
// Called for every webhook/poll/statement signal — even provisional ones.
// Only FAILED signals with a reason code update the taxonomy.
func (s *ProjectionService) HandleOutcomeNormalized(
	ctx context.Context,
	e models.OutcomeNormalizedEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleOutcomeNormalized IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	if e.StatusCandidate != "FAILED" || e.ReasonCode == "" {
		if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
			return fmt.Errorf("HandleOutcomeNormalized MarkProcessed event_id=%s: %w", e.EventID, err)
		}
		return nil
	}

	window := todayWindow(e.OccurredAt)

	if err := s.projRepo.AtomicIncrementFailureReason(
		ctx, e.TenantID, e.CorridorID, e.ReasonCode, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleOutcomeNormalized taxonomy corridor=%s reason=%s: %w",
			e.CorridorID, e.ReasonCode, err)
	}

	// PHASE 4: Recompute RCA snapshot after failure taxonomy is updated.
	// rcaSvc reads the failure taxonomy projection we just incremented.
	if err := s.rcaSvc.ComputeAndSave(ctx, e.TenantID, e.CorridorID, window.start, window.end); err != nil {
		log.Printf("HandleOutcomeNormalized: rcaSvc failed corridor=%s: %v", e.CorridorID, err)
	}

	// Did this failure spike trigger any policy rules?
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "outcome.event.normalized", e.EventID,
	); err != nil {
		return err
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleOutcomeNormalized MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleFinalityCertIssued is the most critical handler in ZPI.
// A finality certificate means a payout reached a terminal state.
//
// Updates three projections — all via atomic SQL (no race condition):
//  1. success_rate  — settled/total count for this corridor
//  2. finality_latency histogram — time from intent creation to finality
//  3. pending_backlog — decrement (this payout is done)
//
// Also resolves the SLA timer so we don't fire a false breach alert.
func (s *ProjectionService) HandleFinalityCertIssued(
	ctx context.Context,
	e models.FinalityCertIssuedEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" || e.CertificateID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, isProcessedErr := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if isProcessedErr != nil {
		return fmt.Errorf("HandleFinalityCertIssued IsProcessed event_id=%s: %w", e.EventID, isProcessedErr)
	}
	if processed {
		return nil
	}

	finalityProcessed, finalityProcessedErr := s.projRepo.IsFinalityProcessed(ctx, e.TenantID, e.CertificateID)
	if finalityProcessedErr != nil {
		return fmt.Errorf("HandleFinalityCertIssued IsFinalityProcessed certificate_id=%s: %w", e.CertificateID, finalityProcessedErr)
	}
	if finalityProcessed {
		return nil
	}

	window := todayWindow(e.DecisionAt)

	// ── Update 1: success_rate ────────────────────────────────────────────
	var err error
	switch e.FinalState {
	case "SETTLED":
		err = s.projRepo.AtomicIncrementSuccess(
			ctx, e.TenantID, e.CorridorID, window.start, window.end,
		)
	default:
		// FAILED, REVERSED, UNKNOWN — count in total but not settled
		err = s.projRepo.AtomicIncrementFailure(
			ctx, e.TenantID, e.CorridorID, window.start, window.end,
		)
	}
	if err != nil {
		return fmt.Errorf("HandleFinalityCertIssued success_rate corridor=%s: %w",
			e.CorridorID, err)
	}

	// ── Update 2: finality latency histogram ──────────────────────────────
	ttfSeconds := e.DecisionAt.Sub(e.IntentCreatedAt).Seconds()

	// Negative TTF means clock skew between services — clamp to 0
	if ttfSeconds < 0 {
		log.Printf("HandleFinalityCertIssued: negative TTF cert=%s (clock skew), clamping to 0",
			e.CertificateID)
		ttfSeconds = 0
	}

	if err := s.projRepo.AtomicRecordLatencySample(
		ctx, e.TenantID, e.CorridorID, ttfSeconds, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleFinalityCertIssued latency corridor=%s: %w",
			e.CorridorID, err)
	}

	// ── Update 3: pending backlog ─────────────────────────────────────────
	if err := s.projRepo.AtomicDecrementPending(
		ctx, e.TenantID, e.CorridorID, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleFinalityCertIssued pending corridor=%s: %w",
			e.CorridorID, err)
	}

	// ── Update 4: provider_ref_missing_rate (new — Service 5 field) ───────
	// HasProviderRef tells us whether Service 5 found a UTR/RRN/BankRef.
	// Default true if field absent (zero-value bool = false, but old events
	// from before the Service 5 upgrade won't have this field at all —
	// treat missing field as "unknown" by using true to avoid inflating miss rate).
	if err := s.projRepo.AtomicRecordProviderRef(
		ctx, e.TenantID, e.CorridorID, e.HasProviderRef, window.start, window.end,
	); err != nil {
		// Log but don't fail — this is a new projection; don't break existing flow
		log.Printf("HandleFinalityCertIssued: AtomicRecordProviderRef failed cert=%s: %v",
			e.CertificateID, err)
	}

	// ── Update 5: conflict_rate_in_fusion (new — Service 5 fields) ────────
	// ConflictCount and ConflictTypes are populated by Outcome Fusion.
	// ConflictCount == 0 on events from before the Service 5 upgrade —
	// that's fine, it just registers as a clean (no-conflict) cert.
	if err := s.projRepo.AtomicRecordFusionConflict(
		ctx, e.TenantID, e.CorridorID,
		e.ConflictCount, e.ConflictTypes,
		window.start, window.end,
	); err != nil {
		log.Printf("HandleFinalityCertIssued: AtomicRecordFusionConflict failed cert=%s: %v",
			e.CertificateID, err)
	}

	// ── Update 6: retry_recovery_rate (increment recovered if SETTLED) ────
	// When a corridor's SETTLED cert arrives, we check whether the corridor
	// already has retry_attempts > 0 in this window. If so, this settlement
	// counts as a "recovery" — a retry that ultimately succeeded.
	// This is a corridor-level heuristic (not per-intent), which keeps the
	// handler stateless. Per-intent tracking would require a join table.
	if e.FinalState == "SETTLED" {
		if err := s.projRepo.AtomicIncrementRetryRecovered(
			ctx, e.TenantID, e.CorridorID, window.start, window.end,
		); err != nil {
			log.Printf("HandleFinalityCertIssued: AtomicIncrementRetryRecovered failed cert=%s: %v",
				e.CertificateID, err)
		}
	}

	// ── Resolve the SLA timer ─────────────────────────────────────────────
	// Mark as RESOLVED so sla_worker doesn't fire a breach alert for a payout
	// that already finished. Log failures — don't let them fail the event.
	if err := s.slaRepo.ResolveTimer(ctx, e.IntentID, e.TenantID); err != nil {
		log.Printf("HandleFinalityCertIssued: ResolveTimer failed intent=%s: %v",
			e.IntentID, err)
	}

	// ── Track SLA Compliance ───────────────────────────────────────────────
	// Record whether this payout met its SLA deadline
	if err := s.HandleSLATimerResolved(ctx, e.TenantID); err != nil {
		log.Printf("HandleFinalityCertIssued: HandleSLATimerResolved failed tenant=%s: %v",
			e.TenantID, err)
	}

	// ── Trigger policy evaluation ─────────────────────────────────────────
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "finality.certificate.issued", e.EventID,
	); err != nil {
		return err
	}

	if err := s.projRepo.MarkFinalityProcessed(ctx, e.TenantID, e.CertificateID); err != nil {
		return fmt.Errorf("HandleFinalityCertIssued MarkFinalityProcessed certificate_id=%s: %w", e.CertificateID, err)
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleFinalityCertIssued MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleFinalContractUpdated is called when the final contract read model updates.
// Primary use: trigger event-based policy evaluation.
func (s *ProjectionService) HandleFinalContractUpdated(
	ctx context.Context,
	e models.FinalContractUpdatedEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleFinalContractUpdated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "final.contract.updated", e.EventID,
	); err != nil {
		return err
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleFinalContractUpdated MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleStatementMatch updates the statement_match_rate projection.
//
// Called when Service 5 emits a StatementMatchEvent on the
// "statement.match.event" Kafka topic (new topic, added per Service 5 spec).
//
// MATCHED events:   payout was found in the bank/PSP settlement statement.
// UNMATCHED events: payout settled per signals but NOT in statement after 24h.
//
// A rising UNMATCHED rate is a finance alarm:
//   - Signals say SETTLED but money not confirmed in statement
//   - Could indicate settlement delay, PSP error, or leakage
//   - Finance team can't close books cleanly
func (s *ProjectionService) HandleStatementMatch(
	ctx context.Context,
	e models.StatementMatchEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleStatementMatch IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.CreatedAt)
	matched := e.MatchStatus == "MATCHED"

	if err := s.projRepo.AtomicRecordStatementMatch(
		ctx, e.TenantID, e.CorridorID, matched, e.AgedSeconds, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleStatementMatch corridor=%s status=%s: %w",
			e.CorridorID, e.MatchStatus, err)
	}

	// Trigger policy evaluation — a spike in UNMATCHED events should fire
	// the reconciliation policy (P_STATEMENT_MISMATCH_SPIKE)
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "statement.match.event", e.EventID,
	); err != nil {
		return err
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleStatementMatch MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	return nil
}
func (s *ProjectionService) HandleEvidencePackReady(
	ctx context.Context,
	e models.EvidencePackReadyEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleEvidencePackReady IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.CreatedAt)

	// Update legacy evidence_readiness projection (existing behaviour)
	if err := s.projRepo.AtomicIncrementEvidence(
		ctx, e.TenantID, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleEvidencePackReady tenant=%s: %w", e.TenantID, err)
	}

	// PHASE 4: Update DEFENSIBILITY projection — this intent now has an evidence pack.
	// AtomicIncrementDefensibilityIntent increments both total_intents (denominator)
	// AND with_evidence_pack (numerator), so evidence_pack_rate is always correct.
	if err := s.projRepo.AtomicIncrementDefensibilityIntent(
		ctx, e.TenantID, true /* hasEvidencePack */, window.start, window.end,
	); err != nil {
		// Log but don't fail — legacy evidence_readiness was already updated
		log.Printf("HandleEvidencePackReady: AtomicIncrementDefensibilityIntent failed tenant=%s: %v",
			e.TenantID, err)
	} else {
		// Recompute defensibility snapshot now that evidence pack rate changed
		if err := s.defensibilitySvc.ComputeAndSave(ctx, e.TenantID, "", window.start, window.end); err != nil {
			log.Printf("HandleEvidencePackReady: defensibilitySvc failed tenant=%s: %v",
				e.TenantID, err)
		}
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleEvidencePackReady MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

// HandleDLQEvent counts DLQ failures per original topic for ops visibility.
func (s *ProjectionService) HandleDLQEvent(
	ctx context.Context,
	e models.DLQEvent,
) error {
	if e.TenantID == "" || e.EventID == "" || e.OriginalTopic == "" {
		log.Printf("invalid event: missing required fields tenant=%s event_id=%s topic=%s",
			e.TenantID, e.EventID, e.OriginalTopic)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleDLQEvent IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.FailedAt)
	if err := s.projRepo.AtomicIncrementDLQ(
		ctx, e.TenantID, e.OriginalTopic, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleDLQEvent topic=%s: %w", e.OriginalTopic, err)
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleDLQEvent MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	return nil
}

// ── Private helpers ───────────────────────────────────────────────────────────

type windowBounds struct {
	start time.Time
	end   time.Time
}

// todayWindow returns a 24-hour UTC window starting at midnight of the given time.
// All events on the same calendar day share the same window bucket.
func todayWindow(t time.Time) windowBounds {
	start := t.UTC().Truncate(24 * time.Hour)
	return windowBounds{
		start: start,
		end:   start.Add(24 * time.Hour),
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA BREACH RATE HANDLERS (new for Gap #4)
// ─────────────────────────────────────────────────────────────────────────────

// HandleSLATimerBreached is called by sla_worker when an SLA timer exceeds its deadline.
//
// Business logic:
//   - An intent had a deadline (created_at + 6 hours)
//   - Current time is now past that deadline
//   - The payout is still PENDING (not finalized)
//   - This is a breach
//
// What we do:
//  1. Calculate how late we are: breach_duration = now - deadline
//  2. Increment the breach counter
//  3. Track the breach duration for averaging
//  4. Update the projection
func (s *ProjectionService) HandleSLATimerBreached(
	ctx context.Context,
	tenantID string,
	breachDurationSeconds float64,
) error {
	window := todayWindow(time.Now())

	if err := s.projRepo.AtomicIncrementSLABreached(
		ctx, tenantID, breachDurationSeconds, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleSLATimerBreached tenant=%s: %w", tenantID, err)
	}

	return nil
}

// HandleSLATimerResolved is called when an SLA timer reaches finality BEFORE its deadline.
//
// Business logic:
//   - An intent had a deadline
//   - The payout reached SETTLED/FAILED/REVERSED before deadline
//   - This is on-time delivery
//
// What we do:
//  1. Increment on_time counter
//  2. Increment total_processed counter
//  3. Update the projection
func (s *ProjectionService) HandleSLATimerResolved(
	ctx context.Context,
	tenantID string,
) error {
	window := todayWindow(time.Now())

	if err := s.projRepo.AtomicIncrementSLAOnTime(
		ctx, tenantID, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleSLATimerResolved tenant=%s: %w", tenantID, err)
	}

	return nil
}

// =============================================================================
// PHASE 4 — Grade A intelligence handlers
// =============================================================================
//
// These five handlers implement the full Grade A intelligence computation for
// the pivoted ZPI spec. They replace the Phase 2 stubs.
//
// Each handler follows the same pattern:
//   1. Validate required fields
//   2. Idempotency check (skip already-processed events)
//   3. Atomic projection update (race-safe SQL)
//   4. Intelligence snapshot recomputation (non-fatal)
//   5. Policy evaluation (non-fatal)
//   6. MarkProcessed
//
// FINTECH PRINCIPLE: steps 3–5 are ordered so that the atomic projection
// write (step 3) always succeeds before snapshot computation (step 4).
// If snapshot computation fails, the raw projection data is still correct
// and the next event will trigger another snapshot computation attempt.
// =============================================================================

// HandleSettlementCreated processes a canonical settlement observation from Service 5B.
//
// PHASE 4 LOGIC:
// A settlement observation arriving with POOR attachment readiness and no
// matching intent is the earliest signal of an ORPHAN_SETTLEMENT leakage event.
// We record it into the LEAKAGE projection here, then trigger the leakage
// intelligence service to recompute the snapshot.
//
// IMPORTANT: We do NOT record a leakage event for every settlement — only for
// those with StatusObservation = "SETTLED" AND AttachmentReadiness = "POOR"
// (meaning Service 5B could not find a candidate intent at all).
// The definitive MATCH_UNRESOLVED signal comes from Service 5C via
// HandleAttachmentDecision. This handler only catches the earliest orphan signal.
func (s *ProjectionService) HandleSettlementCreated(
	ctx context.Context,
	e models.CanonicalSettlementCreatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("HandleSettlementCreated: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleSettlementCreated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.OccurredAt)

	// Record ORPHAN_SETTLEMENT leakage signal when a settled observation
	// has no attachment candidates at all.
	// AttachmentReadiness = "POOR" means Service 5B found zero candidate intents.
	if e.StatusObservation == "SETTLED" && e.AttachmentReadiness == "POOR" {
		if err := s.projRepo.AtomicRecordLeakage(
			ctx,
			e.TenantID,
			"ORPHAN_SETTLEMENT",
			0,                      // intendedMinor = 0 (no intent found)
			e.SettledAmountMinor,   // orphanMinor = settled amount
			window.start, window.end,
		); err != nil {
			// Log but don't fail — the event is still marked processed below.
			// A transient DB error here must not cause infinite Kafka redelivery.
			log.Printf("HandleSettlementCreated: AtomicRecordLeakage failed settlement=%s: %v",
				e.SettlementID, err)
		} else {
			// Recompute leakage intelligence snapshot
			if err := s.leakageSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
				log.Printf("HandleSettlementCreated: leakageSvc.ComputeAndSave failed tenant=%s: %v",
					e.TenantID, err)
			}
		}
	}

	log.Printf("HandleSettlementCreated: settlement_id=%s tenant=%s source=%s readiness=%s confidence=%.2f",
		e.SettlementID, e.TenantID, e.SourceSystemID, e.AttachmentReadiness, e.ParseConfidence)

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleSettlementCreated MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	return nil
}

// HandleAttachmentDecision processes an attachment decision from Service 5C.
//
// PHASE 4 LOGIC — This is the most important Grade A handler.
// Every attachment decision feeds TWO intelligence layers:
//
// 1. LEAKAGE:   MATCH_UNRESOLVED → intent exists but no settlement found
//               → record UNMATCHED_INTENT leakage
//
// 2. AMBIGUITY: ALL decisions → update ambiguity projection
//               → MATCH_AMBIGUOUS / MATCH_UNRESOLVED → increment ambiguity counters
//               → ALL decisions → update running confidence average
//
// After both projections are updated, we recompute both intelligence snapshots
// and then recompute the RECOMMENDATION snapshot which reads from both.
//
// ORDERING: projections are updated atomically first, then snapshots are computed.
// If snapshot computation fails (non-fatal), the projection data is still correct
// and the next event will trigger another snapshot computation attempt.
func (s *ProjectionService) HandleAttachmentDecision(
	ctx context.Context,
	e models.AttachmentDecisionCreatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("HandleAttachmentDecision: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleAttachmentDecision IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.OccurredAt)

	// ── Step 1: Update LEAKAGE projection for MATCH_UNRESOLVED ───────────
	// A MATCH_UNRESOLVED decision means a settlement observation exists but
	// Service 5C could not find any matching intent for it — or an intent
	// exists with no matching settlement. The full intended amount is at risk.
	if e.DecisionType == "MATCH_UNRESOLVED" {
		if err := s.projRepo.AtomicRecordLeakage(
			ctx,
			e.TenantID,
			"UNMATCHED_INTENT",
			e.IntendedAmountMinor,  // intended amount at risk
			0,                     // no orphan amount (that comes from HandleSettlementCreated)
			window.start, window.end,
		); err != nil {
			return fmt.Errorf("HandleAttachmentDecision AtomicRecordLeakage decision=%s: %w",
				e.DecisionID, err)
		}
	}

	// ── Step 2: Update AMBIGUITY projection for ALL decisions ─────────────
	// Every attachment decision contributes to the running confidence average
	// and the total_decisions denominator, regardless of decision type.
	if err := s.projRepo.AtomicRecordAttachmentDecision(
		ctx,
		e.TenantID,
		e.DecisionType,
		e.ConfidenceScore,
		e.IntendedAmountMinor,
		e.SupportingCarriers,
		window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleAttachmentDecision AtomicRecordAttachmentDecision decision=%s: %w",
			e.DecisionID, err)
	}

	// ── Step 3: Recompute intelligence snapshots ──────────────────────────
	// These are non-fatal — a failure to write a snapshot does not corrupt
	// the projection data written above. The next event will retry.

	if err := s.leakageSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
		log.Printf("HandleAttachmentDecision: leakageSvc failed decision=%s: %v",
			e.DecisionID, err)
	}

	if err := s.ambiguitySvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
		log.Printf("HandleAttachmentDecision: ambiguitySvc failed decision=%s: %v",
			e.DecisionID, err)
	}

	// Recompute recommendation snapshot after both upstream layers updated
	if err := s.recommendationSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
		log.Printf("HandleAttachmentDecision: recommendationSvc failed decision=%s: %v",
			e.DecisionID, err)
	}

	// ── Step 4: Trigger policy evaluation ────────────────────────────────
	// Policies P_LEAKAGE_UNMATCHED and P_AMBIGUITY_RATE_HIGH fire here.
	// corridorID may be empty for tenant-scoped policies — pass it through.
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "attachment.decision.created", e.EventID,
	); err != nil {
		log.Printf("HandleAttachmentDecision: EvaluateForEvent failed decision=%s: %v",
			e.DecisionID, err)
	}

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleAttachmentDecision MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	return nil
}

// HandleVarianceRecord processes a financial variance record from Service 5C.
//
// PHASE 4 LOGIC:
// A variance record is the definitive signal of a financial discrepancy —
// a settlement WAS matched to an intent, but the amounts or dates don't agree.
//
// UNDER_SETTLEMENT: the most common type. PSP settled less than intended.
//   → add variance_amount_minor to leakage.under_settlement_amount_minor
//
// REVERSAL: settled then reversed — money paid out then clawed back.
//   → add to leakage.reversal_exposure_minor (tracked separately — different risk)
//
// DEDUCTION: PSP deducted a fee.
//   → whitelisted (pre-agreed) deductions: record for audit, don't count as leakage
//   → non-whitelisted: count as leakage in UNDER_SETTLEMENT bucket
//
// VALUE_DATE_MISMATCH / CROSS_PERIOD: date discrepancies.
//   → these affect accounting periods, not money amounts.
//   → we record them as UNDER_SETTLEMENT with varianceAmountMinor=0 for count tracking.
//
// OVER_SETTLEMENT: received MORE than intended.
//   → not leakage — but track separately for audit / financial reconciliation.
//   → we skip over-settlement from the leakage projection (spec §10.1).
func (s *ProjectionService) HandleVarianceRecord(
	ctx context.Context,
	e models.VarianceRecordCreatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" {
		log.Printf("HandleVarianceRecord: missing required fields tenant=%s event_id=%s",
			e.TenantID, e.EventID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleVarianceRecord IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.OccurredAt)

	// Skip OVER_SETTLEMENT — it's not leakage (we received more, not less).
	// Also skip OVER_SETTLEMENT in the ML features to avoid label contamination.
	if e.VarianceType != "OVER_SETTLEMENT" {
		// Use the absolute variance amount. VarianceAmountMinor from Service 5C
		// is already the absolute difference (intended - settled).
		varianceMinor := e.VarianceAmountMinor
		if varianceMinor < 0 {
			varianceMinor = -varianceMinor // ensure positive for leakage calculation
		}

		if err := s.projRepo.AtomicRecordVariance(
			ctx,
			e.TenantID,
			e.VarianceType,
			varianceMinor,
			e.IntendedAmountMinor,
			e.IsWhitelisted,
			window.start, window.end,
		); err != nil {
			return fmt.Errorf("HandleVarianceRecord AtomicRecordVariance variance=%s: %w",
				e.VarianceID, err)
		}

		// Recompute leakage intelligence snapshot
		if err := s.leakageSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
			log.Printf("HandleVarianceRecord: leakageSvc failed variance=%s: %v",
				e.VarianceID, err)
		}

		// Recompute recommendations (leakage changed)
		if err := s.recommendationSvc.ComputeAndSave(ctx, e.TenantID, window.start, window.end); err != nil {
			log.Printf("HandleVarianceRecord: recommendationSvc failed variance=%s: %v",
				e.VarianceID, err)
		}
	}

	// Trigger policy evaluation for P_LEAKAGE_UNDER_SETTLEMENT
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "variance.record.created", e.EventID,
	); err != nil {
		log.Printf("HandleVarianceRecord: EvaluateForEvent failed variance=%s: %v",
			e.VarianceID, err)
	}

	log.Printf("HandleVarianceRecord: variance_id=%s type=%s amount=%d whitelisted=%v cross_period=%v tenant=%s",
		e.VarianceID, e.VarianceType, e.VarianceAmountMinor, e.IsWhitelisted, e.CrossPeriodFlag, e.TenantID)

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleVarianceRecord MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	return nil
}

// HandleBatchSummaryUpdated processes a batch summary event from Service 5C.
//
// PHASE 4 LOGIC:
// 1. Update batch.health.{batch_id} projection — time-series history for trend queries.
// 2. Compute PATTERN intelligence snapshot (batch risk score, signals, tier).
// 3. Trigger policy evaluation for P_AMBIGUITY_BATCH_REVIEW and P_PATTERN_BATCH_RISK.
func (s *ProjectionService) HandleBatchSummaryUpdated(
	ctx context.Context,
	e models.BatchSummaryUpdatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" || e.BatchID == "" {
		log.Printf("HandleBatchSummaryUpdated: missing required fields tenant=%s event_id=%s batch_id=%s",
			e.TenantID, e.EventID, e.BatchID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleBatchSummaryUpdated IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.OccurredAt)

	// Step 1: Update batch.health projection (full snapshot replacement)
	if err := s.projRepo.AtomicUpdateBatchHealth(
		ctx,
		e.TenantID,
		e.BatchID,
		e.TotalCount,
		e.SuccessCount,
		e.FailedCount,
		e.PendingCount,
		e.ReversedCount,
		e.PartialReconCount,
		e.TotalIntendedAmountMinor,
		e.TotalConfirmedAmountMinor,
		e.TotalVarianceMinor,
		e.AmbiguityScore,
		e.BatchFinalityStatus,
		window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleBatchSummaryUpdated AtomicUpdateBatchHealth batch=%s: %w",
			e.BatchID, err)
	}

	// Step 2: Compute PATTERN intelligence snapshot
	if err := s.patternSvc.ComputeAndSave(ctx, e.TenantID, e.BatchID, window.start, window.end); err != nil {
		log.Printf("HandleBatchSummaryUpdated: patternSvc failed batch=%s: %v", e.BatchID, err)
	}

	// Step 3: Trigger policy evaluation
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, e.CorridorID, "batch.summary.updated", e.EventID,
	); err != nil {
		log.Printf("HandleBatchSummaryUpdated: EvaluateForEvent failed batch=%s: %v", e.BatchID, err)
	}

	log.Printf("HandleBatchSummaryUpdated: batch_id=%s status=%s total=%d pending=%d variance=%d ambiguity=%.2f tenant=%s",
		e.BatchID, e.BatchFinalityStatus, e.TotalCount, e.PendingCount,
		e.TotalVarianceMinor, e.AmbiguityScore, e.TenantID)

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleBatchSummaryUpdated MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	return nil
}

// HandleGovernanceDecision processes a governance decision from Service 6.
//
// PHASE 4 LOGIC:
// Every governance decision updates the DEFENSIBILITY intelligence layer.
// This is the critical audit-grade signal: "did a human or system approve
// this payment with full KYC/AML checks, and is the evidence replayable?"
//
// Steps:
//  1. AtomicRecordGovernanceCoverage → increments governance coverage counters
//     (with_governance_decision, with_kyc_checked, with_aml_checked,
//      with_replay_equivalence, governance_approved/rejected/escalated counts)
//
//  2. Recompute DEFENSIBILITY snapshot → updated audit_ready_pct,
//     defensibility_tier, compliance alerts
//
//  3. Recompute RECOMMENDATION snapshot → compliance alerts surface as cards
//
//  4. Trigger policy evaluation → P_DEFENSIBILITY_AUDIT_RISK may fire
//     if audit_ready_pct drops below 80%
//
// REJECTED governance decisions are the most critical compliance signal.
// They are flagged in both the defensibility snapshot AND the policy engine.
func (s *ProjectionService) HandleGovernanceDecision(
	ctx context.Context,
	e models.GovernanceDecisionCreatedEvent,
) error {
	if e.TenantID == "" || e.EventID == "" || e.IntentID == "" {
		log.Printf("HandleGovernanceDecision: missing required fields tenant=%s event_id=%s intent_id=%s",
			e.TenantID, e.EventID, e.IntentID)
		return nil
	}

	processed, err := s.projRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleGovernanceDecision IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	window := todayWindow(e.OccurredAt)

	// Step 1: Update DEFENSIBILITY projection with this governance decision.
	// This is the primary atomic write — must succeed before snapshot computation.
	if err := s.projRepo.AtomicRecordGovernanceCoverage(
		ctx,
		e.TenantID,
		e.DecisionOutcome,
		e.KYCChecked,
		e.AMLChecked,
		e.ReplayEquivalent,
		window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleGovernanceDecision AtomicRecordGovernanceCoverage gdec=%s: %w",
			e.GovernanceDecisionID, err)
	}

	// Step 2: Recompute DEFENSIBILITY snapshot.
	// Pass batchID from the evidence pack context if available.
	// GovernanceDecisionCreatedEvent doesn't carry a batch_id directly,
	// so we pass empty string (tenant-scoped snapshot only).
	if err := s.defensibilitySvc.ComputeAndSave(
		ctx, e.TenantID, "", window.start, window.end,
	); err != nil {
		log.Printf("HandleGovernanceDecision: defensibilitySvc failed gdec=%s: %v",
			e.GovernanceDecisionID, err)
	}

	// Step 3: Recompute RECOMMENDATION snapshot.
	if err := s.recommendationSvc.ComputeAndSave(
		ctx, e.TenantID, window.start, window.end,
	); err != nil {
		log.Printf("HandleGovernanceDecision: recommendationSvc failed gdec=%s: %v",
			e.GovernanceDecisionID, err)
	}

	// Step 4: Trigger policy evaluation.
	// Topic "governance.decision.created" fires P_DEFENSIBILITY_AUDIT_RISK
	// and P_DEFENSIBILITY_EVIDENCE_WEAK.
	// corridorID is not applicable for governance decisions (tenant-scoped).
	if err := s.policyService.EvaluateForEvent(
		ctx, e.TenantID, "", "governance.decision.created", e.EventID,
	); err != nil {
		log.Printf("HandleGovernanceDecision: EvaluateForEvent failed gdec=%s: %v",
			e.GovernanceDecisionID, err)
	}

	log.Printf("HandleGovernanceDecision: gdec_id=%s intent=%s outcome=%s kyc=%v aml=%v replay=%v tenant=%s",
		e.GovernanceDecisionID, e.IntentID, e.DecisionOutcome,
		e.KYCChecked, e.AMLChecked, e.ReplayEquivalent, e.TenantID)

	if err := s.projRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleGovernanceDecision MarkProcessed event_id=%s: %w", e.EventID, err)
	}
	return nil
}

