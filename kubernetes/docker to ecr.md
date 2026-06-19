# Docker Hub → ECR Mirror Guide

Mirror third-party Docker Hub images to your private ECR to avoid Docker Hub rate limits.
Run these commands **once** from the Bastion EC2 instance. After that, images are permanently in your ECR.

---

## Step 1: Login to ECR

```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 522189039032.dkr.ecr.ap-south-1.amazonaws.com
```

---

## Step 2: Create ECR Repos (one-time)

```bash
aws ecr create-repository --repository-name mirror/kong --region ap-south-1
aws ecr create-repository --repository-name mirror/konga --region ap-south-1
aws ecr create-repository --repository-name mirror/cp-kafka --region ap-south-1
aws ecr create-repository --repository-name mirror/fluentd --region ap-south-1
aws ecr create-repository --repository-name mirror/curl --region ap-south-1
aws ecr create-repository --repository-name mirror/grafana --region ap-south-1
aws ecr create-repository --repository-name mirror/prometheus --region ap-south-1
aws ecr create-repository --repository-name mirror/node-exporter --region ap-south-1
aws ecr create-repository --repository-name mirror/postgres-exporter --region ap-south-1
aws ecr create-repository --repository-name mirror/kafka-exporter --region ap-south-1
```

---

## Step 3: Pull → Tag → Push (one-time per image)

### Kong Gateway

```bash
docker pull kong:3.9
docker tag kong:3.9 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kong:3.9
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kong:3.9
```

### Kong Admin UI (Konga)

```bash
docker pull pantsel/konga:0.14.9
docker tag pantsel/konga:0.14.9 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/konga:0.14.9
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/konga:0.14.9
```

### Confluent Kafka

```bash
docker pull confluentinc/cp-kafka:7.6.0
docker tag confluentinc/cp-kafka:7.6.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/cp-kafka:7.6.0
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/cp-kafka:7.6.0
```

### Fluentd

```bash
docker pull fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch8-1
docker tag fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch8-1 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/fluentd:v1.16-debian-elasticsearch8-1
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/fluentd:v1.16-debian-elasticsearch8-1
```

### Curl (Kibana Init Job)

```bash
docker pull curlimages/curl:8.7.1
docker tag curlimages/curl:8.7.1 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/curl:8.7.1
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/curl:8.7.1
```

### Grafana

```bash
docker pull grafana/grafana:10.4.0
docker tag grafana/grafana:10.4.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/grafana:10.4.0
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/grafana:10.4.0
```

### Prometheus

```bash
docker pull prom/prometheus:v2.51.0
docker tag prom/prometheus:v2.51.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/prometheus:v2.51.0
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/prometheus:v2.51.0
```

### Node Exporter

```bash
docker pull prom/node-exporter:v1.7.0
docker tag prom/node-exporter:v1.7.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/node-exporter:v1.7.0
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/node-exporter:v1.7.0
```

### Postgres Exporter

```bash
docker pull prometheuscommunity/postgres-exporter:v0.15.0
docker tag prometheuscommunity/postgres-exporter:v0.15.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/postgres-exporter:v0.15.0
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/postgres-exporter:v0.15.0
```

### Kafka Exporter

```bash
docker pull danielqsj/kafka-exporter:v1.7.0
docker tag danielqsj/kafka-exporter:v1.7.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kafka-exporter:v1.7.0
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kafka-exporter:v1.7.0
```

---

## Step 4: Update Manifest Files

After pushing images to ECR, update these files to use your ECR mirror:

### Kong Gateway

**File:** `kubernetes/api-gateway/kong/deployment.yaml`

```yaml
# Change:
image: kong:3.9
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kong:3.9
```

### Kong Admin UI (Konga)

**File:** `kubernetes/api-gateway/kong-admin-ui/deployment.yaml`

```yaml
# Change:
image: pantsel/konga:0.14.9
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/konga:0.14.9
```

### Kafka (StatefulSet + Topics Job)

**File:** `kubernetes/eks/infrastructure/kafka/statefulset.yaml`
**File:** `kubernetes/eks/infrastructure/kafka/topic-job.yaml`

```yaml
# Change:
image: confluentinc/cp-kafka:7.6.0
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/cp-kafka:7.6.0
```

### Fluentd

**File:** `kubernetes/logging/fluentd/daemonset.yaml`

```yaml
# Change:
image: fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch8-1
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/fluentd:v1.16-debian-elasticsearch8-1
```

### Curl (Kibana Init Job)

**File:** `kubernetes/logging/kibana/init-job.yaml`

```yaml
# Change:
image: curlimages/curl:8.7.1
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/curl:8.7.1
```

### Grafana

