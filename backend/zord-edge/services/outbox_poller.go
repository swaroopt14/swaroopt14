package services

import (
	"context"
	"database/sql"
	"log"
	"math"
	"time"

	"zord-edge/db"
	"zord-edge/kafka"
	"zord-edge/model"

	"github.com/google/uuid"
)

const (
	outboxMaxAttempts = 10
	outboxBatchSize   = 100
)

// outboxRow holds the columns we need from ingress_outbox for publishing.
type outboxRow struct {
	OutboxID         uuid.UUID
	TraceID          uuid.UUID
	EnvelopeID       uuid.UUID
	TenantID         uuid.UUID
	ObjectRef        string
	ReceivedAt       time.Time
	Source           string
	IdempotencyKey   string
	EncryptedPayload []byte
	PayloadHash      []byte
	Topic            string
	Attempts         int
}

// StartOutboxPoller starts a background goroutine that polls ingress_outbox
// for PENDING rows and publishes them to Kafka. It stops when ctx is cancelled.
func StartOutboxPoller(ctx context.Context, producer *kafka.Producer, interval time.Duration) {
	log.Printf("[OutboxPoller] Starting with interval=%s", interval)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[OutboxPoller] Shutting down")
			return
		case <-ticker.C:
			if err := pollAndPublish(ctx, producer); err != nil {
				log.Printf("[OutboxPoller] Poll cycle error: %v", err)
			}
		}
	}
}

// pollAndPublish fetches a batch of PENDING outbox rows (due for retry),
// publishes each to Kafka, and updates their status accordingly.
func pollAndPublish(ctx context.Context, producer *kafka.Producer) error {
	tx, err := db.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(ctx, `
		SELECT outbox_id, trace_id, envelope_id, tenant_id, object_ref,
		       received_at, source, idempotency_key, encrypted_payload, payload_hash, topic, attempts
		FROM ingress_outbox
		WHERE status = 'PENDING'
		  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
		ORDER BY received_at ASC
		LIMIT $1
		FOR UPDATE SKIP LOCKED
	`, outboxBatchSize)
	if err != nil {
		return err
	}
	defer rows.Close()

	var batch []outboxRow
	for rows.Next() {
		var r outboxRow
		if err := rows.Scan(
			&r.OutboxID, &r.TraceID, &r.EnvelopeID, &r.TenantID, &r.ObjectRef,
			&r.ReceivedAt, &r.Source, &r.IdempotencyKey, &r.EncryptedPayload, &r.PayloadHash, &r.Topic, &r.Attempts,
		); err != nil {
			log.Printf("[OutboxPoller] Row scan error: %v", err)
			continue
		}
		batch = append(batch, r)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	if len(batch) == 0 {
		tx.Commit()
		return nil
	}

	log.Printf("[OutboxPoller] Processing %d PENDING row(s)", len(batch))

	for _, r := range batch {
		event := model.Event{
			TraceID:          r.TraceID,
			EnvelopeID:       r.EnvelopeID,
			TenantID:         r.TenantID,
			ObjectRef:        r.ObjectRef,
			ReceivedAt:       r.ReceivedAt,
			Source:           r.Source,
			IdempotencyKey:   r.IdempotencyKey,
			EncryptedPayload: r.EncryptedPayload,
			PayloadHash:      r.PayloadHash,
		}

		publishErr := kafka.SendRawIntentMessage(ctx, event, producer)
		if publishErr != nil {
			log.Printf("[OutboxPoller] Publish failed for envelope_id=%s attempt=%d: %v", r.EnvelopeID, r.Attempts+1, publishErr)
			if err := markFailed(ctx, tx, r); err != nil {
				log.Printf("[OutboxPoller] Failed to update failure status for outbox_id=%s: %v", r.OutboxID, err)
			}
		} else {
			log.Printf("[OutboxPoller] Published envelope_id=%s", r.EnvelopeID)
			if err := markPublished(ctx, tx, r.OutboxID); err != nil {
				log.Printf("[OutboxPoller] Failed to mark published for outbox_id=%s: %v", r.OutboxID, err)
			}
		}
	}

	return tx.Commit()
}

// markPublished sets a row's status to PUBLISHED.
func markPublished(ctx context.Context, tx *sql.Tx, outboxID uuid.UUID) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE ingress_outbox
		SET status = 'SENT'
		WHERE outbox_id = $1
	`, outboxID)
	return err
}

// markFailed increments attempts and schedules the next retry using exponential
// backoff (2^attempts seconds, capped at 10 minutes). After outboxMaxAttempts
// the row is moved to FAILED so it no longer blocks the queue.
func markFailed(ctx context.Context, tx *sql.Tx, r outboxRow) error {
	newAttempts := r.Attempts + 1

	if newAttempts >= outboxMaxAttempts {
		_, err := tx.ExecContext(ctx, `
			UPDATE ingress_outbox
			SET status = 'FAILED', attempts = $1
			WHERE outbox_id = $2
		`, newAttempts, r.OutboxID)
		if err == nil {
			log.Printf("[OutboxPoller] Moved outbox_id=%s to FAILED after %d attempts", r.OutboxID, newAttempts)
		}
		return err
	}

	// Exponential backoff: 2^attempts seconds, max 10 min.
	backoff := time.Duration(math.Min(math.Pow(2, float64(r.Attempts)), 600)) * time.Second
	nextRetry := time.Now().UTC().Add(backoff)

	_, err := tx.ExecContext(ctx, `
		UPDATE ingress_outbox
		SET attempts = $1, next_retry_at = $2
		WHERE outbox_id = $3
	`, newAttempts, nextRetry, r.OutboxID)
	return err
}
