# Zord Endpoint Links

Namespace: `arealis-zord`

## External Endpoints

- Frontend (zord-console): `http://<LOADBALANCER_IP>/` (service port `80`)
- Edge API (zord-edge): `http://<LOADBALANCER_IP>:8080/`

## Ingress Endpoints (Observability)

- Grafana: `http://grafana.zord.local/`
- Prometheus: `http://prometheus.zord.local/`
- Jaeger: `http://jaeger.zord.local/`

If using Minikube locally, map hosts and use ingress controller port-forward/tunnel.

## Internal Service Endpoints (Cluster DNS)

- zord-console: `http://zord-console.arealis-zord.svc.cluster.local:80`
- zord-edge: `http://zord-edge.arealis-zord.svc.cluster.local:8080`
- zord-intent-engine: `http://zord-intent-engine.arealis-zord.svc.cluster.local:8083`
- zord-relay: `http://zord-relay.arealis-zord.svc.cluster.local:8081`
- zord-relay health: `http://zord-relay.arealis-zord.svc.cluster.local:8082`
- zord-token-enclave: `http://zord-token-enclave.arealis-zord.svc.cluster.local:8087`
- zord-prompt-layer: `http://zord-prompt-layer.arealis-zord.svc.cluster.local:8086`

## Infra/Internal Endpoints

- Edge Postgres: `zord-edge-postgres.arealis-zord.svc.cluster.local:5432`
- Intent Postgres: `zord-intent-postgres.arealis-zord.svc.cluster.local:5432`
- Relay Postgres: `zord-relay-postgres.arealis-zord.svc.cluster.local:5432`
- Token Enclave Postgres: `zord-token-enclave-postgres.arealis-zord.svc.cluster.local:5432`
- Redis: `zord-redis.arealis-zord.svc.cluster.local:6379`
- Kafka: `zord-kafka.arealis-zord.svc.cluster.local:9092`
- Chroma: `http://chroma.arealis-zord.svc.cluster.local:8000`

## Observability Internal Endpoints

- OTEL Collector gRPC: `otel-collector.arealis-zord.svc.cluster.local:4317`
- OTEL Collector HTTP: `otel-collector.arealis-zord.svc.cluster.local:4318`
- OTEL Collector metrics: `http://otel-collector.arealis-zord.svc.cluster.local:8888/metrics`
- Prometheus: `http://prometheus.arealis-zord.svc.cluster.local:9090`
- Grafana: `http://grafana.arealis-zord.svc.cluster.local:3000`
- Loki: `http://loki.arealis-zord.svc.cluster.local:3100`
- Jaeger UI: `http://jaeger.arealis-zord.svc.cluster.local:16686`
