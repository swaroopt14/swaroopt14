package kafka

import (
	"context"
	"encoding/json"
	"log"

	"github.com/IBM/sarama"
)

type MessageHandler func(ctx context.Context, key string, payload []byte) error

type Consumer struct {
	handler MessageHandler
}

func NewConsumer(handler MessageHandler) *Consumer {
	return &Consumer{handler: handler}
}

func (c *Consumer) Setup(_ sarama.ConsumerGroupSession) error   { return nil }
func (c *Consumer) Cleanup(_ sarama.ConsumerGroupSession) error { return nil }

func (c *Consumer) ConsumeClaim(sess sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		if err := c.handler(sess.Context(), string(msg.Key), msg.Value); err != nil {
			log.Printf("evidence.kafka.consume_error topic=%s partition=%d offset=%d err=%v", msg.Topic, msg.Partition, msg.Offset, err)
			continue
		}
		sess.MarkMessage(msg, "")
	}
	return nil
}

func StartConsumer(ctx context.Context, brokers []string, groupID, topic string, handler MessageHandler) error {
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V2_6_0_0
	cfg.Consumer.Offsets.Initial = sarama.OffsetNewest
	cfg.Consumer.Group.Rebalance.Strategy = sarama.NewBalanceStrategyRoundRobin()

	consumerGroup, err := sarama.NewConsumerGroup(brokers, groupID, cfg)
	if err != nil {
		return err
	}
	go func() {
		defer consumerGroup.Close()
		consumer := NewConsumer(handler)
		for {
			if err := consumerGroup.Consume(ctx, []string{topic}, consumer); err != nil {
				log.Printf("evidence.kafka.consume_loop_error err=%v", err)
			}
			if ctx.Err() != nil {
				return
			}
		}
	}()
	return nil
}

// ParsePayloadMap is useful for event-based enrichment hooks.
func ParsePayloadMap(raw []byte) (map[string]any, error) {
	m := map[string]any{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	return m, nil
}
