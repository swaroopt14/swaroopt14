package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"zord-outcome-engine/models"
	"zord-outcome-engine/services"
)

// SettlementUploadHandler manages the end-to-end flow of settlement file ingestion.
// Following the structure of zord-edge/intent_handler, the orchestration logic
// resides directly here for maximum visibility.
func (h *Handler) SettlementUploadHandler(c *gin.Context) {
	// ── PRE-FLIGHT ───────────────────────────────────────────────────────────
	// Validate early to avoid processing invalid requests.
	tenantIDRaw := c.Query("tenant_id")
	tenantID, err := uuid.Parse(tenantIDRaw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}

	// Retrieve the file from the multipart form data.
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	// Only .xlsx files are allowed as Razorpay recon reports are delivered in this format.
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".xlsx") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only .xlsx files are supported"})
		return
	}

	// ── PHASE 1: METRICS & STORAGE ───────────────────────────────────────────
	// Compute file hash and size while reading into memory.
	// We use io.TeeReader to compute a SHA256 content fingerprint in a single pass.
	hasher := sha256.New()
	fileBytes, err := io.ReadAll(io.TeeReader(file, hasher))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	// Capture metrics for logging and job metadata.
	fileHash := hex.EncodeToString(hasher.Sum(nil))
	fileSize := int64(len(fileBytes))
	
	log.Printf("settlement.upload.metrics tenant_id=%s filename=%s hash=%s size=%d",
		tenantID, header.Filename, fileHash, fileSize)

	// Persist the raw file payload to S3. This is our immutable source of truth 
	// for the ingestion job. The storage layer returns an envelopeID and objRef.
	envelopeID, _, objRef, err := h.S3store.StoreRawPayload(c.Request.Context(), fileBytes, tenantID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "S3 storage failed: " + err.Error()})
		return
	}

	// ── PHASE 2: JOB REGISTRATION ───────────────────────────────────────────
	// Register a new ingest job in 'PARSING' status. This allows us to track 
	// job progress and handle resumes or audits if needed.
	jobID := uuid.New()
	svc := &services.SettlementIngestService{S3: h.S3store}
	
	if err := svc.RegisterJob(c.Request.Context(), jobID, tenantID, envelopeID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register job: " + err.Error()})
		return
	}

	// ── PHASE 3: PARSING ─────────────────────────────────────────────────────
	// Transform raw bytes into structured shapes using the Razorpay-specific parser.
	parser := &services.RazorpayParser{}
	results, err := parser.Parse(fileBytes, objRef, envelopeID)
	if err != nil {
		svc.MarkJobFailed(c.Request.Context(), jobID, "HEADER_MISMATCH")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "parsing failed: " + err.Error()})
		return
	}

	var rowCountParsed, rowCountFailed int
	var confidenceSum float64

	// ── PHASE 4: PERSISTENCE ─────────────────────────────────────────────────
	// Save each row's parse result independently. Row-level errors (e.g. invalid dates)
	// are recorded separately in settlement_parse_errors to prevent whole-file failures.
	for _, result := range results {
		rowRef := fmt.Sprintf("%d", result.RowIndex)

		if result.Failed {
			rowCountFailed++
			_ = svc.PersistParseError(c.Request.Context(), tenantID, jobID, envelopeID, rowRef, "PARSING", result.FailureReason)
			continue
		}

		if err := svc.PersistParsedRow(c.Request.Context(), tenantID, jobID, envelopeID, objRef, rowRef, result); err != nil {
			log.Printf("settlement.upload.row_persist_error job_id=%s row=%s err=%v", jobID, rowRef, err)
			continue
		}

		rowCountParsed++
		confidenceSum += result.Confidence
	}

	// Aggregate metrics and mark the parsing phase as DONE.
	avgConfidence := 0.0
	if rowCountParsed > 0 {
		avgConfidence = confidenceSum / float64(rowCountParsed)
	}
	if err := svc.FinalizeJob(c.Request.Context(), jobID, rowCountParsed, rowCountFailed, avgConfidence); err != nil {
		log.Printf("settlement.upload.finalize_error job_id=%s err=%v", jobID, err)
	}

	// ── PHASE 5: CANONICALIZATION & OUTPUTS ──────────────────────────────────
	// Automatically trigger Phase 3 to build canonical observations and emit outbox events.
	// This keeps the entire truth-generation flow synchronous within the upload request.
	log.Printf("settlement.upload.canonicalize_start job_id=%s", jobID)
	canonSvc := &services.SettlementCanonicalizeService{}
	if err := canonSvc.RunForJob(c.Request.Context(), jobID, tenantID); err != nil {
		log.Printf("settlement.upload.canonicalize_error job_id=%s err=%v", jobID, err)
	}

	// ── PHASE 6: RESPONSE ────────────────────────────────────────────────────
	c.JSON(http.StatusOK, models.SettlementUploadResponse{
		JobID:          jobID,
		Status:         "DONE",
		RowCountParsed: rowCountParsed,
		RowCountFailed: rowCountFailed,
		Message:        "File ingested, parsed, and canonicalized successfully",
	})
}
