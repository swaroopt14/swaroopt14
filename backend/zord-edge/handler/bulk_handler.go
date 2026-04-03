package handler

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"zord-edge/model"
	"zord-edge/services"
	"zord-edge/vault"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

type BulkResult struct {
	Row        int    `json:"row"`
	EnvelopeID string `json:"EnvelopeID,omitempty"`
	TraceID    string `json:"Trace_id,omitempty"`
	Status     string `json:"Status"`
	ReceivedAt string `json:"Received_At,omitempty"`
	Error      string `json:"error,omitempty"`
}

type BulkJob struct {
	Row     int
	Payload []byte
}

func (h *Handler) BulkIntentHandler(c *gin.Context) {

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "unable to open file"})
		return
	}
	defer src.Close()

	fileBytes, err := io.ReadAll(src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	// Reset file pointer for subsequent row parsing
	if _, err := src.Seek(0, io.SeekStart); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset file pointer"})
		return
	}

	// 🔐 Hash
	fileHashBytes := sha256.Sum256(fileBytes)
	fileHash := hex.EncodeToString(fileHashBytes[:])

	tenantID := c.MustGet("tenant_id").(uuid.UUID)

	fileTraceID := uuid.NewString()

	log.Printf(
		"Bulk file stored | filename=%s size=%d hash=%s ",
		file.Filename,
		len(fileBytes),
		fileHash,
	)

	filePayload := map[string]interface{}{
		"file_name":           file.Filename,
		"file_size_bytes":     len(fileBytes),
		"file_content_hash":   fileHash,
		"row_count_estimate":  strings.Count(string(fileBytes), "\n") - 1,
		"file_upload_channel": "CSV",
		"file_data":           fileBytes,
	}

	payloadBytes, err := json.Marshal(filePayload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to build file payload",
		})
		return
	}

	fileMsg := model.RawIntentMessage{
		TenantID:       tenantID.String(),
		TraceID:        fileTraceID,
		IdempotencyKey: uuid.NewString(),
		PayloadSize:    len(payloadBytes),
		Payload:        payloadBytes,
		ContentType:    "application/json",
		SourceType:     "BULK_FILE",
	}

	_, err = services.ProcessRawIntent(context.Background(), fileMsg, h.S3store, uuid.NewString(), time.Now().UTC())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "failed to store bulk file envelope",
		})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))

	var rows [][]string

	switch ext {

	case ".xlsx":

		f, err := excelize.OpenReader(src)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid excel file"})
			return
		}

		sheet := f.GetSheetName(0)

		rows, err = f.GetRows(sheet)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unable to read sheet"})
			return
		}

	case ".csv":

		reader := csv.NewReader(src)

		rows, err = reader.ReadAll()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid CSV file"})
			return
		}

	default:

		c.JSON(http.StatusBadRequest, gin.H{
			"error": "unsupported file format (.csv or .xlsx only)",
		})
		return
	}

	if len(rows) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "file must contain header and at least one row",
		})
		return
	}

	// Safety limit
	if len(rows) > 10000 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "CSV limit exceeded (max 10000 rows)",
		})
		return
	}

	headers := rows[0]
	headersBytes, _ := json.Marshal(c.Request.Header)
	headersHashSum := sha256.Sum256(headersBytes)
	headersHash := headersHashSum[:]
	sourceSystem := c.GetHeader("X-Zord-Source-System")
	if sourceSystem == "" {
		sourceSystem = "UNKNOWN"
	}

	results := make([]BulkResult, len(rows)-1)

	// Pipeline queue
	jobs := make(chan BulkJob, len(rows))

	// CPU based worker scaling
	workerCount := runtime.NumCPU() * 2

	var wg sync.WaitGroup

	/*
		Worker Pool
	*/
	for w := 0; w < workerCount; w++ {

		wg.Add(1)

		go func() {

			defer wg.Done()

			for job := range jobs {

				traceID := uuid.New().String()
				idempotencyKey := uuid.New().String()
				envelopeID := uuid.New().String()
				receivedAt := time.Now().UTC()

				storageAck, duplicateID, err := h.processBulkIntentRow(
					c.Request.Context(),
					job.Payload,
					tenantID,
					traceID,
					idempotencyKey,
					envelopeID,
					receivedAt,
					len(job.Payload),
					"application/json",
					"CSV",
					headersHash,
					sourceSystem,
				)

				if err != nil {
					if errors.Is(err, services.ErrFingerprintMismatch) {
						results[job.Row-1] = BulkResult{
							Row:    job.Row,
							Status: "CONFLICT",
							Error:  "idempotency key reuse with different payload",
						}
						continue
					}

					results[job.Row-1] = BulkResult{
						Row:     job.Row,
						Status:  "FAILED",
						TraceID: traceID,
						Error:   err.Error(),
					}

					continue
				}

				if duplicateID != uuid.Nil {

					results[job.Row-1] = BulkResult{
						Row:        job.Row,
						Status:     "DUPLICATE",
						TraceID:    traceID,
						EnvelopeID: duplicateID.String(),
						Error:      "duplicate idempotency key",
					}

					continue
				}

				results[job.Row-1] = BulkResult{
					Row:        job.Row,
					Status:     "Accepted",
					TraceID:    traceID,
					EnvelopeID: storageAck.EnvelopeId,
					ReceivedAt: storageAck.ReceivedAt.Format(time.RFC3339Nano),
				}
			}

		}()
	}

	/*
		Producer Stage
		Build JSON payloads
	*/

	for i := 1; i < len(rows); i++ {

		row := rows[i]

		payloadMap := make(map[string]interface{})

		for j, header := range headers {

			if j >= len(row) {
				continue
			}

			keys := strings.Split(header, ".")
			current := payloadMap

			for k := 0; k < len(keys); k++ {

				if k == len(keys)-1 {

					current[keys[k]] = row[j]

				} else {

					if _, exists := current[keys[k]]; !exists {
						current[keys[k]] = make(map[string]interface{})
					}

					current = current[keys[k]].(map[string]interface{})
				}
			}
		}

		jsonPayload, err := json.Marshal(payloadMap)
		if err != nil {

			results[i-1] = BulkResult{
				Row:    i,
				Status: "FAILED",
				Error:  "failed to marshal JSON payload",
			}

			continue
		}

		jobs <- BulkJob{
			Row:     i,
			Payload: jsonPayload,
		}
	}

	close(jobs)

	wg.Wait()

	c.JSON(http.StatusAccepted, gin.H{
		"total":   len(results),
		"results": results,
	})
}

