package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"
	"zord-relay/logger"
	"zord-relay/model"
	"zord-relay/psp"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// DispatchLoopConfig holds all tuning parameters for the dispatch loop.
type DispatchLoopConfig struct {
	WorkerCount  int
	BatchSize    int
	PollInterval time.Duration
	LeaseTTLSecs int
	ConnectorID  string
	CorridorID   string

	// Circuit breaker: consecutive PSP failures before pausing new leases.
	// Default threshold: 5. Default reset: 60 seconds.
	PSPCircuitBreakerThreshold int
	PSPCircuitResetSecs        int
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle — triggered by consuming from Kafka topic payments.intent.events.v1.
//
//   Step 0  — Kafka consumer receives OutboxEvent from payments.intent.events.v1.
//   Step 1  — DispatchCreated: durably accept work, write dispatches row + event.
//             Commit Kafka offset immediately after this commits.
//             Service 2 is now out of the picture. All retries owned by Service 4.
//   Step 1.5— Governance evaluation: check connector health, circuit breaker,
//             execution window, retry budget. Outputs ALLOW / HOLD / FAIL.
//   Step 2  — Detokenize JIT: call Service 3 with tokens. PII in memory only.
//   Step 3  — AttemptSent: persist before PSP call. Crash-recovery anchor.
//   Step 4  — PSP call: submit payout. Classify outcome.
//   Step 5  — ProviderAcked / AwaitingSignal / FailedRetryable / FailedTerminal
// ─────────────────────────────────────────────────────────────────────────────

// DispatchLoop executes the PSP dispatch lifecycle.
// It is driven externally: processEvent is called by DispatchConsumer (Kafka)
// and runSteps2to5 is called by RetrySweeper for FAILED_RETRYABLE dispatches.
type DispatchLoop struct {
	db           *sql.DB
	outboxRepo   *RelayOutboxRepo
	dispatchRepo *DispatchRepo
	pspClient    psp.Client
	tokenClient  TokenClient
	cfg          *DispatchLoopConfig

	// Circuit breaker — tracks consecutive PSP failures.
	cbMu       sync.Mutex
	cbFailures int
	cbOpenAt   time.Time
}

func NewDispatchLoop(
	db *sql.DB,
	outboxRepo *RelayOutboxRepo,
	dispatchRepo *DispatchRepo,
	pspClient psp.Client,
	tokenClient TokenClient,
	cfg *DispatchLoopConfig,
) *DispatchLoop {
	return &DispatchLoop{
		db:           db,
		outboxRepo:   outboxRepo,
		dispatchRepo: dispatchRepo,
		pspClient:    pspClient,
		tokenClient:  tokenClient,
		cfg:          cfg,
	}
}

// processEvent runs the full dispatch lifecycle for a single Kafka-consumed event.
//
// Returns true  → Step 1 committed to DB; caller should commit the Kafka offset.
// Returns false → Step 1 failed (DB unavailable, etc.); caller must NOT commit
//
//	the offset so the message is re-delivered on next restart.
//
// Once true is returned, all subsequent failures (Steps 2–5) are owned entirely
// by Service 4's retry sweeper — the Kafka message is no longer relevant.
func (l *DispatchLoop) processEvent(ctx context.Context, workerID int, e model.OutboxEvent) bool {
	// ── Derive contractID ────────────────────────────────────────────────────
	// ContractID may not be present in early-stage intent events.
	// Fall back to AggregateID (= IntentID) so idempotency still works.
	contractID := e.ContractID
	if contractID == "" {
		contractID = e.AggregateID
	}

	log := logger.Logger.With(
		zap.Int("worker_id", workerID),
		zap.String("event_id", e.EventID),
		zap.String("contract_id", contractID),
		zap.String("intent_id", e.AggregateID),
		zap.String("tenant_id", e.TenantID),
		zap.String("trace_id", e.TraceID),
	)

	// ── Parse payload ─────────────────────────────────────────────────────────
	var payload model.OutboxPayload
	if err := json.Unmarshal(e.Payload, &payload); err != nil {
		// Poison event — cannot parse. Do NOT return false here: returning false
		// would withhold the Kafka offset commit and re-queue a message that will
		// never be parseable. Instead we log and return true so the consumer skips
		// this poison safely (the DLQ path in DispatchConsumer handles logging).
		log.Error("dispatch_loop: failed to parse outbox payload — skipping poison", zap.Error(err))
		return true
	}

	connectorID := l.cfg.ConnectorID
	corridorID := l.cfg.CorridorID
	switch payload.Beneficiary.Instrument.Kind {
	case "UPI":
		corridorID = "UPI"
	case "BANK":
		corridorID = "IMPS"
	}

	intentID := e.AggregateID
	tenantID := e.TenantID
	traceID := e.TraceID

	// =========================================================
	// STEP 1: DispatchCreated — take ownership
	// Idempotency check: reuse existing dispatch_id on re-delivery.
	// After this atomic commit, commit the Kafka offset immediately.
	// =========================================================
	existing, err := l.dispatchRepo.FindByContractAndAttempt(ctx, contractID, 1)
	if err != nil {
		log.Error("dispatch_loop: step1 idempotency check failed", zap.Error(err))
		return false // DB error — withhold Kafka offset commit; will retry on restart
	}

	var d *model.Dispatch

	if existing != nil {
		d = existing
		log.Info("dispatch_loop: step1 reusing existing dispatch",
			zap.String("dispatch_id", d.DispatchID),
			zap.String("existing_status", string(d.Status)),
		)
		// Already took ownership. Terminal states — nothing left to do.
		if d.Status == model.DispatchStatusProviderAcked ||
			d.Status == model.DispatchStatusFailedTerminal ||
			d.Status == model.DispatchStatusRequiresManualReview {
			return true // commit Kafka offset — this intent is fully resolved
		}
		// Non-terminal (PENDING, HELD, FAILED_RETRYABLE, etc.) — re-run Steps 2-5.
		// Use the preserved payload from the DB, not from the (potentially stale) Kafka msg.
		if len(d.PayloadJSON) > 0 {
			if err := json.Unmarshal(d.PayloadJSON, &payload); err != nil {
				log.Error("dispatch_loop: step1 failed to parse stored payload", zap.Error(err))
				return true // commit to skip — payload is permanently corrupt
			}
		}
	} else {
		// First time — mint dispatch_id and take ownership.
		dispatchID := uuid.New().String()

		carriers := model.CorrelationCarriers{
			ReferenceID: dispatchID,
			Narration:   "ZRD:" + contractID,
		}
		carriersJSON, _ := json.Marshal(carriers)

		newDispatch := &model.Dispatch{
			DispatchID:             dispatchID,
			ContractID:             contractID,
			IntentID:               intentID,
			TenantID:               tenantID,
			TraceID:                traceID,
			ConnectorID:            connectorID,
			CorridorID:             corridorID,
			AttemptCount:           1,
			Status:                 model.DispatchStatusPending,
			ProviderIdempotencyKey: dispatchID,
			CorrelationCarriersJSON: carriersJSON,
		}

		dcEvent := model.DispatchCreatedEvent{
			EventID:       uuid.New().String(),
			EventType:     "DispatchCreated",
			TenantID:      tenantID,
			IntentID:      intentID,
			ContractID:    contractID,
			DispatchID:    dispatchID,
			TraceID:       traceID,
			SchemaVersion: "v1",
			CreatedAt:     time.Now().UTC(),
			Payload: model.DispatchCreatedPayload{
				DispatchID:          dispatchID,
				ConnectorID:         connectorID,
				CorridorID:          corridorID,
				AttemptCount:        1,
				CorrelationCarriers: carriers,
			},
		}

		if err := l.atomicStep(ctx, func(tx *sql.Tx) error {
			if err := l.dispatchRepo.InsertTx(ctx, tx, newDispatch, e.Payload); err != nil {
				return err
			}
			return l.outboxRepo.EnqueueTx(ctx, tx,
				dcEvent.EventID, "DispatchCreated",
				dispatchID, contractID, intentID, tenantID, traceID,
				dcEvent,
			)
		}); err != nil {
			log.Error("dispatch_loop: step1 atomic write failed", zap.Error(err))
			// Step 1 failed — we never took ownership. Withhold Kafka offset.
			return false
		}

		log.Info("dispatch_loop: step1 DispatchCreated committed — ownership taken",
			zap.String("dispatch_id", dispatchID),
		)

		d = newDispatch
	}

	// ── Kafka offset committed after this point (caller commits on true return) ──
	// All failures below are owned by Service 4 only.
	l.runSteps2to5(ctx, workerID, d, payload)
	return true
}

// runSteps2to5 executes the PSP execution pipeline (Governance → Detokenize →
// AttemptSent → PSP call → Outcome). It is called from both processEvent
// (Kafka consumer path) and RetrySweeper (FAILED_RETRYABLE retry path).
// d must be a valid, fully-populated Dispatch row (including ConnectorID, CorridorID).
func (l *DispatchLoop) runSteps2to5(ctx context.Context, workerID int, d *model.Dispatch, payload model.OutboxPayload) {
	dispatchID := d.DispatchID
	contractID := d.ContractID
	intentID := d.IntentID
	tenantID := d.TenantID
	traceID := d.TraceID
	connectorID := d.ConnectorID
	corridorID := d.CorridorID

	log := logger.Logger.With(
		zap.Int("worker_id", workerID),
		zap.String("dispatch_id", dispatchID),
		zap.String("contract_id", contractID),
		zap.String("intent_id", intentID),
		zap.String("tenant_id", tenantID),
		zap.String("trace_id", traceID),
	)

	// =========================================================
	// STEP 1.5: Dispatch Governance Evaluation
	// Check connector health, circuit breaker, execution window.
	// =========================================================
	decision, reasonCodes := l.evaluateGovernance(ctx, dispatchID, connectorID, payload)

	govEvent := model.DispatchGovernanceEvaluatedEvent{
		EventID:       uuid.New().String(),
		EventType:     "DispatchGovernanceEvaluated",
		TenantID:      tenantID,
		IntentID:      intentID,
		ContractID:    contractID,
		DispatchID:    dispatchID,
		TraceID:       traceID,
		SchemaVersion: "v1",
		CreatedAt:     time.Now().UTC(),
		Payload: model.DispatchGovernanceEvaluatedPayload{
			DispatchID:  dispatchID,
			Decision:    string(decision),
			ReasonCodes: reasonCodes,
		},
	}

	if err := l.atomicStep(ctx, func(tx *sql.Tx) error {
		if err := l.dispatchRepo.MarkGovernanceDecisionTx(ctx, tx, dispatchID, decision, reasonCodes); err != nil {
			return err
		}
		return l.outboxRepo.EnqueueTx(ctx, tx,
			govEvent.EventID, "DispatchGovernanceEvaluated",
			dispatchID, contractID, intentID, tenantID, traceID,
			govEvent,
		)
	}); err != nil {
		log.Error("dispatch_loop: step1.5 governance write failed", zap.Error(err))
		return
	}

	if decision != model.GovernanceAllow {
		log.Info("dispatch_loop: step1.5 governance blocked dispatch",
			zap.String("decision", string(decision)),
			zap.Strings("reason_codes", reasonCodes),
		)
		return
	}

	log.Info("dispatch_loop: step1.5 governance ALLOW_DISPATCH")

	// =========================================================
	// STEP 2: Detokenize JIT — Service 3
	// PII in memory only. Zeroed by defer rb.Zero() on every exit.
	// =========================================================
	detokResp, err := l.tokenClient.Detokenize(ctx, DetokenizeRequest{
		AccountNumber: payload.PIITokens.AccountNumber,
		Name:          payload.PIITokens.Name,
		IFSC:          payload.PIITokens.IFSC,
		VPA:           payload.PIITokens.VPA,
	})
	if err != nil {
		log.Error("dispatch_loop: step2 detokenize failed", zap.Error(err))
		l.markFailedRetryable(ctx, dispatchID, contractID, intentID, tenantID, traceID,
			string(model.RetryClassRetryableTechnical), "DETOKENIZE_FAILED", err.Error(), log)
		return
	}

	rb := &model.ResolvedBeneficiary{
		AccountNumber: detokResp.AccountNumber,
		Name:          detokResp.Name,
		IFSC:          detokResp.IFSC,
	}
	defer rb.Zero()

	if rb.AccountNumber == "" || rb.Name == "" {
		log.Error("dispatch_loop: step2 detokenize returned empty values")
		l.markFailedTerminal(ctx, dispatchID, contractID, intentID, tenantID, traceID,
			"DETOKENIZE_EMPTY", log)
		return
	}

	// =========================================================
	// STEP 3: AttemptSent — crash-recovery anchor
	// Written BEFORE PSP call. If process dies after this,
	// we know a PSP call may have been in-flight for this dispatch_id.
	// =========================================================
	fingerprint := buildRequestFingerprint(dispatchID, payload.Amount, corridorID)
	asSentAt := time.Now().UTC()
	asEvent := model.AttemptSentEvent{
		EventID:       uuid.New().String(),
		EventType:     "AttemptSent",
		TenantID:      tenantID,
		IntentID:      intentID,
		ContractID:    contractID,
		DispatchID:    dispatchID,
		TraceID:       traceID,
		SchemaVersion: "v1",
		CreatedAt:     asSentAt,
		Payload: model.AttemptSentPayload{
			DispatchID:   dispatchID,
			ConnectorID:  connectorID,
			CorridorID:   corridorID,
			AttemptCount: d.AttemptCount,
			SentAt:       asSentAt,
			CorrelationCarriers: model.CorrelationCarriers{
				ReferenceID: dispatchID,
				Narration:   "ZRD:" + contractID,
			},
		},
	}

	if err := l.atomicStep(ctx, func(tx *sql.Tx) error {
		if err := l.outboxRepo.EnqueueTx(ctx, tx,
			asEvent.EventID, "AttemptSent",
			dispatchID, contractID, intentID, tenantID, traceID,
			asEvent,
		); err != nil {
			return err
		}
		return l.dispatchRepo.MarkSentTx(ctx, tx, dispatchID, dispatchID, fingerprint)
	}); err != nil {
		log.Error("dispatch_loop: step3 AttemptSent write failed", zap.Error(err))
		l.markFailedRetryable(ctx, dispatchID, contractID, intentID, tenantID, traceID,
			string(model.RetryClassRetryableTechnical), "ATTEMPT_SENT_WRITE_FAILED", err.Error(), log)
		return
	}

	log.Info("dispatch_loop: step3 AttemptSent written")

	// =========================================================
	// STEP 4: PSP call
	// rb contains PII — zeroed by defer rb.Zero() when this function returns.
	// Do NOT log rb.AccountNumber or rb.Name at any level.
	// =========================================================
	pspReq := psp.PayoutRequest{
		ReferenceID: dispatchID,
		Narration:   "ZRD:" + contractID,
		Amount:      amountFromString(payload.Amount),
		Mode:        corridorID,
		Beneficiary: psp.Beneficiary{
			Name:          rb.Name,
			AccountNumber: rb.AccountNumber,
			IFSC:          rb.IFSC,
		},
	}

	pspResp, pspErr := l.pspClient.Do(ctx, pspReq)

	if pspErr != nil {
		retryClass, isFatal, isUncertain := classifyPSPError(pspErr)

		log.Error("dispatch_loop: step4 PSP call failed",
			zap.String("retry_class", retryClass),
			zap.Bool("is_fatal", isFatal),
			zap.Bool("is_uncertain", isUncertain),
			zap.Error(pspErr),
		)

		l.recordPSPFailure()

		if isUncertain {
			l.markAwaitingProviderSignal(ctx, dispatchID, contractID, intentID, tenantID, traceID, pspErr.Error(), log)
			return
		}
		if isFatal {
			l.markFailedTerminal(ctx, dispatchID, contractID, intentID, tenantID, traceID, pspErr.Error(), log)
			return
		}
		l.markFailedRetryable(ctx, dispatchID, contractID, intentID, tenantID, traceID,
			retryClass, "PSP_CALL_FAILED", pspErr.Error(), log)
		return
	}

	l.recordPSPSuccess()

	log.Info("dispatch_loop: step4 PSP acked",
		zap.String("provider_attempt_id", pspResp.PayoutID),
		zap.String("psp_status", pspResp.Status),
	)

	// =========================================================
	// STEP 5: ProviderAcked — persist immediate PSP acknowledgement.
	// Not final — UTR and settlement truth arrive later via Service 5.
	// =========================================================
	ackedAt := time.Now().UTC()
	paEvent := model.ProviderAckedEvent{
		EventID:       uuid.New().String(),
		EventType:     "ProviderAcked",
		TenantID:      tenantID,
		IntentID:      intentID,
		ContractID:    contractID,
		DispatchID:    dispatchID,
		TraceID:       traceID,
		SchemaVersion: "v1",
		CreatedAt:     ackedAt,
		Payload: model.ProviderAckedPayload{
			DispatchID:        dispatchID,
			ProviderAttemptID: pspResp.PayoutID,
			ProviderReference: nil,
			Status:            pspResp.Status,
			AckedAt:           ackedAt.Format(time.RFC3339),
		},
	}

	if err := l.atomicStep(ctx, func(tx *sql.Tx) error {
		if err := l.outboxRepo.EnqueueTx(ctx, tx,
			paEvent.EventID, "ProviderAcked",
			dispatchID, contractID, intentID, tenantID, traceID,
			paEvent,
		); err != nil {
			return err
		}
		return l.dispatchRepo.MarkProviderAckedTx(ctx, tx, dispatchID, pspResp.PayoutID, pspResp.Status)
	}); err != nil {
		log.Error("dispatch_loop: step5 ProviderAcked write failed", zap.Error(err))
		// PSP succeeded but write failed. Mark awaiting signal so the
		// recovery sweeper can reconcile without re-calling PSP.
		l.markAwaitingProviderSignal(ctx, dispatchID, contractID, intentID, tenantID, traceID,
			"PROVIDER_ACKED_WRITE_FAILED", log)
		return
	}

	log.Info("dispatch_loop: step5 ProviderAcked written",
		zap.String("provider_attempt_id", pspResp.PayoutID),
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance evaluation (Step 1.5)
// ─────────────────────────────────────────────────────────────────────────────

func (l *DispatchLoop) evaluateGovernance(_ context.Context, dispatchID, connectorID string, _ model.OutboxPayload) (model.GovernanceDecision, []string) {
	var reasonCodes []string

	if l.circuitOpen() {
		reasonCodes = append(reasonCodes, "CIRCUIT_BREAKER_OPEN")
		return model.GovernanceHold, reasonCodes
	}

	if connectorID == "" {
		reasonCodes = append(reasonCodes, "CONNECTOR_NOT_CONFIGURED")
		return model.GovernanceTerminalFail, reasonCodes
	}

	// Future: connector_health_state lookup, execution window, tenant policy, retry budget.
	return model.GovernanceAllow, reasonCodes
}

// ─────────────────────────────────────────────────────────────────────────────
// PSP error classification
// ─────────────────────────────────────────────────────────────────────────────

func classifyPSPError(err error) (retryClass string, isFatal bool, isUncertain bool) {
	msg := err.Error()

	for _, s := range []string{"context deadline", "timeout", "deadline exceeded", "i/o timeout"} {
		if containsCI(msg, s) {
			return string(model.RetryClassWaitForSignal), false, true
		}
	}

	for _, s := range []string{"HTTP 4", "400", "422", "404", "403", "401"} {
		if containsCI(msg, s) {
			return string(model.RetryClassNeverRetry), true, false
		}
	}

	return string(model.RetryClassRetryableAfterBackoff), false, false
}

func containsCI(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || func() bool {
		for i := 0; i <= len(s)-len(sub); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	}())
}

// ─────────────────────────────────────────────────────────────────────────────
// Failure helpers — all owned by Service 4 after Step 1
// ─────────────────────────────────────────────────────────────────────────────

func (l *DispatchLoop) markFailedRetryable(
	ctx context.Context,
	dispatchID, contractID, intentID, tenantID, traceID string,
	retryClass, failureCode, reason string,
	log *zap.Logger,
) {
	nextAttempt := time.Now().UTC().Add(30 * time.Second)
	failedAt := time.Now().UTC()

	dfEvent := model.DispatchFailedEvent{
		EventID: uuid.New().String(), EventType: "DispatchFailed",
		TenantID: tenantID, IntentID: intentID, ContractID: contractID,
		DispatchID: dispatchID, TraceID: traceID, SchemaVersion: "v1",
		CreatedAt: failedAt,
		Payload: model.DispatchFailedPayload{
			DispatchID: dispatchID, AttemptCount: 1,
			Reason: fmt.Sprintf("%s: %s", failureCode, reason), FailedAt: failedAt,
		},
	}

	if err := l.atomicStep(ctx, func(tx *sql.Tx) error {
		if err := l.outboxRepo.EnqueueTx(ctx, tx,
			dfEvent.EventID, "DispatchFailed",
			dispatchID, contractID, intentID, tenantID, traceID, dfEvent,
		); err != nil {
			return err
		}
		return l.dispatchRepo.MarkFailedRetryableTx(ctx, tx, dispatchID, retryClass, nextAttempt)
	}); err != nil {
		log.Error("dispatch_loop: mark failed retryable write error",
			zap.String("dispatch_id", dispatchID), zap.Error(err))
	}
}

func (l *DispatchLoop) markFailedTerminal(
	ctx context.Context,
	dispatchID, contractID, intentID, tenantID, traceID, reason string,
	log *zap.Logger,
) {
	failedAt := time.Now().UTC()
	dfEvent := model.DispatchFailedEvent{
		EventID: uuid.New().String(), EventType: "DispatchFailed",
		TenantID: tenantID, IntentID: intentID, ContractID: contractID,
		DispatchID: dispatchID, TraceID: traceID, SchemaVersion: "v1",
		CreatedAt: failedAt,
		Payload: model.DispatchFailedPayload{
			DispatchID: dispatchID, AttemptCount: 1,
			Reason: reason, FailedAt: failedAt,
		},
	}

	if err := l.atomicStep(ctx, func(tx *sql.Tx) error {
		if err := l.outboxRepo.EnqueueTx(ctx, tx,
			dfEvent.EventID, "DispatchFailed",
			dispatchID, contractID, intentID, tenantID, traceID, dfEvent,
		); err != nil {
			return err
		}
		return l.dispatchRepo.MarkFailedTerminalTx(ctx, tx, dispatchID)
	}); err != nil {
		log.Error("dispatch_loop: mark failed terminal write error",
			zap.String("dispatch_id", dispatchID), zap.Error(err))
	}
}

func (l *DispatchLoop) markAwaitingProviderSignal(
	ctx context.Context,
	dispatchID, contractID, intentID, tenantID, traceID, reason string,
	log *zap.Logger,
) {
	awaitEvent := model.DispatchAwaitingProviderSignalEvent{
		EventID: uuid.New().String(), EventType: "DispatchAwaitingProviderSignal",
		TenantID: tenantID, IntentID: intentID, ContractID: contractID,
		DispatchID: dispatchID, TraceID: traceID, SchemaVersion: "v1",
		CreatedAt: time.Now().UTC(),
		Payload: model.DispatchAwaitingProviderSignalPayload{
			DispatchID:             dispatchID,
			ProviderIdempotencyKey: dispatchID,
			Reason:                 reason,
			SentAt:                 time.Now().UTC(),
		},
	}

	if err := l.atomicStep(ctx, func(tx *sql.Tx) error {
		if err := l.outboxRepo.EnqueueTx(ctx, tx,
			awaitEvent.EventID, "DispatchAwaitingProviderSignal",
			dispatchID, contractID, intentID, tenantID, traceID, awaitEvent,
		); err != nil {
			return err
		}
		return l.dispatchRepo.MarkAwaitingProviderSignalTx(ctx, tx, dispatchID)
	}); err != nil {
		log.Error("dispatch_loop: mark awaiting signal write error",
			zap.String("dispatch_id", dispatchID), zap.Error(err))
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

func (l *DispatchLoop) atomicStep(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := l.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

func (l *DispatchLoop) sleep(ctx context.Context, d time.Duration) {
	select {
	case <-ctx.Done():
	case <-time.After(d):
	}
}

// buildRequestFingerprint creates a non-PII hash for audit/replay purposes.
// Contains only dispatch_id, amount string, and corridor — no account numbers or names.
func buildRequestFingerprint(dispatchID, amount, corridor string) string {
	h := sha256.Sum256([]byte(dispatchID + "|" + amount + "|" + corridor))
	return fmt.Sprintf("%x", h)
}

// amountFromString converts a decimal string amount (e.g. "100.50") to int64.
// Amount is expected in major currency units; conversion to minor units (paise)
// is the PSP connector's responsibility. For the demo client this is fine as-is.
func amountFromString(amount string) int64 {
	if amount == "" {
		return 0
	}
	var f float64
	fmt.Sscanf(amount, "%f", &f)
	return int64(f)
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit breaker
// ─────────────────────────────────────────────────────────────────────────────

func (l *DispatchLoop) recordPSPSuccess() {
	l.cbMu.Lock()
	defer l.cbMu.Unlock()
	l.cbFailures = 0
	l.cbOpenAt = time.Time{}
}

func (l *DispatchLoop) recordPSPFailure() {
	threshold := l.cfg.PSPCircuitBreakerThreshold
	if threshold <= 0 {
		threshold = 5
	}
	l.cbMu.Lock()
	defer l.cbMu.Unlock()
	l.cbFailures++
	if l.cbFailures >= threshold && l.cbOpenAt.IsZero() {
		l.cbOpenAt = time.Now()
		logger.Logger.Error("dispatch_loop: circuit breaker OPENED",
			zap.Int("consecutive_failures", l.cbFailures))
	}
}

func (l *DispatchLoop) circuitOpen() bool {
	resetSecs := l.cfg.PSPCircuitResetSecs
	if resetSecs <= 0 {
		resetSecs = 60
	}
	l.cbMu.Lock()
	defer l.cbMu.Unlock()
	if l.cbOpenAt.IsZero() {
		return false
	}
	if time.Since(l.cbOpenAt) >= time.Duration(resetSecs)*time.Second {
		logger.Logger.Info("dispatch_loop: circuit breaker RESET")
		l.cbFailures = 0
		l.cbOpenAt = time.Time{}
		return false
	}
	return true
}
