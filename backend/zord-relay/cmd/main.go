package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"

	"zord-relay/config"
	"zord-relay/logger"
	"zord-relay/publisher"
	"zord-relay/shutdown"
	"zord-relay/tracing"
	"zord-relay/worker"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "relay: fatal: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	// --- Config ---
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	// --- Instance ID ---
	// Use hostname (pod name in Kubernetes) if not set explicitly.
	instanceID := cfg.Relay.InstanceID
	if instanceID == "" {
		if h, err := os.Hostname(); err == nil {
			instanceID = h
		} else {
			instanceID = "relay-unknown"
		}
		cfg.Relay.InstanceID = instanceID
	}

	// --- Logger ---
	log, err := logger.New("relay-service", instanceID, cfg.Tracing.Environment)
	if err != nil {
		return fmt.Errorf("building logger: %w", err)
	}
	defer log.Sync() //nolint:errcheck

	log.Info("relay-service starting",
		zap.String("instance_id", instanceID),
		zap.Int("services", len(cfg.Services)),
	)

	// --- Tracing ---
	var tracingProvider *tracing.Provider
	if cfg.Tracing.Enabled {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		tracingProvider, err = tracing.Init(
			ctx,
			cfg.Tracing.ServiceName,
			cfg.Tracing.Environment,
			cfg.Tracing.OTLPEndpoint,
		)
		if err != nil {
			// Tracing failure is non-fatal — log and continue.
			log.Warn("failed to initialise tracing, continuing without it", zap.Error(err))
			tracingProvider = nil
		} else {
			log.Info("tracing initialised", zap.String("endpoint", cfg.Tracing.OTLPEndpoint))
		}
	}

	// --- Kafka Publisher ---
	kafkaPublisher, err := publisher.NewKafkaPublisher(cfg.Kafka, log)
	if err != nil {
		return fmt.Errorf("creating kafka publisher: %w", err)
	}

	// --- Scheduler ---
	sched, err := worker.NewScheduler(cfg, kafkaPublisher, log)
	if err != nil {
		return fmt.Errorf("creating scheduler: %w", err)
	}

	// --- Metrics HTTP server ---
	var metricsSrv *http.Server
	if cfg.Metrics.Enabled {
		gin.SetMode(gin.ReleaseMode)
		r := gin.New()
		r.Use(gin.Recovery())

		r.GET("/metrics", gin.WrapH(promhttp.Handler()))
		r.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})
		r.GET("/ready", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ready"})
		})

		metricsSrv = &http.Server{
			Addr:         cfg.Metrics.Addr,
			Handler:      r,
			ReadTimeout:  5 * time.Second,
			WriteTimeout: 10 * time.Second,
			IdleTimeout:  30 * time.Second,
		}
		go func() {
			log.Info("metrics server listening", zap.String("addr", cfg.Metrics.Addr))
			if err := metricsSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Error("metrics server error", zap.Error(err))
			}
		}()
	}

	// --- Run workers in background ---
	ctx, cancelWorkers := context.WithCancel(context.Background())

	workersDone := make(chan struct{})
	go func() {
		defer close(workersDone)
		sched.Run(ctx)
	}()

	// --- Graceful shutdown ---
	shutdownCoord := shutdown.New(cfg.Relay.ShutdownTimeout, log)
	shutdownCoord.WaitForSignal(
		func(ctx context.Context) error {
			log.Info("stopping workers...")
			cancelWorkers()
			select {
			case <-workersDone:
				log.Info("all workers drained")
			case <-ctx.Done():
				log.Warn("shutdown timeout: workers did not drain in time")
			}
			return nil
		},
		func(ctx context.Context) error {
			if metricsSrv != nil {
				log.Info("shutting down metrics server...")
				return metricsSrv.Shutdown(ctx)
			}
			return nil
		},
		func(ctx context.Context) error {
			log.Info("flushing kafka producer...")
			return kafkaPublisher.Close()
		},
		func(ctx context.Context) error {
			if tracingProvider != nil {
				log.Info("flushing traces...")
				return tracingProvider.Shutdown(ctx)
			}
			return nil
		},
	)

	return nil
}
