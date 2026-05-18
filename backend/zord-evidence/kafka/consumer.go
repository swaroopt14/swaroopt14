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

func (c *Consumer) Setup(sess sarama.ConsumerGroupSession) error {
	// log.Printf("evidence.kafka.session_setup claims=%v member_id=%s", sess.Claims(), sess.MemberID())
	return nil
}
func (c *Consumer) Cleanup(sess sarama.ConsumerGroupSession) error {
	log.Printf("evidence.kafka.session_cleanup member_id=%s", sess.MemberID())
	return nil
}

func (c *Consumer) ConsumeClaim(sess sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		log.Printf("evidence.kafka.message_received topic=%s partition=%d offset=%d key=%s payload_bytes=%d", msg.Topic, msg.Partition, msg.Offset, string(msg.Key), len(msg.Value))

		if err := c.handler(sess.Context(), string(msg.Key), msg.Value); err != nil {
			log.Printf("evidence.kafka.consume_error topic=%s partition=%d offset=%d err=%v", msg.Topic, msg.Partition, msg.Offset, err)
			continue
		}
		sess.MarkMessage(msg, "")
		log.Printf("evidence.kafka.message_committed topic=%s partition=%d offset=%d key=%s", msg.Topic, msg.Partition, msg.Offset, string(msg.Key))

	}
	return nil
}

func StartConsumer(ctx context.Context, brokers []string, groupID, topic string, handler MessageHandler) error {
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V2_6_0_0
	cfg.Consumer.Offsets.Initial = sarama.OffsetOldest
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
func StartConsumerForTopics(ctx context.Context, brokers []string, groupID string, topics []string, handler MessageHandler) error {
	cfg := sarama.NewConfig()
	cfg.Version = sarama.V2_6_0_0
	cfg.Consumer.Offsets.Initial = sarama.OffsetOldest
	cfg.Consumer.Group.Rebalance.Strategy = sarama.NewBalanceStrategyRoundRobin()

	consumerGroup, err := sarama.NewConsumerGroup(brokers, groupID, cfg)
	if err != nil {
		return err
	}

	go func() {
		log.Printf("evidence.kafka.consumer_started group=%s topics=%v brokers=%v", groupID, topics, brokers)

		defer consumerGroup.Close()
		consumer := NewConsumer(handler)
		for {
			if err := consumerGroup.Consume(ctx, topics, consumer); err != nil {
				log.Printf("evidence.kafka.consume_loop_error topics=%v err=%v", topics, err)
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
