# Observability Stack — Metrics, Logs, Traces

Three independent stacks deployed separately. All accessible via custom subdomains with authentication.

---

## Architecture

```
                         ┌── grafana.zordnet.com ──→ Grafana (metrics dashboards)
1 Shared ALB ───────────┼── kibana.zordnet.com  ──→ Kibana (log search & visualization)
(zord-observability)     └── jaeger.zordnet.com  ──→ Jaeger (distributed traces)
```

```
Your Services (zord namespace)
    │
    ├── /metrics endpoint ──→ Prometheus (scrapes every 15s) ──→ Grafana (visualizes)
    │
    ├── stdout/stderr logs ──→ Fluentd (DaemonSet, every node) ──→ Elasticsearch ──→ Kibana (search)
    │
    └── OTLP traces ──→ OTel Collector ──→ Jaeger (trace viewer)
```

---

## Structure

```
kubernetes/
├── monitoring/                     ← Prometheus + Grafana (metrics)
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── ingress.yaml                ← grafana.zordnet.com
│   ├── prometheus/
│   │   ├── rbac.yaml
│   │   ├── configmap.yaml
│   │   ├── deployment.yaml         ← 20Gi persistent storage
│   │   └── service.yaml
│   └── grafana/
│       ├── secret.yaml             ← admin credentials
│       ├── datasources.yaml        ← Prometheus + Elasticsearch + Jaeger
│       ├── deployment.yaml         ← 5Gi persistent storage
│       └── service.yaml
│
├── logging/                        ← Elasticsearch + Fluentd + Kibana (logs)
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── ingress.yaml                ← kibana.zordnet.com
│   ├── elasticsearch/
│   │   ├── statefulset.yaml        ← 50Gi persistent storage, security enabled
│   │   └── service.yaml
│   ├── kibana/
│   │   ├── secret.yaml             ← elastic credentials
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   └── fluentd/
│       ├── rbac.yaml
│       ├── configmap.yaml          ← log parsing + enrichment rules
│       ├── daemonset.yaml          ← runs on every node
│       └── service.yaml
│
└── tracing/                        ← OpenTelemetry + Jaeger (traces)
    ├── kustomization.yaml
    ├── namespace.yaml
    ├── ingress.yaml                ← jaeger.zordnet.com
    ├── otel-collector/
    │   ├── configmap.yaml
    │   ├── deployment.yaml
    │   └── service.yaml
    └── jaeger/
        ├── secret.yaml             ← basic auth credentials
        ├── auth-config.yaml        ← Nginx reverse proxy config
        ├── deployment.yaml         ← 10Gi persistent storage + auth sidecar
        └── service.yaml
```

---

## Deploy

Each stack is independent. Deploy in any order:

```bash
# Metrics (Prometheus + Grafana)
kubectl apply -k kubernetes/monitoring

# Logs (Elasticsearch + Fluentd + Kibana)
kubectl apply -k kubernetes/logging

# Traces (OpenTelemetry + Jaeger)
kubectl apply -k kubernetes/tracing
```

---

## Verify

```bash
# Check all pods
kubectl get pods -n monitoring
kubectl get pods -n logging
kubectl get pods -n tracing

# Check ingresses (all share 1 ALB)
kubectl get ingress -n monitoring
kubectl get ingress -n logging
kubectl get ingress -n tracing
```

---

## Access UIs (Custom Subdomains)

| Tool | URL | Username | Password | Secret File |
|------|-----|----------|----------|-------------|
| **Grafana** | `https://grafana.zordnet.com` | admin | zord-grafana-2026 | `monitoring/grafana/secret.yaml` |
| **Kibana** | `https://kibana.zordnet.com` | elastic | zord-elastic-2026 | `logging/kibana/secret.yaml` |
| **Jaeger** | `https://jaeger.zordnet.com` | admin | zord-jaeger-2026 | `tracing/jaeger/secret.yaml` |

**To change passwords:** Edit the secret file → redeploy → restart the pod.

---

## DNS Setup

All 3 subdomains share 1 ALB (via `group.name: zord-observability`).

After deploying, get the ALB address:

```bash
kubectl get ingress -n monitoring
```

Copy the ALB DNS name and create these DNS records:

| Record | Type | Value |
|--------|------|-------|
| `grafana.zordnet.com` | CNAME | (observability ALB DNS) |
| `kibana.zordnet.com` | CNAME | (observability ALB DNS) |
| `jaeger.zordnet.com` | CNAME | (observability ALB DNS) |

**Note:** Your ACM certificate must cover `*.zordnet.com` (wildcard) for HTTPS to work on these subdomains.

---

