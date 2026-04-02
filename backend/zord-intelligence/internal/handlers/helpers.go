package handlers

// What is this file?
// Two helper functions used by every handler in this package.
// Putting them here means we don't copy-paste the same code in every file.
//
// writeJSON  → sends any Go value as a JSON HTTP response
// writeError → sends a standard error JSON response

import (
	"encoding/json"
	"net/http"
)

// writeJSON serialises v to JSON and writes it to the response.
//
// USED IN EVERY HANDLER like this:
//
//	writeJSON(w, http.StatusOK, myData)
//	writeJSON(w, http.StatusCreated, map[string]string{"id": "123"})
//
// "any" means this accepts any Go type:
//
//	structs, maps, slices — anything json.Marshal can handle
func writeJSON(w http.ResponseWriter, status int, v any) {
	// Tell the browser this response is JSON
	w.Header().Set("Content-Type", "application/json")

	// Write the HTTP status code (200, 201, 400, 500 etc.)
	w.WriteHeader(status)

	// Encode v as JSON and write to the response body
	// json.NewEncoder(w) writes directly to the response — no intermediate string
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// At this point headers are already sent — we can only log
		// In production: use zerolog here
		_ = err
	}
}

// writeError sends a standard error response.
//
// USED IN EVERY HANDLER like this:
//
//	writeError(w, http.StatusBadRequest, "tenant_id is required")
//	writeError(w, http.StatusNotFound, "action not found")
//
// ALL error responses have the same shape:
//
//	{ "error": "message here" }
//
// This makes it easy for the frontend to handle errors consistently.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": message,
	})
}
