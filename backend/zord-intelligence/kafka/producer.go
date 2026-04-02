package kafka

// What is this file?
// ZPI's "mouth" — sends actuation messages to Kafka.
// ONLY called by internal/worker/outbox_worker.go
// ONLY sends to 3 topics (actuation only — NOT for sending KPI data)
//
// WHO CALLS THIS FILE?
//   outbox_worker.go → producer.Publish(topic, key, payload)
//
// WHAT DOES IT CALL?
//   Nothing. It just writes to Kafka and returns.

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/segmentio/kafka-go"
)

// Producer wraps kafka-go's Writer.
// We wrap it so the rest of the code doesn't need to know about kafka-go directly.
// They just call producer.Publish() and we handle the details.
type Producer struct {
	writer *kafka.Writer
}

// NewProducer creates a Kafka producer connected to the given broker.
//
// Called once from cmd/main.go:
//
//	producer := kafka.NewProducer(cfg.KafkaBrokers)
//	defer producer.Close()
func NewProducer(broker string) *Producer {
	writer := &kafka.Writer{
		// Addr is the Kafka broker address
		Addr: kafka.TCP(broker),

		// Balancer decides which partition a message goes to.
		// LeastBytes sends to the partition with the fewest recent bytes.
		// For ZPI, we use the tenant_id as the message Key (set in Publish below),
		// so all messages for the same tenant go to the same partition.
		// This ensures ordering of events per tenant.
		Balancer: &kafka.LeastBytes{},

		// RequiredAcks: wait for ALL in-sync replicas to confirm the write.
		// Slower but guarantees the message is not lost if one broker fails.
		// For financial intelligence events, we always use this.
		RequiredAcks: kafka.RequireAll,

		// Async false = synchronous writes.
		// We wait for broker acknowledgment before returning.
		// If the write fails, we get an error we can handle.
		Async: false,
	}

	return &Producer{writer: writer}
}

// Publish sends a message to a Kafka topic.
//
// PARAMETERS:
//
//	ctx     → context for cancellation
//	topic   → which Kafka topic to publish to
//	key     → partition key (use tenant_id for consistent ordering)
//	payload → any Go struct — will be marshaled to JSON automatically
//
// EXAMPLE CALL from outbox_worker.go:
//
//	err := producer.Publish(ctx, cfg.TopicActuationAlert, tenantID, alertPayload)
func (p *Producer) Publish(ctx context.Context, topic, key string, payload any) error {

	// json.Marshal converts any Go struct to JSON bytes
	// "any" is Go's way of saying "any type" (like Object in Java)
	value, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("producer: failed to marshal payload for topic=%s: %w", topic, err)
	}

	// Write the message to Kafka
	err = p.writer.WriteMessages(ctx,
		kafka.Message{
			Topic: topic,
			Key:   []byte(key), // tenant_id as bytes — used for partition routing
			Value: value,       // JSON payload as bytes
		},
	)
	if err != nil {
		return fmt.Errorf("producer: failed to write to topic=%s: %w", topic, err)
	}

	log.Printf("kafka: published to topic=%s key=%s bytes=%d", topic, key, len(value))
	return nil
}

// Close flushes any pending messages and closes the connection.
// Call this during service shutdown.
//
// In main.go:
//
//	defer producer.Close()
func (p *Producer) Close() error {
	if err := p.writer.Close(); err != nil {
		return fmt.Errorf("producer: close error: %w", err)
	}
	return nil
}
