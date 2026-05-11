package services

import (
	"fmt"

	"github.com/google/uuid"
	"zord-outcome-engine/models"
)

// RunLevelErrorKind is the failure_reason_code written to settlement_ingest_runs
// when a parser returns a fatal, file-level error.
type RunLevelErrorKind string

const (
	// RunLevelFileCorrupted means the file cannot be read at all (corrupt bytes,
	// missing sheets, empty file, CSV read failure, etc.).
	RunLevelFileCorrupted RunLevelErrorKind = "FILE_CORRUPTED"

	// RunLevelUnsupportedFormat means the file is readable but its structure
	// (headers, column names, column count) does not match the expected format.
	RunLevelUnsupportedFormat RunLevelErrorKind = "UNSUPPORTED_FORMAT"
)

// RunLevelError is returned by SettlementParser.Parse for fatal file-level failures.
// The handler extracts Kind to set settlement_ingest_runs.failure_reason_code.
type RunLevelError struct {
	Kind    RunLevelErrorKind
	Message string
}

func (e *RunLevelError) Error() string {
	return fmt.Sprintf("[%s] %s", e.Kind, e.Message)
}

// SettlementParser is the interface every PSP-specific parser must implement.
// Adding a new PSP means writing a new struct that implements this interface.
// The rest of the pipeline (canonicalization, outbox, scoring) never changes.
type SettlementParser interface {
	// Parse reads raw file bytes and returns one ParsedRowResult per data row.
	// sourceFileRef is the S3 object path. envelopeID is the raw envelope UUID.
	// Fatal file-level failures are returned as *RunLevelError (never nil error for row issues).
	// Row-level failures are represented as ParsedRowResult{Failed: true}, never as errors.
	Parse(fileBytes []byte, sourceFileRef string, envelopeID uuid.UUID, profile models.MappingProfile) ([]ParsedRowResult, error)
}

