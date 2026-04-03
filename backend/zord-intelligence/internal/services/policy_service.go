package services

// Evaluates policy rules against current KPI projection values.
// When a rule's conditions are met, calls action_service.CreateAction().

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/zord/zord-intelligence/internal/logger"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// PolicyService evaluates policies and triggers actions.
type PolicyService struct {
	policyRepo    *persistence.PolicyRepo
	projRepo      *persistence.ProjectionRepo
	actionService *ActionService
	mlFeatures    *MLFeaturesService
}

// NewPolicyService creates a PolicyService.
func NewPolicyService(
	policyRepo *persistence.PolicyRepo,
	projRepo *persistence.ProjectionRepo,
	actionService *ActionService,
) *PolicyService {
	return &PolicyService{
		policyRepo:    policyRepo,
		projRepo:      projRepo,
		actionService: actionService,
		mlFeatures:    NewMLFeaturesService(projRepo),
	}
}

// EvaluateForEvent is called by projection_service after every KPI update.
// Finds all enabled policies for the given topic and evaluates each one.
func (s *PolicyService) EvaluateForEvent(
	ctx context.Context,
	tenantID, corridorID, topic, eventID string,
) error {
	if corridorID != "" {
		if err := s.mlFeatures.RefreshForPair(ctx, tenantID, corridorID); err != nil {
			logger.Error("ml features refresh failed",
				"tenant_id", tenantID,
				"corridor_id", corridorID,
				"topic", topic,
				"error", err,
			)
		}
	}

	policies, err := s.policyRepo.GetByTrigger(ctx, "event", topic)
	if err != nil {
		return fmt.Errorf("policy_service.EvaluateForEvent get policies: %w", err)
	}

	if len(policies) == 0 {
		return nil
	}

	for _, policy := range policies {
		if policy.TenantID != "" && policy.TenantID != tenantID {
			continue
		}

		if err := s.evaluateOne(ctx, policy, tenantID, corridorID, eventID); err != nil {

			logger.Error("policy evaluation failed",
				"policy_id", policy.PolicyID,
				"tenant_id", tenantID,
				"corridor_id", corridorID,
				"topic", topic,
				"error", err,
			)
		}
	}
	return nil
}

func (s *PolicyService) EvaluateForCron(
	ctx context.Context,
	tenantID, corridorID string,
) error {
	// Fetch ALL enabled cron policies — not filtered by schedule string
	policies, err := s.policyRepo.GetAllCronPolicies(ctx)
	if err != nil {
		return fmt.Errorf("policy_service.EvaluateForCron get policies: %w", err)
	}

	if err := s.mlFeatures.RefreshForPair(ctx, tenantID, corridorID); err != nil {
		logger.Error("ml features refresh failed",
			"tenant_id", tenantID,
			"corridor_id", corridorID,
			"error", err,
		)
	}

	for _, policy := range policies {
		// Skip policies locked to a different tenant
		if policy.TenantID != "" && policy.TenantID != tenantID {
			continue
		}

		if err := s.evaluateOne(ctx, policy, tenantID, corridorID, "cron"); err != nil {
			logger.Error("cron policy evaluation failed",
				"policy_id", policy.PolicyID,
				"tenant_id", tenantID,
				"corridor_id", corridorID,
				"error", err,
			)
			// Log and continue — one bad policy must not block the others
		}
	}
	return nil
}

// evaluateOne evaluates a single policy against current projection data.
func (s *PolicyService) evaluateOne(
	ctx context.Context,
	policy models.Policy,
	tenantID, corridorID, triggerEventID string,
) error {
	evalCtx, err := s.buildEvalContext(ctx, tenantID, corridorID)
	if err != nil {
		return err
	}

	fires, decision, confidence, payload := evaluateDSL(policy.DSL, evalCtx)

	if !fires {
		return nil
	}

	// Policy fired — log it so ops can see which rules are triggering
	logger.Info("policy fired",
		"policy_id", policy.PolicyID,
		"policy_version", policy.Version,
		"decision", string(decision),
		"confidence", confidence,
		"tenant_id", tenantID,
		"corridor_id", corridorID,
	)

	scopeRefs := models.ScopeRefs{
		TenantID:   tenantID,
		CorridorID: corridorID,
	}

	inputRefs, _ := json.Marshal(evalCtx)

	return s.actionService.CreateAction(ctx, CreateActionRequest{
		TenantID:       tenantID,
		PolicyID:       policy.PolicyID,
		PolicyVersion:  policy.Version,
		ScopeRefs:      scopeRefs,
		InputRefsJSON:  string(inputRefs),
		Decision:       decision,
		Confidence:     confidence,
		PayloadJSON:    payload,
		TriggerEventID: triggerEventID,
	})
}

