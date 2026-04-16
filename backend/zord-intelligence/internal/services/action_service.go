package services

// ============================================================
// action_service.go
// ============================================================
//
// Creates ActionContracts and their matching outbox entries.
// Called by policy_service when a rule fires.
//
// PHASE 5 ADDITIONS:
//
// 1. REQUIRES_MANUAL_APPROVAL SUPPORT
//    When a policy has requires_manual_approval=true, OR the decision itself
//    requires approval (HOLD, RETRY, REVIEW_AMBIGUOUS_BATCH), the ActionContract
//    is created with contract_status = PENDING_APPROVAL and NO outbox entry.
//    The outbox entry is only inserted when ops approves the action via the API.
//
// 2. EXPIRY WINDOWS
//    PENDING_APPROVAL contracts are given an expires_at deadline.
//    Default: 24h. The outbox_worker sweeps and marks expired contracts.
//    This prevents stale approval requests from lingering indefinitely.
//
// 3. POLICY METADATA PROPAGATION
//    policy_family and severity are now carried from the policy into
//    the ActionContract at creation time. This enables family-scoped
//    and severity-scoped dashboard queries without parsing DSL text.
//
// 4. ACTUATION GATING
//    needsActuation() is extended to cover all new Phase 5 decision types
//    that should produce Kafka messages (not just advisory records).

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
	pool       *pgxpool.Pool // needed to open transactions
}

// NewActionService creates an ActionService.
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
//
// PHASE 5: RequiresManualApproval, PolicyFamily, Severity are new.
// They come from the Policy row that triggered this action.
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

	// PHASE 5 — sourced from policy_registry
	RequiresManualApproval bool             // policy.RequiresManualApproval
	PolicyFamily           models.PolicyFamily // policy.PolicyFamily
	Severity               string           // parsed from DSL or policy.Severity column
}

// CreateAction creates an ActionContract and its outbox entry atomically.
//
// PHASE 5 APPROVAL LOGIC:
//
// A decision enters PENDING_APPROVAL when:
//   a) The Policy has requires_manual_approval = true (DB column), OR
//   b) The Decision itself always requires approval (HOLD, RETRY, REVIEW_AMBIGUOUS_BATCH)
//
// When PENDING_APPROVAL:
//   - ActionContract is inserted with contract_status = PENDING_APPROVAL
//   - No outbox entry is created (outbox_worker would skip it anyway, but
//     we save a row to make the approval dashboard query simpler)
//   - expires_at is set to now + ApprovalDefaultExpiryHours
//
// When ACTIVE (normal path):
//   - ActionContract is inserted with contract_status = ACTIVE
//   - Outbox entry is created in the SAME transaction (atomic)
//   - Outbox worker delivers to Kafka on next poll
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

	// ── Determine contract status ─────────────────────────────────────────
	// PHASE 5: the approval gate. Two conditions force PENDING_APPROVAL:
	//   1. The policy explicitly declares it needs human approval
	//   2. The decision type always requires human approval by design
	needsApproval := req.RequiresManualApproval || req.Decision.RequiresApproval()

	contractStatus := models.ContractStatusActive
	var expiresAt *time.Time
	if needsApproval {
		contractStatus = models.ContractStatusPendingApproval
		// Set a 24-hour window for approval. After this, outbox_worker auto-expires.
		exp := time.Now().UTC().Add(models.ApprovalDefaultExpiryHours * time.Hour)
		expiresAt = &exp
	}

	// ── Build the ActionContract ──────────────────────────────────────────
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
		ContractStatus: contractStatus, // PHASE 5
		ExpiresAt:      expiresAt,      // PHASE 5
		PolicyFamily:   req.PolicyFamily, // PHASE 5
		Severity:       req.Severity,   // PHASE 5
		CreatedAt:      now,
	}
	contract.Signature = signContract(contract, string(scopeJSON))

	// ── Decide if an outbox entry is needed ───────────────────────────────
	// No outbox for PENDING_APPROVAL — we wait for human sign-off.
	// No outbox for advisory/audit-only decisions — they produce no Kafka message.
	needsOutbox := contractStatus == models.ContractStatusActive && needsActuation(req.Decision)

	// ── Open a database transaction ───────────────────────────────────────
	// Either BOTH the contract and outbox entry land in the DB, or neither does.
	// This eliminates the "contract inserted but Kafka never fires" failure mode.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("action_service.CreateAction begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// ── Write 1: Insert ActionContract ───────────────────────────────────
	inserted, err := s.actionRepo.InsertIfNewTx(ctx, tx, contract)
	if err != nil {
		return fmt.Errorf("action_service.CreateAction insert contract: %w", err)
	}
	if !inserted {
		// Idempotent — already processed this exact (policy, scope, trigger) triple.
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

	// ── Write 2: Insert outbox entry (only when actuation is needed) ──────
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
			return fmt.Errorf("action_service.CreateAction insert outbox: %w", err)
		}
	}

	// ── Commit ────────────────────────────────────────────────────────────
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("action_service.CreateAction commit: %w", err)
	}

	// ── Structured log ────────────────────────────────────────────────────
	logger.Info("action created",
		"action_id", actionID,
		"policy_id", req.PolicyID,
		"decision", string(req.Decision),
		"confidence", req.Confidence,
		"tenant_id", req.TenantID,
		"contract_status", string(contractStatus),
		"policy_family", string(req.PolicyFamily),
		"severity", req.Severity,
		"needs_approval", needsApproval,
		"needs_outbox", needsOutbox,
	)

	return nil
}