## How Each Stack Works

### Monitoring (Prometheus + Grafana)

- **Prometheus** scrapes `/metrics` from all services every 15s
- Scrapes both `zord` and `api-gateway` namespaces (including Kong)
- Services are auto-discovered via `prometheus.io/scrape: "true"` pod annotation
- Data retained for 15 days (20Gi storage)
- **Grafana** visualizes Prometheus data as dashboards
- Pre-configured datasources: Prometheus, Elasticsearch, Jaeger
- Import Kong dashboard (ID `7424`) for API gateway metrics

### Logging (Elasticsearch + Fluentd + Kibana)

- **Fluentd** runs on every node (DaemonSet), collects all pod logs
- Enriches logs with Kubernetes metadata (namespace, pod, service name)
- Ships to Elasticsearch with authentication
- Logs indexed as `zord-logs-YYYY.MM.DD`
- Kong access logs indexed as `kong-access-YYYY.MM.DD`
- **Kibana** provides search, filtering, and visualization
- Login required (elastic / zord-elastic-2026)
- 50Gi storage for Elasticsearch

### Tracing (OpenTelemetry + Jaeger)

- **OTel Collector** receives traces via OTLP (gRPC:4317, HTTP:4318)
- Batches and forwards to Jaeger
- **Jaeger** stores traces in Badger (10Gi persistent storage)
- Protected by Nginx basic auth sidecar
- Login required (admin / zord-jaeger-2026)

---

## Connect Your Services to Tracing

All services that have this env var will automatically send traces:

```yaml
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: http://otel-collector.tracing.svc.cluster.local:4318
```

**Already configured (via `zord-aws-config` ConfigMap):**
- zord-edge
- zord-intent-engine
- zord-token-enclave
- zord-intelligence

**For zord-relay (requires manual enable):**

After deploying the tracing stack, edit `kubernetes/eks/services/zord-relay/deployment.yaml`:

```yaml
# Change:
- name: RELAY_TRACING_ENABLED
  value: "false"

# To:
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

---

## Authentication Summary

| Tool | Auth Method | How it works |
|------|-------------|-------------|
| **Grafana** | Built-in login | Grafana has its own user management. Credentials from K8s Secret. |
| **Kibana** | Elasticsearch security (xpack) | Kibana authenticates against Elasticsearch. Credentials from K8s Secret. |
| **Jaeger** | Nginx basic auth sidecar | Nginx sits in front of Jaeger, requires htpasswd login. Credentials from K8s Secret. |

---

## Resource Allocation

| Component | CPU (req/limit) | Memory (req/limit) | Storage |
|-----------|----------------|-------------------|---------|
| Prometheus | 250m / 1 | 512Mi / 2Gi | 20Gi PVC |
| Grafana | 100m / 500m | 256Mi / 512Mi | 5Gi PVC |
| Elasticsearch | 500m / 2 | 2Gi / 3Gi | 50Gi PVC |
| Kibana | 200m / 1 | 512Mi / 1Gi | — |
| Fluentd (per node) | 100m / 500m | 256Mi / 512Mi | — |
| OTel Collector | 100m / 500m | 256Mi / 512Mi | — |
| Jaeger | 100m / 500m | 256Mi / 1Gi | 10Gi PVC |
| Jaeger auth proxy | 10m / 50m | 16Mi / 32Mi | — |

---

## Grafana Dashboards to Import

After logging into Grafana, import these dashboards:

| Dashboard | ID | What it shows |
|-----------|-----|--------------|
| Kong Official | 7424 | API gateway traffic, latency, errors |
| Kubernetes Cluster | 6417 | Node CPU, memory, pod status |
| Node Exporter | 1860 | Detailed node metrics |

Import: Grafana → Dashboards → Import → Enter ID → Load

---

## Kibana: First-Time Setup

After logging into Kibana:

1. Go to **Stack Management** → **Index Patterns**
2. Create index pattern: `zord-logs-*`
3. Set time field: `@timestamp`
4. Create another: `kong-access-*`
5. Go to **Discover** → Select `zord-logs-*` → See all service logs

**Useful filters:**
- `service: "zord-edge"` — show only edge logs
- `namespace: "zord"` — show only app logs
- `namespace: "api-gateway"` — show only Kong logs
- `stream: "stderr"` — show only errors

---

## Troubleshooting

### Grafana shows "No data"

```bash
kubectl logs -n monitoring deploy/prometheus --tail=20
```

Check:
- Prometheus is scraping targets: open Grafana → Explore → Prometheus → query `up`
- Services have `prometheus.io/scrape: "true"` annotation

### Kibana shows "No indices"

```bash
kubectl logs -n logging deploy/kibana --tail=20
kubectl logs -n logging -l app=fluentd --tail=20
```

Check:
- Elasticsearch is running: `kubectl get pods -n logging`
- Fluentd is shipping logs: check fluentd pod logs for errors
- Create index pattern in Kibana: `zord-logs-*`

### Jaeger shows no traces

```bash
kubectl logs -n tracing deploy/otel-collector --tail=20
kubectl logs -n tracing deploy/jaeger --tail=20
```

Check:
- OTel collector is receiving: check collector logs
- Services have `OTEL_EXPORTER_OTLP_ENDPOINT` env var set
- Tracing stack is deployed before enabling tracing in services

### ALB not created for observability

```bash
kubectl describe ingress -n monitoring
```

Check:
- AWS Load Balancer Controller is installed
- ACM certificate covers `*.zordnet.com`
- All 3 ingresses have same `group.name: zord-observability`

---

## Destroy

### Destroy Observability Only

```bash
# Delete tracing (Jaeger + OTel Collector)
kubectl delete -k kubernetes/tracing

