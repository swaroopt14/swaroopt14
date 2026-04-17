package handlers

// intelligence_surface_handler.go
//
// HTTP handlers for the six intelligence layer APIs (Phase 6).
//
// ENDPOINTS:
//
//   GET /v1/intelligence/leakage?tenant_id=X
//       Returns the LEAKAGE intelligence snapshot for a tenant.
//       Available in: GRADE_A and GRADE_B.
//
//   GET /v1/intelligence/ambiguity?tenant_id=X
//       Returns the AMBIGUITY intelligence snapshot.
//       Available in: GRADE_A and GRADE_B.
//
//   GET /v1/intelligence/defensibility?tenant_id=X
//       Returns the DEFENSIBILITY intelligence snapshot.
//       Available in: GRADE_A and GRADE_B.
//
//   GET /v1/intelligence/rca?tenant_id=X[&corridor_id=Y]
//       Returns the RCA (Root Cause Analysis) intelligence snapshot.
//       Available in: GRADE_A and GRADE_B.
//
//   GET /v1/intelligence/pattern?tenant_id=X
//       Returns the PATTERN intelligence snapshot (batch quality, duplicate risk).
//       Available in: GRADE_A and GRADE_B.
//
//   GET /v1/intelligence/batches/{batch_id}?tenant_id=X
//       Returns full batch intelligence for one batch: authoritative counts,
//       variance totals, ambiguity score, defensibility tier, and latest
//       batch.health.* projection for trend data.
//       Available in: GRADE_A and GRADE_B.
//
//   GET /v1/intelligence/batches?tenant_id=X
//       Returns a list of all batches for a tenant, newest-updated first.
//       Supports ?status=REQUIRES_REVIEW filter for the ops review queue.
//       Available in: GRADE_A and GRADE_B.
//
// GRADE-GATING PATTERN:
//   All six intelligence layers are available in both Grade A and Grade B.
//   Grade B-only data (finality rates, latency) is exposed only through the
//   existing KPI endpoints — not through the intelligence surface endpoints.
//   This preserves the commercial upgrade path.
//
//   When a snapshot does not exist yet (tenant has no data), we return
//   HTTP 200 with data=null and a "no_data" reason — never HTTP 404.
//   This is intentional: the tenant is onboarded, just waiting for events.
//
// RESPONSE SHAPE:
//   Every intelligence endpoint wraps its payload in a consistent envelope:
//   {
//     "tenant_id": "tnt_A",
//     "intelligence_mode": "GRADE_A",
//     "snapshot_type": "LEAKAGE",
//     "snapshot_id": "snap_...",
//     "window_start": "...",
//     "window_end": "...",
//     "computed_at": "...",
//     "data": { ...snapshot_json... },
//     "data_available": true
//   }
//
//   When no snapshot exists yet:
//   {
//     "tenant_id": "tnt_A",
//     "intelligence_mode": "GRADE_A",
//     "snapshot_type": "LEAKAGE",
//     "data_available": false,
//     "reason": "no_data — no attachment decisions received yet for this tenant"
//   }

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// IntelligenceSurfaceHandler serves the six intelligence layer API endpoints.
type IntelligenceSurfaceHandler struct {
	projectionService *services.ProjectionService
	snapshotRepo      *persistence.IntelligenceSnapshotRepo
	batchRepo         *persistence.BatchContractRepo
	projRepo          *persistence.ProjectionRepo
}

// NewIntelligenceSurfaceHandler creates an IntelligenceSurfaceHandler.
func NewIntelligenceSurfaceHandler(
	projectionService *services.ProjectionService,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	batchRepo *persistence.BatchContractRepo,
	projRepo *persistence.ProjectionRepo,
) *IntelligenceSurfaceHandler {
	return &IntelligenceSurfaceHandler{
		projectionService: projectionService,
		snapshotRepo:      snapshotRepo,
		batchRepo:         batchRepo,
		projRepo:          projRepo,
	}
}

// ── Intelligence snapshot response envelope ────────────────────────────────────

