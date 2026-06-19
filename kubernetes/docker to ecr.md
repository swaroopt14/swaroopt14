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

---

## Images Already on ECR Public (no mirroring needed)

These images are already switched to AWS ECR Public — no rate limits, no action needed:

| Component | Image | Source |
|-----------|-------|--------|
| Busybox (init containers) | `public.ecr.aws/docker/library/busybox:1.36` | ECR Public |
| Postgres | `public.ecr.aws/docker/library/postgres:16-alpine` | ECR Public |
| Redis | `public.ecr.aws/docker/library/redis:7-alpine` | ECR Public |
| Prometheus | `public.ecr.aws/bitnami/prometheus:2.51.0` | ECR Public |
| Node Exporter | `public.ecr.aws/bitnami/node-exporter:1.7.0` | ECR Public |
| Postgres Exporter | `public.ecr.aws/bitnami/postgres-exporter:0.15.0` | ECR Public |
| Kafka Exporter | `public.ecr.aws/bitnami/kafka-exporter:1.7.0` | ECR Public |
| Grafana | `public.ecr.aws/docker/library/grafana/grafana:10.4.0` | ECR Public |
| Curl (init jobs) | `public.ecr.aws/docker/library/curlimages/curl:8.7.1` | ECR Public |

---

## Images NOT from Docker Hub (no action needed)

| Component | Image | Source |
|-----------|-------|--------|
| Elasticsearch | `docker.elastic.co/elasticsearch/elasticsearch:8.13.0` | Elastic registry (no limit) |
| Kibana | `docker.elastic.co/kibana/kibana:8.13.0` | Elastic registry (no limit) |
| kube-state-metrics | `registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.12.0` | K8s registry (no limit) |
| OTel Collector | `otel/opentelemetry-collector-contrib:0.96.0` | Docker Hub (low pull frequency) |
| Jaeger | `jaegertracing/all-in-one:1.55` | Docker Hub (low pull frequency) |

---

## When to Re-run This Guide

- After deleting entire infrastructure and redeploying from scratch
- When upgrading image versions (e.g., Kong 3.9 → 4.0)
- When adding new third-party images

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
```

---

**Last Updated:** June 2025
**Author:** Yaswanth Reddy — Lead DevOps Engineer, Arealis Networks