// IMPORTANT — why we use zero-values instead of returning errors:
// When a projection row doesn't exist yet (e.g. a brand-new tenant
// whose first payment just arrived 2 minutes ago), GetValueAs returns
// nil — it found nothing in the DB.

// NEW behaviour: if projection is missing, leave the map key at 0.0
//   → the DSL evaluator sees 0.0, which is a valid value.
//   → policies that check "< threshold" may fire (e.g. success_rate < 0.9
//     fires because 0.0 < 0.9 — correct, we have no successful payouts yet).
//   → policies that check "> threshold" won't fire — also correct.
//   → no error, no skipping, engine works from the very first event.

func (s *PolicyService) buildEvalContext(
	ctx context.Context,
	tenantID, corridorID string,
) (map[string]float64, error) {
	// Use a named variable instead of ctx_map — Go convention is camelCase
	evalMap := make(map[string]float64)

	// ── success_rate ──────────────────────────────────────────────────────
	// var declares a variable with its zero value.
	// For a struct, every field starts at 0 / "" / false.
	// If GetValueAs finds nothing, successVal stays all-zeros — that's fine.
	var successVal models.SuccessRateValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.success_rate.%s", corridorID), &successVal); err != nil {
		// Real DB error (network failure, bad SQL) — this is worth returning.
		// "No row found" is NOT an error from GetValueAs (it returns nil for that).
		return nil, fmt.Errorf("buildEvalContext success_rate corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.success_rate"] = successVal.Rate
	evalMap["corridor.total_count"] = float64(successVal.TotalCount)

	// ── finality latency ──────────────────────────────────────────────────
	var latencyVal models.FinalityLatencyValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.finality_latency.%s", corridorID), &latencyVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext finality_latency corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.finality_p50_seconds"] = latencyVal.P50Seconds
	evalMap["corridor.finality_p95_seconds"] = latencyVal.P95Seconds

	// ── pending backlog ───────────────────────────────────────────────────
	var pendingVal models.PendingBacklogValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.pending_backlog.%s", corridorID), &pendingVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext pending_backlog corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.total_pending"] = float64(pendingVal.TotalPending)
	evalMap["corridor.pending_6h_plus"] = float64(pendingVal.Bucket6hPlus)

	// ── evidence readiness ────────────────────────────────────────────────
	// tenant-level projection: no corridorID in the key
	var evidenceVal models.EvidenceReadinessValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		"tenant.evidence_readiness", &evidenceVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext evidence_readiness tenant=%s: %w", tenantID, err)
	}
	evalMap["tenant.evidence_readiness_rate"] = evidenceVal.Rate

	// ── statement match rate ──────────────────────────────────────────────
	var stmtVal models.StatementMatchRateValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.statement_match_rate.%s", corridorID), &stmtVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext statement_match_rate corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.statement_match_rate"] = stmtVal.MatchRate
	evalMap["corridor.statement_unmatched"] = float64(stmtVal.Unmatched)

	// ── SLA breach rate ───────────────────────────────────────────────────
	var slaVal models.SLABreachRateValue
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		"tenant.sla_breach_rate", &slaVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext sla_breach_rate tenant=%s: %w", tenantID, err)
	}
	evalMap["tenant.sla_breach_rate"] = slaVal.BreachRate

	var anomalyVal struct {
		Value float64 `json:"value"`
	}
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.anomaly_score.%s", corridorID), &anomalyVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext anomaly_score corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.anomaly_score"] = anomalyVal.Value

	var slaRiskVal struct {
		Value float64 `json:"value"`
	}
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.sla_breach_risk.%s", corridorID), &slaRiskVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext sla_breach_risk corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.sla_breach_risk"] = slaRiskVal.Value

	var failureShiftVal struct {
		Value float64 `json:"value"`
	}
	if err := s.projRepo.GetValueAs(ctx, tenantID,
		fmt.Sprintf("corridor.failure_cluster_shift_score.%s", corridorID), &failureShiftVal); err != nil {
		return nil, fmt.Errorf("buildEvalContext failure_cluster_shift_score corridor=%s: %w", corridorID, err)
	}
	evalMap["corridor.failure_cluster_shift_score"] = failureShiftVal.Value

	return evalMap, nil
}

