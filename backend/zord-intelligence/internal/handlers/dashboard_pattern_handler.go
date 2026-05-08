package handlers

// dashboard_pattern_handler.go
//
// GET /v1/intelligence/dashboard/patterns
//
// Serves the 1 Pattern KPI for the frontend dashboard:
//   KPI 14  pattern_anomaly_score → batch_anomaly_score + anomaly_level
//
// Data source: intelligence_snapshots WHERE snapshot_type = 'PATTERN'.
// Pattern snapshots are BATCH-scoped (one per batch).
//
// Behaviour:
//   - If batch_id is provided → return the anomaly score for that specific batch.
//   - If batch_id is omitted  → return the most recently scored batch
//     (uses GetLatestByTypeAnyScope, which finds the latest regardless of scope_ref).
//
// Query params:
//   tenant_id   required
//   batch_id    optional — scopes the response to a specific batch
//   from_date   optional — ISO-8601 date; filters by snapshot created_at >= from
//   to_date     optional — ISO-8601 date; filters by snapshot created_at <= to
//   provider    optional — not applicable; accepted and ignored

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardPatternHandler serves GET /v1/intelligence/dashboard/patterns.
type DashboardPatternHandler struct {
	snapshotRepo *persistence.IntelligenceSnapshotRepo
}

// NewDashboardPatternHandler creates a DashboardPatternHandler.
func NewDashboardPatternHandler(snapshotRepo *persistence.IntelligenceSnapshotRepo) *DashboardPatternHandler {
	return &DashboardPatternHandler{snapshotRepo: snapshotRepo}
}

// patternKPIFields reads only the KPI 14 fields from PatternSnapshot JSON.
type patternKPIFields struct {
	BatchID           string  `json:"batch_id"`
	BatchAnomalyScore float64 `json:"batch_anomaly_score"`
	AnomalyLevel      string  `json:"anomaly_level"`
	AnomalyType       string  `json:"anomaly_type"`
	BatchRiskScore    float64 `json:"batch_risk_score"`
	RiskTier          string  `json:"risk_tier"`
	FinalityStatus    string  `json:"finality_status"`
	TotalCount        int     `json:"total_count"`
	SuccessCount      int     `json:"success_count"`
	FailedCount       int     `json:"failed_count"`
	PendingCount      int     `json:"pending_count"`
}

// DashboardPatternResponse is the frontend-ready payload for the pattern dashboard card.
type DashboardPatternResponse struct {
	TenantID      string     `json:"tenant_id"`
	DataAvailable bool       `json:"data_available"`
	SnapshotID    string     `json:"snapshot_id,omitempty"`
	ScopedBatchID string     `json:"batch_id,omitempty"`
	WindowStart   *time.Time `json:"window_start,omitempty"`
	WindowEnd     *time.Time `json:"window_end,omitempty"`
	ComputedAt    *time.Time `json:"computed_at,omitempty"`
	Reason        string     `json:"reason,omitempty"`

	// KPI 14 — pattern_anomaly_score
	BatchAnomalyScore float64 `json:"batch_anomaly_score"`
	AnomalyLevel      string  `json:"anomaly_level"`

	// Supplementary pattern fields for frontend context
	AnomalyType    string  `json:"anomaly_type,omitempty"`
	BatchRiskScore float64 `json:"batch_risk_score"`
	RiskTier       string  `json:"risk_tier,omitempty"`
	FinalityStatus string  `json:"finality_status,omitempty"`
	TotalCount     int     `json:"total_count"`
	SuccessCount   int     `json:"success_count"`
	FailedCount    int     `json:"failed_count"`
	PendingCount   int     `json:"pending_count"`
}

// GetPatternKPIs handles GET /v1/intelligence/dashboard/patterns
func (h *DashboardPatternHandler) GetPatternKPIs(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	batchID := r.URL.Query().Get("batch_id")
	from, to := parseDateRangeParams(r)

	var snap *persistence.IntelligenceSnapshot
	var err error

	if batchID != "" {
		// Specific batch requested — use scoped lookup with optional date filter.
		snap, err = h.snapshotRepo.GetLatestByTypeFiltered(
			r.Context(),
			tenantID, "PATTERN", "BATCH", &batchID,
			from, to,
		)
	} else {
		// No batch_id — return the most recently scored batch for this tenant.
		// GetLatestByTypeAnyScope ignores scope_ref so it picks the freshest snapshot.
		snap, err = h.snapshotRepo.GetLatestByTypeAnyScope(
			r.Context(),
			tenantID, "PATTERN", "BATCH",
		)
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch pattern snapshot")
		return
	}

	resp := DashboardPatternResponse{TenantID: tenantID}

	if snap == nil {
		resp.DataAvailable = false
		resp.Reason = "no_data — no batch summary events received yet"
		writeJSON(w, http.StatusOK, resp)
		return
	}

	var kpis patternKPIFields
	if err := json.Unmarshal(snap.SnapshotJSON, &kpis); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to parse pattern snapshot")
		return
	}

	resp.DataAvailable = true
	resp.SnapshotID = snap.SnapshotID
	if snap.ScopeRef != nil {
		resp.ScopedBatchID = *snap.ScopeRef
	}
	resp.WindowStart = &snap.WindowStart
	resp.WindowEnd = &snap.WindowEnd
	resp.ComputedAt = &snap.CreatedAt
	resp.BatchAnomalyScore = kpis.BatchAnomalyScore
	resp.AnomalyLevel = kpis.AnomalyLevel
	resp.AnomalyType = kpis.AnomalyType
	resp.BatchRiskScore = kpis.BatchRiskScore
	resp.RiskTier = kpis.RiskTier
	resp.FinalityStatus = kpis.FinalityStatus
	resp.TotalCount = kpis.TotalCount
	resp.SuccessCount = kpis.SuccessCount
	resp.FailedCount = kpis.FailedCount
	resp.PendingCount = kpis.PendingCount

	writeJSON(w, http.StatusOK, resp)
}
