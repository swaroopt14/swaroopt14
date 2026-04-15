package services

import (
	"log"
	"time"

	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
)

func CanonicalIntentToOutboxEvent(
	intent models.CanonicalIntent,
	payload []byte,
	eventType string,
) (models.OutboxEvent, error) {

	intId, err := uuid.Parse(intent.IntentID)
	if err != nil {
		log.Printf("Invalid Intent ID: %s", intent.IntentID)
		return models.OutboxEvent{}, err
	}

	return models.OutboxEvent{
		TraceID:       intent.TraceID,
		EnvelopeID:    intent.EnvelopeID,
		TenantID:      intent.TenantID,
		AggregateType: "intent",
		AggregateID:   intId,
		EventType:     eventType,

		SchemaVersion: "v1",
		Amount:        intent.Amount,
		Currency:      intent.Currency,
		Payload:       payload,
		Status:        "PENDING",
		CreatedAt:     time.Now().UTC(),
		PayloadHash:   intent.PayloadHash,
		BatchID:       intent.BatchID,
	}, nil
}
