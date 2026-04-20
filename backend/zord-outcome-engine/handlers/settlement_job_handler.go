package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"zord-outcome-engine/db"
)

// SettlementJobStatusResponse is the response body for GET /v1/settlement/jobs/:job_id.
// It returns everything the caller needs to understand the current state of an ingest job.
type SettlementJobStatusResponse struct {
	JobID                  uuid.UUID  `json:"job_id"`
	TenantID               uuid.UUID  `json:"tenant_id"`
	SourceSystem           string     `json:"source_system"`
	MappingProfileID       string     `json:"mapping_profile_id"`
	JobStatus              string     `json:"job_status"`
	RowCountParsed         int        `json:"row_count_parsed"`
	RowCountFailed         int        `json:"row_count_failed"`
	RowCountCanonicalized  int        `json:"row_count_canonicalized"`
	ParseConfidenceOverall float64    `json:"parse_confidence_overall"`
	FailureReasonCode      *string    `json:"failure_reason_code,omitempty"`
	StartedAt              *time.Time `json:"started_at,omitempty"`
	CompletedAt            *time.Time `json:"completed_at,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
}

// GetSettlementJobHandler returns the current status and row counts for a settlement ingest job.
// This allows callers to re-query job progress after upload and verify canonicalization results.
//
// GET /v1/settlement/jobs/:job_id?tenant_id=<uuid>
func (h *Handler) GetSettlementJobHandler(c *gin.Context) {
	// Parse and validate tenant_id from query param.
	tenantID, err := uuid.Parse(c.Query("tenant_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}

	// Parse and validate job_id from path param.
	jobID, err := uuid.Parse(c.Param("job_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid job_id"})
		return
	}

	log.Printf("settlement.job.get tenant_id=%s job_id=%s", tenantID, jobID)

	// Query the settlement_ingest_jobs table.
	// tenant_id is included in the WHERE clause to enforce tenant isolation —
	// a tenant cannot query another tenant's job even if they know the job_id.
	var resp SettlementJobStatusResponse
	err = db.DB.QueryRowContext(c.Request.Context(), `
        SELECT
            job_id, tenant_id, source_system, mapping_profile_id,
            job_status,
            row_count_parsed, row_count_failed, row_count_canonicalized,
            parse_confidence_overall,
            failure_reason_code,
            started_at, completed_at, created_at
        FROM settlement_ingest_jobs
        WHERE job_id = $1 AND tenant_id = $2
        LIMIT 1`,
		jobID, tenantID,
	).Scan(
		&resp.JobID, &resp.TenantID, &resp.SourceSystem, &resp.MappingProfileID,
		&resp.JobStatus,
		&resp.RowCountParsed, &resp.RowCountFailed, &resp.RowCountCanonicalized,
		&resp.ParseConfidenceOverall,
		&resp.FailureReasonCode,
		&resp.StartedAt, &resp.CompletedAt, &resp.CreatedAt,
	)

	if err == sql.ErrNoRows {
		// Return 404 if job does not exist or belongs to a different tenant.
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}
	if err != nil {
		log.Printf("settlement.job.get.error tenant_id=%s job_id=%s err=%v", tenantID, jobID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch job"})
		return
	}

	c.JSON(http.StatusOK, resp)
}
