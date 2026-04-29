package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
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

// BatchLookupResult is returned when checking for an existing settlement batch.
// It carries enough information for the handler to determine which idempotency case applies.
type BatchLookupResult struct {
	SettlementBatchID   string
	ClientBatchID       string
	CurrentActiveRunID  string
	ActiveRunFileSHA256 string
	ActiveRunStatus     string
	LatestRunNumber     int
}

// FindBatchByClientID looks up a settlement batch by the client-provided batch reference.
// Returns nil if no batch exists for this tenant + psp + client_batch_id combination.
func (s *SettlementIngestService) FindBatchByClientID(
	ctx context.Context,
	tenantID uuid.UUID,
	psp string,
	clientBatchID string,
) (*BatchLookupResult, error) {
	var r BatchLookupResult
	var activeRunID, activeFileSHA256, activeRunStatus sql.NullString
	err := db.DB.QueryRowContext(ctx, `
        SELECT
            b.settlement_batch_id,
            b.client_batch_id,
            b.current_active_run_id,
            b.latest_run_number,
            r.file_sha256,
            r.run_status
        FROM settlement_batches b
        LEFT JOIN settlement_ingest_runs r
            ON r.ingest_run_id = b.current_active_run_id
        WHERE b.tenant_id = $1 AND b.psp = $2 AND b.client_batch_id = $3
        LIMIT 1`,
		tenantID, psp, clientBatchID,
	).Scan(
		&r.SettlementBatchID, &r.ClientBatchID,
		&activeRunID, &r.LatestRunNumber,
		&activeFileSHA256, &activeRunStatus,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("batch lookup failed: %w", err)
	}
	r.CurrentActiveRunID = activeRunID.String
	r.ActiveRunFileSHA256 = activeFileSHA256.String
	r.ActiveRunStatus = activeRunStatus.String
	return &r, nil
}

// RegisterBatchAndRun creates the settlement_batches row (if new) and always
// creates a new settlement_ingest_runs row for this processing attempt.
func (s *SettlementIngestService) RegisterBatchAndRun(
	ctx context.Context,
	tenantID uuid.UUID,
	psp string,
	clientBatchID string,
	existingBatch *BatchLookupResult,
	envelopeID uuid.UUID,
	profile models.MappingProfile,
	fileSHA256 string,
	forceReprocess bool,
	reprocessReason string,
) (ingestRunID string, settlementBatchID string, runNumber int, err error) {
	ingestRunID = uuid.New().String()
	now := time.Now().UTC()

	if existingBatch == nil {
		settlementBatchID = uuid.New().String()
		runNumber = 1
		_, err = db.DB.ExecContext(ctx, `
            INSERT INTO settlement_batches (
                settlement_batch_id, tenant_id, psp, client_batch_id,
                current_active_run_id, latest_run_number, status,
                created_at, updated_at
            ) VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)`,
			settlementBatchID, tenantID, psp, clientBatchID,
			0, "ACTIVE", now, now,
		)
		if err != nil {
			if isUniqueViolation(err) {
				return "", "", 0, fmt.Errorf("concurrent batch creation - retry request: %w", err)
			}
			return "", "", 0, fmt.Errorf("create settlement batch failed: %w", err)
		}
	} else {
		settlementBatchID = existingBatch.SettlementBatchID
		runNumber = existingBatch.LatestRunNumber + 1
	}

	var reprocessReasonVal interface{}
	if reprocessReason != "" {
		reprocessReasonVal = reprocessReason
	}

	_, err = db.DB.ExecContext(ctx, `
        INSERT INTO settlement_ingest_runs (
            ingest_run_id, settlement_batch_id, tenant_id, psp,
            settlement_envelope_id, artifact_family, source_system,
            mapping_profile_id, mapping_profile_version,
            file_sha256, run_number, force_reprocess, reprocess_reason,
            run_status, started_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		ingestRunID, settlementBatchID, tenantID, psp,
		envelopeID, profile.ArtifactFamily, profile.SourceSystem,
		profile.ProfileID, profile.ProfileVersion,
		fileSHA256, runNumber, forceReprocess, reprocessReasonVal,
		"PARSING", now, now,
	)
	if err != nil {
		return "", "", 0, fmt.Errorf("create ingest run failed: %w", err)
	}

	return ingestRunID, settlementBatchID, runNumber, nil
}

// ActivateRun is called after a run completes successfully.
// It updates the batch's active run pointer and supersedes the previous run.
func (s *SettlementIngestService) ActivateRun(
	ctx context.Context,
	settlementBatchID string,
	newRunID string,
	previousRunID string,
	newRunNumber int,
) error {
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("activate run: begin tx failed: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
        UPDATE settlement_batches
        SET current_active_run_id = $1,
            latest_run_number     = $2,
            updated_at            = $3
        WHERE settlement_batch_id = $4`,
		newRunID, newRunNumber, time.Now().UTC(), settlementBatchID,
	)
	if err != nil {
		return fmt.Errorf("activate run: update batch failed: %w", err)
	}

	if previousRunID != "" {
		_, err = tx.ExecContext(ctx, `
            UPDATE settlement_ingest_runs
            SET run_status = 'SUPERSEDED'
            WHERE ingest_run_id = $1`,
			previousRunID,
		)
		if err != nil {
			return fmt.Errorf("activate run: supersede old run failed: %w", err)
		}
	}

	return tx.Commit()
}

