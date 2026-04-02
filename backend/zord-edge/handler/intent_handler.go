package handler

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"zord-edge/model"
	"zord-edge/services"
	"zord-edge/vault"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *Handler) IntentHandler(context *gin.Context) {

	tenantID := context.MustGet("tenant_id").(uuid.UUID)
	idempotencyKey := context.GetString("idempotency_key")

	rawPayloadAny, ok := context.Get("raw_payload")
	if !ok {
		context.JSON(http.StatusBadRequest, gin.H{"error": "raw_payload missing"})
		return
	}
	rawPayload := rawPayloadAny.([]byte)

	// Compute fingerprint: Hash(payload + idempotencyKey + tenantID)
	fingerprintInput := append(rawPayload, []byte(idempotencyKey+tenantID.String())...)
	fingerprintSum := sha256.Sum256(fingerprintInput)
	fingerprint := fingerprintSum[:]

	rawIntent := model.RawIntentMessage{
		TenantID:           tenantID.String(),
		IdempotencyKey:     idempotencyKey,
		Payload:            rawPayload,
		RequestFingerprint: fingerprint,
	}

	id, err := services.PersistIdempotency(context.Request.Context(), rawIntent)
	if err != nil {
		if errors.Is(err, services.ErrFingerprintMismatch) {
			context.JSON(http.StatusBadRequest, gin.H{
				"IdempotencyKey": idempotencyKey,
				"ErrorCode":      "IDEMPOTENCY_CONFLICT",
				"ErrorMsg":       "IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD",
				"HttpStatus":     http.StatusBadRequest,
			})
			return
		}
		log.Printf("Error persisting idempotency key: %v", err)
		context.JSON(http.StatusInternalServerError, gin.H{
			"ErrorCode":  "INTERNAL_SERVER_ERROR",
			"ErrorMsg":   "Failed to persist idempotency key.",
			"HttpStatus": http.StatusInternalServerError,
		})
		return
	}
	if id != uuid.Nil {
		log.Printf("Duplicate idempotency key detected for tenant_id=%s, idempotency_key=%s, Envelope_Id=%s", rawIntent.TenantID, rawIntent.IdempotencyKey, id)
		context.JSON(http.StatusConflict, gin.H{
			"ErrorCode":  "DUPLICATE_IDEMPOTENCY_KEY",
			"ErrorMsg":   "request already processed",
			"EnvelopeID": id.String(),
		})
		return
	}

	//traceID := context.GetString("trace_id")
	traceID := uuid.New().String()
	payloadSize := len(rawPayload)
	contentType := context.ContentType()
	sourceType := context.GetString("source_type")
	sourceSystem := context.GetHeader("X-Zord-Source-System")
	if sourceSystem == "" {
		sourceSystem = "UNKNOWN"
	}
	tenantName := context.GetString("tenant_name")

	envelopeID := uuid.New().String()
	receivedAt := time.Now().UTC()

	headersBytes, _ := json.Marshal(context.Request.Header)
	headersHashSum := sha256.Sum256(headersBytes)
	headersHash := headersHashSum[:]

	encryptedPayload, err := vault.Encrypt(rawPayload)
	if err != nil {
		context.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encrypt payload"})
		return
	}

	rawIntent.TraceID = traceID
	rawIntent.PayloadSize = payloadSize
	rawIntent.Payload = encryptedPayload // Replace raw payload with encrypted one for further stages
	rawIntent.ContentType = contentType
	rawIntent.SourceType = sourceType
	rawIntent.SourceSystem = sourceSystem
	rawIntent.TenantName = tenantName
	rawIntent.RequestHeadersHash = headersHash
	rawIntent.SchemaHint = nil
	//Need to replace Hashed payload with Encrypted Payload before sending to S3

	storageAck, err := services.ProcessRawIntent(context.Request.Context(), rawIntent, h.S3store, envelopeID, receivedAt)
	if err != nil {
		log.Printf("Error processing intent: %v", err)
		context.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":   rawIntent.TraceID,
			"ErrorCode": "INTERNAL_ERROR",
			"ErrorMsg":  err.Error(),
		})
		return
	}

	if storageAck == nil {
		log.Printf("S3 Data is nil for trace_id=%s", rawIntent.TraceID)
		context.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":   rawIntent.TraceID,
			"ErrorCode": "INTERNAL_ERROR",
			"ErrorMsg":  "S3 data is nil",
		})
		return
	}

	//Hash Payload Using SHA256
	payloadHashSum := sha256.Sum256(rawPayload)
	payloadHash := payloadHashSum[:]

	rawIntent.PayloadHash = payloadHash

	if err := services.RawIntent(context.Request.Context(), rawIntent, storageAck); err != nil {
		log.Printf("Error persisting raw intent: %v", err)
		context.JSON(http.StatusInternalServerError, gin.H{
			"TraceID":    rawIntent.TraceID,
			"ErrorCode":  "INTERNAL_SERVER_ERROR",
			"ErrorMsg":   "Failed to persist raw intent.",
			"HttpStatus": http.StatusInternalServerError,
		})
		return
	}

	context.JSON(http.StatusAccepted, gin.H{
		"EnvelopeID":  storageAck.EnvelopeId,
		"Trace_id":    rawIntent.TraceID,
		"Status":      "Accepted",
		"Received_At": storageAck.ReceivedAt,
	})
}
