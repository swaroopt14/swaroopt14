package services

// ============================================================
// action_service.go
// ============================================================
//
// Creates ActionContracts and their matching outbox entries.
// Called by policy_service when a rule fires.
//
// GAP #2 — Structured logging:
//   fmt.Printf replaced with logger.Info / logger.Error
//   Output is now JSON, parseable by Datadog/Grafana/CloudWatch
//
// GAP #3 — Database transaction:
//   ActionContract insert + outbox insert now happen in ONE transaction.
//   If anything fails mid-way, both writes are rolled back atomically.
//
// BUG FIX (from compile error):
//   The previous version defined a custom interface for the tx parameter:
//     interface{ Exec(...) (interface{RowsAffected() int64}, error) }
//   This was WRONG. pgx.Tx.Exec returns (pgconn.CommandTag, error),
//   not (interface{RowsAffected() int64}, error).
//   So pgx.Tx did not satisfy that interface → compile error.
//
//   THE FIX: use pgx.Tx directly as the type.
//   pgx.Tx is the actual transaction type from the pgx library.
//   No custom interface needed. No mismatch possible.

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/logger"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// ActionService creates and stores ActionContracts.
type ActionService struct {
	actionRepo *persistence.ActionContractRepo
	outboxRepo *persistence.OutboxRepo
	pool       *pgxpool.Pool // needed to open transactions (Gap #3)
}

// NewActionService creates an ActionService.
// pool is required for transaction support added in Gap #3.
func NewActionService(
	actionRepo *persistence.ActionContractRepo,
	outboxRepo *persistence.OutboxRepo,
	pool *pgxpool.Pool,
) *ActionService {
	return &ActionService{
		actionRepo: actionRepo,
		outboxRepo: outboxRepo,
		pool:       pool,
	}
}

// CreateActionRequest holds everything needed to create an ActionContract.
type CreateActionRequest struct {
	TenantID       string
	PolicyID       string
	PolicyVersion  int
	ScopeRefs      models.ScopeRefs
	InputRefsJSON  string
	Decision       models.Decision
	Confidence     float64
	PayloadJSON    string
	TriggerEventID string
}