**File:** `kubernetes/monitoring/grafana/deployment.yaml`

```yaml
# Change:
image: grafana/grafana:10.4.0
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/grafana:10.4.0
```

### Prometheus

**File:** `kubernetes/monitoring/prometheus/deployment.yaml`

```yaml
# Change:
image: prom/prometheus:v2.51.0
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/prometheus:v2.51.0
```

### Node Exporter

**File:** `kubernetes/monitoring/node-exporter/daemonset.yaml`

```yaml
# Change:
image: prom/node-exporter:v1.7.0
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/node-exporter:v1.7.0
```

### Postgres Exporter

**File:** `kubernetes/monitoring/postgres-exporter/deployment.yaml`

```yaml
# Change:
image: prometheuscommunity/postgres-exporter:v0.15.0
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/postgres-exporter:v0.15.0
```

### Kafka Exporter

**File:** `kubernetes/monitoring/kafka-exporter/deployment.yaml`

```yaml
# Change:
image: danielqsj/kafka-exporter:v1.7.0
# To:
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kafka-exporter:v1.7.0
```

---

## Images NOT from Docker Hub (no mirroring needed)

These images are from registries that have no rate limits:

| Component | Image | Source |
|-----------|-------|--------|
| Busybox (init containers) | `public.ecr.aws/docker/library/busybox:1.36` | ECR Public |
| Postgres | `public.ecr.aws/docker/library/postgres:16-alpine` | ECR Public |
| Redis | `public.ecr.aws/docker/library/redis:7-alpine` | ECR Public |
| Elasticsearch | `docker.elastic.co/elasticsearch/elasticsearch:8.13.0` | Elastic registry (no limit) |
| Kibana | `docker.elastic.co/kibana/kibana:8.13.0` | Elastic registry (no limit) |
| kube-state-metrics | `registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.12.0` | K8s registry (no limit) |
| OTel Collector | `otel/opentelemetry-collector-contrib:0.96.0` | Docker Hub (low pull frequency) |
| Jaeger | `jaegertracing/all-in-one:1.55` | Docker Hub (low pull frequency) |

---

## When to Re-run This Guide

- **Before first fresh deploy** — run all pull+push commands once
- After deleting entire infrastructure and redeploying from scratch
- When upgrading image versions (e.g., Kong 3.9 → 4.0)
- When adding new third-party images

> **NOTE:** The manifest files already point to your ECR mirror images.
> You only need to run the docker pull/push commands if the ECR repos are empty
> (first time setup or after deleting ECR repos).

---

## Quick Copy-Paste (All in One)

```bash
# Login
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 522189039032.dkr.ecr.ap-south-1.amazonaws.com

# Kong
docker pull kong:3.9 && docker tag kong:3.9 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kong:3.9 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kong:3.9

# Konga
docker pull pantsel/konga:0.14.9 && docker tag pantsel/konga:0.14.9 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/konga:0.14.9 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/konga:0.14.9

# Kafka
docker pull confluentinc/cp-kafka:7.6.0 && docker tag confluentinc/cp-kafka:7.6.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/cp-kafka:7.6.0 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/cp-kafka:7.6.0

# Fluentd
docker pull fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch8-1 && docker tag fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch8-1 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/fluentd:v1.16-debian-elasticsearch8-1 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/fluentd:v1.16-debian-elasticsearch8-1

# Curl
docker pull curlimages/curl:8.7.1 && docker tag curlimages/curl:8.7.1 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/curl:8.7.1 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/curl:8.7.1

# Grafana
docker pull grafana/grafana:10.4.0 && docker tag grafana/grafana:10.4.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/grafana:10.4.0 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/grafana:10.4.0

# Prometheus
docker pull prom/prometheus:v2.51.0 && docker tag prom/prometheus:v2.51.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/prometheus:v2.51.0 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/prometheus:v2.51.0

# Node Exporter
docker pull prom/node-exporter:v1.7.0 && docker tag prom/node-exporter:v1.7.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/node-exporter:v1.7.0 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/node-exporter:v1.7.0

# Postgres Exporter
docker pull prometheuscommunity/postgres-exporter:v0.15.0 && docker tag prometheuscommunity/postgres-exporter:v0.15.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/postgres-exporter:v0.15.0 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/postgres-exporter:v0.15.0

# Kafka Exporter
docker pull danielqsj/kafka-exporter:v1.7.0 && docker tag danielqsj/kafka-exporter:v1.7.0 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kafka-exporter:v1.7.0 && docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/mirror/kafka-exporter:v1.7.0
```

---

**Last Updated:** June 2025
**Author:** Yaswanth Reddy — Lead DevOps Engineer, Arealis Networks
