package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Relay-level metrics.
// All metrics carry a "service" label so a single Grafana dashboard can fan out
// across all upstream services.

var (
	// LeaseTotal counts how many lease calls were made.
	LeaseTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "lease_total",
		Help:      "Total number of lease calls made to upstream services.",
	}, []string{"service", "result"}) // result: success | empty | error

	// LeaseBatchSize tracks the distribution of batch sizes returned by /lease.
	LeaseBatchSize = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "relay",
		Name:      "lease_batch_size",
		Help:      "Number of events returned per lease call.",
		Buckets:   []float64{0, 1, 10, 50, 100, 200, 500, 1000},
	}, []string{"service"})

	// PublishTotal counts Kafka publish attempts.
	PublishTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "publish_total",
		Help:      "Total Kafka publish attempts.",
	}, []string{"service", "topic", "result"}) // result: success | error

	// PublishDuration tracks end-to-end publish latency per event.
	PublishDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "relay",
		Name:      "publish_duration_seconds",
		Help:      "Latency of Kafka publish calls.",
		Buckets:   prometheus.DefBuckets,
	}, []string{"service", "topic"})

	// AckTotal counts ack calls.
	AckTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "ack_total",
		Help:      "Total ack calls made to upstream services.",
	}, []string{"service", "result"})

	// NackTotal counts nack calls.
	NackTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "nack_total",
		Help:      "Total nack calls made to upstream services.",
	}, []string{"service", "result"})

	// DLQTotal counts events sent to either DLQ topic.
	DLQTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "dlq_total",
		Help:      "Total events routed to a DLQ topic.",
	}, []string{"service", "dlq_type"}) // dlq_type: publish_failure | poison

	// RetryTotal counts per-event Kafka retry attempts.
	RetryTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "retry_total",
		Help:      "Total Kafka publish retry attempts.",
	}, []string{"service"})

	// BacklogGauge tracks the current known backlog size per service
	// (= batch size when last lease returned events).
	BacklogGauge = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "relay",
		Name:      "outbox_backlog",
		Help:      "Approximate number of PENDING outbox events seen in the last lease call.",
	}, []string{"service"})

	// PollCycleTotal counts complete poll cycles (lease → publish → ack/nack).
	PollCycleTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "relay",
		Name:      "poll_cycle_total",
		Help:      "Total number of completed poll cycles per service.",
	}, []string{"service"})

	// WorkerUp is 1 while the worker goroutine for a service is running.
	WorkerUp = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "relay",
		Name:      "worker_up",
		Help:      "1 if the worker for this service is running, 0 otherwise.",
	}, []string{"service"})

	// InFlightPublishes tracks the current semaphore usage per service.
	InFlightPublishes = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "relay",
		Name:      "in_flight_publishes",
		Help:      "Current number of in-flight Kafka publish goroutines.",
	}, []string{"service"})
)
