package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"zord-outcome-engine/models"
	"zord-outcome-engine/services"

	"github.com/gin-gonic/gin"
)

func (h *Handler) WebhookHandler(c *gin.Context) {
	log.Print("Webhook Handler Started")
	connectorID := c.Param("connector")

	payload, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	var referenceID *string
	var parsed struct {
		ReferenceID string `json:"reference_id"`
	}
	if err := json.Unmarshal(payload, &parsed); err == nil && parsed.ReferenceID != "" {
		referenceID = &parsed.ReferenceID
	}
	log.Printf("ingest.request source_class=%s connector_id=%s reference_id=%v payload_bytes=%d", "S2", connectorID, refForLog(referenceID), len(payload))

	svc := &services.RawOutcomeService{S3: h.S3store}
	resp, err := svc.Ingest(c.Request.Context(), models.IngestRequest{
		ConnectorID: connectorID,
		SourceClass: "S2",
		Payload:     payload,
		ReferenceID: referenceID,
	})
	if err != nil {
		log.Printf("ingest.error source_class=%s connector_id=%s reference_id=%v err=%v", "S2", connectorID, refForLog(referenceID), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	log.Printf("ingest.success source_class=%s connector_id=%s reference_id=%v raw_envelope_id=%s canonical_event_id=%s contract_id=%v fused_state=%v", "S2", connectorID, refForLog(referenceID), resp.RawOutcomeEnvelopeID, resp.CanonicalEventID, ptrForLog(resp.ContractID), ptrForLog(resp.FusedState))
	c.JSON(http.StatusOK, resp)
}

func refForLog(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func ptrForLog(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
