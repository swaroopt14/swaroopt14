package tracing

import (
	"context"
	"log"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
)

// Tracer is the global tracer for zord-relay.
// Use this to start spans in the dispatch loop and relay loop.
var Tracer trace.Tracer

// Init initialises OpenTelemetry tracing.
// If OTEL_EXPORTER_OTLP_ENDPOINT is not set, tracing is a no-op —
// spans are created but immediately discarded. Safe for local development.
// Returns a cleanup function that must be called on shutdown.
func Init(serviceName string) func() {
	ctx := context.Background()

	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		// No exporter configured — use a no-op tracer.
		// Spans will still be created and propagated so trace_id is correct,
		// but nothing is exported.
		log.Println("tracing: OTEL_EXPORTER_OTLP_ENDPOINT not set — running with no-op exporter")
		Tracer = otel.Tracer(serviceName)
		return func() {}
	}

	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpoint(endpoint),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		log.Fatalf("tracing: failed to create OTLP exporter: %v", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
		),
	)
	if err != nil {
		log.Fatalf("tracing: failed to create resource: %v", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		// Sample 100% of traces in development.
		// In production, set OTEL_TRACES_SAMPLER=parentbased_traceidratio
		// and OTEL_TRACES_SAMPLER_ARG=0.1 for 10% sampling.
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)

	otel.SetTracerProvider(tp)
	Tracer = otel.Tracer(serviceName)

	log.Printf("tracing: initialised with OTLP endpoint %s", endpoint)

	return func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := tp.Shutdown(ctx); err != nil {
			log.Printf("tracing: shutdown error: %v", err)
		}
	}
}
