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
func (h *RCAHandler) GetRCA(w http.ResponseWriter, r *http.Request) {
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

	resp := h.base.buildSnapshotResponse(r, tenantID, "RCA", scopeType, scopeRef)
	writeJSON(w, http.StatusOK, resp)
}