// CreateAction creates an ActionContract and its outbox entry atomically.
//
// WHY "ATOMICALLY"?
// ──────────────────
// Before Gap #3, the code did:
//
//	s.actionRepo.InsertIfNew(ctx, contract)   ← DB write 1
//	s.outboxRepo.Insert(ctx, outboxEntry)     ← DB write 2
//
// If the service crashed between write 1 and write 2:
//   - ActionContract exists in DB  ✓  (decision was recorded)
//   - Outbox entry MISSING         ✗  (Kafka message never sent)
//   - Ops never gets the ESCALATE alert
//   - SLA breach goes unnoticed
//
// With a transaction, either BOTH writes succeed, or NEITHER does.
// The Kafka consumer will redeliver the event, and we try again from scratch.
func (s *ActionService) CreateAction(
	ctx context.Context,
	req CreateActionRequest,
) error {

	// ── Build idempotency key ─────────────────────────────────────────────
	// SHA-256(policy_id + scope_refs + trigger_event_id)
	// Same inputs → same key → DB UNIQUE constraint silently ignores duplicate
	scopeJSON, err := json.Marshal(req.ScopeRefs)
	if err != nil {
		return fmt.Errorf("action_service.CreateAction marshal scope_refs: %w", err)
	}
	idempotencyKey := buildIdempotencyKey(req.PolicyID, string(scopeJSON), req.TriggerEventID)

	// ── Generate IDs and build the contract ──────────────────────────────
	actionID := "act_" + uuid.New().String()
	now := time.Now().UTC()

	contract := models.ActionContract{
		ActionID:       actionID,
		TenantID:       req.TenantID,
		PolicyID:       req.PolicyID,
		PolicyVersion:  req.PolicyVersion,
		ScopeRefs:      req.ScopeRefs,
		InputRefsJSON:  req.InputRefsJSON,
		Decision:       req.Decision,
		Confidence:     req.Confidence,
		PayloadJSON:    req.PayloadJSON,
		IdempotencyKey: idempotencyKey,
		CreatedAt:      now,
	}
	contract.Signature = signContract(contract, string(scopeJSON))

	// Decide whether this decision needs Kafka delivery
	needsOutbox := !req.Decision.IsSafe() || needsActuation(req.Decision)

	// ── Open a database transaction ───────────────────────────────────────
	//
	// pool.Begin(ctx) returns a pgx.Tx — an open transaction on ONE connection.
	//
	// WHAT IS A TRANSACTION?
	// Think of it like a shopping cart:
	//   - You add items to the cart (DB writes inside the transaction)
	//   - You press "Confirm Order" (tx.Commit) → all items are saved
	//   - OR you press "Cancel" (tx.Rollback) → cart is emptied, nothing saved
	//
	// If the service crashes mid-way, Postgres automatically rolls back
	// any uncommitted transaction — just like cancelling the cart.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("action_service.CreateAction begin tx: %w", err)
	}

	// defer runs when the function exits, no matter what path it takes.
	// Rollback is safe to call even after a successful Commit — it becomes a no-op.
	// This pattern ensures the transaction is NEVER left hanging open.
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	// ── Write 1: Insert ActionContract (inside transaction) ───────────────
	inserted, err := s.actionRepo.InsertIfNewTx(ctx, tx, contract)
	if err != nil {
		return fmt.Errorf("action_service.CreateAction insert contract: %w", err)
	}
	if !inserted {
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("action_service.CreateAction commit duplicate: %w", err)
		}
		logger.Info("action deduplicated by idempotency key",
			"policy_id", req.PolicyID,
			"tenant_id", req.TenantID,
			"idempotency_key", idempotencyKey,
		)
		return nil
	}

	// ── Write 2: Insert outbox entry (inside SAME transaction) ───────────
	if needsOutbox {
		outboxEntry := models.ActuationOutbox{
			EventID:     "evt_" + uuid.New().String(),
			ActionID:    actionID,
			EventType:   string(req.Decision),
			Payload:     buildOutboxPayload(req, actionID),
			Status:      models.OutboxStatusPending,
			Attempts:    0,
			NextRetryAt: now,
			CreatedAt:   now,
		}
		if err := s.outboxRepo.InsertTx(ctx, tx, outboxEntry); err != nil {
			// defer tx.Rollback will also undo the action_contracts insert above
			return fmt.Errorf("action_service.CreateAction insert outbox: %w", err)
		}
	}

	// ── Commit: make both writes permanent ────────────────────────────────
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("action_service.CreateAction commit: %w", err)
	}

	// ── Structured log (Gap #2) ───────────────────────────────────────────
	// BEFORE: fmt.Printf("action_service: created action %s...\n", ...)
	//   → plain text, no timestamp, no level, invisible to monitoring
	//
	// AFTER: logger.Info with named fields
	//   → JSON with level=INFO, all fields searchable in Datadog
	logger.Info("action created",
		"action_id", actionID,
		"policy_id", req.PolicyID,
		"decision", string(req.Decision),
		"confidence", req.Confidence,
		"tenant_id", req.TenantID,
		"needs_outbox", needsOutbox,
	)

	return nil
}

// ── Private helpers ───────────────────────────────────────────────────────────

func buildIdempotencyKey(policyID, scopeRefsJSON, triggerEventID string) string {
	raw := fmt.Sprintf("%s|%s|%s", policyID, scopeRefsJSON, triggerEventID)
	hash := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", hash)
}

func signContract(ac models.ActionContract, scopeJSON string) string {
	canonical := fmt.Sprintf("%s|%s|%s|%s|%.3f|%s",
		ac.ActionID, ac.TenantID, ac.PolicyID,
		string(ac.Decision), ac.Confidence, scopeJSON,
	)
	hash := sha256.Sum256([]byte(canonical))
	return fmt.Sprintf("sha256:%x", hash)
}

func needsActuation(d models.Decision) bool {
	switch d {
	case models.DecisionEscalate,
		models.DecisionNotify,
		models.DecisionOpenOpsIncident,
		models.DecisionGenerateEvidence,
		models.DecisionHold,
		models.DecisionRetry:
		return true
	}
	return false
}

func buildOutboxPayload(req CreateActionRequest, actionID string) string {
	payload := map[string]any{
		"action_id":  actionID,
		"tenant_id":  req.TenantID,
		"policy_id":  req.PolicyID,
		"decision":   string(req.Decision),
		"scope_refs": req.ScopeRefs,
		"payload":    req.PayloadJSON,
		"created_at": time.Now().UTC(),
	}
	b, _ := json.Marshal(payload)
	return string(b)
}
