package handlers

// dashboard_leakage_handler.go
//
// GET /v1/intelligence/dashboard/leakage
//
// Serves the 6 Leakage KPIs for the frontend dashboard:
//   KPI 1  total_intended_volume        → total_intended_amount_minor
//   KPI 2  unmatched_intent_amount      → unmatched_amount_minor
//   KPI 3  under_settlement_amount      → under_settlement_amount_minor
//   KPI 4  orphan_settlement_amount     → orphan_amount_minor
//   KPI 5  reversal_exposure            → reversal_exposure_minor
//   KPI 6  leakage_rate                 → leakage_percentage
//
// Data source: intelligence_snapshots WHERE snapshot_type = 'LEAKAGE'.
// The LeakageIntelligenceService writes these snapshots after every
// attachment decision / variance record event.
//
// Query params:
//   tenant_id   required
//   from_date   optional — ISO-8601 date (YYYY-MM-DD); filters by snapshot created_at >= from
//   to_date     optional — ISO-8601 date (YYYY-MM-DD); filters by snapshot created_at <= to
//   batch_id    optional — not applicable for leakage (TENANT-scoped); accepted and ignored
//   provider    optional — not applicable for leakage (TENANT-scoped); accepted and ignored

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardLeakageHandler serves GET /v1/intelligence/dashboard/leakage.
type DashboardLeakageHandler struct {
	snapshotRepo *persistence.IntelligenceSnapshotRepo
}

// NewDashboardLeakageHandler creates a DashboardLeakageHandler.
func NewDashboardLeakageHandler(snapshotRepo *persistence.IntelligenceSnapshotRepo) *DashboardLeakageHandler {
	return &DashboardLeakageHandler{snapshotRepo: snapshotRepo}
}

// leakageKPIFields contains only the 6 KPI fields extracted from LeakageSnapshot JSON.
// We unmarshal just these fields to avoid coupling to the full service snapshot struct.
type leakageKPIFields struct {
	TotalIntendedAmountMinor   decimal.Decimal `json:"total_intended_amount_minor"`
	UnmatchedAmountMinor       decimal.Decimal `json:"unmatched_amount_minor"`
	UnderSettlementAmountMinor decimal.Decimal `json:"under_settlement_amount_minor"`
	OrphanAmountMinor          decimal.Decimal `json:"orphan_amount_minor"`
	ReversalExposureMinor      decimal.Decimal `json:"reversal_exposure_minor"`
	LeakagePercentage          float64         `json:"leakage_percentage"`
	RiskTier                   string          `json:"risk_tier"`
}

// DashboardLeakageResponse is the frontend-ready payload for the leakage dashboard card.
type DashboardLeakageResponse struct {
	TenantID     string     `json:"tenant_id"`
	DataAvailable bool      `json:"data_available"`
	SnapshotID   string     `json:"snapshot_id,omitempty"`
	WindowStart  *time.Time `json:"window_start,omitempty"`
	WindowEnd    *time.Time `json:"window_end,omitempty"`
	ComputedAt   *time.Time `json:"computed_at,omitempty"`
	Reason       string     `json:"reason,omitempty"`

	// KPI 1 — total_intended_volume
	TotalIntendedAmountMinor decimal.Decimal `json:"total_intended_amount_minor"`
	// KPI 2 — unmatched_intent_amount
	UnmatchedAmountMinor decimal.Decimal `json:"unmatched_amount_minor"`
	// KPI 3 — under_settlement_amount
	UnderSettlementAmountMinor decimal.Decimal `json:"under_settlement_amount_minor"`
	// KPI 4 — orphan_settlement_amount
	OrphanAmountMinor decimal.Decimal `json:"orphan_amount_minor"`
	// KPI 5 — reversal_exposure
	ReversalExposureMinor decimal.Decimal `json:"reversal_exposure_minor"`
	// KPI 6 — leakage_rate
	LeakagePercentage float64 `json:"leakage_percentage"`

	// Risk classification tier — included for frontend colour-coding
	RiskTier string `json:"risk_tier,omitempty"`
}

// GetLeakageKPIs handles GET /v1/intelligence/dashboard/leakage
func (h *DashboardLeakageHandler) GetLeakageKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	from, to := parseDateRangeParams(r)

	snap, err := h.snapshotRepo.GetLatestByTypeFiltered(
		r.Context(),
		tenantID, "LEAKAGE", "TENANT", nil,
		from, to,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch leakage snapshot")
		return
	}

	resp := DashboardLeakageResponse{TenantID: tenantID}

	if snap == nil {
		resp.DataAvailable = false
		resp.Reason = "no_data — no attachment decisions or variance records received yet"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var kpis leakageKPIFields
	if err := json.Unmarshal(snap.SnapshotJSON, &kpis); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse leakage snapshot")
		return
	}

	resp.DataAvailable = true
	resp.SnapshotID = snap.SnapshotID
	resp.WindowStart = &snap.WindowStart
	resp.WindowEnd = &snap.WindowEnd
	resp.ComputedAt = &snap.CreatedAt
	resp.TotalIntendedAmountMinor = kpis.TotalIntendedAmountMinor
	resp.UnmatchedAmountMinor = kpis.UnmatchedAmountMinor
	resp.UnderSettlementAmountMinor = kpis.UnderSettlementAmountMinor
	resp.OrphanAmountMinor = kpis.OrphanAmountMinor
	resp.ReversalExposureMinor = kpis.ReversalExposureMinor
	resp.LeakagePercentage = kpis.LeakagePercentage
	resp.RiskTier = kpis.RiskTier

	writeJSON(w, http.StatusOK, resp)
}
