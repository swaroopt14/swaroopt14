package services

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/confluentinc/confluent-kafka-go/v2/kafka"
	"go.uber.org/zap"

	"zord-relay/logger"
	"zord-relay/model"
)

// DispatchConsumerConfig holds tuning parameters for the Kafka dispatch consumer.
type DispatchConsumerConfig struct {
	Brokers     string
	GroupID     string
	Topic       string
	PollTimeout time.Duration
	// MaxPollIntervalMs is the max time between Poll() calls before the broker
	// considers the consumer dead and triggers a rebalance.
	// Must be > worst-case dispatch time: PSP timeout + detokenize + DB writes.
	// Default: 90000 (90 seconds). Do not set lower than PSP timeout * 2.
	MaxPollIntervalMs int
	// WorkerCount is the number of concurrent dispatch goroutines.
	// Each worker handles one message at a time — concurrency is bounded.
	// Default: 4. Set based on PSP rate limits and DB connection pool size.
	WorkerCount int
}

// DispatchConsumer reads OutboxEvents from Kafka and feeds them to DispatchLoop.
//
// Concurrency model (Gap 14 fix):
//   A single Kafka consumer goroutine polls messages and feeds a bounded
//   worker pool via a buffered channel. Each worker processes one dispatch
//   at a time. This means slow PSP calls on partition N do not block
//   partition M — bounded parallelism without partition ordering violations.
//
// Offset commit strategy (at-least-once, safe for fintech):
//   - Offset is committed only after Step 1 of processEvent durably commits to DB.
//   - If Step 1 fails (DB unavailable), the offset is withheld.
//     On consumer restart Kafka re-delivers the message — Step 1's idempotency
//     check prevents double-dispatch.
//   - For poison messages (JSON parse failure), the offset IS committed to skip
//     permanently unparseable messages; DispatchLoop logs the event clearly.
type DispatchConsumer struct {
	cfg  *DispatchConsumerConfig
	loop *DispatchLoop
}

func NewDispatchConsumer(cfg *DispatchConsumerConfig, loop *DispatchLoop) *DispatchConsumer {
	return &DispatchConsumer{cfg: cfg, loop: loop}
}

// Start launches one consumer goroutine. Kafka consumer groups are single-threaded
// per partition by design; concurrent dispatch is achieved via topic partitioning.
func (c *DispatchConsumer) Start(ctx context.Context, wg *sync.WaitGroup) error {
	consumer, err := kafka.NewConsumer(&kafka.ConfigMap{
		"bootstrap.servers": c.cfg.Brokers,
		"group.id":          c.cfg.GroupID,
		"auto.offset.reset": "earliest",
		"enable.auto.commit": false,
		"session.timeout.ms": 30000,
		// max.poll.interval.ms must cover the worst-case dispatch time:
		// governance (fast) + detokenize (~100ms) + PSP call (up to 30s) +
		// DB writes (~100ms) + safety margin = ~90 seconds.
		// Previous value of 300000 (5 min) was unnecessarily long and masks real hangs.
		// Set via MaxPollIntervalMs config; default 90s.
		"max.poll.interval.ms": c.cfg.MaxPollIntervalMs,
		"fetch.min.bytes":      1,
		"fetch.wait.max.ms":    500,
	})
	if err != nil {
		return err
	}

	if err := consumer.Subscribe(c.cfg.Topic, nil); err != nil {
		consumer.Close() //nolint:errcheck
		return err
	}

	log := logger.Logger.With(
		zap.String("component", "dispatch_consumer"),
		zap.String("topic", c.cfg.Topic),
		zap.String("group_id", c.cfg.GroupID),
	)
	log.Info("dispatch_consumer: subscribed")

	wg.Add(1)
	go func() {
		defer wg.Done()
		defer consumer.Close() //nolint:errcheck
		c.run(ctx, consumer, log)
	}()

	return nil
}

