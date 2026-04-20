package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
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

	// Read the PSP identifier from the query param.
	// This tells the system which parser and mapping profile to use.
	// Example: POST /v1/settlement/upload?tenant_id=xxx&psp=razorpay
	psp := strings.ToLower(strings.TrimSpace(c.Query("psp")))
	if psp == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "psp query param is required (e.g. ?psp=razorpay)"})
		return
	}

	// Look up the mapping profile for this PSP.
	// If the PSP is not registered, reject the request immediately.
	profile, ok := models.GetProfile(psp)
	if !ok {
		// Build supported PSP list dynamically from KnownProfiles so this message
		// never goes out of date when new PSPs are added to the registry.
		supportedKeys := make([]string, 0, len(models.KnownProfiles))
		for k := range models.KnownProfiles {
			supportedKeys = append(supportedKeys, k)
		}
		sort.Strings(supportedKeys)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("unsupported psp %q — supported: %s",
				psp, strings.Join(supportedKeys, ", ")),
		})
		return
	}

	// Retrieve the file from the multipart form data.
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	// Validate file extension matches what this PSP's profile expects.
	// This catches the common mistake of uploading a Razorpay file for a Cashfree job.
	if !strings.HasSuffix(strings.ToLower(header.Filename), profile.FileExtension) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("wrong file type for psp=%s: expected %s file", psp, profile.FileExtension),
		})
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
	
	// RegisterJob now takes profile so it writes the correct PSP metadata to the job row.
	if err := svc.RegisterJob(c.Request.Context(), jobID, tenantID, envelopeID, profile); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register job: " + err.Error()})
		return
	}

	// ── PHASE 3: PARSING ─────────────────────────────────────────────────────
	// Get the correct parser for this PSP from the registry.
	// The registry was populated at startup in services/parser_registry.go init().
	parser, err := services.GetParser(profile.ParserKey)
	if err != nil {
		svc.MarkJobFailed(c.Request.Context(), jobID, "PARSER_NOT_FOUND")
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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
			// PersistParseError for failed rows during parsing phase.
			_ = svc.PersistParseError(c.Request.Context(), tenantID, jobID, envelopeID, rowRef, "PARSING", result.FailureReason, profile)
			continue
		}

		// PersistParsedRow for successful rows.
		if err := svc.PersistParsedRow(c.Request.Context(), tenantID, jobID, envelopeID, objRef, rowRef, result, profile); err != nil {
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
	// RunForJob now takes profile so canonical observations store the correct profile ID.
	if err := canonSvc.RunForJob(c.Request.Context(), jobID, tenantID, profile); err != nil {
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
