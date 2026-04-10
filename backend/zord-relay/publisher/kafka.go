package publisher

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/confluentinc/confluent-kafka-go/v2/kafka"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"go.uber.org/zap"

	"zord-relay/config"
	"zord-relay/model"
)

// otelHeaderCarrier adapts []kafka.Header for OTel text map propagation.
type otelHeaderCarrier struct {
	headers *[]kafka.Header
}

func (c otelHeaderCarrier) Get(key string) string {
	for _, h := range *c.headers {
		if h.Key == key {
			return string(h.Value)
		}
	}
	return ""
}

func (c otelHeaderCarrier) Set(key string, value string) {
	*c.headers = append(*c.headers, kafka.Header{Key: key, Value: []byte(value)})
}

func (c otelHeaderCarrier) Keys() []string {
	keys := make([]string, len(*c.headers))
	for i, h := range *c.headers {
		keys[i] = h.Key
	}
	return keys
}

// KafkaPublisher is the production Kafka publisher.
type KafkaPublisher struct {
	producer           *kafka.Producer
	dlqPublishFailure  string
	dlqPoison          string
	deliveryTimeout    time.Duration
	log                *zap.Logger
	tracer             trace.Tracer
}

// NewKafkaPublisher builds a Kafka producer configured for fintech production use.
// Auth: SASL/SCRAM-SHA-512. Durability: acks=all, idempotence=true.
func NewKafkaPublisher(cfg config.KafkaConfig, log *zap.Logger) (*KafkaPublisher, error) {
	kafkaCfg := kafka.ConfigMap{
		"bootstrap.servers":                     cfg.Brokers,
		"acks":                                  cfg.Acks,                // "all"
		"enable.idempotence":                    true,                   // exactly-once producer semantics
		"max.in.flight.requests.per.connection": 5,                      // required for idempotence
		"retries":                               10,                     // kafka-level retries (network blips)
		"linger.ms":                             cfg.LingerMs,
		"compression.type":                      cfg.CompressionType,
		"message.max.bytes":                     cfg.MessageMaxBytes,
		"delivery.timeout.ms":                   int(cfg.DeliveryTimeout.Milliseconds()),
		// Idempotent producers must have queuing disabled for strict ordering.
		"queue.buffering.max.messages":          100000,
	}

	// SASL/SCRAM-SHA-512 auth (non-negotiable for fintech).
	if cfg.SASLUsername != "" && cfg.SASLPassword != "" {
		kafkaCfg["security.protocol"] = map[bool]string{true: "SASL_SSL", false: "SASL_PLAINTEXT"}[cfg.TLSEnabled]
		kafkaCfg["sasl.mechanisms"] = cfg.SASLMechanism
		kafkaCfg["sasl.username"] = cfg.SASLUsername
		kafkaCfg["sasl.password"] = cfg.SASLPassword
	} else if cfg.TLSEnabled {
		kafkaCfg["security.protocol"] = "SSL"
	}

	producer, err := kafka.NewProducer(&kafkaCfg)
	if err != nil {
		return nil, fmt.Errorf("creating kafka producer: %w", err)
	}

	p := &KafkaPublisher{
		producer:          producer,
		dlqPublishFailure: cfg.DLQPublishFailureTopic,
		dlqPoison:         cfg.DLQPoisonTopic,
		deliveryTimeout:   cfg.DeliveryTimeout,
		log:               log.With(zap.String("component", "kafka_publisher")),
		tracer:            otel.Tracer("zord-relay/publisher"),
	}

	// Background goroutine drains the delivery report channel.
	// Without this the producer's internal queue fills up and Produce() blocks.
	go p.drainDeliveryReports()

	return p, nil
}

// Publish sends one event to Kafka synchronously (waits for delivery report).
// Key = event_id for deduplication by consumers.
// Headers: trace_id, tenant_id, event_id, event_type, relay_instance (+ OTel propagation).
func (p *KafkaPublisher) Publish(ctx context.Context, event *model.OutboxEvent, topic string) error {
	ctx, span := p.tracer.Start(ctx, "kafka.publish",
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.String("messaging.system", "kafka"),
			attribute.String("messaging.destination", topic),
			attribute.String("event.id", event.EventID),
			attribute.String("tenant.id", event.TenantID),
		),
	)
	defer span.End()

	payload, err := json.Marshal(event)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "event marshal failed")
		return poisonError(fmt.Errorf("marshalling event: %w", err))
	}

	if len(payload) > 1*1024*1024 {
		err := poisonError(fmt.Errorf("event size %d bytes exceeds 1MiB limit", len(payload)))
		span.RecordError(err)
		span.SetStatus(codes.Error, "message too large")
		return err
	}

	headers := p.buildHeaders(ctx, event)

	deliveryChan := make(chan kafka.Event, 1)

	err = p.producer.Produce(&kafka.Message{
		TopicPartition: kafka.TopicPartition{
			Topic:     &topic,
			Partition: kafka.PartitionAny,
		},
		Key:     []byte(event.EventID), // consumer dedup key
		Value:   payload,
		Headers: headers,
	}, deliveryChan)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "produce enqueue failed")
		return fmt.Errorf("enqueuing message: %w", err)
	}

	// Wait for delivery confirmation or timeout.
	select {
	case e := <-deliveryChan:
		msg, ok := e.(*kafka.Message)
		if !ok {
			return fmt.Errorf("unexpected delivery event type: %T", e)
		}
		if msg.TopicPartition.Error != nil {
			span.RecordError(msg.TopicPartition.Error)
			span.SetStatus(codes.Error, msg.TopicPartition.Error.Error())
			return fmt.Errorf("kafka delivery failed: %w", msg.TopicPartition.Error)
		}
		span.SetAttributes(
			attribute.Int64("messaging.kafka.partition", int64(msg.TopicPartition.Partition)),
			attribute.Int64("messaging.kafka.offset", int64(msg.TopicPartition.Offset)),
		)
		return nil

	case <-ctx.Done():
		return fmt.Errorf("publish context cancelled: %w", ctx.Err())

	case <-time.After(p.deliveryTimeout):
		return fmt.Errorf("kafka delivery timeout after %s", p.deliveryTimeout)
	}
}

