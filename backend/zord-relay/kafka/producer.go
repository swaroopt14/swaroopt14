package kafka

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/IBM/sarama"
)

// Producer wraps a Sarama SyncProducer.
// All publishes are synchronous — the caller blocks until Kafka acks.
// Idempotent mode is enabled so broker-side deduplication handles
// producer retries without producing duplicates.
type Producer struct {
	p sarama.SyncProducer
}

func NewProducer(brokers []string) *Producer {
	cfg := sarama.NewConfig()

	// Wait for all in-sync replicas to ack — strongest durability guarantee.
	cfg.Producer.RequiredAcks = sarama.WaitForAll

	// Idempotent producer: safe to retry on transient failures.
	// Requires MaxOpenRequests = 1 per Kafka protocol.
	cfg.Producer.Idempotent = true
	cfg.Net.MaxOpenRequests = 1

	cfg.Producer.Retry.Max = 5
	cfg.Producer.Retry.Backoff = 200 * time.Millisecond
	cfg.Producer.Return.Successes = true

	// Batching: flush every 10ms or when 100 messages accumulate.
	// This amortises the MaxOpenRequests=1 constraint at high throughput.
	cfg.Producer.Flush.Frequency = 10 * time.Millisecond
	cfg.Producer.Flush.Messages = 100

	cfg.Version = sarama.V2_8_0_0

	var (
		p   sarama.SyncProducer
		err error
	)
	for attempt := 1; attempt <= 30; attempt++ {
		p, err = sarama.NewSyncProducer(brokers, cfg)
		if err == nil {
			log.Printf("kafka: producer connected (attempt %d)", attempt)
			return &Producer{p: p}
		}
		log.Printf("kafka: producer connect failed (attempt %d/30): %v — retrying in 2s", attempt, err)
		time.Sleep(2 * time.Second)
	}
	log.Fatalf("kafka: failed to create producer after 30 attempts: %v", err)
	return nil
}

// Publish sends a single message to a Kafka topic.
// key is used for Kafka partitioning — always pass dispatch_id.
// headers must include trace_id, tenant_id, event_id.
// value can be []byte (sent as-is) or any struct (JSON-marshalled).
func (p *Producer) Publish(topic, key string, value interface{}, headers map[string]string) error {
	var body []byte

	switch v := value.(type) {
	case []byte:
		body = v
	default:
		var err error
		body, err = json.Marshal(v)
		if err != nil {
			return fmt.Errorf("kafka: marshal failed for topic %s: %w", topic, err)
		}
	}

	msg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(body),
	}

	// Headers in deterministic order: trace_id, tenant_id, event_id, event_type.
	// Deterministic order makes log correlation and debugging easier.
	for _, k := range []string{"trace_id", "tenant_id", "event_id", "event_type", "dispatch_id"} {
		if v, ok := headers[k]; ok {
			msg.Headers = append(msg.Headers, sarama.RecordHeader{
				Key:   []byte(k),
				Value: []byte(v),
			})
		}
	}
	// Append any remaining headers not in the priority list.
	for k, v := range headers {
		switch k {
		case "trace_id", "tenant_id", "event_id", "event_type", "dispatch_id":
			// already added above
		default:
			msg.Headers = append(msg.Headers, sarama.RecordHeader{
				Key:   []byte(k),
				Value: []byte(v),
			})
		}
	}

	_, _, err := p.p.SendMessage(msg)
	if err != nil {
		return fmt.Errorf("kafka: send failed for topic %s key %s: %w", topic, key, err)
	}
	return nil
}

func (p *Producer) Close() error {
	return p.p.Close()
}