// intelligenceResponse is the standard wrapper for every intelligence endpoint.
type intelligenceResponse struct {
	TenantID         string          `json:"tenant_id"`
	IntelligenceMode string          `json:"intelligence_mode"`
	SnapshotType     string          `json:"snapshot_type"`
	SnapshotID       string          `json:"snapshot_id,omitempty"`
	ScopeType        string          `json:"scope_type,omitempty"`
	ScopeRef         *string         `json:"scope_ref,omitempty"`
	WindowStart      *time.Time      `json:"window_start,omitempty"`
	WindowEnd        *time.Time      `json:"window_end,omitempty"`
	ComputedAt       *time.Time      `json:"computed_at,omitempty"`
	ModelVersion     *string         `json:"model_version,omitempty"`
	Data             json.RawMessage `json:"data"` // the actual snapshot JSON
	DataAvailable    bool            `json:"data_available"`
	Reason           string          `json:"reason,omitempty"` // why data is unavailable
}

// buildSnapshotResponse fetches the latest snapshot of a given type for a tenant
// and wraps it in the standard intelligence response envelope.
func (h *IntelligenceSurfaceHandler) buildSnapshotResponse(
	r *http.Request,
	tenantID string,
	snapshotType string,
	scopeType string,
	scopeRef *string,
) intelligenceResponse {
	mode := h.projectionService.Mode()

	snap, err := h.snapshotRepo.GetLatestByType(
		r.Context(),
		tenantID,
		snapshotType,
		scopeType,
		scopeRef,
	)

	base := intelligenceResponse{
		TenantID:         tenantID,
		IntelligenceMode: string(mode),
		SnapshotType:     snapshotType,
	}

	if err != nil {
		base.DataAvailable = false
		base.Reason = "internal error reading snapshot"
		base.Data = json.RawMessage([]byte(`null`))
		return base
	}

	if snap == nil {
		base.DataAvailable = false
		base.Data = json.RawMessage([]byte(`null`))
		switch snapshotType {
		case "LEAKAGE":
			base.Reason = "no_data — no attachment decisions or variance records received yet"
		case "AMBIGUITY":
			base.Reason = "no_data — no attachment decisions received yet"
		case "DEFENSIBILITY":
			base.Reason = "no_data — no evidence packs or governance decisions received yet"
		case "RCA":
			base.Reason = "no_data — no failure events or DLQ events processed yet"
		case "PATTERN":
			base.Reason = "no_data — no batch summary events received yet"
		case "RECOMMENDATION":
			base.Reason = "no_data — recommendation layer has no upstream snapshots to synthesise yet"
		default:
			base.Reason = "no_data — no events processed yet for this intelligence layer"
		}
		return base
	}

	base.SnapshotID = snap.SnapshotID
	base.ScopeType = snap.ScopeType
	base.ScopeRef = snap.ScopeRef
	base.WindowStart = &snap.WindowStart
	base.WindowEnd = &snap.WindowEnd
	base.ComputedAt = &snap.CreatedAt
	base.ModelVersion = snap.ModelVersion
	base.Data = json.RawMessage(snap.SnapshotJSON)
	base.DataAvailable = true
	return base
}

// ── Intelligence layer endpoints ───────────────────────────────────────────────

// GetLeakage handles GET /v1/intelligence/leakage?tenant_id=X
//
// Returns the latest LEAKAGE intelligence snapshot for a tenant.
// The snapshot contains: total leakage amount, breakdown by type
// (unmatched, under-settlement, orphan, reversal), top leakage drivers,
// leakage percentage of intended volume, and risk tier.
//
// Available in: GRADE_A and GRADE_B.
// Data source:  attachment.decision.created + variance.record.created events.
func (h *IntelligenceSurfaceHandler) GetLeakage(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	resp := h.buildSnapshotResponse(r, tenantID, "LEAKAGE", "TENANT", nil)
	writeJSON(w, http.StatusOK, resp)
}

