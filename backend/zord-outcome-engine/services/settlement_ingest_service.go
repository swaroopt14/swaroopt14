package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
	"zord-outcome-engine/storage"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// SettlementIngestService provides granular methods for settlement file ingestion.
// Orchestration is handled at the controller/handler level to maintain a flat flow.
type SettlementIngestService struct {
	S3 *storage.S3Store
}

// ExistingJobResult holds what we need to return when a duplicate is found.
type ExistingJobResult struct {
	JobID       string
	JobStatus   string
	CreatedAt   time.Time
	Fingerprint string
}

// CheckByFingerprint looks up an existing job by ingest_fingerprint.
// Returns nil if no job exists for this fingerprint.
func (s *SettlementIngestService) CheckByFingerprint(ctx context.Context, fingerprint string) (*ExistingJobResult, error) {
	var r ExistingJobResult
	err := db.DB.QueryRowContext(ctx,
		`SELECT job_id, job_status, created_at, ingest_fingerprint
         FROM settlement_ingest_jobs
         WHERE ingest_fingerprint = $1 LIMIT 1`,
		fingerprint,
	).Scan(&r.JobID, &r.JobStatus, &r.CreatedAt, &r.Fingerprint)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("idempotency check failed: %w", err)
	}
	return &r, nil
}

// JobIDExists checks whether a job_id already exists in settlement_ingest_jobs.
// Used to prevent reusing an existing job_id as a batch_id on a force reprocess.
func (s *SettlementIngestService) JobIDExists(ctx context.Context, jobID string) (bool, error) {
	var count int
	err := db.DB.QueryRowContext(ctx,
		`SELECT COUNT(1) FROM settlement_ingest_jobs WHERE job_id = $1`,
		jobID,
	).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("job_id existence check failed: %w", err)
	}
	return count > 0, nil
}

// RegisterJob creates the initial job record in 'PARSING' status.
// profile carries the PSP-specific metadata (source_system, mapping_profile_id, etc.)
// so the job row correctly reflects which PSP this file came from.
func (s *SettlementIngestService) RegisterJob(
	ctx context.Context, 
	jobID string, tenantID, envelopeID uuid.UUID, 
	profile models.MappingProfile,
	fileSHA256 string,
	externalBatchID *string,
	fingerprint string,
) error {
	receivedAt := time.Now().UTC()
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO settlement_ingest_jobs (
			job_id, tenant_id, settlement_envelope_id,
			artifact_family, source_system,
			mapping_profile_id, mapping_profile_version,
			job_status, started_at, created_at,
			file_sha256, external_batch_id, ingest_fingerprint
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		jobID, tenantID, envelopeID,
		profile.ArtifactFamily, profile.SourceSystem,
		profile.ProfileID, profile.ProfileVersion,
		"PARSING", receivedAt, receivedAt,
		fileSHA256, externalBatchID, fingerprint,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return nil
		}
		return fmt.Errorf("register job failed: %w", err)
	}
	return nil
}

// PersistParsedRow saves a successfully parsed row to the database.
// profile is passed through so the row records which PSP mapping was used.
func (s *SettlementIngestService) PersistParsedRow(
	ctx context.Context, 
	tenantID uuid.UUID, jobID string, envelopeID uuid.UUID,
	objRef, rowRef string,
	result ParsedRowResult,
	profile models.MappingProfile, // NEW
) error {
	parsedRowID := uuid.New()
	rawColsJSON, _ := json.Marshal(result.RawColumns)
	shapeJSON, _ := json.Marshal(result.Shape)

	var warningsJSON []byte
	if len(result.Warnings) > 0 {
		warningsJSON, _ = json.Marshal(result.Warnings)
	}

	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO settlement_parsed_rows (
			parsed_row_id, job_id, tenant_id, settlement_envelope_id,
			source_file_ref, source_row_ref,
			raw_columns_json, parsed_candidates_json, parse_warnings_json,
			parse_confidence, mapping_profile_id, mapping_profile_version, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		parsedRowID, jobID, tenantID, envelopeID,
		objRef, rowRef,
		rawColsJSON, shapeJSON, warningsJSON,
		result.Confidence, profile.ProfileID, profile.ProfileVersion, time.Now().UTC(),
	)
	return err
}

// FinalizeJob updates the job status, counts, and overall confidence.
// This is called after all rows have been processed in the persistence phase.
func (s *SettlementIngestService) FinalizeJob(
	ctx context.Context, 
	jobID string, 
	parsedCount, failedCount int, 
	avgConfidence float64,
) error {
	_, err := db.DB.ExecContext(ctx, `
		UPDATE settlement_ingest_jobs
		SET job_status = $1,
		    row_count_parsed = $2,
		    row_count_failed = $3,
		    parse_confidence_overall = $4,
		    completed_at = $5
		WHERE job_id = $6`,
		"DONE", parsedCount, failedCount, avgConfidence, time.Now().UTC(), jobID,
	)
	return err
}

// MarkJobFailed is a helper to update job status on non-recoverable failures.
func (s *SettlementIngestService) MarkJobFailed(ctx context.Context, jobID string, reasonCode string) {
	_, _ = db.DB.ExecContext(ctx,
		`UPDATE settlement_ingest_jobs SET job_status='FAILED', failure_reason_code=$1, completed_at=$2 WHERE job_id=$3`,
		reasonCode, time.Now().UTC(), jobID,
	)
}

// PersistParseError records a non-fatal row-level error for later auditing.
// profile is passed so the error record references the correct mapping profile.
func (s *SettlementIngestService) PersistParseError(ctx context.Context, tenantID uuid.UUID, jobID string, envID uuid.UUID, rowRef, errorStage, reason string, profile models.MappingProfile) error {
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO settlement_parse_errors (
			error_id, tenant_id, job_id, settlement_envelope_id,
			source_row_ref, error_stage, reason_code,
			severity, mapping_profile_id, mapping_profile_version, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		uuid.New(), tenantID, jobID, envID,
		rowRef, errorStage, reason,
		"ERROR", profile.ProfileID, profile.ProfileVersion, time.Now().UTC(),
	)
	return err
}

// -- Pointer Helpers --

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func int64Ptr(v int64) *int64 { return &v }

// isUniqueViolation returns true for Postgres error code 23505.
func isUniqueViolation(err error) bool {
	var pgErr *pq.Error
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
