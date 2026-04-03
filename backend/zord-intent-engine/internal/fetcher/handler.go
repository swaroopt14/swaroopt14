package fetcher

import (
	"encoding/json"
	"net/http"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// POST /test/raw-envelope
func (h *Handler) Store(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage

	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		http.Error(w, "invalid JSON payload", http.StatusBadRequest)
		return
	}

	// TEMP: hardcoded tenant for testing
	tenantID := "11111111-1111-1111-1111-111111111111"

	envelope, err := h.service.StoreRawIntent( //Raw intent along with Tenant ID
		r.Context(),
		tenantID,
		raw,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"envelope_id": envelope.EnvelopeID,
	})
}