// RegisterJob is kept for handler backward compatibility only.
// The actual insert is now done in RegisterBatchAndRun.
// This method is a no-op and will be removed in a future cleanup.
func (s *SettlementIngestService) RegisterJob(
	ctx context.Context,
	jobID string, tenantID, envelopeID uuid.UUID,
	profile models.MappingProfile,
	fileSHA256 string,
	externalBatchID *string,
	fingerprint string,
) error {
	return nil
}

// PersistParsedRow saves a successfully parsed row to the database.
// profile is passed through so the row records which PSP mapping was used.
func (s *SettlementIngestService) PersistParsedRow(
	ctx context.Context,
	tenantID uuid.UUID, jobID string, envelopeID uuid.UUID,
	objRef, rowRef string,
	result ParsedRowResult,
	profile models.MappingProfile,
	ingestRunID string,
	settlementBatchID string,
) error {
	parsedRowID := uuid.New()
	rawColsJSON, _ := json.Marshal(result.RawColumns)
	shapeJSON, _ := json.Marshal(result.Shape)

	hash := sha256.Sum256(rawColsJSON)
	rawLineHash := hex.EncodeToString(hash[:])

	var warningsJSON []byte
	if len(result.Warnings) > 0 {
		warningsJSON, _ = json.Marshal(result.Warnings)
	}

	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO settlement_parsed_rows (
			parsed_row_id, job_id, ingest_run_id, settlement_batch_id,
			tenant_id, settlement_envelope_id,
			source_file_ref, source_row_ref, raw_line_hash,
			raw_columns_json, parsed_candidates_json, parse_warnings_json,
			parse_confidence, mapping_profile_id, mapping_profile_version, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		parsedRowID, jobID, ingestRunID, settlementBatchID,
		tenantID, envelopeID,
		objRef, rowRef, rawLineHash,
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
		UPDATE settlement_ingest_runs
		SET run_status               = $1,
		    row_count_parsed         = $2,
		    row_count_failed         = $3,
		    parse_confidence_overall = $4,
		    completed_at             = $5
		WHERE ingest_run_id = $6`,
		"DONE", parsedCount, failedCount, avgConfidence, time.Now().UTC(), jobID,
	)
	return err
}

// MarkJobFailed is a helper to update job status on non-recoverable failures.
func (s *SettlementIngestService) MarkJobFailed(ctx context.Context, jobID string, reasonCode string) {
	_, _ = db.DB.ExecContext(ctx,
		`UPDATE settlement_ingest_runs
         SET run_status='FAILED', failure_reason_code=$1, completed_at=$2
         WHERE ingest_run_id=$3`,
		reasonCode, time.Now().UTC(), jobID,
	)
}

// PersistParseError records a non-fatal row-level error for later auditing.
// profile is passed so the error record references the correct mapping profile.
func (s *SettlementIngestService) PersistParseError(
	ctx context.Context,
	tenantID uuid.UUID, jobID string, envID uuid.UUID,
	rowRef, errorStage, reason string,
	profile models.MappingProfile,
	ingestRunID string,
	settlementBatchID string,
) error {
	_, err := db.DB.ExecContext(ctx, `
		INSERT INTO settlement_parse_errors (
			error_id, tenant_id, job_id, ingest_run_id, settlement_batch_id,
			settlement_envelope_id,
			source_row_ref, error_stage, reason_code,
			severity, mapping_profile_id, mapping_profile_version, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		uuid.New(), tenantID, jobID, ingestRunID, settlementBatchID,
		envID,
		rowRef, errorStage, reason,
		"ERROR", profile.ProfileID, profile.ProfileVersion, time.Now().UTC(),
	)
	return err
}

// -- Pointer Helpers --

// isUniqueViolation returns true for Postgres error code 23505.
func isUniqueViolation(err error) bool {
	var pgErr *pq.Error
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