# Delete logging (Elasticsearch + Fluentd + Kibana)
kubectl delete -k kubernetes/logging

# Delete monitoring (Prometheus + Grafana)
kubectl delete -k kubernetes/monitoring

# Verify namespaces are gone
kubectl get ns | grep -E "monitoring|logging|tracing"
```

**Warning:** This deletes all stored metrics, logs, and traces. PVCs (persistent data) are also deleted.

---

### Destroy Everything (Full Platform Teardown)

Run in this order (reverse of deploy order):

```bash
# Step 1: Delete Argo CD (if deployed)
kubectl delete -f kubernetes/argocd/apps/
kubectl delete -f kubernetes/argocd/ingress.yaml
kubectl delete -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.3/manifests/install.yaml
kubectl delete -f kubernetes/argocd/namespace.yaml

# Step 2: Delete Observability
kubectl delete -k kubernetes/tracing
kubectl delete -k kubernetes/logging
kubectl delete -k kubernetes/monitoring

# Step 3: Delete Kong API Gateway
kubectl delete -k kubernetes/api-gateway

# Step 4: Delete Application Services
kubectl delete -k kubernetes/eks

# Step 5: Delete PVCs (persistent data — IRREVERSIBLE)
kubectl delete pvc --all -n zord
kubectl delete pvc --all -n monitoring
kubectl delete pvc --all -n logging
kubectl delete pvc --all -n tracing

# Step 6: Delete namespaces (cleanup)
kubectl delete ns zord
kubectl delete ns api-gateway
kubectl delete ns monitoring
kubectl delete ns logging
kubectl delete ns tracing
kubectl delete ns argocd

# Step 7: Verify everything is gone
kubectl get ns
kubectl get pods --all-namespaces | grep -E "zord|kong|grafana|kibana|jaeger|argocd|prometheus|elasticsearch|fluentd"
```

### After Destroy — AWS Resources to Clean Up Manually

These are NOT deleted by `kubectl delete` — clean them up in AWS Console:

| Resource | Where | Action |
|----------|-------|--------|
| ALB (Kong) | EC2 → Load Balancers | Delete (auto-deleted after ingress removal, wait 5 min) |
| ALB (Observability) | EC2 → Load Balancers | Delete (auto-deleted after ingress removal, wait 5 min) |
| EBS Volumes | EC2 → Volumes | Delete any `Available` volumes tagged with `zord` |
| ECR Images | ECR → Repositories | Delete if no longer needed |
| Secrets Manager | Secrets Manager | Keep or delete `production/zord/*` secrets |
| EKS Cluster | EKS → Clusters | Delete via Terraform (`terraform destroy`) |
| Node Group | EKS → Compute | Deleted with cluster |
| IAM Roles | IAM → Roles | Delete `ZordAppS3AccessRole` if no longer needed |

### Quick Destroy (Single Command — Dangerous)

```bash
# THIS DELETES EVERYTHING IN ONE GO — NO CONFIRMATION
kubectl delete ns zord api-gateway monitoring logging tracing argocd --ignore-not-found
```

**Use only if you want to wipe the entire platform immediately.** All data is lost.

---

## Security Notes

- All UIs require authentication (no anonymous access)
- Credentials stored in Kubernetes Secrets (not hardcoded in deployments)
- Observability ALB is separate from the main app ALB
- Prometheus admin API is not exposed externally
- Elasticsearch is only accessible within the cluster (Kibana proxies to it)
- Jaeger collector ports (4317/4318) are internal-only (services send traces via K8s DNS)