// ApproveAction transitions a PENDING_APPROVAL contract to APPROVED and
// inserts its outbox entry so the outbox_worker can deliver it to Kafka.
//
// PHASE 5: This is the "human approved it" path.
//
// Returns (true, nil)  → approved successfully, outbox entry created
// Returns (false, nil) → action not found or not in PENDING_APPROVAL state
// Returns (false, err) → database error
func (s *ActionService) ApproveAction(
	ctx context.Context,
	tenantID, actionID string,
) (approved bool, err error) {
	// Fetch the current contract to get the decision type and payload
	contract, err := s.actionRepo.GetByID(ctx, actionID)
	if err != nil {
		return false, fmt.Errorf("action_service.ApproveAction GetByID action=%s: %w", actionID, err)
	}
	if contract == nil {
		return false, nil // not found
	}
	if contract.TenantID != tenantID {
		return false, nil // wrong tenant — treat as not found (security)
	}
	if contract.ContractStatus != models.ContractStatusPendingApproval {
		return false, nil // already resolved or active
	}

	// Open a transaction: status update + outbox insert must be atomic.
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("action_service.ApproveAction begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Transition to APPROVED
	updated, err := s.actionRepo.UpdateStatus(ctx, actionID, models.ContractStatusApproved)
	if err != nil {
		return false, fmt.Errorf("action_service.ApproveAction UpdateStatus action=%s: %w", actionID, err)
	}
	if !updated {
		// Race condition: another goroutine already processed this approval
		return false, nil
	}

	// Insert outbox entry now that approval is confirmed.
	// Build a synthetic CreateActionRequest just for buildOutboxPayload.
	req := CreateActionRequest{
		TenantID:     contract.TenantID,
		PolicyID:     contract.PolicyID,
		PolicyVersion: contract.PolicyVersion,
		ScopeRefs:    contract.ScopeRefs,
		Decision:     contract.Decision,
		PayloadJSON:  contract.PayloadJSON,
	}
	now := time.Now().UTC()
	outboxEntry := models.ActuationOutbox{
		EventID:     "evt_" + uuid.New().String(),
		ActionID:    actionID,
		EventType:   string(contract.Decision),
		Payload:     buildOutboxPayload(req, actionID),
		Status:      models.OutboxStatusPending,
		Attempts:    0,
		NextRetryAt: now,
		CreatedAt:   now,
	}
	if err := s.outboxRepo.InsertTx(ctx, tx, outboxEntry); err != nil {
		return false, fmt.Errorf("action_service.ApproveAction insert outbox: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("action_service.ApproveAction commit: %w", err)
	}

	logger.Info("action approved",
		"action_id", actionID,
		"tenant_id", tenantID,
		"decision", string(contract.Decision),
	)
	return true, nil
}

// DismissAction transitions a PENDING_APPROVAL contract to DISMISSED.
// No outbox entry is created — the decision is permanently abandoned.
//
// Returns (true, nil)  → dismissed successfully
// Returns (false, nil) → action not found or not in PENDING_APPROVAL state
func (s *ActionService) DismissAction(
	ctx context.Context,
	tenantID, actionID string,
) (dismissed bool, err error) {
	contract, err := s.actionRepo.GetByID(ctx, actionID)
	if err != nil {
		return false, fmt.Errorf("action_service.DismissAction GetByID action=%s: %w", actionID, err)
	}
	if contract == nil || contract.TenantID != tenantID {
		return false, nil
	}
	if contract.ContractStatus != models.ContractStatusPendingApproval {
		return false, nil
	}

	updated, err := s.actionRepo.UpdateStatus(ctx, actionID, models.ContractStatusDismissed)
	if err != nil {
		return false, fmt.Errorf("action_service.DismissAction UpdateStatus action=%s: %w", actionID, err)
	}

	if updated {
		logger.Info("action dismissed",
			"action_id", actionID,
			"tenant_id", tenantID,
			"decision", string(contract.Decision),
		)
	}
	return updated, nil
}

// ── Private helpers ────────────────────────────────────────────────────────────

// buildIdempotencyKey creates a stable SHA-256 key from policy+scope+trigger.
// Same inputs always produce the same key — duplicate events are silently skipped.
func buildIdempotencyKey(policyID, scopeRefsJSON, triggerEventID string) string {
	raw := fmt.Sprintf("%s|%s|%s", policyID, scopeRefsJSON, triggerEventID)
	hash := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", hash)
}

// signContract creates a SHA-256 signature over the immutable fields of the contract.
// In production, replace with ed25519 signing via KMS for tamper-evident audit trail.
func signContract(ac models.ActionContract, scopeJSON string) string {
	canonical := fmt.Sprintf("%s|%s|%s|%s|%.3f|%s",
		ac.ActionID, ac.TenantID, ac.PolicyID,
		string(ac.Decision), ac.Confidence, scopeJSON,
	)
	hash := sha256.Sum256([]byte(canonical))
	return fmt.Sprintf("sha256:%x", hash)
}

// needsActuation returns true when the decision should produce a Kafka message.
//
// PHASE 5: Extended to include all new decision types that need delivery.
//
// DESIGN:
//   - Safe advisory decisions (ADVISORY_RECOMMENDATION, ALLOW) → no Kafka message
//   - PENDING_APPROVAL decisions → no outbox at create time (added on approval)
//   - Everything else that ops needs to act on → outbox entry needed
func needsActuation(d models.Decision) bool {
	switch d {
	// ── Original decisions that produce Kafka messages ────────────────────
	case models.DecisionEscalate,
		models.DecisionNotify,
		models.DecisionOpenOpsIncident,
		models.DecisionGenerateEvidence,
		models.DecisionHold,
		models.DecisionRetry:
		return true

	// ── PHASE 5: New decisions that produce Kafka messages ─────────────────
	// These all route to specific Kafka topics in outbox_worker.topicForEventType.

	// REVIEW_AMBIGUOUS_BATCH: ops must review the batch before it proceeds.
	// Goes to alert topic — a structured review request.
	case models.DecisionReviewAmbiguousBatch:
		return true

	// REQUEST_SOURCE_PATCH: structured patch request to source system ops team.
	// Goes to batch_patch topic.
	case models.DecisionRequestSourcePatch:
		return true

	// REGENERATE_EVIDENCE: ask Service 6 to rebuild a weak evidence pack.
	// Goes to evidence topic.
	case models.DecisionRegenerateEvidence:
		return true

	// PREPARE_AND_SIGN_RECOMMENDED: commercial upsell signal to ops dashboard.
	// Goes to alert topic — advisory card in the dashboard.
	case models.DecisionPrepareAndSignRecommended:
		return true

	// DISPATCH_MODE_RECOMMENDED: another commercial upsell signal.
	case models.DecisionDispatchModeRecommended:
		return true

	// REQUEST_STRONGER_CARRIER_CONTRACT: ops advisory to renegotiate PSP contract.
	case models.DecisionRequestStrongerCarrierContract:
		return true

	// ── Decisions that do NOT produce Kafka messages ───────────────────────
	// ALLOW: recorded for audit trail only. No downstream effect.
	// ADVISORY_RECOMMENDATION: pure advisory — shown in dashboard only.
	// default: any unknown future decision type defaults to no actuation (safe).
	default:
		return false
	}
}

// buildOutboxPayload constructs the JSON payload written to actuation_outbox.payload.
// This payload is published verbatim to the Kafka topic.
// MUST NOT contain PII — only IDs, references, and operational data.
func buildOutboxPayload(req CreateActionRequest, actionID string) string {
	payload := map[string]any{
		"action_id":     actionID,
		"tenant_id":     req.TenantID,
		"policy_id":     req.PolicyID,
		"policy_version": req.PolicyVersion,
		"decision":      string(req.Decision),
		"scope_refs":    req.ScopeRefs,
		"payload":       req.PayloadJSON,
		"created_at":    time.Now().UTC(),
	}
	b, _ := json.Marshal(payload)
	return string(b)
}
