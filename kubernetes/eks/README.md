# EKS Deployment Manifests

These manifests are now split into a real-world style layout: one YAML per Kubernetes resource, grouped by responsibility.

## Folder Layout

```text
kubernetes/eks/
├── kustomization.yaml
├── namespace.yaml
├── shared/
│   ├── serviceaccount.yaml
│   ├── app-secrets.yaml
│   ├── edge-signing-key.yaml
│   ├── relay-config.yaml
│   └── postgres-bootstrap-config.yaml
├── infrastructure/
│   ├── postgres/
│   │   ├── service.yaml
│   │   └── statefulset.yaml
│   └── kafka/
│       ├── headless-service.yaml
│       ├── service.yaml
│       ├── statefulset.yaml
│       └── topic-job.yaml
├── services/
│   ├── zord-edge/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-intent-engine/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-token-enclave/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-relay/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-outcome-engine/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-evidence/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-intelligence/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   ├── zord-prompt-layer/
│   │   ├── service.yaml
│   │   └── deployment.yaml
│   └── zord-console/
│       ├── service.yaml
│       └── deployment.yaml
└── ingress/
    └── public-alb.yaml
```

## How Companies Usually Organize It

This style is much closer to how teams normally maintain manifests:

- `shared/`: common config, service accounts, secrets, config maps
- `infrastructure/`: stateful dependencies like Postgres, Kafka, Redis, etc.
- `services/<service-name>/`: every microservice has its own `Deployment` and `Service`
- `ingress/`: public entrypoints and ALB or NGINX ingress objects
- `kustomization.yaml`: the single assembly point for the environment

## High Availability

The stateless application tier is now configured for higher availability:

- each microservice deployment runs with `replicas: 2`
- rolling updates use `maxUnavailable: 0`
- each service has a dedicated `PodDisruptionBudget`
- each service has a dedicated `HorizontalPodAutoscaler`
- pod anti-affinity prevents two replicas of the same service from landing on one node
- topology spread tries to distribute replicas across zones and nodes

Important limitation:

- `Postgres` is still a single StatefulSet pod
- `Kafka` is still a single-broker StatefulSet

So this manifest set gives you HA mainly for the application layer, not full platform HA.

For real production-grade HA, companies usually do one of these:

- use Amazon RDS Multi-AZ for Postgres
- use Amazon MSK for Kafka
- run EKS node groups across multiple AZs
- keep app deployments at 2 or more replicas, with PDBs and anti-affinity

## HPA Note

The new HPA manifests need Kubernetes `metrics-server` to be installed in the cluster.

Without `metrics-server`, the HPA objects will exist but will not scale correctly.

## What You Need To Edit

Before applying, replace placeholders in:

- `services/*/deployment.yaml`: replace all ECR image placeholders
- `shared/app-secrets.yaml`: replace passwords, DSNs, API keys, vault keys
- `shared/edge-signing-key.yaml`: replace the private key
- `shared/relay-config.yaml`: replace PSP URL and relay auth tokens if needed
- `ingress/public-alb.yaml`: replace ACM certificate ARN and hostnames
- `shared/serviceaccount.yaml`: replace the IRSA IAM role ARN

## Apply

```bash
kubectl apply -k kubernetes/eks
```

## Verify

```bash
kubectl get pods -n zord
kubectl get svc -n zord
kubectl get ingress -n zord
kubectl logs -n zord deploy/zord-edge
kubectl logs -n zord deploy/zord-intelligence
```

## Repo Notes

- `zord-intelligence` did not previously have a Dockerfile, so one was added for EKS image builds.
- `zord-relay` and `zord-intelligence` now self-apply their schemas on startup instead of relying only on compose-time SQL bootstrap.
- `zord-evidence` listens on `8088`; its Dockerfile port metadata was corrected to match.
- The console still references some legacy backend surfaces that are not fully implemented in this repo, so a few pages may still need backend cleanup after deployment.
