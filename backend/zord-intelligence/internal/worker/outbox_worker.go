package worker

// What is this file?
// The outbox worker delivers pending actuation events to Kafka.
// It runs in the background, waking up every 5 seconds.
//
// WHY DOES THIS EXIST?
// When ZPI creates an ActionContract that needs to trigger another service,
// it writes to the actuation_outbox table (not Kafka directly).
// This worker reads those entries and delivers them to Kafka.
// If delivery fails, it retries with exponential backoff.
//
// WHAT IT DOES EVERY 5 SECONDS:
//   1. SELECT up to 50 PENDING/FAILED entries WHERE next_retry_at <= now
//   2. For each entry: publish to the right Kafka topic
//   3. On success: mark as SENT
//   4. On failure: mark as FAILED (increments attempt, schedules retry)
//
// WHO STARTS THIS?
// cmd/main.go calls outboxWorker.Start(ctx) in a goroutine.

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zord/zord-intelligence/config"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
	kafkapkg "github.com/zord/zord-intelligence/kafka"
)

// OutboxWorker delivers pending actuation events to Kafka.
type OutboxWorker struct {
	outboxRepo *persistence.OutboxRepo
	producer   *kafkapkg.Producer
	cfg        *config.Config
}

// NewOutboxWorker creates an OutboxWorker with its dependencies.
func NewOutboxWorker(
	outboxRepo *persistence.OutboxRepo,
	producer *kafkapkg.Producer,
	cfg *config.Config,
) *OutboxWorker {
	return &OutboxWorker{
		outboxRepo: outboxRepo,
		producer:   producer,
		cfg:        cfg,
	}
}

// Start runs the outbox delivery loop until ctx is cancelled.
// Call this in a goroutine from main.go:
//
//	go outboxWorker.Start(ctx)
func (w *OutboxWorker) Start(ctx context.Context) {
	// time.NewTicker returns a ticker that fires every interval
	// ticker.C is a channel — it receives the current time every 5 seconds
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop() // always stop the ticker when done — frees resources

	log.Println("outbox_worker: started (interval=5s)")

	// Run once immediately before the first tick
	// Without this, we would wait 5 seconds before first delivery on startup
	w.runOnce(ctx)

	for {
		// select waits until ONE of the cases is ready
		select {
		case <-ticker.C:
			// Ticker fired — time to check for pending entries
			w.runOnce(ctx)

		case <-ctx.Done():
			// Context cancelled — service is shutting down
			log.Println("outbox_worker: shutting down")
			return
		}
	}
}

// runOnce fetches and delivers one batch of pending outbox entries.
// Called every 5 seconds by the Start loop.
func (w *OutboxWorker) runOnce(ctx context.Context) {
	// Fetch up to 50 entries ready for delivery
	// FOR UPDATE SKIP LOCKED means multiple ZPI instances won't double-deliver
	entries, err := w.outboxRepo.FetchPending(ctx, 50)
	if err != nil {
		log.Printf("outbox_worker: fetch error: %v", err)
		return
	}

	if len(entries) == 0 {
		return // nothing to do
	}

	log.Printf("outbox_worker: processing %d entries", len(entries))

	for _, entry := range entries {
		w.deliver(ctx, entry)
	}
}

// deliver sends one outbox entry to the correct Kafka topic.
// Decides which topic to use based on the entry's EventType (ESCALATE, RETRY etc.)
func (w *OutboxWorker) deliver(ctx context.Context, entry models.ActuationOutbox) {
	// Decide which Kafka topic this goes to based on event type
	topic, err := w.topicForEventType(entry.EventType)
	if err != nil {
		log.Printf("outbox_worker: unknown event_type=%s for event=%s",
			entry.EventType, entry.EventID)
		// Mark as failed — needs manual investigation
		_ = w.outboxRepo.MarkFailed(ctx, entry.EventID)
		return
	}

	// Publish to Kafka
	// Key = entry.ActionID — ensures ordering: all events for same action
	// go to the same partition
	publishErr := w.producer.Publish(ctx, topic, entry.ActionID, entry.Payload)

	if publishErr != nil {
		// Delivery failed — log and schedule retry
		log.Printf("outbox_worker: publish failed event=%s topic=%s attempt=%d: %v",
			entry.EventID, topic, entry.Attempts+1, publishErr)

		if err := w.outboxRepo.MarkFailed(ctx, entry.EventID); err != nil {
			log.Printf("outbox_worker: mark_failed error event=%s: %v",
				entry.EventID, err)
		}
		return
	}

	// Delivery succeeded — mark as SENT
	if err := w.outboxRepo.MarkSent(ctx, entry.EventID); err != nil {
		log.Printf("outbox_worker: mark_sent error event=%s: %v",
			entry.EventID, err)
		// The Kafka message was sent — even if we fail to mark it,
		// ON CONFLICT DO NOTHING means a retry is harmless (idempotent)
	}

	log.Printf("outbox_worker: delivered event=%s action=%s topic=%s",
		entry.EventID, entry.ActionID, topic)
}

// topicForEventType maps an event type to the correct Kafka output topic.
// Only 3 actuation topics exist — ZPI does not publish KPI data to Kafka.
func (w *OutboxWorker) topicForEventType(eventType string) (string, error) {
	switch eventType {
	case string(models.DecisionRetry):
		// → Service 4 (Relay) — retry the payout
		return w.cfg.TopicActuationRetry, nil

	case string(models.DecisionGenerateEvidence):
		// → Service 6 (Contracts) — build an evidence pack
		return w.cfg.TopicActuationEvidence, nil

	case string(models.DecisionEscalate),
		string(models.DecisionNotify),
		string(models.DecisionOpenOpsIncident),
		string(models.DecisionHold):
		// All ops-facing decisions go to the alert topic
		// The notification service downstream decides how to route them
		return w.cfg.TopicActuationAlert, nil
	}

	return "", fmt.Errorf("no topic configured for event_type=%s", eventType)
}
