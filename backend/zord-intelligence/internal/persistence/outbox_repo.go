package persistence

// What is this file?
// Reads and writes the actuation_outbox table.
//
// WHO WRITES TO THIS FILE?
//   action_service.go → Insert() — adds entry when ActionContract is created
//
// WHO READS AND UPDATES THIS FILE?
//   outbox_worker.go → FetchPending() to get entries to deliver
//   outbox_worker.go → MarkSent() after successful Kafka publish
//   outbox_worker.go → MarkFailed() after failed Kafka publish

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zord/zord-intelligence/internal/models"
)

type OutboxRepo struct {
	pool *pgxpool.Pool
}

func NewOutboxRepo(pool *pgxpool.Pool) *OutboxRepo {
	return &OutboxRepo{pool: pool}
}

// Insert saves a new outbox entry.
// ALWAYS call this in the same DB transaction as action_contract_repo.InsertIfNew.
// This guarantees: ActionContract recorded ↔ Outbox entry created, atomically.
//
// In action_service.go this will look like:
//
//	tx, _ := pool.Begin(ctx)
//	actionRepo.InsertIfNewTx(ctx, tx, contract)
//	outboxRepo.InsertTx(ctx, tx, outboxEntry)
//	tx.Commit(ctx)
//
// For now we use the simple (non-transactional) version.
// We add transaction support in action_service.go.
func (r *OutboxRepo) Insert(ctx context.Context, e models.ActuationOutbox) error {
	sql := `
		INSERT INTO actuation_outbox
			(event_id, action_id, event_type, payload,
			 status, attempts, next_retry_at, created_at)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (event_id) DO NOTHING
	`
	// ON CONFLICT DO NOTHING = safe to call twice with same event_id (idempotent)

	_, err := r.pool.Exec(ctx, sql,
		e.EventID,
		e.ActionID,
		e.EventType,
		e.Payload, // JSON string stored as JSONB
		string(e.Status),
		e.Attempts,
		e.NextRetryAt,
		e.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("outbox_repo.Insert event=%s: %w", e.EventID, err)
	}
	return nil
}

// FetchPending returns up to `limit` outbox entries that are ready for delivery.
// "Ready" means: status is PENDING or FAILED, AND next_retry_at is in the past.
//
// FOR UPDATE SKIP LOCKED is a critical pattern for worker processes:
// If multiple ZPI instances run simultaneously (horizontal scaling),
// each worker will try to fetch pending entries.
// FOR UPDATE locks the fetched rows.
// SKIP LOCKED skips rows already locked by another worker.
// Result: each entry is delivered by exactly ONE worker — no double delivery.
func (r *OutboxRepo) FetchPending(ctx context.Context, limit int) ([]models.ActuationOutbox, error) {
	sql := `
		SELECT event_id, action_id, event_type, payload::text,
		       status, attempts, next_retry_at, sent_at, created_at
		FROM   actuation_outbox
		WHERE  status        IN ('PENDING', 'FAILED')
		  AND  next_retry_at <= now()
		ORDER  BY next_retry_at ASC
		LIMIT  $1
		FOR UPDATE SKIP LOCKED
	`
	rows, err := r.pool.Query(ctx, sql, limit)
	if err != nil {
		return nil, fmt.Errorf("outbox_repo.FetchPending: %w", err)
	}
	defer rows.Close()

	var result []models.ActuationOutbox
	for rows.Next() {
		var e models.ActuationOutbox
		var status string
		if err := rows.Scan(
			&e.EventID, &e.ActionID, &e.EventType, &e.Payload,
			&status, &e.Attempts, &e.NextRetryAt, &e.SentAt, &e.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("outbox_repo.FetchPending scan: %w", err)
		}
		e.Status = models.OutboxStatus(status)
		result = append(result, e)
	}
	return result, nil
}

// MarkSent updates an entry to SENT status after successful Kafka delivery.
// Called by outbox_worker.go immediately after Publish() succeeds.
func (r *OutboxRepo) MarkSent(ctx context.Context, eventID string) error {
	now := time.Now().UTC()
	sql := `
		UPDATE actuation_outbox
		SET    status  = 'SENT',
		       sent_at = $1
		WHERE  event_id = $2
	`
	_, err := r.pool.Exec(ctx, sql, now, eventID)
	if err != nil {
		return fmt.Errorf("outbox_repo.MarkSent event=%s: %w", eventID, err)
	}
	return nil
}

// MarkFailed increments the attempt counter and schedules the next retry
// using exponential backoff.
//
// BACKOFF SCHEDULE:
//
//	attempt 1 → retry in 30 seconds
//	attempt 2 → retry in 2 minutes
//	attempt 3 → retry in 8 minutes
//	attempt 4 → retry in 32 minutes
//	attempt 5 → status = FAILED permanently (manual fix needed)
//
// The SQL calculates next_retry_at using:
//
//	LEAST(30 * 4^attempts, 3600) seconds from now
//	(capped at 1 hour maximum delay)
func (r *OutboxRepo) MarkFailed(ctx context.Context, eventID string) error {
	sql := `
		UPDATE actuation_outbox
		SET
			attempts      = attempts + 1,
			status        = CASE
				WHEN attempts + 1 >= 5 THEN 'FAILED'
				ELSE status
			END,
			next_retry_at = CASE
				WHEN attempts + 1 < 5 THEN
					now() + (LEAST(30 * POWER(4, attempts), 3600) || ' seconds')::interval
				ELSE next_retry_at
			END
		WHERE event_id = $1
	`
	_, err := r.pool.Exec(ctx, sql, eventID)
	if err != nil {
		return fmt.Errorf("outbox_repo.MarkFailed event=%s: %w", eventID, err)
	}
	return nil
}


// ── Transaction-aware method (Gap #3) ────────────────────────────────────────

// InsertTx is identical to Insert but runs inside a pgx.Tx transaction.
//
// Uses pgx.Tx directly (not a custom interface) to avoid the compile error
// that occurred when using interface{Exec(...)(interface{RowsAffected()},error)}.
// pgx.Tx.Exec returns (pgconn.CommandTag, error) — the custom interface
// did not match that signature.
func (r *OutboxRepo) InsertTx(
	ctx context.Context,
	tx pgx.Tx,
	e models.ActuationOutbox,
) error {
	sql := `
		INSERT INTO actuation_outbox
			(event_id, action_id, event_type, payload,
			 status, attempts, next_retry_at, created_at)
		VALUES
			($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (event_id) DO NOTHING
	`
	_, err := tx.Exec(ctx, sql,
		e.EventID, e.ActionID, e.EventType, e.Payload,
		string(e.Status), e.Attempts, e.NextRetryAt, e.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("outbox_repo.InsertTx event=%s: %w", e.EventID, err)
	}
	return nil
}
