package handlers

// What is this file?
// Wires every URL route to the right handler function.
// This is the ONLY file that knows the full URL map of ZPI.
//
// cmd/main.go calls NewRouter() once and gets back a ready HTTP server.
//
// HOW CHI ROUTING WORKS:
//   r.Get("/path", handlerFunc)   → handles GET requests
//   r.Post("/path", handlerFunc)  → handles POST requests
//   r.Route("/prefix", func...)   → groups routes under a shared prefix
//   {id} in a path               → URL parameter, read via chi.URLParam(r, "id")

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// NewRouter creates and returns the fully wired HTTP router.
// All handlers are passed in — routes.go never creates them itself.
//
// Called once in cmd/main.go:
//
//	router := handlers.NewRouter(healthH, kpiH, policyH, actionH)
//	http.ListenAndServe(":8087", router)
func NewRouter(
	healthH *HealthHandler,
	kpiH *KPIHandler,
	policyH *PolicyHandler,
	actionH *ActionHandler,
) http.Handler {

	r := chi.NewRouter()

	// ── Middleware ─────────────────────────────────────────────────────────
	// Middleware runs on EVERY request before the handler.
	// These come from chi's built-in middleware package.

	// Recoverer catches any panic inside a handler and returns 500
	// instead of crashing the whole service
	r.Use(middleware.Recoverer)

	// RequestID attaches a unique ID to every request
	// Useful for tracing a request through logs
	r.Use(middleware.RequestID)

	// Logger logs every request: method, path, status, duration
	r.Use(middleware.Logger)

	// ── Health check endpoints ─────────────────────────────────────────────
	// These must NOT be under /v1 — Kubernetes calls them directly
	r.Get("/healthz", healthH.Liveness)
	r.Get("/readyz", healthH.Readiness)

	// ── API v1 routes ──────────────────────────────────────────────────────
	// All business routes are grouped under /v1/intelligence
	// r.Route() creates a sub-router with a shared prefix
	r.Route("/v1/intelligence", func(r chi.Router) {

		// ── KPI / Projection endpoints ─────────────────────────────────
		// Called by zord-console dashboard to display KPI numbers

		// GET /v1/intelligence/kpis?tenant_id=X
		// Returns all latest projections for a tenant
		r.Get("/kpis", kpiH.GetKPIs)

		// GET /v1/intelligence/corridors/health?tenant_id=X
		// Returns success rate and latency per corridor
		r.Get("/corridors/health", kpiH.GetCorridorHealth)

		// GET /v1/intelligence/failures/top?tenant_id=X&corridor_id=Y
		// Returns top failure reason codes
		r.Get("/failures/top", kpiH.GetTopFailures)

		// GET /v1/intelligence/sla?tenant_id=X
		// Returns SLA timer status
		r.Get("/sla", kpiH.GetSLAStatus)

		// GET /v1/intelligence/sla-breach?tenant_id=X
		// Returns SLA breach rate metrics
		r.Get("/sla-breach", kpiH.GetSLABreachRate)

		// GET /v1/intelligence/retry-recovery?tenant_id=X&corridor_id=Y
		// Returns retry efficiency per corridor — recovered / retry_attempts
		r.Get("/retry-recovery", kpiH.GetRetryRecoveryRate)

		// GET /v1/intelligence/statement-match?tenant_id=X&corridor_id=Y
		// Returns statement reconciliation match rate (requires Service 5 upgrade)
		r.Get("/statement-match", kpiH.GetStatementMatchRate)

		// GET /v1/intelligence/provider-ref-missing?tenant_id=X&corridor_id=Y
		// Returns % of finalized payouts missing UTR/RRN/BankRef
		r.Get("/provider-ref-missing", kpiH.GetProviderRefMissingRate)

		// GET /v1/intelligence/fusion-conflicts?tenant_id=X&corridor_id=Y
		// Returns Outcome Fusion signal conflict rate per corridor
		r.Get("/fusion-conflicts", kpiH.GetConflictRateInFusion)

		// GET /v1/intelligence/ml/anomaly?tenant_id=X&corridor_id=Y
		// GET /v1/intelligence/ml/sla-risk?tenant_id=X&corridor_id=Y
		// GET /v1/intelligence/ml/failure-shift?tenant_id=X&corridor_id=Y
		r.Route("/ml", func(r chi.Router) {
			r.Get("/anomaly", kpiH.GetMLAnomaly)
			r.Get("/sla-risk", kpiH.GetMLSlaRisk)
			r.Get("/failure-shift", kpiH.GetMLFailureShift)
		})

		// ── Policy endpoints ───────────────────────────────────────────
		// Used by ops team to manage rules

		r.Route("/policies", func(r chi.Router) {

			// GET  /v1/intelligence/policies
			// Returns all policies (enabled and disabled)
			r.Get("/", policyH.ListPolicies)

			// POST /v1/intelligence/policies
			// Creates a new policy (starts disabled)
			r.Post("/", policyH.CreatePolicy)

			// Routes with {id} in the path — chi extracts the value automatically
			r.Route("/{id}", func(r chi.Router) {

				// GET /v1/intelligence/policies/P_SLA_BREACH_RISK
				r.Get("/", policyH.GetPolicy)

				// POST /v1/intelligence/policies/P_SLA_BREACH_RISK/enable
				r.Post("/enable", policyH.EnablePolicy)

				// POST /v1/intelligence/policies/P_SLA_BREACH_RISK/disable
				r.Post("/disable", policyH.DisablePolicy)
			})
		})

		// ── Action Contract endpoints ──────────────────────────────────
		// Read-only — actions are created by the policy engine, not the API

		r.Route("/actions", func(r chi.Router) {

			// GET /v1/intelligence/actions?tenant_id=X&limit=50
			// GET /v1/intelligence/actions?tenant_id=X&scope_field=contract_id&scope_value=ctr_01
			r.Get("/", actionH.ListActions)

			// GET /v1/intelligence/actions/act_01J8X...
			r.Get("/{action_id}", actionH.GetAction)
		})
	})

	return r
}
