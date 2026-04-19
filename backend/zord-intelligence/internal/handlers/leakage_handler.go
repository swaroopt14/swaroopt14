package handlers

import (
	"net/http"
)

// LeakageHandler serves the GET /v1/intelligence/leakage endpoint.
type LeakageHandler struct {
	base *IntelligenceBase
}

// NewLeakageHandler creates a LeakageHandler.
func NewLeakageHandler(base *IntelligenceBase) *LeakageHandler {
	return &LeakageHandler{base: base}
}

// GetLeakage handles GET /v1/intelligence/leakage?tenant_id=X
func (h *LeakageHandler) GetLeakage(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	resp := h.base.buildSnapshotResponse(r, tenantID, "LEAKAGE", "TENANT", nil)
	writeJSON(w, http.StatusOK, resp)
}
