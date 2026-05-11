package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"zord-intent-engine/internal/etl"
	"zord-intent-engine/internal/worker"
)

type AirflowHandler struct {
	airflowWorker *worker.AirflowWorker
}

func NewAirflowHandler(w *worker.AirflowWorker) *AirflowHandler {
	return &AirflowHandler{airflowWorker: w}
}

// POST /internal/airflow/transform
// Called by Airflow ZordTransformOperator once per task execution.
// Leases PENDING outbox events, runs ETL quality scoring, acks/nacks.
// Returns BatchTransformResponse so Airflow can gate on parse_success_rate.
func (h *AirflowHandler) Transform(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !authorizeRelay(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse optional query params — Airflow operator passes these
	limit := 500
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}

	ttl := 300
	if raw := r.URL.Query().Get("lease_ttl_seconds"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 600 {
			ttl = n
		}
	}

	leasedBy := relayInstanceID(r) // reuse existing helper — reads X-Relay-Instance-ID header

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Minute)
	defer cancel()

	summary, err := h.airflowWorker.RunOnce(ctx, limit, ttl, leasedBy)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, etl.BatchTransformResponse{
		LeaseID:          summary.LeaseID,
		Leased:           summary.Leased,
		Accepted:         summary.Accepted,
		Failed:           summary.Failed,
		ParseSuccessRate: summary.ParseSuccessRate,
		BelowThreshold:   summary.BelowThreshold,
		Results:          nil, // summary-level only; per-event detail lives in etl_quality_results
	})
}
