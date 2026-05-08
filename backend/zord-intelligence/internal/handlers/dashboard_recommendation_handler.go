package handlers

// dashboard_recommendation_handler.go
//
// GET /v1/intelligence/dashboard/recommendations
//
// Serves the 2 Recommendation KPIs for the frontend dashboard:
//   KPI 15  action_acceptance_rate = Accepted / Total
//   KPI 16  action_resolution_rate = Resolved / Total
//
// Data source: action_contracts table (direct aggregate query).
//
// Definitions:
//   Total    = all non-EXPIRED contracts for the tenant in the window
//   Accepted = contracts with contract_status = 'APPROVED'
//   Resolved = contracts with contract_status IN ('APPROVED', 'DISMISSED')
//              (human acted on them — not left as PENDING or auto-expired)
//
// These are computed by ActionContractRepo.GetRateSummary — raw aggregates
// from the DB. Division happens here in the service layer (not in SQL)
// per the formula implementation rule.
//
// Query params:
//   tenant_id   required
//   from_date   optional — ISO-8601 date; filters by action created_at >= from
//   to_date     optional — ISO-8601 date; filters by action created_at <= to
//   batch_id    optional — not applicable for actions; accepted and ignored
//   provider    optional — not applicable; accepted and ignored

import (
	"net/http"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardRecommendationHandler serves GET /v1/intelligence/dashboard/recommendations.
type DashboardRecommendationHandler struct {
	actionRepo *persistence.ActionContractRepo
}

// NewDashboardRecommendationHandler creates a DashboardRecommendationHandler.
func NewDashboardRecommendationHandler(actionRepo *persistence.ActionContractRepo) *DashboardRecommendationHandler {
	return &DashboardRecommendationHandler{actionRepo: actionRepo}
}

// DashboardRecommendationResponse is the frontend-ready payload for the recommendation dashboard card.
type DashboardRecommendationResponse struct {
	TenantID      string     `json:"tenant_id"`
	DataAvailable bool       `json:"data_available"`
	ComputedAt    *time.Time `json:"computed_at,omitempty"`
	Reason        string     `json:"reason,omitempty"`

	// KPI 15 — action_acceptance_rate = accepted / total
	ActionAcceptanceRate float64 `json:"action_acceptance_rate"`
	// KPI 16 — action_resolution_rate = resolved / total
	ActionResolutionRate float64 `json:"action_resolution_rate"`

	// Raw counts for frontend context (avoids double-fetching)
	TotalActions    int `json:"total_actions"`
	AcceptedActions int `json:"accepted_actions"`
	ResolvedActions int `json:"resolved_actions"`
}

// GetRecommendationKPIs handles GET /v1/intelligence/dashboard/recommendations
func (h *DashboardRecommendationHandler) GetRecommendationKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	from, to := parseDateRangeParams(r)

	summary, err := h.actionRepo.GetRateSummary(r.Context(), tenantID, from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch recommendation summary")
		return
	}

	now := time.Now().UTC()
	resp := DashboardRecommendationResponse{
		TenantID:        tenantID,
		DataAvailable:   summary.Total > 0,
		ComputedAt:      &now,
		TotalActions:    summary.Total,
		AcceptedActions: summary.Accepted,
		ResolvedActions: summary.Resolved,
	}

	if summary.Total == 0 {
		resp.Reason = "no_data — no action contracts exist for this tenant yet"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	// KPI 15 — action_acceptance_rate = accepted / total_recommendations
	resp.ActionAcceptanceRate = float64(summary.Accepted) / float64(summary.Total)

	// KPI 16 — action_resolution_rate = resolved / total_accepted_actions
	// "resolved" = reached a terminal decision (APPROVED or DISMISSED).
	// "total_accepted_actions" = all non-EXPIRED contracts accepted for review = Total.
	resp.ActionResolutionRate = float64(summary.Resolved) / float64(summary.Total)

	writeJSON(w, http.StatusOK, resp)
}