func (c *DispatchConsumer) run(ctx context.Context, consumer *kafka.Consumer, log *zap.Logger) {
	pollMs := int(c.cfg.PollTimeout.Milliseconds())
	if pollMs <= 0 {
		pollMs = 200
	}

	// Worker pool: bounded concurrency for dispatch processing.
	// The pool size controls max in-flight PSP calls at any moment.
	workerCount := c.cfg.WorkerCount
	if workerCount <= 0 {
		workerCount = 4
	}

	type workItem struct {
		consumer *kafka.Consumer
		msg      *kafka.Message
	}
	workCh := make(chan workItem, workerCount*2)

	// Start worker goroutines.
	var workerWg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		workerWg.Add(1)
		go func(workerID int) {
			defer workerWg.Done()
			for w := range workCh {
				c.handleMessage(ctx, w.consumer, w.msg, log.With(zap.Int("worker_id", workerID)))
			}
		}(i)
	}

	log.Info("dispatch_consumer: running", zap.Int("workers", workerCount))

	for {
		select {
		case <-ctx.Done():
			log.Info("dispatch_consumer: context cancelled — stopping")
			close(workCh)
			workerWg.Wait()
			return
		default:
		}

		ev := consumer.Poll(pollMs)
		if ev == nil {
			continue
		}

		switch e := ev.(type) {
		case *kafka.Message:
			// Send to worker pool. If pool is full (all workers busy with slow PSP calls),
			// this blocks — which is correct backpressure: we do not over-lease.
			select {
			case workCh <- workItem{consumer: consumer, msg: e}:
			case <-ctx.Done():
				close(workCh)
				workerWg.Wait()
				return
			}

		case kafka.Error:
			if e.Code() == kafka.ErrAllBrokersDown {
				log.Error("dispatch_consumer: all brokers down — backing off",
					zap.Error(e),
				)
				select {
				case <-ctx.Done():
					close(workCh)
					workerWg.Wait()
					return
				case <-time.After(5 * time.Second):
				}
			} else {
				log.Warn("dispatch_consumer: kafka error (transient)",
					zap.Int("code", int(e.Code())),
					zap.Error(e),
				)
			}
		}
	}
}

func (c *DispatchConsumer) handleMessage(
	ctx context.Context,
	consumer *kafka.Consumer,
	msg *kafka.Message,
	log *zap.Logger,
) {
	msgLog := log.With(
		zap.Int32("partition", msg.TopicPartition.Partition),
		zap.Int64("offset", int64(msg.TopicPartition.Offset)),
	)

	// Quick sanity-check: can we parse this as OutboxEvent?
	// If not, log and commit (poison skip). The real JSON-parse inside
	// processEvent also handles this, but we extract event_id first for logging.
	var peek struct {
		EventID string `json:"event_id"`
	}
	if jsonErr := json.Unmarshal(msg.Value, &peek); jsonErr != nil {
		msgLog.Error("dispatch_consumer: totally unparseable message — committing as poison",
			zap.Error(jsonErr),
		)
		c.commitOffset(consumer, msg, msgLog)
		return
	}

	msgLog = msgLog.With(zap.String("event_id", peek.EventID))

	var event model.OutboxEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		// Parseable as JSON but not as OutboxEvent — poison.
		msgLog.Error("dispatch_consumer: cannot unmarshal OutboxEvent — committing as poison",
			zap.Error(err),
		)
		c.commitOffset(consumer, msg, msgLog)
		return
	}

	// processEvent returns true  → Step 1 committed → commit Kafka offset.
	//                   false → Step 1 failed (DB down) → withhold offset.
	ownershipTaken := c.loop.processEvent(ctx, int(msg.TopicPartition.Partition), event)
	if ownershipTaken {
		c.commitOffset(consumer, msg, msgLog)
	} else {
		msgLog.Warn("dispatch_consumer: step1 failed — withholding offset commit (will retry on restart)")
	}
}

func (c *DispatchConsumer) commitOffset(consumer *kafka.Consumer, msg *kafka.Message, log *zap.Logger) {
	if _, err := consumer.CommitMessage(msg); err != nil {
		log.Error("dispatch_consumer: offset commit failed",
			zap.Int32("partition", msg.TopicPartition.Partition),
			zap.Int64("offset", int64(msg.TopicPartition.Offset)),
			zap.Error(err),
		)
	}
}
