package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"zord-outcome-engine/models"
	"zord-outcome-engine/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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
	var jobID uuid.UUID
	if batchIDRaw := c.GetHeader("Batch-ID"); batchIDRaw != "" {
		parsedID, err := uuid.Parse(batchIDRaw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid Batch-ID format (must be UUID)"})
			return
		}
		jobID = parsedID
	} else {
		jobID = uuid.New()
	}

	svc := &services.SettlementIngestService{S3: h.S3store}

	// RegisterJob now takes profile so it writes the correct PSP metadata to the job row.
	if err := svc.RegisterJob(c.Request.Context(), jobID, tenantID, envelopeID, profile); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register job: " + err.Error()})
		return
	}

	// ── RETURN EARLY RESPONSE ────────────────────────────────────────────────
	c.JSON(http.StatusAccepted, gin.H{
		"job_id":                 jobID,
		"settlement_envelope_id": envelopeID,
		"status":                 "ACCEPTED",
		"psp":                    psp,
		"mapping_profile_id":     profile.ProfileID,
		"file": gin.H{
			"name":       header.Filename,
			"size_bytes": fileSize,
			"sha256":     fileHash,
		},
		"processing_status": "PARSING_IN_PROGRESS",
		"poll_url":          fmt.Sprintf("/v1/settlement/jobs/%s", jobID),
		"received_at":       time.Now().UTC().Format(time.RFC3339),
	})

	// ── ASYNC BACKGROUND PIPELINE ───────────────────────────────────────────
	// Push parsing and canonicalization to background to free up HTTP worker.
	go func(bgCtx context.Context, pspProfile models.MappingProfile, bgJobID, bgTenant uuid.UUID, bgEnvelope uuid.UUID, bgRef string, data []byte) {
		// ── PHASE 3: PARSING ─────────────────────────────────────────────────────
		parser, err := services.GetParser(pspProfile.ParserKey)
		if err != nil {
			svc.MarkJobFailed(bgCtx, bgJobID, "PARSER_NOT_FOUND")
			return
		}
		
		results, err := parser.Parse(data, bgRef, bgEnvelope)
		if err != nil {
			svc.MarkJobFailed(bgCtx, bgJobID, "HEADER_MISMATCH")
			return
		}

		var rowCountParsed, rowCountFailed int
		var confidenceSum float64

		// ── PHASE 4: PERSISTENCE ─────────────────────────────────────────────────
		for _, result := range results {
			rowRef := fmt.Sprintf("%d", result.RowIndex)

			if result.Failed {
				rowCountFailed++
				_ = svc.PersistParseError(bgCtx, bgTenant, bgJobID, bgEnvelope, rowRef, "PARSING", result.FailureReason, pspProfile)
				continue
			}

			if err := svc.PersistParsedRow(bgCtx, bgTenant, bgJobID, bgEnvelope, bgRef, rowRef, result, pspProfile); err != nil {
				log.Printf("settlement.upload.row_persist_error job_id=%s row=%s err=%v", bgJobID, rowRef, err)
				continue
			}

			rowCountParsed++
			confidenceSum += result.Confidence
		}

		avgConfidence := 0.0
		if rowCountParsed > 0 {
			avgConfidence = confidenceSum / float64(rowCountParsed)
		}
		if err := svc.FinalizeJob(bgCtx, bgJobID, rowCountParsed, rowCountFailed, avgConfidence); err != nil {
			log.Printf("settlement.upload.finalize_error job_id=%s err=%v", bgJobID, err)
		}

		// ── PHASE 5: CANONICALIZATION & OUTPUTS ──────────────────────────────────
		log.Printf("settlement.upload.canonicalize_start job_id=%s", bgJobID)
		canonSvc := &services.SettlementCanonicalizeService{}
		if err := canonSvc.RunForJob(bgCtx, bgJobID, bgTenant, pspProfile); err != nil {
			log.Printf("settlement.upload.canonicalize_error job_id=%s err=%v", bgJobID, err)
		}
	}(context.Background(), profile, jobID, tenantID, envelopeID, objRef, fileBytes)
}
