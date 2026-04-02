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
) (models.OutboxEvent, error) {

	intId, err := uuid.Parse(intent.IntentID)
	if err != nil {
		log.Fatal("Invalid Intent ID", intId)
	}

	return models.OutboxEvent{
		TraceID:       intent.TraceID,
		EnvelopeID:    intent.EnvelopeID,
		TenantID:      intent.TenantID,
		AggregateType: "intent",
		AggregateID:   intId,
		EventType:     "eventTypePlaceholder",

		SchemaVersion: "v1",
		Amount:        intent.Amount,
		Currency:      intent.Currency,
		Payload:       payload,
		Status:        "PENDING",
		CreatedAt:     time.Now(),
		PayloadHash:   intent.PayloadHash,
	}, nil
}
