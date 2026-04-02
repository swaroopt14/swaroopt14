package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"
	"zord-relay/model"
	"zord-relay/psp"
	"zord-relay/utils"

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
// Corrected lifecycle — per architecture review document:
//
//   Step 0  — Lease from Service 2
//   Step 1  — DispatchCreated: durably accept work, write dispatches row + event.
//             ACK Service 2 immediately after this commits.
//             Service 2 is now out of the picture. All retries owned by Service 4.
//   Step 1.5— Governance evaluation: check connector health, circuit breaker,
//             execution window, retry budget. Outputs ALLOW / HOLD / FAIL.
//   Step 2  — Detokenize JIT: call Service 3 with tokens. PII in memory only.
//   Step 3  — AttemptSent: persist before PSP call. Crash-recovery anchor.
//   Step 4  — PSP call: submit payout. Classify outcome.
//   Step 5  — ProviderAcked / AwaitingSignal / FailedRetryable / FailedTerminal
// ─────────────────────────────────────────────────────────────────────────────

type DispatchLoop struct {
	db           *sql.DB
	intentClient IntentClientIface
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
	intentClient IntentClientIface,
	outboxRepo *RelayOutboxRepo,
	dispatchRepo *DispatchRepo,
	pspClient psp.Client,
	tokenClient TokenClient,
	cfg *DispatchLoopConfig,
) *DispatchLoop {
	return &DispatchLoop{
		db:           db,
		intentClient: intentClient,
		outboxRepo:   outboxRepo,
		dispatchRepo: dispatchRepo,
		pspClient:    pspClient,
		tokenClient:  tokenClient,
		cfg:          cfg,
	}
}

func (l *DispatchLoop) Start(ctx context.Context, wg *sync.WaitGroup) {
	workCh := make(chan model.OutboxEvent, l.cfg.WorkerCount*2)

	for i := 0; i < l.cfg.WorkerCount; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			l.worker(ctx, workerID, workCh)
		}(i)
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		defer close(workCh)
		l.poller(ctx, workCh)
	}()
}

// poller leases batches from Service 2 and fans events out to workers.
// It no longer waits for worker results to decide ack/nack —
// that decision is made inside the worker immediately after Step 1.
func (l *DispatchLoop) poller(ctx context.Context, workCh chan<- model.OutboxEvent) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if l.circuitOpen() {
			utils.Logger.Warn("dispatch_loop: circuit open — pausing lease",
				zap.Int("reset_after_seconds", func() int {
					if l.cfg.PSPCircuitResetSecs > 0 {
						return l.cfg.PSPCircuitResetSecs
					}
					return 60
				}()),
			)
			l.sleep(ctx, l.cfg.PollInterval*5)
			continue
		}

		lease, err := l.intentClient.Lease(ctx, l.cfg.BatchSize, l.cfg.LeaseTTLSecs)
		if err != nil {
			utils.Logger.Warn("dispatch_loop: lease failed", zap.Error(err))
			l.sleep(ctx, l.cfg.PollInterval)
			continue
		}
		if len(lease.Events) == 0 {
			l.sleep(ctx, l.cfg.PollInterval)
			continue
		}

		utils.Logger.Info("dispatch_loop: leased batch",
			zap.String("lease_id", lease.LeaseID),
			zap.Int("count", len(lease.Events)),
		)

		for _, e := range lease.Events {
			select {
			case <-ctx.Done():
				return
			case workCh <- e:
			}
		}
	}
}

// worker processes each event through the full lifecycle.
func (l *DispatchLoop) worker(ctx context.Context, workerID int, workCh <-chan model.OutboxEvent) {
	for e := range workCh {
		l.processEvent(ctx, workerID, e)
	}
}

