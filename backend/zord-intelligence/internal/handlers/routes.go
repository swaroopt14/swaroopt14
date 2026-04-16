package handlers

// routes.go
//
// Wires every URL route to the right handler function.
// This is the ONLY file that knows the full URL map of ZPI.
//
// PHASE 5 ADDITIONS:
//
//   GET  /v1/intelligence/actions/pending-approval
//        → ops approval dashboard (most urgent first)
//
//   POST /v1/intelligence/actions/{action_id}/approve
//        → human approves a PENDING_APPROVAL contract
//
//   POST /v1/intelligence/actions/{action_id}/dismiss
//        → human dismisses a PENDING_APPROVAL contract
//
//   GET  /v1/intelligence/actions?policy_family=LEAKAGE
//        → filter actions by intelligence family (handled in ListActions)
//
//   GET  /v1/intelligence/actions?decision=HOLD
//        → filter actions by decision type (handled in ListActions)
//
// NOTE: The route order inside the /actions group matters in chi.
// Static paths (/pending-approval) MUST be registered BEFORE parameterised
// paths (/{action_id}) so chi matches them correctly.

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// NewRouter creates and returns the fully wired HTTP router.
func NewRouter(
	healthH *HealthHandler,
	kpiH *KPIHandler,
	policyH *PolicyHandler,
	actionH *ActionHandler,
) http.Handler {

	r := chi.NewRouter()

	// ── Middleware ─────────────────────────────────────────────────────────
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)

	// ── Health check endpoints ─────────────────────────────────────────────
	r.Get("/healthz", healthH.Liveness)
	r.Get("/readyz", healthH.Readiness)

	// ── API v1 routes ──────────────────────────────────────────────────────
	r.Route("/v1/intelligence", func(r chi.Router) {

		// ── KPI / Projection endpoints ─────────────────────────────────
		r.Get("/kpis", kpiH.GetKPIs)
		r.Get("/corridors/health", kpiH.GetCorridorHealth)
		r.Get("/failures/top", kpiH.GetTopFailures)
		r.Get("/sla", kpiH.GetSLAStatus)
		r.Get("/sla-breach", kpiH.GetSLABreachRate)
		r.Get("/retry-recovery", kpiH.GetRetryRecoveryRate)
		r.Get("/statement-match", kpiH.GetStatementMatchRate)
		r.Get("/provider-ref-missing", kpiH.GetProviderRefMissingRate)
		r.Get("/fusion-conflicts", kpiH.GetConflictRateInFusion)

		r.Route("/ml", func(r chi.Router) {
			r.Get("/anomaly", kpiH.GetMLAnomaly)
			r.Get("/sla-risk", kpiH.GetMLSlaRisk)
			r.Get("/failure-shift", kpiH.GetMLFailureShift)
		})

		// ── Policy endpoints ───────────────────────────────────────────
		r.Route("/policies", func(r chi.Router) {
			r.Get("/", policyH.ListPolicies)
			r.Post("/", policyH.CreatePolicy)
			r.Route("/{id}", func(r chi.Router) {
				r.Get("/", policyH.GetPolicy)
				r.Post("/enable", policyH.EnablePolicy)
				r.Post("/disable", policyH.DisablePolicy)
			})
		})

		// ── Action Contract endpoints ──────────────────────────────────
		//
		// IMPORTANT: Static paths MUST come before parameterised paths
		// in chi so they are matched first. If /{action_id} is registered
		// before /pending-approval, chi will match "pending-approval" as
		// the action_id value instead of routing to the static handler.
		//
		// Correct order:
		//   1. GET  /actions/pending-approval   (static — registered first)
		//   2. GET  /actions                    (no path param)
		//   3. GET  /actions/{action_id}         (parameterised — registered last)
		//   4. POST /actions/{action_id}/approve
		//   5. POST /actions/{action_id}/dismiss

		r.Route("/actions", func(r chi.Router) {

			// ── Static paths (must precede /{action_id}) ───────────────

			// GET /v1/intelligence/actions/pending-approval?tenant_id=X
			// Returns all PENDING_APPROVAL contracts ordered by urgency.
			// Powers the ops approval dashboard. (PHASE 5)
			r.Get("/pending-approval", actionH.ListPendingApproval)

			// GET /v1/intelligence/actions?tenant_id=X[&limit=50][&before=RFC3339]
			// GET /v1/intelligence/actions?tenant_id=X&scope_field=batch_id&scope_value=B1
			// GET /v1/intelligence/actions?tenant_id=X&decision=HOLD         (PHASE 5)
			// GET /v1/intelligence/actions?tenant_id=X&policy_family=LEAKAGE (PHASE 5)
			r.Get("/", actionH.ListActions)

			// ── Parameterised paths ────────────────────────────────────

			r.Route("/{action_id}", func(r chi.Router) {

				// GET /v1/intelligence/actions/{action_id}
				// Full detail of one ActionContract including signature.
				r.Get("/", actionH.GetAction)

				// POST /v1/intelligence/actions/{action_id}/approve?tenant_id=X
				// Human approves a PENDING_APPROVAL contract.
				// Transitions to APPROVED, inserts outbox entry atomically. (PHASE 5)
				r.Post("/approve", actionH.ApproveAction)

				// POST /v1/intelligence/actions/{action_id}/dismiss?tenant_id=X
				// Human dismisses a PENDING_APPROVAL contract.
				// Transitions to DISMISSED. No outbox entry ever created. (PHASE 5)
				r.Post("/dismiss", actionH.DismissAction)
			})
		})
	})

	return r
}
