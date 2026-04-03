package kafka

import (
	"context"
	"encoding/json"
	"log"
	"strings"

	"github.com/segmentio/kafka-go"
	"github.com/zord/zord-intelligence/config"
	"github.com/zord/zord-intelligence/internal/models"
)

type EventHandler interface {
	HandleIntentCreated(ctx context.Context, e models.IntentCreatedEvent) error
	HandleDispatchCreated(ctx context.Context, e models.DispatchAttemptCreatedEvent) error
	HandleOutcomeNormalized(ctx context.Context, e models.OutcomeNormalizedEvent) error
	HandleFinalityCertIssued(ctx context.Context, e models.FinalityCertIssuedEvent) error
	HandleFinalContractUpdated(ctx context.Context, e models.FinalContractUpdatedEvent) error
	HandleEvidencePackReady(ctx context.Context, e models.EvidencePackReadyEvent) error
	HandleDLQEvent(ctx context.Context, e models.DLQEvent) error
	HandleStatementMatch(ctx context.Context, e models.StatementMatchEvent) error
}

type CorridorHealthTickHandler interface {
	HandleCorridorHealthTick(ctx context.Context, e models.CorridorHealthTickEvent) error
}

type SLATimerTickHandler interface {
	HandleSLATimerTick(ctx context.Context, e models.SLATimerTickEvent) error
}

func StartConsumers(ctx context.Context, cfg *config.Config, handler EventHandler) {
	brokers := strings.Split(cfg.KafkaBrokers, ",")
	topicHandlers := map[string]func(kafka.Message) error{
		cfg.TopicIntentCreated: func(msg kafka.Message) error {
			var e models.IntentCreatedEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return handler.HandleIntentCreated(ctx, e)
		},
		cfg.TopicDispatchCreated: func(msg kafka.Message) error {
			var e models.DispatchAttemptCreatedEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return handler.HandleDispatchCreated(ctx, e)
		},
		cfg.TopicOutcomeNormalized: func(msg kafka.Message) error {
			var e models.OutcomeNormalizedEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return handler.HandleOutcomeNormalized(ctx, e)
		},
		cfg.TopicFinalityCert: func(msg kafka.Message) error {
			var e models.FinalityCertIssuedEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return handler.HandleFinalityCertIssued(ctx, e)
		},
		cfg.TopicFinalContract: func(msg kafka.Message) error {
			var e models.FinalContractUpdatedEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return handler.HandleFinalContractUpdated(ctx, e)
		},
		cfg.TopicEvidenceReady: func(msg kafka.Message) error {
			var e models.EvidencePackReadyEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return handler.HandleEvidencePackReady(ctx, e)
		},
		cfg.TopicDLQ: func(msg kafka.Message) error {
			var e models.DLQEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return handler.HandleDLQEvent(ctx, e)
		},
		cfg.TopicStatementMatch: func(msg kafka.Message) error {
			var e models.StatementMatchEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return handler.HandleStatementMatch(ctx, e)
		},
	}

	if corridorHealthHandler, ok := handler.(CorridorHealthTickHandler); ok {
		topicHandlers[cfg.TopicCorridorHealthTick] = func(msg kafka.Message) error {
			var e models.CorridorHealthTickEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return corridorHealthHandler.HandleCorridorHealthTick(ctx, e)
		}
	}

	if slaTimerHandler, ok := handler.(SLATimerTickHandler); ok {
		topicHandlers[cfg.TopicSLATimerTick] = func(msg kafka.Message) error {
			var e models.SLATimerTickEvent
			if err := json.Unmarshal(msg.Value, &e); err != nil {
				return err
			}
			return slaTimerHandler.HandleSLATimerTick(ctx, e)
		}
	}

	go consume(ctx, brokers, cfg.KafkaGroupID, topicHandlers)

	log.Println("kafka: consumers started")
}

func consume(
	ctx context.Context,
	brokers []string,
	groupID string,
	topicHandlers map[string]func(kafka.Message) error,
) {
	topics := make([]string, 0, len(topicHandlers))
	for topic := range topicHandlers {
		if topic == "" {
			continue
		}
		topics = append(topics, topic)
	}
	if len(topics) == 0 {
		log.Printf("kafka: no topics configured for group=%s", groupID)
		return
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     brokers,
		GroupID:     groupID,
		GroupTopics: topics,
		CommitInterval: 0,
		MaxWait:        3e9,
	})

	defer func() {
		if err := reader.Close(); err != nil {
			log.Printf("kafka: error closing reader for group %s: %v", groupID, err)
		}
	}()

	log.Printf("kafka: group consumer started for topics=%v group=%s", topics, groupID)

	for {
		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				log.Printf("kafka: consumer shutting down for group=%s", groupID)
				return
			}
			log.Printf("kafka: fetch error on group=%s: %v", groupID, err)
			continue
		}

		handle, ok := topicHandlers[msg.Topic]
		if !ok {
			log.Printf("kafka: no handler registered for topic=%s partition=%d offset=%d", msg.Topic, msg.Partition, msg.Offset)
			if err := reader.CommitMessages(ctx, msg); err != nil {
				log.Printf("kafka: commit error on topic=%s offset=%d: %v", msg.Topic, msg.Offset, err)
			}
			continue
		}

		if err := handle(msg); err != nil {
			log.Printf("kafka: handler error on topic=%s partition=%d offset=%d: %v", msg.Topic, msg.Partition, msg.Offset, err)
			continue
		}

		log.Printf("kafka: consumed topic=%s partition=%d offset=%d", msg.Topic, msg.Partition, msg.Offset)

		if err := reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("kafka: commit error on topic=%s offset=%d: %v", msg.Topic, msg.Offset, err)
		}
	}
}
