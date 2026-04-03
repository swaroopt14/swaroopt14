package kafka //need to change to kafka

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"zord-edge/model"

	"github.com/IBM/sarama"
)

type Producer struct {
	producer sarama.SyncProducer
}

func NewProducer(brokers []string) (*Producer, error) {
	config := sarama.NewConfig()

	config.Version = sarama.V2_8_0_0

	config.Producer.RequiredAcks = sarama.WaitForAll

	config.Producer.Idempotent = true
	config.Net.MaxOpenRequests = 1

	//Retry Settings
	config.Producer.Retry.Max = 10
	config.Producer.Retry.Backoff = 2 * time.Second

	//Batch Settings
	config.Producer.Flush.Bytes = 1_000_000 // 1MB batch
	config.Producer.Flush.Messages = 100
	config.Producer.Flush.Frequency = 5 * time.Millisecond

	// Compression reduces network overhead
	config.Producer.Compression = sarama.CompressionSnappy

	// SyncProducer requires Successes to be true.
	config.Producer.Return.Successes = true
	config.Producer.Return.Errors = true

	var producer sarama.SyncProducer
	var err error

	for i := 0; i < 30; i++ {
		producer, err = sarama.NewSyncProducer(brokers, config)
		if err == nil {
			break
		}
		log.Printf("Failed to create Kafka sync producer (attempt %d/30): %v. Retrying in 2s...", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, err
	}

	return &Producer{producer: producer}, nil
}

func (p *Producer) Publish(ctx context.Context, topic string, key string, event interface{}) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	msg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(payload),
	}

	_, _, err = p.producer.SendMessage(msg)
	return err
}


func SendRawIntentMessage(ctx context.Context, Event model.Event, pro *Producer) error {
	topic := os.Getenv("KAFKA_TOPIC")

	err := pro.Publish(ctx,
		topic,
		Event.EnvelopeID.String(),
		Event,
	)
	if err != nil {
		return err
	}

	log.Printf("Kafka Event published successfully for envelope_id=%s", Event.EnvelopeID)
	return nil
}

// Close gracefully shuts down the Kafka producer
func (p *Producer) Close() error {

	if p == nil || p.producer == nil {
		return nil
	}

	return p.producer.Close()
}