// GetAmbiguity handles GET /v1/intelligence/ambiguity?tenant_id=X
//
// Returns the latest AMBIGUITY intelligence snapshot for a tenant.
// The snapshot contains: ambiguous intent count, value-at-risk,
// average attachment confidence, provider ref missing rate, ambiguity rate,
// unresolved settlement count, and confidence heatmap signals.
//
// Available in: GRADE_A and GRADE_B.
// Data source:  attachment.decision.created events.
func (h *IntelligenceSurfaceHandler) GetAmbiguity(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	resp := h.buildSnapshotResponse(r, tenantID, "AMBIGUITY", "TENANT", nil)
	writeJSON(w, http.StatusOK, resp)
}

// GetDefensibility handles GET /v1/intelligence/defensibility?tenant_id=X
//
// Returns the latest DEFENSIBILITY intelligence snapshot for a tenant.
// The snapshot contains: evidence pack rate, governance coverage pct,
// replayability pct, audit-ready pct, dispute-ready pct, defensibility tier
// per payment (STRONG/GOOD/WEAK/FRAGILE), and compliance alerts.
//
// Available in: GRADE_A and GRADE_B.
// Data source:  evidence.pack.ready + governance.decision.created events.
func (h *IntelligenceSurfaceHandler) GetDefensibility(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	resp := h.buildSnapshotResponse(r, tenantID, "DEFENSIBILITY", "TENANT", nil)
	writeJSON(w, http.StatusOK, resp)
}

// GetRCA handles GET /v1/intelligence/rca?tenant_id=X[&corridor_id=Y]
//
// Returns the latest RCA (Root Cause Analysis) intelligence snapshot.
// The snapshot contains: top failure drivers ranked by (count × amount × recurrence),
// top ambiguity drivers, failure reason clusters, top batch template issues,
// top provider/source-system issues, and top reversal/return drivers.
//
// When corridor_id is provided, returns RCA scoped to that corridor.
// When omitted, returns tenant-level RCA across all corridors.
//
// Available in: GRADE_A and GRADE_B.
// Data source:  outcome.event.normalized + dlq.event + variance.record.created.
func (h *IntelligenceSurfaceHandler) GetRCA(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	corridorID := r.URL.Query().Get("corridor_id")

	scopeType := "TENANT"
	var scopeRef *string
	if corridorID != "" {
		scopeType = "CORRIDOR"
		scopeRef = &corridorID
	}

	resp := h.buildSnapshotResponse(r, tenantID, "RCA", scopeType, scopeRef)
	writeJSON(w, http.StatusOK, resp)
}

// GetPattern handles GET /v1/intelligence/pattern?tenant_id=X
//
// Returns the latest PATTERN intelligence snapshot for a tenant.
// The snapshot contains: batch risk scores, bad batch patterns,
// repeated weak-ref patterns, duplicate-risk clusters, poor-intent cohorts,
// low proof-readiness cohorts, and pre-dispatch quality signals.
//
// Available in: GRADE_A and GRADE_B.
// Data source:  batch.summary.updated + canonical.intent.created events.
func (h *IntelligenceSurfaceHandler) GetPattern(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	resp := h.buildSnapshotResponse(r, tenantID, "PATTERN", "TENANT", nil)
	writeJSON(w, http.StatusOK, resp)
}

// GetRecommendation handles GET /v1/intelligence/recommendation?tenant_id=X
//
// Returns the latest RECOMMENDATION intelligence snapshot for a tenant.
// The snapshot contains ranked recommendation cards synthesised from all
// other intelligence layers, priority buckets (CRITICAL/HIGH/MEDIUM/LOW),
// total amount at stake, and the source snapshot IDs used.
//
// Available in: GRADE_A and GRADE_B.
// Data source:  all other intelligence snapshots.
func (h *IntelligenceSurfaceHandler) GetRecommendation(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	resp := h.buildSnapshotResponse(r, tenantID, "RECOMMENDATION", "TENANT", nil)
	writeJSON(w, http.StatusOK, resp)
}

// ── Batch endpoints ────────────────────────────────────────────────────────────

