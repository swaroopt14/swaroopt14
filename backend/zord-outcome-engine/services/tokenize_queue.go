package services

import (
	"context"
	"log"
	"os"

	"zord-outcome-engine/kafka"
	"zord-outcome-engine/models"
)

type KafkaTokenizeQueue struct {
	producer *kafka.Producer
	topic    string
}

func NewKafkaTokenizeQueue(producer *kafka.Producer) *KafkaTokenizeQueue {
	topic := os.Getenv("KAFKA_TOPIC_PII_TOKENIZE_REQUEST")
	if topic == "" {
		topic = "pii.tokenize.request"
	}
	return &KafkaTokenizeQueue{
		producer: producer,
		topic:    topic,
	}
}

func (k *KafkaTokenizeQueue) PublishTokenizeRequest(
	ctx context.Context,
	req models.TokenizeRequestEvent,
) error {
	err := k.producer.Publish(
		ctx,
		k.topic,
		req.EnvelopeID,
		req,
	)

	if err != nil {
		log.Printf("Failed to publish tokenize request: %v", err)
		return err
	}

	log.Printf("Tokenize request event published for EnvelopeID=%s", req.EnvelopeID)
	return nil
}