func (h *Handler) processBulkIntentRow(
	ctx context.Context,
	rawPayload []byte,
	tenantID uuid.UUID,
	traceID string,
	idempotencyKey string,
	envelopeID string,
	receivedAt time.Time,
	payloadSize int,
	contentType string,
	sourceType string,
	headersHash []byte,
	sourceSystem string,
) (*model.AckMessage, uuid.UUID, error) {

	encryptedPayload, err := vault.Encrypt(rawPayload)
	if err != nil {
		log.Printf("Error encrypting payload for bulk row, trace_id=%s: %v", traceID, err)
		return nil, uuid.Nil, err
	}

	// Compute fingerprint: Hash(payload + idempotencyKey + tenantID)
	fingerprintInput := append(rawPayload, []byte(idempotencyKey+tenantID.String())...)
	fingerprintSum := sha256.Sum256(fingerprintInput)
	fingerprint := fingerprintSum[:]

	rawIntent := model.RawIntentMessage{
		TenantID:           tenantID.String(),
		TraceID:            traceID,
		IdempotencyKey:     idempotencyKey,
		PayloadSize:        payloadSize,
		Payload:            encryptedPayload,
		ContentType:        contentType,
		SourceType:         sourceType,
		SourceSystem:       sourceSystem,
		RequestHeadersHash: headersHash,
		RequestFingerprint: fingerprint,
		SchemaHint:         nil,
	}

	id, err := services.PersistIdempotency(ctx, rawIntent)
	if err != nil {
		return nil, uuid.Nil, err
	}
	if id != uuid.Nil {
		return nil, id, nil
	}

	storageAck, err := services.ProcessRawIntent(ctx, rawIntent, h.S3store, envelopeID, receivedAt)
	if err != nil {
		log.Printf("Error processing raw intent for bulk row, trace_id=%s: %v", traceID, err)
		return nil, uuid.Nil, err
	}
	if storageAck == nil {
		log.Printf("S3 data is nil for bulk row, trace_id=%s", traceID)
		return nil, uuid.Nil, err
	}

	payloadHashSum := sha256.Sum256(rawPayload)
	rawIntent.PayloadHash = payloadHashSum[:]

	if err := services.RawIntent(ctx, rawIntent, storageAck); err != nil {
		log.Printf("Error persisting raw intent for bulk row, trace_id=%s: %v", traceID, err)
		return nil, uuid.Nil, err
	}

	return storageAck, uuid.Nil, nil
}
