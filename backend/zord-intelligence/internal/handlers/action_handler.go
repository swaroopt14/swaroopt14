package handlers

// What is this file?
// HTTP handlers for reading ActionContracts.
// The frontend uses these to show what decisions ZPI has made.
//
// ENDPOINTS:
//   GET /v1/intelligence/actions?tenant_id=X&limit=50
//       → paginated list of recent actions
//
//   GET /v1/intelligence/actions/{action_id}
//       → full detail of one action
//
//   GET /v1/intelligence/actions?tenant_id=X&scope_field=contract_id&scope_value=ctr_01
//       → all actions for a specific contract

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// ActionHandler handles ActionContract HTTP requests.
type ActionHandler struct {
	actionRepo *persistence.ActionContractRepo
}

// NewActionHandler creates an ActionHandler.
func NewActionHandler(actionRepo *persistence.ActionContractRepo) *ActionHandler {
	return &ActionHandler{actionRepo: actionRepo}
}

// ListActions handles GET /v1/intelligence/actions
//
// Query parameters:
//
//	tenant_id    → required
//	limit        → optional, default 50, max 100
//	before       → optional cursor for pagination (RFC3339 timestamp)
//	scope_field  → optional filter: "contract_id", "corridor_id", "intent_id"
//	scope_value  → required if scope_field is set
//
// EXAMPLE REQUESTS:
//
//	/v1/intelligence/actions?tenant_id=tnt_A
//	/v1/intelligence/actions?tenant_id=tnt_A&limit=20
//	/v1/intelligence/actions?tenant_id=tnt_A&scope_field=corridor_id&scope_value=razorpay_UPI
func (h *ActionHandler) ListActions(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}

	// Parse optional scope filter
	scopeField := r.URL.Query().Get("scope_field")
	scopeValue := r.URL.Query().Get("scope_value")

	// If scope filter is provided, use the scope-based query
	if scopeField != "" && scopeValue != "" {
		actions, err := h.actionRepo.ListByScope(r.Context(), tenantID, scopeField, scopeValue)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch actions")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"tenant_id":   tenantID,
			"scope_field": scopeField,
			"scope_value": scopeValue,
			"actions":     actions,
			"count":       len(actions),
		})
		return
	}

	// Parse limit
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	// Parse before cursor (for pagination)
	// Default: now (get latest actions first)
	before := time.Now().UTC()
	if b := r.URL.Query().Get("before"); b != "" {
		if parsed, err := time.Parse(time.RFC3339, b); err == nil {
			before = parsed
		}
	}

	actions, err := h.actionRepo.List(r.Context(), tenantID, limit, before)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch actions")
		return
	}

	// Build next_cursor for pagination
	// Frontend uses this to fetch the next page:
	// /actions?tenant_id=X&before=<next_cursor>
	var nextCursor string
	if len(actions) == limit {
		// There might be more — give the frontend a cursor
		nextCursor = actions[len(actions)-1].CreatedAt.Format(time.RFC3339)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":   tenantID,
		"actions":     actions,
		"count":       len(actions),
		"next_cursor": nextCursor, // empty string = no more pages
	})
}

// GetAction handles GET /v1/intelligence/actions/{action_id}
//
// Returns full detail of one ActionContract including:
// - The decision and confidence
// - The scope refs (what it was about)
// - The input refs (what projection values triggered it)
// - The payload (what the actuator did)
// - The signature (cryptographic proof)
func (h *ActionHandler) GetAction(w http.ResponseWriter, r *http.Request) {
	actionID := chi.URLParam(r, "action_id")
	if actionID == "" {
		writeError(w, http.StatusBadRequest, "action_id is required")
		return
	}

	action, err := h.actionRepo.GetByID(r.Context(), actionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch action")
		return
	}
	if action == nil {
		writeError(w, http.StatusNotFound, "action not found")
		return
	}

	writeJSON(w, http.StatusOK, action)
}
