package handlers

// What is this file?
// Health check endpoints for Kubernetes.
// Kubernetes calls /healthz every few seconds to know if the pod is alive.
// If this returns non-200, Kubernetes restarts the pod.
//
// Two endpoints:
//   GET /healthz  → liveness  (is the process running?)
//   GET /readyz   → readiness (is it ready to serve traffic?)

import (
	"net/http"
)

// HealthHandler handles health check requests.
type HealthHandler struct{}

// NewHealthHandler creates a HealthHandler.
func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

// Liveness responds to GET /healthz
// Returns 200 as long as the process is alive.
// Even if DB is down, this returns 200 — the process is still running.
func (h *HealthHandler) Liveness(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "zord-intelligence",
	})
}

// Readiness responds to GET /readyz
// Returns 200 only when the service is ready to handle traffic.
// Kubernetes won't route traffic to a pod until this returns 200.
func (h *HealthHandler) Readiness(w http.ResponseWriter, r *http.Request) {
	// TODO: add DB ping check here in production
	// For now: if the process started, it is ready
	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ready",
	})
}
