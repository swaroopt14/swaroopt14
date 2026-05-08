package handlers

// dashboard_ambiguity_handler.go
//
// GET /v1/intelligence/dashboard/ambiguity
//
// Serves the 4 Ambiguity KPIs for the frontend dashboard:
//   KPI 7   ambiguous_intent_count
//   KPI 8   ambiguity_rate
//   KPI 9   avg_attachment_confidence
//   KPI 10  missing_reference_rate    → provider_ref_missing_rate
//
// Data source: intelligence_snapshots WHERE snapshot_type = 'AMBIGUITY'.
// The AmbiguityIntelligenceService writes these snapshots after every
// attachment decision event.
//
// Query params:
//   tenant_id   required
//   from_date   optional — ISO-8601 date; filters by snapshot created_at >= from
//   to_date     optional — ISO-8601 date; filters by snapshot created_at <= to
//   batch_id    optional — not applicable for ambiguity (TENANT-scoped); accepted and ignored
//   provider    optional — not applicable; accepted and ignored

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardAmbiguityHandler serves GET /v1/intelligence/dashboard/ambiguity.
type DashboardAmbiguityHandler struct {
	snapshotRepo *persistence.IntelligenceSnapshotRepo
}

// NewDashboardAmbiguityHandler creates a DashboardAmbiguityHandler.
func NewDashboardAmbiguityHandler(snapshotRepo *persistence.IntelligenceSnapshotRepo) *DashboardAmbiguityHandler {
	return &DashboardAmbiguityHandler{snapshotRepo: snapshotRepo}
}

// ambiguityKPIFields contains only the 4 KPI fields from AmbiguitySnapshot JSON.
type ambiguityKPIFields struct {
	AmbiguousIntentCount    int             `json:"ambiguous_intent_count"`
	AmbiguityRate           float64         `json:"ambiguity_rate"`
	AvgAttachmentConfidence float64         `json:"avg_attachment_confidence"`
	ProviderRefMissingRate  float64         `json:"provider_ref_missing_rate"`
	ValueAtRiskMinor        decimal.Decimal `json:"value_at_risk_minor"`
	RiskTier                string          `json:"risk_tier"`
}

// DashboardAmbiguityResponse is the frontend-ready payload for the ambiguity dashboard card.
type DashboardAmbiguityResponse struct {
	TenantID      string     `json:"tenant_id"`
	DataAvailable bool       `json:"data_available"`
	SnapshotID    string     `json:"snapshot_id,omitempty"`
	WindowStart   *time.Time `json:"window_start,omitempty"`
	WindowEnd     *time.Time `json:"window_end,omitempty"`
	ComputedAt    *time.Time `json:"computed_at,omitempty"`
	Reason        string     `json:"reason,omitempty"`

	// KPI 7 — ambiguous_intent_count
	AmbiguousIntentCount int `json:"ambiguous_intent_count"`
	// KPI 8 — ambiguity_rate
	AmbiguityRate float64 `json:"ambiguity_rate"`
	// KPI 9 — avg_attachment_confidence
	AvgAttachmentConfidence float64 `json:"avg_attachment_confidence"`
	// KPI 10 — missing_reference_rate
	ProviderRefMissingRate float64 `json:"provider_ref_missing_rate"`

	// Supplementary fields for dashboard context (not separate KPIs)
	ValueAtRiskMinor decimal.Decimal `json:"value_at_risk_minor"`
	RiskTier         string          `json:"risk_tier,omitempty"`
}

// GetAmbiguityKPIs handles GET /v1/intelligence/dashboard/ambiguity
func (h *DashboardAmbiguityHandler) GetAmbiguityKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	from, to := parseDateRangeParams(r)

	snap, err := h.snapshotRepo.GetLatestByTypeFiltered(
		r.Context(),
		tenantID, "AMBIGUITY", "TENANT", nil,
		from, to,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch ambiguity snapshot")
		return
	}

	resp := DashboardAmbiguityResponse{TenantID: tenantID}

	if snap == nil {
		resp.DataAvailable = false
		resp.Reason = "no_data — no attachment decisions received yet"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var kpis ambiguityKPIFields
	if err := json.Unmarshal(snap.SnapshotJSON, &kpis); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse ambiguity snapshot")
		return
	}

	resp.DataAvailable = true
	resp.SnapshotID = snap.SnapshotID
	resp.WindowStart = &snap.WindowStart
	resp.WindowEnd = &snap.WindowEnd
	resp.ComputedAt = &snap.CreatedAt
	resp.AmbiguousIntentCount = kpis.AmbiguousIntentCount
	resp.AmbiguityRate = kpis.AmbiguityRate
	resp.AvgAttachmentConfidence = kpis.AvgAttachmentConfidence
	resp.ProviderRefMissingRate = kpis.ProviderRefMissingRate
	resp.ValueAtRiskMinor = kpis.ValueAtRiskMinor
	resp.RiskTier = kpis.RiskTier

	writeJSON(w, http.StatusOK, resp)
}
