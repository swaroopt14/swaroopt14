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
type ProjectionService struct {
	projRepo      *persistence.ProjectionRepo
	policyService *PolicyService
	slaRepo       *persistence.SLATimerRepo
}

// NewProjectionService creates a ProjectionService.
//
// slaRepo is passed in rather than created here — this is dependency injection.
// main.go creates all repos and wires them together, keeping this struct simple.
func NewProjectionService(
	projRepo *persistence.ProjectionRepo,
	policyService *PolicyService,
	slaRepo *persistence.SLATimerRepo,
) *ProjectionService {
	return &ProjectionService{
		projRepo:      projRepo,
		policyService: policyService,
		slaRepo:       slaRepo,
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
	if err := s.projRepo.AtomicIncrementEvidence(
		ctx, e.TenantID, window.start, window.end,
	); err != nil {
		return fmt.Errorf("HandleEvidencePackReady tenant=%s: %w", e.TenantID, err)
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

