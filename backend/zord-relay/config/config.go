package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config is the root configuration for the relay service.
type Config struct {
	Relay    RelayConfig     `mapstructure:"relay"`
	Kafka    KafkaConfig     `mapstructure:"kafka"`
	Services []ServiceConfig `mapstructure:"services"`
	Tracing  TracingConfig   `mapstructure:"tracing"`
	Metrics  MetricsConfig   `mapstructure:"metrics"`
}

// RelayConfig holds global relay behaviour settings.
type RelayConfig struct {
	// Unique identity for this relay instance (used in lease ownership + logs).
	// Defaults to hostname. Should be set to pod name in Kubernetes.
	InstanceID string `mapstructure:"instance_id"`

	// PollInterval is how long a worker sleeps between lease cycles when the
	// upstream outbox is empty.
	PollInterval time.Duration `mapstructure:"poll_interval"`

	// LeaseLimit is the default batch size for /lease calls.
	LeaseLimit int `mapstructure:"lease_limit"`

	// LeaseTTLSeconds is the lease lock duration requested from upstream.
	LeaseTTLSeconds int `mapstructure:"lease_ttl_seconds"`

	// MaxPublishConcurrency is the semaphore size — max in-flight Kafka publishes
	// per worker at any time. Controls backpressure.
	MaxPublishConcurrency int `mapstructure:"max_publish_concurrency"`

	// ShutdownTimeout is how long we wait for in-flight work to finish on SIGTERM.
	ShutdownTimeout time.Duration `mapstructure:"shutdown_timeout"`
}

// KafkaConfig holds all Kafka connection and auth settings.
type KafkaConfig struct {
	// Brokers is the comma-separated list of bootstrap servers.
	Brokers string `mapstructure:"brokers"`

	// Auth — SASL/SCRAM-SHA-512 (recommended for fintech).
	SASLMechanism string `mapstructure:"sasl_mechanism"` // SCRAM-SHA-512
	SASLUsername  string `mapstructure:"sasl_username"`
	SASLPassword  string `mapstructure:"sasl_password"`

	// TLS — should be true in production.
	TLSEnabled bool `mapstructure:"tls_enabled"`

	// Producer tuning.
	// Acks: "all" = strongest durability guarantee (required for fintech).
	Acks              string        `mapstructure:"acks"`
	LingerMs          int           `mapstructure:"linger_ms"`
	CompressionType   string        `mapstructure:"compression_type"` // snappy / lz4 / zstd
	MessageMaxBytes   int           `mapstructure:"message_max_bytes"`
	DeliveryTimeout   time.Duration `mapstructure:"delivery_timeout"`

	// DLQ topics.
	DLQPublishFailureTopic string `mapstructure:"dlq_publish_failure_topic"`
	DLQPoisonTopic         string `mapstructure:"dlq_poison_topic"`
}

// ServiceConfig describes one upstream service that relay polls.
type ServiceConfig struct {
	// Name is a short identifier used in logs and metrics labels.
	Name string `mapstructure:"name"`

	// BaseURL is the root URL of the upstream service.
	// e.g. http://intent-engine.payments.svc.cluster.local
	BaseURL string `mapstructure:"base_url"`

	// AuthToken is the shared secret sent as X-Relay-Token header.
	// Each service should have its own token.
	AuthToken string `mapstructure:"auth_token"`

	// HTTPTimeout for lease/ack/nack calls to this service.
	HTTPTimeout time.Duration `mapstructure:"http_timeout"`

	// Topic is the default Kafka topic to publish to.
	// Individual events override this if the outbox row carries a topic field.
	DefaultTopic string `mapstructure:"default_topic"`

	// Retry settings (Kafka-side) — override global if set.
	MaxRetryAttempts int           `mapstructure:"max_retry_attempts"`
	RetryBaseDelay   time.Duration `mapstructure:"retry_base_delay"`
	RetryMaxDelay    time.Duration `mapstructure:"retry_max_delay"`
}

