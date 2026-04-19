package handlers

import (
	"net/http"
)

// PatternHandler serves the GET /v1/intelligence/pattern endpoint.
type PatternHandler struct {
	base *IntelligenceBase
}

// NewPatternHandler creates a PatternHandler.
func NewPatternHandler(base *IntelligenceBase) *PatternHandler {
	return &PatternHandler{base: base}
}

// GetPattern handles GET /v1/intelligence/pattern?tenant_id=X
func (h *PatternHandler) GetPattern(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	batchID := r.URL.Query().Get("batch_id")
	var scopeRef *string
	if batchID != "" {
		scopeRef = &batchID
	}
	resp := h.base.buildSnapshotResponse(r, tenantID, "PATTERN", "BATCH", scopeRef)
	writeJSON(w, http.StatusOK, resp)
}
