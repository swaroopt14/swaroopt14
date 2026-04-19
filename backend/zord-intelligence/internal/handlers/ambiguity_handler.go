package handlers

import (
	"net/http"
)

// AmbiguityHandler serves the GET /v1/intelligence/ambiguity endpoint.
type AmbiguityHandler struct {
	base *IntelligenceBase
}

// NewAmbiguityHandler creates a AmbiguityHandler.
func NewAmbiguityHandler(base *IntelligenceBase) *AmbiguityHandler {
	return &AmbiguityHandler{base: base}
}

// GetAmbiguity handles GET /v1/intelligence/ambiguity?tenant_id=X
func (h *AmbiguityHandler) GetAmbiguity(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	resp := h.base.buildSnapshotResponse(r, tenantID, "AMBIGUITY", "TENANT", nil)
	writeJSON(w, http.StatusOK, resp)
}