// PublishDLQ sends a DLQMessage to the appropriate DLQ topic.
func (p *KafkaPublisher) PublishDLQ(ctx context.Context, msg *model.DLQMessage, dlqType DLQType) error {
	topic := p.dlqPublishFailure
	if dlqType == DLQTypePoison {
		topic = p.dlqPoison
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		p.log.Error("failed to marshal DLQ message",
			zap.String("dlq_type", string(dlqType)),
			zap.Error(err),
		)
		return err
	}

	var key []byte
	if msg.Event != nil {
		key = []byte(msg.Event.EventID)
	}

	deliveryChan := make(chan kafka.Event, 1)
	err = p.producer.Produce(&kafka.Message{
		TopicPartition: kafka.TopicPartition{
			Topic:     &topic,
			Partition: kafka.PartitionAny,
		},
		Key:   key,
		Value: payload,
		Headers: []kafka.Header{
			{Key: "dlq_type", Value: []byte(dlqType)},
			{Key: "reason_code", Value: []byte(msg.ReasonCode)},
		},
	}, deliveryChan)
	if err != nil {
		return fmt.Errorf("enqueuing DLQ message: %w", err)
	}

	select {
	case e := <-deliveryChan:
		if m, ok := e.(*kafka.Message); ok && m.TopicPartition.Error != nil {
			return fmt.Errorf("DLQ delivery failed: %w", m.TopicPartition.Error)
		}
	case <-time.After(30 * time.Second):
		return fmt.Errorf("DLQ delivery timeout")
	}

	return nil
}

// Close flushes all in-flight messages and closes the producer.
func (p *KafkaPublisher) Close() error {
	remaining := p.producer.Flush(15000) // 15s flush timeout
	if remaining > 0 {
		p.log.Warn("kafka producer closed with unflushed messages",
			zap.Int("remaining", remaining),
		)
	}
	p.producer.Close()
	return nil
}

// buildHeaders constructs all required Kafka message headers.
func (p *KafkaPublisher) buildHeaders(ctx context.Context, event *model.OutboxEvent) []kafka.Header {
	headers := []kafka.Header{
		{Key: "trace_id", Value: []byte(event.TraceID)},
		{Key: "tenant_id", Value: []byte(event.TenantID)},
		{Key: "event_id", Value: []byte(event.EventID)},
		{Key: "event_type", Value: []byte(event.EventType)},
		{Key: "envelope_id", Value: []byte(event.EnvelopeID)},
	}
	if event.SchemaVersion != "" {
		headers = append(headers, kafka.Header{Key: "schema_version", Value: []byte(event.SchemaVersion)})
	}

	// Inject OTel trace context so consumers can continue the trace.
	otel.GetTextMapPropagator().Inject(ctx, otelHeaderCarrier{headers: &headers})

	return headers
}

// drainDeliveryReports runs in a goroutine, consuming delivery reports that
// were NOT routed to a specific deliveryChan (e.g. if Produce was called
// without one). This prevents the internal queue from blocking.
func (p *KafkaPublisher) drainDeliveryReports() {
	for e := range p.producer.Events() {
		switch ev := e.(type) {
		case *kafka.Message:
			if ev.TopicPartition.Error != nil {
				p.log.Error("unrouted kafka delivery failure",
					zap.String("topic", *ev.TopicPartition.Topic),
					zap.Error(ev.TopicPartition.Error),
				)
			}
		case kafka.Error:
			p.log.Error("kafka producer error",
				zap.Int("code", int(ev.Code())),
				zap.Error(ev),
			)
		}
	}
}

// PoisonErr marks an error as a poison event (non-retryable).
type PoisonErr struct{ cause error }

func (e *PoisonErr) Error() string { return e.cause.Error() }
func (e *PoisonErr) Unwrap() error { return e.cause }

func poisonError(err error) *PoisonErr { return &PoisonErr{cause: err} }

// IsPoison reports whether err is a non-retryable poison event error.
func IsPoison(err error) bool {
	if err == nil {
		return false
	}
	_, ok := err.(*PoisonErr)
	return ok
}
