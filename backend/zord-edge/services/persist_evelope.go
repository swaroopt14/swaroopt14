package services

import (
	"context"
	"encoding/base64"
	"log"
	"os"

	"zord-edge/db"
	"zord-edge/model"
	"zord-edge/vault"

	"github.com/google/uuid"
)

func RawIntent(ctx context.Context,
	rawIntent model.RawIntentMessage, storageAck *model.AckMessage) error {

	envelopeID, err := uuid.Parse(storageAck.EnvelopeId)
	if err != nil {
		log.Printf("Invalid EnvelopeId: %s", storageAck.EnvelopeId)
		return err
	}
	traceID, err := uuid.Parse(rawIntent.TraceID)
	if err != nil {
		log.Printf("Invalid TraceID: %s", rawIntent.TraceID)
		return err
	}
	tenantID, err := uuid.Parse(rawIntent.TenantID)
	if err != nil {
		log.Printf("Invalid TenantId: %s", rawIntent.TenantID)
		return err
	}
	objectRef := storageAck.ObjectRef

	envelopeHash := BuildEnvelopeHash(rawIntent, storageAck)
	envelopeSignature := vault.SignEnvelopeHash(envelopeHash)
	encodedSignature := base64.StdEncoding.EncodeToString(envelopeSignature)
	storedSignature := "ZORD_" + encodedSignature

	envelope := model.IngressEnvelope{
		TraceID:           traceID,
		EnvelopeID:        envelopeID,
		TenantID:          tenantID,
		Source:            rawIntent.SourceType,
		SourceSystem:      rawIntent.SourceSystem,
		ContentType:       rawIntent.ContentType,
		IdempotencyKey:    rawIntent.IdempotencyKey,
		PayloadSize:       rawIntent.PayloadSize,
		PayloadHash:       rawIntent.PayloadHash,
		EnvelopeHash:                 envelopeHash,
		EnvelopeSignature:            storedSignature,
		RequestHeadersHash:           rawIntent.RequestHeadersHash,
		SchemaHint:                   rawIntent.SchemaHint,
		EncryptionKeyID:              os.Getenv("VAULT_KEY_ID"),
		ObjectStoreVersion:           os.Getenv("OBJECT_STORE_VERSION"),
		IdempotencyReservationStatus: "RESERVED",
		PrincipalID:                  tenantID,
		AuthMethod:                   "API_KEY",
		ObjectRef:                    objectRef,
		Status:                       "RECEIVED",
		ReceivedAt:                   storageAck.ReceivedAt,
		Payload:                      rawIntent.Payload,
	}

	// Envolope.SaveRawIntent()
	err = SaveRawIntent(ctx,
		db.DB,
		&envelope,
	)
	if err != nil {
		return err
	}
	return nil
}

func SaveToIngressOutbox(
	ctx context.Context, rawIntent model.RawIntentMessage, storageAck *model.AckMessage) error {

	envelopeID, err := uuid.Parse(storageAck.EnvelopeId)
	if err != nil {
		log.Printf("Invalid EnvelopeId: %s", storageAck.EnvelopeId)
		return err
	}
	traceID, err := uuid.Parse(rawIntent.TraceID)
	if err != nil {
		log.Printf("Invalid TraceID: %s", rawIntent.TraceID)
		return err
	}
	tenantID, err := uuid.Parse(rawIntent.TenantID)
	if err != nil {
		log.Printf("Invalid TenantId: %s", rawIntent.TenantID)
		return err
	}
	objectRef := storageAck.ObjectRef

	topic := "vault.envelope.accepted.v1"

	query := `
		INSERT INTO ingress_outbox
		(trace_id, envelope_id, tenant_id, object_ref, received_at, source, idempotency_key, encrypted_payload, payload_hash, topic)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	_, err = db.DB.ExecContext(ctx, query,
		traceID,
		envelopeID,
		tenantID,
		objectRef,
		storageAck.ReceivedAt,
		rawIntent.SourceType,
		rawIntent.IdempotencyKey,
		rawIntent.Payload,
		rawIntent.PayloadHash,
		topic,
	)
	if err != nil {
		log.Printf("Failed to insert into ingress_outbox: %v", err)
		return err
	}
	return nil
}