// TracingConfig holds OpenTelemetry settings.
type TracingConfig struct {
	Enabled      bool   `mapstructure:"enabled"`
	OTLPEndpoint string `mapstructure:"otlp_endpoint"` // e.g. http://tempo:4318
	ServiceName  string `mapstructure:"service_name"`
	Environment  string `mapstructure:"environment"` // production / staging
}

// MetricsConfig holds Prometheus settings.
type MetricsConfig struct {
	Enabled bool   `mapstructure:"enabled"`
	Addr    string `mapstructure:"addr"` // e.g. :9090
}

// Load reads configuration from file + env vars.
// Environment variables override file values.
// Prefix: RELAY_ (e.g. RELAY_KAFKA_SASL_PASSWORD)
func Load() (*Config, error) {
	v := viper.New()

	// --- Defaults ---
	v.SetDefault("relay.poll_interval", "2s")
	v.SetDefault("relay.lease_limit", 500)
	v.SetDefault("relay.lease_ttl_seconds", 120)
	v.SetDefault("relay.max_publish_concurrency", 10)
	v.SetDefault("relay.shutdown_timeout", "30s")

	v.SetDefault("kafka.sasl_mechanism", "SCRAM-SHA-512")
	v.SetDefault("kafka.tls_enabled", true)
	v.SetDefault("kafka.acks", "all")
	v.SetDefault("kafka.linger_ms", 5)
	v.SetDefault("kafka.compression_type", "snappy")
	v.SetDefault("kafka.message_max_bytes", 1048576) // 1 MiB
	v.SetDefault("kafka.delivery_timeout", "30s")
	v.SetDefault("kafka.dlq_publish_failure_topic", "relay.dlq.publish_failure")
	v.SetDefault("kafka.dlq_poison_topic", "relay.dlq.poison")

	v.SetDefault("tracing.enabled", true)
	v.SetDefault("tracing.service_name", "relay-service")
	v.SetDefault("tracing.environment", "production")

	v.SetDefault("metrics.enabled", true)
	v.SetDefault("metrics.addr", ":9090")

	// --- File ---
	v.SetConfigName("config")
	v.SetConfigType("yaml")
	v.AddConfigPath(".")
	v.AddConfigPath("./config")
	v.AddConfigPath("/etc/relay")

	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("reading config file: %w", err)
		}
		// Config file is optional; env vars alone are valid.
	}

	// --- Environment variable overrides ---
	v.SetEnvPrefix("RELAY")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unmarshalling config: %w", err)
	}

	if err := cfg.validate(); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	return &cfg, nil
}

func (c *Config) validate() error {
	if c.Kafka.Brokers == "" {
		return fmt.Errorf("kafka.brokers is required")
	}
	if len(c.Services) == 0 {
		return fmt.Errorf("at least one service must be configured under services[]")
	}
	for i, svc := range c.Services {
		if svc.Name == "" {
			return fmt.Errorf("services[%d].name is required", i)
		}
		if svc.BaseURL == "" {
			return fmt.Errorf("services[%d].base_url is required (service: %s)", i, svc.Name)
		}
		if svc.AuthToken == "" {
			return fmt.Errorf("services[%d].auth_token is required (service: %s)", i, svc.Name)
		}
		if svc.DefaultTopic == "" {
			return fmt.Errorf("services[%d].default_topic is required (service: %s)", i, svc.Name)
		}
	}
	if c.Tracing.Enabled && c.Tracing.OTLPEndpoint == "" {
		return fmt.Errorf("tracing.otlp_endpoint is required when tracing is enabled")
	}
	return nil
}

// RetryConfig returns resolved retry settings for a given service,
// falling back to sane production defaults.
func (s *ServiceConfig) RetryConfig() (maxAttempts int, baseDelay, maxDelay time.Duration) {
	maxAttempts = s.MaxRetryAttempts
	if maxAttempts <= 0 {
		maxAttempts = 20
	}
	baseDelay = s.RetryBaseDelay
	if baseDelay <= 0 {
		baseDelay = 1 * time.Second
	}
	maxDelay = s.RetryMaxDelay
	if maxDelay <= 0 {
		maxDelay = 5 * time.Minute
	}
	return
}
