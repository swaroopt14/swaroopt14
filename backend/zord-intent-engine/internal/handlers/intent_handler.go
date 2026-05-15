package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
)

// IntentHandler handles HTTP requests for payment intents
type IntentHandler struct {
	queryRepo persistence.IntentQueryRepository
}

// NewIntentHandler creates a new handler instance
func NewIntentHandler(queryRepo persistence.IntentQueryRepository) *IntentHandler {
	return &IntentHandler{queryRepo: queryRepo}
}

// ----- RESPONSE STRUCTURES -----
// FIXED: Must match the frontend's IntentListResponse interface in intents.ts
// Before: { data: [...], total, page, page_size, total_pages }  ← WRONG
// After:  { items: [...], pagination: { page, page_size, total } }  ← CORRECT

type PaginationInfo struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type IntentListResponse struct {
	Items      []models.CanonicalIntent `json:"items"`
	Pagination PaginationInfo           `json:"pagination"`
}
type BatchSidebarResponse struct {
	Items []models.BatchSidebarItem `json:"items"`
}
type TablePagination struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
}

type PaymentIntentDetailsSection struct {
	Items      []models.CanonicalIntent `json:"items"`
	Pagination TablePagination          `json:"pagination"`
}

type DLQDetailsSection struct {
	Items      []models.DLQEntry `json:"items"`
	Pagination TablePagination   `json:"pagination"`
}

type BatchDetailsPayload struct {
	BatchID        string                      `json:"batchId"`
	PaymentIntents PaymentIntentDetailsSection `json:"paymentIntents"`
	DLQItems       DLQDetailsSection           `json:"dlqItems"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code"`
	Message string `json:"message"`
	TraceID string `json:"trace_id,omitempty"`
}

// ENDPOINT 1: LIST INTENTS — GET /v1/intents
func (h *IntentHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Extract pagination parameters
	page := getIntParam(r, "page", 1)
	pageSize := getIntParam(r, "page_size", 20)

	// Enforce limits (security)
	if pageSize > 100 {
		pageSize = 100
	}
	if page < 1 {
		page = 1
	}

	// Extract filter parameters
	tenantID := r.URL.Query().Get("tenant_id")
	status := r.URL.Query().Get("status")
	intentType := r.URL.Query().Get("intent_type")

	// Call repository
	intents, total, err := h.queryRepo.ListIntents(ctx, persistence.IntentFilter{
		TenantID:   tenantID,
		Status:     status,
		IntentType: intentType,
		Page:       page,
		PageSize:   pageSize,
	})

	if err != nil {
		respondError(w, "DATABASE_ERROR", "Failed to fetch intents", http.StatusInternalServerError, err)
		return
	}

	// Ensure empty array instead of null
	if intents == nil {
		intents = []models.CanonicalIntent{}
	}

	// FIXED: Build response matching frontend's IntentListResponse
	response := IntentListResponse{
		Items: intents,
		Pagination: PaginationInfo{
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		},
	}

	// Send response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ENDPOINT 2: GET BY ID — GET /v1/intents/:intent_id
// FIXED: Return the intent directly, NOT wrapped in { "data": ... }
// Frontend does: const data = await response.json(); return data;
// So data must BE the intent, not { data: intent }
func (h *IntentHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Extract intent_id from URL
	path := strings.TrimPrefix(r.URL.Path, "/v1/intents/")
	intentID := strings.TrimSpace(path)

	if intentID == "" {
		respondError(w, "INVALID_REQUEST", "Intent ID is required", http.StatusBadRequest, nil)
		return
	}

	// Fetch from database
	intent, err := h.queryRepo.GetIntentByID(ctx, intentID)

	if err != nil {
		if err.Error() == "intent not found" || strings.Contains(err.Error(), "not found") {
			respondError(w, "NOT_FOUND", "Intent not found", http.StatusNotFound, err)
			return
		}

		respondError(w, "DATABASE_ERROR", "Failed to fetch intent", http.StatusInternalServerError, err)
		return
	}

	// FIXED: Send intent directly (not wrapped in { data: ... })
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(intent)
}

//  HELPERS

func getIntParam(r *http.Request, key string, defaultValue int) int {
	val := r.URL.Query().Get(key)
	if val == "" {
		return defaultValue
	}

	intVal, err := strconv.Atoi(val)
	if err != nil {
		return defaultValue
	}

	return intVal
}

// ENDPOINT 3: LIST BATCH SIDEBAR — GET /api/prod/intents/batches?tenant_id=...
func (h *IntentHandler) ListBatchesSidebar(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	tenantID := strings.TrimSpace(r.URL.Query().Get("tenant_id"))
	if tenantID == "" {
		respondError(w, "INVALID_REQUEST", "tenant_id is required", http.StatusBadRequest, nil)
		return
	}

	// Sidebar summaries (existing behavior)
	items, err := h.queryRepo.ListBatchesForSidebar(ctx, tenantID)
	if err != nil {
		respondError(w, "DATABASE_ERROR", "Failed to fetch batches sidebar data", http.StatusInternalServerError, err)
		return
	}
	if items == nil {
		items = []models.BatchSidebarItem{}
	}

	// Mode 1: sidebar only
	batchID := strings.TrimSpace(r.URL.Query().Get("batch_id"))
	if batchID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(BatchSidebarResponse{Items: items})
		return
	}

	// Mode 2: selected batch details
	page := getIntParam(r, "page", 1)
	pageSize := getIntParam(r, "page_size", 20)
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}

	piItems, piTotal, err := h.queryRepo.ListPaymentIntentsByBatch(ctx, tenantID, batchID, page, pageSize)
	if err != nil {
		respondError(w, "DATABASE_ERROR", "Failed to fetch payment intent details", http.StatusInternalServerError, err)
		return
	}
	if piItems == nil {
		piItems = []models.CanonicalIntent{}
	}

	dlqItems, dlqTotal, err := h.queryRepo.ListDLQItemsByBatch(ctx, tenantID, batchID, page, pageSize)
	if err != nil {
		respondError(w, "DATABASE_ERROR", "Failed to fetch DLQ details", http.StatusInternalServerError, err)
		return
	}
	if dlqItems == nil {
		dlqItems = []models.DLQEntry{}
	}

	resp := struct {
		Items        []models.BatchSidebarItem `json:"items"`
		BatchDetails BatchDetailsPayload       `json:"batchDetails"`
	}{
		Items: items,
		BatchDetails: BatchDetailsPayload{
			BatchID: batchID,
			PaymentIntents: PaymentIntentDetailsSection{
				Items: piItems,
				Pagination: TablePagination{
					Page:     page,
					PageSize: pageSize,
					Total:    piTotal,
				},
			},
			DLQItems: DLQDetailsSection{
				Items: dlqItems,
				Pagination: TablePagination{
					Page:     page,
					PageSize: pageSize,
					Total:    dlqTotal,
				},
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}
func respondError(w http.ResponseWriter, code, message string, httpStatus int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpStatus)

	errResp := ErrorResponse{
		Error:   "REQUEST_FAILED",
		Code:    code,
		Message: message,
	}
	_ = json.NewEncoder(w).Encode(errResp)
}
