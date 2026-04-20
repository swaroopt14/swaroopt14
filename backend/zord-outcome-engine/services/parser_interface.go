package services

import "github.com/google/uuid"

// SettlementParser is the interface every PSP-specific parser must implement.
// Adding a new PSP means writing a new struct that implements this interface.
// The rest of the pipeline (canonicalization, outbox, scoring) never changes.
type SettlementParser interface {
	// Parse reads raw file bytes and returns one ParsedRowResult per data row.
	// sourceFileRef is the S3 object path. envelopeID is the raw envelope UUID.
	// Returns an error only for fatal file-level failures (e.g. wrong format, missing headers).
	// Row-level failures are represented as ParsedRowResult{Failed: true}, never as errors.
	Parse(fileBytes []byte, sourceFileRef string, envelopeID uuid.UUID) ([]ParsedRowResult, error)
}