// GetBatch handles GET /v1/intelligence/batches/{batch_id}?tenant_id=X
//
// Returns full batch intelligence for one batch:
//   - Authoritative batch_contracts row (counts, amounts, finality status)
//   - Latest batch.health.* projection (time-series point for trend queries)
//   - Intelligence mode (so frontend knows which capabilities fed this data)
//
// Returns 404 if the batch_id is not found for the tenant.
// Returns 200 with batch_health=null if no projection exists yet (batch is very new).
//
// Available in: GRADE_A and GRADE_B.
// Data source:  batch.summary.updated events.
func (h *IntelligenceSurfaceHandler) GetBatch(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	batchID := chi.URLParam(r, "batch_id")

	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	if batchID == "" {
		writeError(w, http.StatusBadRequest, "batch_id is required")
		return
	}

	mode := h.projectionService.Mode()

	// Fetch authoritative batch contract
	batch, err := h.batchRepo.GetByID(r.Context(), batchID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batch")
		return
	}
	if batch == nil || batch.TenantID != tenantID {
		writeError(w, http.StatusNotFound, "batch not found")
		return
	}

	// Fetch the latest batch health projection for trend data
	// This is separate from batch_contracts — it gives the time-windowed view.
	var batchHealth interface{} = nil
	healthProj, err := h.projRepo.GetLatest(r.Context(), tenantID, "batch.health."+batchID)
	if err == nil && healthProj != nil {
		var parsed interface{}
		if jsonErr := json.Unmarshal([]byte(healthProj.ValueJSON), &parsed); jsonErr == nil {
			batchHealth = parsed
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":         tenantID,
		"intelligence_mode": string(mode),
		"batch":             batch,
		"batch_health":      batchHealth, // time-series projection point (nil if no projection yet)
	})
}

// ListBatches handles GET /v1/intelligence/batches?tenant_id=X[&status=REQUIRES_REVIEW]
//
// Returns a list of batches for a tenant, ordered by last_updated_at DESC.
// Supports optional ?status= filter for ops workflow:
//   - status=REQUIRES_REVIEW → only batches needing manual review
//   - (no filter) → all batches, newest-updated first
//
// Available in: GRADE_A and GRADE_B.
func (h *IntelligenceSurfaceHandler) ListBatches(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	mode := h.projectionService.Mode()
	statusFilter := r.URL.Query().Get("status")

	// Parse optional limit query param. Default 50, max 100.
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		var parsed int
		if _, err := fmt.Sscanf(l, "%d", &parsed); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	var batches interface{}
	var err error

	if statusFilter == "REQUIRES_REVIEW" {
		batches, err = h.batchRepo.ListRequiringReview(r.Context(), tenantID, limit)
	} else {
		batches, err = h.batchRepo.ListByTenant(r.Context(), tenantID, limit)
	}

	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batches")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":         tenantID,
		"intelligence_mode": string(mode),
		"status_filter":     statusFilter,
		"batches":           batches,
	})
}

// GetSnapshotHistory handles GET /v1/intelligence/{type}/history?tenant_id=X&limit=N
//
// Returns the N most recent snapshots of a given type for a tenant.
// Used by the replay sandbox and trend views to show how intelligence changed over time.
// limit defaults to 20, max 100.
//
// Valid types: leakage, ambiguity, defensibility, rca, pattern, recommendation
func (h *IntelligenceSurfaceHandler) GetSnapshotHistory(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	snapshotType := chi.URLParam(r, "type")

	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	// Map URL segment to canonical snapshot_type value
	typeMap := map[string]string{
		"leakage":        "LEAKAGE",
		"ambiguity":      "AMBIGUITY",
		"defensibility":  "DEFENSIBILITY",
		"rca":            "RCA",
		"pattern":        "PATTERN",
		"recommendation": "RECOMMENDATION",
	}
	canonicalType, ok := typeMap[snapshotType]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid snapshot type: must be one of leakage, ambiguity, defensibility, rca, pattern, recommendation")
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		var parsed int
		if _, err := fmt.Sscanf(l, "%d", &parsed); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	mode := h.projectionService.Mode()

	snapshots, err := h.snapshotRepo.ListByTenantAndType(r.Context(), tenantID, canonicalType, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch snapshot history")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":         tenantID,
		"intelligence_mode": string(mode),
		"snapshot_type":     canonicalType,
		"snapshots":         snapshots,
		"count":             len(snapshots),
	})
}
