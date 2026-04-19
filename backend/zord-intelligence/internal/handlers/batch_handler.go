package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// BatchHandler serves batch-level endpoints out of the intelligence layer.
type BatchHandler struct {
	batchRepo         *persistence.BatchContractRepo
	projRepo          *persistence.ProjectionRepo
	projectionService *services.ProjectionService
}

// NewBatchHandler creates a BatchHandler.
func NewBatchHandler(
	batchRepo *persistence.BatchContractRepo,
	projRepo *persistence.ProjectionRepo,
	projectionService *services.ProjectionService,
) *BatchHandler {
	return &BatchHandler{
		batchRepo:         batchRepo,
		projRepo:          projRepo,
		projectionService: projectionService,
	}
}

// GetBatch handles GET /v1/intelligence/batches/{batch_id}?tenant_id=X
func (h *BatchHandler) GetBatch(w http.ResponseWriter, r *http.Request) {
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

	batch, err := h.batchRepo.GetByID(r.Context(), batchID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batch")
		return
	}
	if batch == nil || batch.TenantID != tenantID {
		writeError(w, http.StatusNotFound, "batch not found")
		return
	}

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
		"batch_health":      batchHealth,
	})
}

// ListBatches handles GET /v1/intelligence/batches?tenant_id=X[&status=REQUIRES_REVIEW]
func (h *BatchHandler) ListBatches(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	mode := h.projectionService.Mode()
	statusFilter := r.URL.Query().Get("status")

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