//	WHEN corridor.success_rate < 0.70
//	THEN ACTION ESCALATE severity=HIGH
//
//	WHEN corridor.finality_p95_seconds > 21600 AND corridor.total_pending > 500
//	THEN ACTION ESCALATE severity=HIGH
//
// Thresholds can use time units:  6h = 21600,  30m = 1800,  90s = 90
// All conditions are AND-ed: every condition must be true for the rule to fire.
//
// Returns: (fired, decision, confidence, payloadJSON)
func evaluateDSL(
	dsl string,
	evalCtx map[string]float64,
) (bool, models.Decision, float64, string) {

	// ── Step 1: find the WHEN line and THEN line ──────────────────────────
	// A DSL rule is two lines. We scan all lines and keep the ones we need.
	lines := strings.Split(strings.TrimSpace(dsl), "\n")

	var whenLine, thenLine string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "WHEN") {
			whenLine = line
		}
		if strings.HasPrefix(line, "THEN") {
			thenLine = line
		}
	}

	if whenLine == "" || thenLine == "" {
		return false, "", 0, "" // malformed DSL — silently skip
	}

	// ── Step 2: strip "WHEN " prefix and split on " AND " ─────────────────
	// "WHEN corridor.success_rate < 0.70 AND corridor.total_pending > 500"
	// → strip "WHEN " → "corridor.success_rate < 0.70 AND corridor.total_pending > 500"
	// → split on " AND " → ["corridor.success_rate < 0.70", "corridor.total_pending > 500"]
	//
	// Why uppercase " AND "?
	// DSL keywords are uppercase by convention, matching how SQL works.
	// "and" inside a metric name (e.g. "corridor.demand_and_supply") won't
	// accidentally split because we require a space on both sides.
	conditionStr := strings.TrimPrefix(whenLine, "WHEN ")
	conditionParts := strings.Split(conditionStr, " AND ")

	// ── Step 3: evaluate every condition ─────────────────────────────────
	// We track the FIRST condition's metric/value/threshold for the payload.
	// (The payload is what goes into the ActionContract as "why it fired".)
	type condResult struct {
		metric    string
		operator  string
		threshold float64
		actual    float64
	}
	var results []condResult

	for _, cond := range conditionParts {
		// Each condition is: "<metric> <operator> <threshold>"
		// strings.Fields splits on any whitespace and handles extra spaces.
		parts := strings.Fields(strings.TrimSpace(cond))
		if len(parts) < 3 {
			return false, "", 0, "" // malformed condition
		}

		metric := parts[0]
		operator := parts[1]
		// parseThreshold handles "6h", "30m", "500", "0.90" — see below
		threshold := parseThreshold(parts[2])

		currentVal, exists := evalCtx[metric]
		if !exists {
			// Metric not in evalCtx at all — unknown metric name in DSL.
			// Return false (don't fire). Ops team needs to fix the policy DSL.
			return false, "", 0, ""
		}

		// Evaluate: does this condition pass?
		conditionMet := false
		switch operator {
		case "<":
			conditionMet = currentVal < threshold
		case ">":
			conditionMet = currentVal > threshold
		case "<=":
			conditionMet = currentVal <= threshold
		case ">=":
			conditionMet = currentVal >= threshold
		case "==":
			conditionMet = currentVal == threshold
		default:
			return false, "", 0, "" // unknown operator
		}

		if !conditionMet {
			// AND logic: if ANY condition is false, the whole rule is false.
			// No need to check the rest — return immediately.
			return false, "", 0, ""
		}

		results = append(results, condResult{metric, operator, threshold, currentVal})
	}

	// If we reach here, ALL conditions passed.

	// ── Step 4: parse the THEN line ───────────────────────────────────────
	// "THEN ACTION ESCALATE severity=HIGH"
	// thenParts[0]="THEN", [1]="ACTION", [2]="ESCALATE", [3]="severity=HIGH"
	thenParts := strings.Fields(thenLine)
	if len(thenParts) < 3 {
		return false, "", 0, ""
	}

	decision := models.Decision(thenParts[2])

	severity := "MEDIUM" // default if not specified
	for _, part := range thenParts[3:] {
		if strings.HasPrefix(part, "severity=") {
			severity = strings.TrimPrefix(part, "severity=")
		}
	}

	// ── Step 5: build the payload (stored in ActionContract) ──────────────
	// We include ALL conditions that fired, so ops can see the full picture.
	// e.g. "p95 was 7.2h AND 600 payouts were pending"
	type condSummary struct {
		Metric    string  `json:"metric"`
		Actual    float64 `json:"actual"`
		Operator  string  `json:"operator"`
		Threshold float64 `json:"threshold"`
	}
	var summaries []condSummary
	for _, r := range results {
		summaries = append(summaries, condSummary{r.metric, r.actual, r.operator, r.threshold})
	}

	// Use the first condition for confidence calculation
	primary := results[0]
	payload, _ := json.Marshal(map[string]any{
		"conditions": summaries,
		"severity":   severity,
		"message": fmt.Sprintf(
			"%s is %.4f (threshold %s %.4f)",
			primary.metric, primary.actual, primary.operator, primary.threshold,
		),
	})

	confidence := computeConfidence(primary.actual, primary.threshold, primary.operator)

	return true, decision, confidence, string(payload)
}

