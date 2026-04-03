package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	
	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
)

type DLQHandler struct {
	repo persistence.DLQRepository
}

func NewDLQHandler(repo persistence.DLQRepository) *DLQHandler {
	return &DLQHandler{repo: repo}
}

// GET /v1/dlq
// - No tenant_id  → all DLQ entries
// - tenant_id=?   → DLQ entries for that tenant
func (h *DLQHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := r.URL.Query().Get("tenant_id")

	var (
		items []models.DLQEntry
		err   error
	)

	if tenantID != "" {
		items, err = h.repo.ListByTenant(ctx, tenantID)
	} else {
		items, err = h.repo.ListAll(ctx)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}
// NEW: GET /v1/dlq/:dlq_id
// Fetches a single DLQ entry by its primary key
func (h *DLQHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Extract dlq_id from URL path: /v1/dlq/{dlq_id}
	dlqID := strings.TrimPrefix(r.URL.Path, "/v1/dlq/")
	dlqID = strings.TrimSpace(dlqID)

	if dlqID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "dlq_id is required"})
		return
	}

	entry, err := h.repo.GetByID(ctx, dlqID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Failed to fetch DLQ item",
			"details": err.Error(),
		})
		return
	}

	if entry == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "DLQ item not found"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entry)
}