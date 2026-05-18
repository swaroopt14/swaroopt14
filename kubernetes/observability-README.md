# Observability Stack — Metrics, Logs, Traces

Three independent stacks, each deployed separately.

## Structure

```
kubernetes/
├── monitoring/     ← Prometheus + Grafana (metrics)
├── logging/        ← Loki + Promtail (logs)
└── tracing/        ← OpenTelemetry Collector + Jaeger (traces)
```

## Deploy

Each stack is independent. Deploy in any order:

```bash
# Metrics
kubectl apply -k kubernetes/monitoring

# Logs
kubectl apply -k kubernetes/logging

# Traces
kubectl apply -k kubernetes/tracing
```

## Verify

```bash
kubectl get pods -n monitoring
kubectl get pods -n logging
kubectl get pods -n tracing
```

## Access UIs

```bash
# Grafana (metrics — Prometheus dashboards)
kubectl port-forward -n monitoring svc/grafana 3000:3000 &
# Open: http://localhost:3000 (admin / zord-grafana-2026)

# Kibana (logs — search and visualize)
kubectl port-forward -n logging svc/kibana 5601:5601 &
# Open: http://localhost:5601

# Jaeger (traces UI)
kubectl port-forward -n tracing svc/jaeger-query 16686:16686 &
# Open: http://localhost:16686
```

## Connect Your Services to Tracing

Set this env var in your service deployments to send traces:

```yaml
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: http://otel-collector.tracing.svc.cluster.local:4318
```

**Already configured in these services (via `zord-aws-config` ConfigMap):**
- zord-edge
- zord-intent-engine
- zord-token-enclave

These services will automatically send traces when the tracing stack is deployed. They gracefully skip tracing if the endpoint is unreachable.

**For zord-relay (requires manual enable):**

After deploying `kubectl apply -k kubernetes/tracing`, edit this file:

```
kubernetes/eks/services/zord-relay/deployment.yaml
```

Change:
```yaml
- name: RELAY_TRACING_ENABLED
  value: "false"
```

To:
```yaml
- name: RELAY_TRACING_ENABLED
  value: "true"
- name: RELAY_TRACING_OTLP_ENDPOINT
  valueFrom:
    configMapKeyRef:
      name: zord-aws-config
      key: OTEL_EXPORTER_OTLP_ENDPOINT
```

Then redeploy:
```bash
kubectl apply -k kubernetes/eks
kubectl rollout restart deployment/zord-relay -n zord
```

**Important:** Do NOT enable relay tracing before deploying the tracing stack — relay will crash if the OTEL endpoint doesn't exist.

## What Each Stack Does

### Monitoring (Prometheus + Grafana)
- Prometheus scrapes `/metrics` from all services
- Grafana visualizes CPU, memory, request rates, latencies
- HPA already uses metrics-server; Prometheus adds detailed app metrics

### Logging (Elasticsearch + Fluentd + Kibana)
- Elasticsearch stores and indexes all logs (50Gi storage)
- Fluentd runs on every node (DaemonSet), collects all pod logs
- Kibana provides search and visualization UI
- Logs are indexed as `zord-logs-YYYY.MM.DD`
- Query logs by service, namespace, pod, container

### Tracing (OpenTelemetry + Jaeger)
- OTel Collector receives traces from services via OTLP
- Forwards to Jaeger for storage and visualization
- See request flow across all 9 microservices

## Destroy

```bash
kubectl delete -k kubernetes/monitoring
kubectl delete -k kubernetes/logging
kubectl delete -k kubernetes/tracing
```