// parseThreshold converts a threshold string to a float64 in seconds (or as-is).
//
// This lets you write human-readable DSL:
//   - "6h"  → 21600.0   (6 hours in seconds)
//   - "30m" → 1800.0    (30 minutes in seconds)
//   - "90s" → 90.0      (90 seconds — explicit)
//   - "0.90" → 0.9      (plain number, used as-is)
//   - "500" → 500.0     (plain number, used as-is)
//
// Why convert to seconds?
// All latency projections (finality_p95_seconds, finality_p50_seconds) are
// stored as seconds in the evalCtx. Writing "6h" in the DSL is more readable
// than "21600", and this function bridges the two.
func parseThreshold(s string) float64 {
	s = strings.TrimSpace(s)

	// Check for time unit suffixes
	if strings.HasSuffix(s, "h") {
		// "6h" → strip "h" → parse "6" → multiply by 3600
		numStr := s[:len(s)-1]
		var v float64
		fmt.Sscanf(numStr, "%f", &v)
		return v * 3600
	}
	if strings.HasSuffix(s, "m") {
		numStr := s[:len(s)-1]
		var v float64
		fmt.Sscanf(numStr, "%f", &v)
		return v * 60
	}
	if strings.HasSuffix(s, "s") {
		// explicit seconds suffix — strip and parse
		numStr := s[:len(s)-1]
		var v float64
		fmt.Sscanf(numStr, "%f", &v)
		return v
	}

	// No suffix — plain number (rate, count, etc.)
	var v float64
	fmt.Sscanf(s, "%f", &v)
	return v
}

// computeConfidence returns 0.5–1.0 based on how far past the threshold we are.
func computeConfidence(current, threshold float64, operator string) float64 {
	if threshold == 0 {
		return 0.75
	}
	var deviation float64
	switch operator {
	case "<", "<=":
		deviation = (threshold - current) / threshold
	case ">", ">=":
		deviation = (current - threshold) / threshold
	default:
		return 0.75
	}

	confidence := 0.5 + (deviation * 0.5)
	if confidence > 1.0 {
		confidence = 1.0
	}
	if confidence < 0.5 {
		confidence = 0.5
	}
	return confidence
}