// processEvent runs the corrected lifecycle for a single outbox event.
//
// KEY CHANGE from previous design:
// Service 2 is ACKed immediately after Step 1 commits — not at the end.
// All failures after Step 1 are owned entirely by Service 4.
// Service 2 is ONLY nacked if Step 1 itself fails (i.e. we never took ownership).
func (l *DispatchLoop) processEvent(ctx context.Context, workerID int, e model.OutboxEvent) {
	log := utils.Logger.With(
		zap.Int("worker_id", workerID),
		zap.String("event_id", e.ID),
		zap.String("contract_id", e.ContractID),
		zap.String("intent_id", e.AggregateID),
		zap.String("tenant_id", e.TenantID),
		zap.String("trace_id", e.TraceID),
	)

	var payload model.OutboxPayload
	if err := json.Unmarshal(e.Payload, &payload); err != nil {
		log.Error("dispatch_loop: failed to parse outbox payload", zap.Error(err))
		l.nackEvent(ctx, e.LeaseID, e.ID, log)
		return
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
	contractID := e.ContractID
	tenantID := e.TenantID
	traceID := e.TraceID

	// =========================================================
	// STEP 1: DispatchCreated — take ownership
	// Idempotency check: reuse existing dispatch_id on re-lease.
	// After this atomic commit, ACK Service 2 immediately.
	// =========================================================
	existing, err := l.dispatchRepo.FindByContractAndAttempt(ctx, contractID, 1)
	if err != nil {
		log.Error("dispatch_loop: step1 idempotency check failed", zap.Error(err))
		l.nackEvent(ctx, e.LeaseID, e.ID, log)
		return
	}

	var dispatchID string

	if existing != nil {
		dispatchID = existing.DispatchID
		log.Info("dispatch_loop: step1 reusing existing dispatch_id",
			zap.String("dispatch_id", dispatchID),
			zap.String("existing_status", string(existing.Status)),
		)
		// Already took ownership before. ACK Service 2 and continue.
		// If already PROVIDER_ACKED, nothing left to do.
		l.ackEvent(ctx, e.LeaseID, e.ID, log)
		if existing.Status == model.DispatchStatusProviderAcked {
			log.Info("dispatch_loop: step1 already provider_acked — skipping")
			return
		}
		// For other terminal statuses, we've re-acked Service 2 but won't re-dispatch.
		if existing.Status == model.DispatchStatusFailedTerminal ||
			existing.Status == model.DispatchStatusRequiresManualReview {
			log.Info("dispatch_loop: step1 terminal status — skipping re-dispatch",
				zap.String("status", string(existing.Status)),
			)
			return
		}
	} else {
		// First time — mint dispatch_id and take ownership.
		dispatchID = uuid.New().String()

		carriers := model.CorrelationCarriers{
			ReferenceID: dispatchID,
			Narration:   "ZRD:" + contractID,
		}
		carriersJSON, _ := json.Marshal(carriers)

		d := &model.Dispatch{
			DispatchID:              dispatchID,
			ContractID:              contractID,
			IntentID:                intentID,
			TenantID:                tenantID,
			TraceID:                 traceID,
			ConnectorID:             connectorID,
			CorridorID:              corridorID,
			AttemptCount:            1,
			Status:                  model.DispatchStatusPending,
			ProviderIdempotencyKey:  dispatchID,
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
			if err := l.dispatchRepo.InsertTx(ctx, tx, d); err != nil {
				return err
			}
			return l.outboxRepo.EnqueueTx(ctx, tx,
				dcEvent.EventID, "DispatchCreated",
				dispatchID, contractID, intentID, tenantID, traceID,
				dcEvent,
			)
		}); err != nil {
			log.Error("dispatch_loop: step1 atomic write failed", zap.Error(err))
			// Step 1 failed — we never took ownership. Nack to Service 2.
			l.nackEvent(ctx, e.LeaseID, e.ID, log)
			return
		}

		log.Info("dispatch_loop: step1 DispatchCreated — ownership taken",
			zap.String("dispatch_id", dispatchID),
		)

		// ── ACK SERVICE 2 HERE ──────────────────────────────────────────────
		// Ownership has been transferred to Service 4.
		// Service 2 is now completely out of the retry picture.
		// All subsequent failures are owned by Service 4.
		// ────────────────────────────────────────────────────────────────────
		l.ackEvent(ctx, e.LeaseID, e.ID, log)
	}

	// =========================================================
	// STEP 1.5: Dispatch Governance Evaluation
	// Check connector health, circuit breaker, execution window.
	// If not ALLOW_DISPATCH → persist decision, emit event, stop.
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
		// Governance write failed — retry will re-evaluate.
		// Service 2 is already acked. Service 4 retries internally.
		return
	}

	if decision != model.GovernanceAllow {
		log.Info("dispatch_loop: step1.5 governance blocked dispatch",
			zap.String("dispatch_id", dispatchID),
			zap.String("decision", string(decision)),
			zap.Strings("reason_codes", reasonCodes),
		)
		return
	}

	log.Info("dispatch_loop: step1.5 governance ALLOW_DISPATCH",
		zap.String("dispatch_id", dispatchID),
	)

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
		log.Error("dispatch_loop: step2 detokenize failed",
			zap.String("dispatch_id", dispatchID),
			zap.Error(err),
		)
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
		log.Error("dispatch_loop: step2 detokenize returned empty values",
			zap.String("dispatch_id", dispatchID),
		)
		l.markFailedTerminal(ctx, dispatchID, contractID, intentID, tenantID, traceID,
			"DETOKENIZE_EMPTY", log)
		return
	}

	// =========================================================
	// STEP 3: AttemptSent — crash-recovery anchor
	// Written BEFORE PSP call. If process dies after this,
	// we know a PSP call may have been in-flight for this dispatch_id.
	// =========================================================
	fingerprint := buildRequestFingerprint(dispatchID, e.Amount.String(), corridorID)
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
			AttemptCount: 1,
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

	log.Info("dispatch_loop: step3 AttemptSent written",
		zap.String("dispatch_id", dispatchID),
	)

	// =========================================================
	// STEP 4: PSP call
	// rb contains PII — zeroed by defer rb.Zero() after this returns.
	// Do NOT log rb.AccountNumber or rb.Name at any level.
	// =========================================================
	pspReq := psp.PayoutRequest{
		ReferenceID: dispatchID,
		Narration:   "ZRD:" + contractID,
		Amount:      amountFromOutbox(e.Amount),
		Mode:        corridorID,
		Beneficiary: psp.Beneficiary{
			Name:          rb.Name,
			AccountNumber: rb.AccountNumber,
			IFSC:          rb.IFSC,
		},
	}

	pspResp, pspErr := l.pspClient.Do(ctx, pspReq)
	// defer rb.Zero() fires here — PII gone from memory.

	if pspErr != nil {
		// Classify the failure before deciding next action.
		retryClass, isFatal, isUncertain := classifyPSPError(pspErr)

		log.Error("dispatch_loop: step4 PSP call failed",
			zap.String("dispatch_id", dispatchID),
			zap.String("retry_class", retryClass),
			zap.Bool("is_fatal", isFatal),
			zap.Bool("is_uncertain", isUncertain),
			zap.Error(pspErr),
		)

		l.recordPSPFailure()

		if isUncertain {
			// Timeout or ambiguous response.
			// The money MAY have already moved. Do NOT retry without querying PSP.
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
		zap.String("dispatch_id", dispatchID),
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
		log.Error("dispatch_loop: step5 ProviderAcked write failed",
			zap.String("dispatch_id", dispatchID),
			zap.Error(err),
		)
		// PSP succeeded but write failed. Mark awaiting signal so the
		// recovery sweeper can reconcile later without re-calling PSP.
		l.markAwaitingProviderSignal(ctx, dispatchID, contractID, intentID, tenantID, traceID,
			"PROVIDER_ACKED_WRITE_FAILED", log)
		return
	}

	log.Info("dispatch_loop: step5 ProviderAcked written",
		zap.String("dispatch_id", dispatchID),
		zap.String("provider_attempt_id", pspResp.PayoutID),
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance evaluation (Step 1.5)
// ─────────────────────────────────────────────────────────────────────────────

// evaluateGovernance checks whether dispatch is allowed at this moment.
// Returns the decision and a list of reason codes.
func (l *DispatchLoop) evaluateGovernance(_ context.Context, dispatchID, connectorID string, _ model.OutboxPayload) (model.GovernanceDecision, []string) {
	var reasonCodes []string

	// Check circuit breaker state.
	if l.circuitOpen() {
		reasonCodes = append(reasonCodes, "CIRCUIT_BREAKER_OPEN")
		return model.GovernanceHold, reasonCodes
	}

	// Connector must be configured.
	if connectorID == "" {
		reasonCodes = append(reasonCodes, "CONNECTOR_NOT_CONFIGURED")
		return model.GovernanceTerminalFail, reasonCodes
	}

	// Future checks to add here:
	// - connector_health_state table lookup
	// - execution window validation (T+1 etc)
	// - tenant policy check
	// - retry budget check

	return model.GovernanceAllow, reasonCodes
}

// ─────────────────────────────────────────────────────────────────────────────
// PSP error classification
// ─────────────────────────────────────────────────────────────────────────────

// classifyPSPError returns (retryClass, isFatal, isUncertain).
// isUncertain = true means the call may have succeeded (timeout/network).
// isFatal = true means the PSP rejected the request explicitly.
func classifyPSPError(err error) (retryClass string, isFatal bool, isUncertain bool) {
	msg := err.Error()

	// Context deadline or timeout — uncertain whether money moved.
	for _, s := range []string{"context deadline", "timeout", "deadline exceeded", "i/o timeout"} {
		if containsCI(msg, s) {
			return string(model.RetryClassWaitForSignal), false, true
		}
	}

	// PSP explicit business reject (4xx) — fatal, do not retry.
	for _, s := range []string{"HTTP 4", "400", "422", "404", "403", "401"} {
		if containsCI(msg, s) {
			return string(model.RetryClassNeverRetry), true, false
		}
	}

	// Transient server errors (5xx) — retryable.
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
	nextAttempt := time.Now().UTC().Add(30 * time.Second) // basic backoff; sweeper can refine
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
// Ack / Nack helpers
// ─────────────────────────────────────────────────────────────────────────────

func (l *DispatchLoop) ackEvent(ctx context.Context, leaseID, eventID string, log *zap.Logger) {
	if err := l.intentClient.Ack(ctx, leaseID, []string{eventID}); err != nil {
		log.Error("dispatch_loop: ack failed — will retry on lease expiry",
			zap.String("event_id", eventID), zap.Error(err))
	}
}

func (l *DispatchLoop) nackEvent(ctx context.Context, leaseID, eventID string, log *zap.Logger) {
	if err := l.intentClient.Nack(ctx, leaseID, []string{eventID}); err != nil {
		log.Error("dispatch_loop: nack failed",
			zap.String("event_id", eventID), zap.Error(err))
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
// Contains only dispatch_id, amount, and corridor — no account numbers or names.
func buildRequestFingerprint(dispatchID, amount, corridor string) string {
	h := sha256.Sum256([]byte(dispatchID + "|" + amount + "|" + corridor))
	return fmt.Sprintf("%x", h)
}

// amountFromOutbox passes the amount through exactly as stored in Service 2.
// No unit conversion. Service 4 is not responsible for amount semantics.
func amountFromOutbox(amount json.Number) int64 {
	value, err := amount.Int64()
	if err != nil {
		f, ferr := amount.Float64()
		if ferr != nil {
			return 0
		}
		return int64(f)
	}
	return value
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
		utils.Logger.Error("dispatch_loop: circuit breaker OPENED",
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
		utils.Logger.Info("dispatch_loop: circuit breaker RESET")
		l.cbFailures = 0
		l.cbOpenAt = time.Time{}
		return false
	}
	return true
}
