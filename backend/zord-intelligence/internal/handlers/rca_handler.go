package handlers

import (
	"net/http"
)

// RCAHandler serves the GET /v1/intelligence/rca endpoint.
type RCAHandler struct {
	base *IntelligenceBase
}

// NewRCAHandler creates an RCAHandler.
func NewRCAHandler(base *IntelligenceBase) *RCAHandler {
	return &RCAHandler{base: base}
}

// GetRCA handles GET /v1/intelligence/rca?tenant_id=X[&corridor_id=Y]
//
// With corridor_id: returns the RCA snapshot for that specific corridor.
// Without corridor_id: returns the most recently computed RCA snapshot across
// all corridors for this tenant (overview view).
func (h *RCAHandler) GetRCA(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	corridorID := r.URL.Query().Get("corridor_id")
	if corridorID != "" {
		resp := h.base.buildSnapshotResponse(r, tenantID, "RCA", "CORRIDOR", &corridorID)
		writeJSON(w, http.StatusOK, resp)
		return
	}

	resp := h.base.buildSnapshotResponseAnyScope(r, tenantID, "RCA", "CORRIDOR")
	writeJSON(w, http.StatusOK, resp)
}
