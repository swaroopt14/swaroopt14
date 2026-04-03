package services

import (
	"context"
	"log"
	"time"

	"zord-edge/model"
	"zord-edge/storage"
)

func ProcessRawIntent(
	ctx context.Context,
	rawIntent model.RawIntentMessage,
	s3store *storage.S3Store,
	envelopeID string,
	receivedAt time.Time,
) (*model.AckMessage, error) {

	objRef, err := s3store.StoreRawPayload(
		ctx,
		envelopeID,
		receivedAt,
		[]byte(rawIntent.Payload),
		rawIntent.TenantID,
		rawIntent.TenantName,
	)
	if err != nil {
		log.Println("S3 Upload Failed", err)
		return nil, err
	}

	return &model.AckMessage{
		EnvelopeId: envelopeID,
		ReceivedAt: receivedAt,
		ObjectRef:  objRef,
	}, nil
}
