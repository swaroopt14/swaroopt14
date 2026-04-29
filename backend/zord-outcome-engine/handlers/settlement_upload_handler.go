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

	// ── IDEMPOTENCY INPUTS ───────────────────────────────────────────────────────
	externalBatchIDRaw := strings.TrimSpace(c.Query("batch_id"))
	if externalBatchIDRaw == "" {
		externalBatchIDRaw = strings.TrimSpace(c.GetHeader("Batch-ID")) // Fallback to honor prior request
	}
	forceReprocess := strings.ToLower(strings.TrimSpace(
		c.GetHeader("X-Zord-Force-Reprocess"))) == "true"
	// X-Zord-Force-Reprocess-Reason is required when force reprocessing.
	// Allowed values: CLIENT_CORRECTED_FILE | PARSER_FIX | BACKFILL | MANUAL
	reprocessReason := strings.TrimSpace(c.GetHeader("X-Zord-Force-Reprocess-Reason"))

	// ── OPTION C IDEMPOTENCY ─────────────────────────────────────────────────
	svc := &services.SettlementIngestService{S3: h.S3store}

	clientBatchID := externalBatchIDRaw
	if clientBatchID == "" {
		clientBatchID = uuid.New().String()
	}

	existingBatch, err := svc.FindBatchByClientID(c.Request.Context(), tenantID, psp, clientBatchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if existingBatch != nil {
		sameFile := existingBatch.ActiveRunFileSHA256 == fileHash

		if sameFile && !forceReprocess {
			log.Printf("settlement.upload.duplicate tenant_id=%s batch=%s active_run=%s",
				tenantID, clientBatchID, existingBatch.CurrentActiveRunID)
			c.JSON(http.StatusOK, gin.H{
				"settlement_batch_id": existingBatch.SettlementBatchID,
				"active_run_id":       existingBatch.CurrentActiveRunID,
				"client_batch_id":     clientBatchID,
				"status":              existingBatch.ActiveRunStatus,
				"already_processed":   true,
				"message":             "file already ingested for this batch - use X-Zord-Force-Reprocess: true to reprocess",
			})
			return
		}

		if !sameFile && !forceReprocess {
			c.JSON(http.StatusConflict, gin.H{
				"error":               "BATCH_CONTENT_CHANGED",
				"settlement_batch_id": existingBatch.SettlementBatchID,
				"client_batch_id":     clientBatchID,
				"message":             "a different file was previously ingested for this batch - add X-Zord-Force-Reprocess: true and X-Zord-Force-Reprocess-Reason header to reprocess",
			})
			return
		}

		if reprocessReason == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "X-Zord-Force-Reprocess-Reason header is required when force reprocessing",
				"allowed": []string{"CLIENT_CORRECTED_FILE", "PARSER_FIX", "BACKFILL", "MANUAL"},
			})
			return
		}
	}

	// Persist the raw file payload to S3. This is our immutable source of truth
	// for the ingestion job. The storage layer returns an envelopeID and objRef.
	envelopeID, _, objRef, err := h.S3store.StoreRawPayload(c.Request.Context(), fileBytes, tenantID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "S3 storage failed: " + err.Error()})
		return
	}

	ingestRunID, settlementBatchID, runNumber, err := svc.RegisterBatchAndRun(
		c.Request.Context(),
		tenantID, psp, clientBatchID,
		existingBatch,
		envelopeID, profile, fileHash,
		forceReprocess, reprocessReason,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to register run: " + err.Error()})
		return
	}

	previousRunID := ""
	if existingBatch != nil {
		previousRunID = existingBatch.CurrentActiveRunID
	}

	c.JSON(http.StatusAccepted, gin.H{
		"ingest_run_id":          ingestRunID,
		"settlement_batch_id":    settlementBatchID,
		"client_batch_id":        clientBatchID,
		"settlement_envelope_id": envelopeID,
		"status":                 "ACCEPTED",
		"psp":                    psp,
		"mapping_profile_id":     profile.ProfileID,
		"run_number":             runNumber,
		"force_reprocess":        forceReprocess,
		"file": gin.H{
			"name":       header.Filename,
			"size_bytes": fileSize,
			"sha256":     fileHash,
		},
		"processing_status": "PARSING_IN_PROGRESS",
		"poll_url":          fmt.Sprintf("/v1/settlement/jobs/%s", ingestRunID),
		"received_at":       time.Now().UTC().Format(time.RFC3339),
	})

	// ── ASYNC BACKGROUND PIPELINE ───────────────────────────────────────────
	// Push parsing and canonicalization to background to free up HTTP worker.
	go func(
		bgCtx context.Context,
		pspProfile models.MappingProfile,
		bgIngestRunID string,
		bgSettlementBatchID string,
		bgPreviousRunID string,
		bgRunNumber int,
		bgTenant uuid.UUID,
		bgEnvelope uuid.UUID,
		bgRef string,
		data []byte,
	) {
		// ── PHASE 3: PARSING ─────────────────────────────────────────────────────
		parser, err := services.GetParser(pspProfile.ParserKey)
		if err != nil {
			svc.MarkJobFailed(bgCtx, bgIngestRunID, "PARSER_NOT_FOUND")
			return
		}

		results, err := parser.Parse(data, bgRef, bgEnvelope, pspProfile)
		if err != nil {
			svc.MarkJobFailed(bgCtx, bgIngestRunID, "HEADER_MISMATCH")
			return
		}

		var rowCountParsed, rowCountFailed int
		var confidenceSum float64

		// ── PHASE 4: PERSISTENCE ─────────────────────────────────────────────────
		for _, result := range results {
			rowRef := fmt.Sprintf("%d", result.RowIndex)

			if result.Failed {
				rowCountFailed++
				_ = svc.PersistParseError(bgCtx, bgTenant, bgIngestRunID, bgEnvelope, rowRef, "PARSING", result.FailureReason, pspProfile, bgIngestRunID, bgSettlementBatchID)
				continue
			}

			if err := svc.PersistParsedRow(bgCtx, bgTenant, bgIngestRunID, bgEnvelope, bgRef, rowRef, result, pspProfile, bgIngestRunID, bgSettlementBatchID); err != nil {
				log.Printf("settlement.upload.row_persist_error job_id=%s row=%s err=%v", bgIngestRunID, rowRef, err)
				continue
			}

			rowCountParsed++
			confidenceSum += result.Confidence
		}

		avgConfidence := 0.0
		if rowCountParsed > 0 {
			avgConfidence = confidenceSum / float64(rowCountParsed)
		}
		if err := svc.FinalizeJob(bgCtx, bgIngestRunID, rowCountParsed, rowCountFailed, avgConfidence); err != nil {
			log.Printf("settlement.upload.finalize_error job_id=%s err=%v", bgIngestRunID, err)
		}

		// ── PHASE 5: CANONICALIZATION & OUTPUTS ──────────────────────────────────
		log.Printf("settlement.upload.canonicalize_start job_id=%s", bgIngestRunID)
		canonSvc := &services.SettlementCanonicalizeService{}
		if err := canonSvc.RunForJob(bgCtx, bgIngestRunID, bgTenant, pspProfile); err != nil {
			log.Printf("settlement.upload.canonicalize_error job_id=%s err=%v", bgIngestRunID, err)
		} else {
			if err := svc.ActivateRun(bgCtx, bgSettlementBatchID, bgIngestRunID, bgPreviousRunID, bgRunNumber); err != nil {
				log.Printf("settlement.upload.activate_run_error run_id=%s err=%v", bgIngestRunID, err)
			}
			// Trigger attachment engine automatically on success
			log.Printf("settlement.upload.attachment_start job_id=%s", bgIngestRunID)
			engine := &services.AttachmentEngine{}
			if _, err := engine.RunForBatch(bgCtx, bgTenant, bgIngestRunID); err != nil {
				log.Printf("settlement.upload.attachment_error job_id=%s err=%v", bgIngestRunID, err)
			}
		}
	}(context.Background(), profile, ingestRunID, settlementBatchID, previousRunID, runNumber, tenantID, envelopeID, objRef, fileBytes)
}
