# EKS Deployment End-to-End Testing Guide

This guide helps you test the full Arealis Zord deployment after applying the Kubernetes manifests to EKS.

Read this like a checklist. Do not jump to the browser first. First check cluster, then pods, then secrets, then ingress, then frontend, then backend flow.

## What We Are Testing

Your production access model is:

```text
Public internet
  -> https://zordnet.com
  -> zord-console frontend
  -> Next.js server API routes
  -> private Kubernetes backend services
```

Only the frontend domain is public.

Private backend services:

- `zord-edge` (Port 8080)
- `zord-intent-engine` (Port 8083)
- `zord-token-enclave` (Port 8087)
- `zord-relay` (Port 8082)
- `zord-outcome-engine` (Port 8081)
- `zord-evidence` (Port 8088)
- `zord-intelligence` (Port 8089)
- `zord-prompt-layer` (Port 8086)
- `zord-postgres` (Port 5432)
- `zord-kafka` (Port 9092)

Users should only open:

```text
https://zordnet.com
```

They should never directly access backend service URLs.

## Before You Start

You need these installed on your laptop or admin machine:

- `aws` CLI
- `kubectl`
- Access to AWS account `522189039032`
- Access to the EKS cluster

You also need these already completed:

- Docker images pushed to ECR (Jenkins handles this)
- AWS Secrets Manager secret `zord/app-secrets` created (Terraform handles this)
- AWS Secrets Manager secret `zord/edge-signing-key` created (Terraform handles this)
- External Secrets Operator installed in cluster
- AWS Load Balancer Controller installed in cluster
- metrics-server installed in cluster
- EBS CSI Driver installed in cluster
- ACM certificate for `zordnet.com` created
- DNS record for `zordnet.com` pointing to ALB

---

## Step 1: Confirm You Are Connected To EKS

```bash
kubectl config current-context
```

Expected:

```text
arn:aws:eks:ap-south-1:522189039032:cluster/<cluster-name>
```

Bad result:

```text
docker-desktop
```

If you see `docker-desktop`, connect to EKS first:

```bash
aws eks update-kubeconfig --region ap-south-1 --name <your-cluster-name>
```

Then verify nodes:

```bash
kubectl get nodes
```

All nodes must show `Ready`. Do NOT continue if nodes are not ready.

---

## Step 2: Check Required Cluster Add-ons

Run all 5 checks. ALL must pass before testing:

```bash
# 1. External Secrets Operator
kubectl get pods -n external-secrets
# Must show running pods

# 2. metrics-server
kubectl get pods -n kube-system | grep metrics-server
# Must show running pod

# 3. AWS Load Balancer Controller
kubectl get deployment -A | grep aws-load-balancer
# Must show a deployment

# 4. EBS CSI Driver
kubectl get pods -n kube-system | grep ebs
# Must show running pods

# 5. StorageClass (must have default)
kubectl get storageclass
# Must show gp2 (default)
```

If any are missing, fix them before continuing.

---

## Step 3: Check All Pods Are Running

```bash
kubectl get pods -n zord
```

Expected — ALL pods should be `Running` or `Completed`:

```text
NAME                                   READY   STATUS
zord-postgres-0                        1/1     Running
zord-kafka-0                           1/1     Running
zord-kafka-topics-xxxxx                0/1     Completed
zord-console-xxxxx                     1/1     Running
zord-console-xxxxx                     1/1     Running
zord-edge-xxxxx                        1/1     Running
zord-edge-xxxxx                        1/1     Running
zord-intent-engine-xxxxx               1/1     Running
zord-intent-engine-xxxxx               1/1     Running
zord-token-enclave-xxxxx               1/1     Running
zord-token-enclave-xxxxx               1/1     Running
zord-relay-xxxxx                       1/1     Running
zord-relay-xxxxx                       1/1     Running
zord-outcome-engine-xxxxx              1/1     Running
zord-outcome-engine-xxxxx              1/1     Running
zord-evidence-xxxxx                    1/1     Running
zord-evidence-xxxxx                    1/1     Running
zord-intelligence-xxxxx                1/1     Running
zord-intelligence-xxxxx                1/1     Running
zord-prompt-layer-xxxxx                1/1     Running
zord-prompt-layer-xxxxx                1/1     Running
```

If any pod is NOT Running:

```bash
kubectl describe pod <pod-name> -n zord
kubectl logs <pod-name> -n zord --tail=30
```

---

## Step 4: Check Secrets Are Synced

```bash
kubectl get externalsecret -n zord
```

Expected:

```text
NAME                    STATUS         READY
zord-app-secrets        SecretSynced   True
zord-edge-signing-key   SecretSynced   True
```

Verify secrets exist:

```bash
kubectl get secret zord-app-secrets -n zord
kubectl get secret zord-edge-signing-key -n zord
```

If `STATUS` is not `SecretSynced`:

```bash
kubectl describe externalsecret zord-app-secrets -n zord
```

---

## Step 5: Check Service Account IAM Role

```bash
kubectl describe serviceaccount zord-aws-access -n zord
```

Expected annotation:

```text
eks.amazonaws.com/role-arn: arn:aws:iam::522189039032:role/ZordAppS3AccessRole
```

If missing, S3 operations will fail.

---

## Step 6: Check Services

```bash
kubectl get svc -n zord
```

All services should be `ClusterIP` (private). No service should be type `LoadBalancer`.

---

## Step 7: Check Ingress and ALB

```bash
kubectl get ingress -n zord
```

Expected:

```text
NAME          CLASS   HOSTS         ADDRESS                                              PORTS
zord-public   alb     zordnet.com   k8s-zord-xxx.ap-south-1.elb.amazonaws.com            80, 443
```

If ADDRESS is empty:

```bash
kubectl describe ingress zord-public -n zord
```

---

## Step 8: Check HPA

```bash
kubectl get hpa -n zord
```

TARGETS should show actual percentages (e.g., `5%/70%`), NOT `<unknown>/70%`.

---

## Step 9: Check PDB

```bash
kubectl get pdb -n zord
```

All services should have PDB with `ALLOWED DISRUPTIONS >= 1`.

---

## Step 10: Test Postgres

```bash
kubectl exec -n zord zord-postgres-0 -- pg_isready -U postgres
```

Expected: `accepting connections`

Check logs:

```bash
kubectl logs zord-postgres-0 -n zord --tail=10
```

---

## Step 11: Test Kafka

```bash
kubectl exec -n zord zord-kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --list
```

Expected — list of 28 topics:

```text
payments.ledger.events.v1
payments.intent.events.v1
payments.dispatch.events.v1
payments.outcome.events.v1
pii.tokenize.request
pii.tokenize.result
relay.dlq.publish_failure
relay.dlq.poison
z.dispatch.events.v1
z.outcome.events.v1
canonical.intent.created
dispatch.attempt.created
outcome.event.normalized
finality.certificate.issued
final.contract.updated
evidence.pack.ready
dlq.event
statement.match.event
corridor.health.tick
sla.timer.tick
canonical.settlement.created
attachment.decision.created
variance.record.created
batch.summary.updated
governance.decision.created
zpi.actuation.retry
zpi.actuation.evidence
zpi.actuation.alert
zpi.actuation.batch_patch
```

---

## Step 12: Test All Backend Health Endpoints (From Inside Cluster)

Run a temporary curl pod:

```bash
kubectl run curl-test -n zord --rm -it --image=curlimages/curl -- sh
```

Inside the pod, test each service:

```sh
curl -s http://zord-console:3000/api/health
curl -s http://zord-edge:8080/health
curl -s http://zord-intent-engine:8083/health
curl -s http://zord-relay:8082/health
curl -s http://zord-token-enclave:8087/v1/health
curl -s http://zord-outcome-engine:8081/v1/health
curl -s http://zord-evidence:8088/healthz
curl -s http://zord-intelligence:8089/healthz
curl -s http://zord-prompt-layer:8086/health
```

ALL should return a JSON response. Exit:

```sh
exit
```

---

## Step 13: Test Frontend (Public Access)

### Health Check

```bash
curl -s https://zordnet.com/api/health
```

Expected: JSON response

### Browser Test

Open: `https://zordnet.com`

Expected:
- Page loads without errors
- No browser certificate warning
- Login or console UI appears

### Check No Backend Leaks

Open browser DevTools (F12) → Network tab. Navigate the app.

All API calls should go to `https://zordnet.com/api/...`

NO calls should go to internal URLs like `http://zord-edge:8080/...`

---

## Step 14: Test Frontend → Backend Flow

```bash
curl -s https://zordnet.com/api/prod/overview
curl -s https://zordnet.com/api/prod/tenants
curl -s https://zordnet.com/api/prod/intents
```

Expected: JSON response (may be empty data, but route should respond without errors)

---

## Step 15: Test Login Flow

Open `https://zordnet.com` and try login/signup.

Watch logs:

```bash
kubectl logs -n zord deploy/zord-console -f --tail=20
kubectl logs -n zord deploy/zord-edge -f --tail=20
```

---

## Step 16: Test Ingestion Flow

Submit a test payment through the UI, then check logs:

```bash
kubectl logs -n zord deploy/zord-edge --tail=50
kubectl logs -n zord deploy/zord-intent-engine --tail=50
kubectl logs -n zord deploy/zord-relay --tail=50
kubectl logs -n zord deploy/zord-outcome-engine --tail=50
```

Expected flow:

```text
zord-console → zord-edge → Kafka → zord-intent-engine → zord-token-enclave → zord-relay → zord-outcome-engine → zord-evidence
```

---

## Step 17: Test Prompt Layer (AI Copilot)

```bash
curl -X POST https://zordnet.com/api/prompt-layer/query \
  -H "Content-Type: application/json" \
  -d '{"query":"show me recent payout risk"}'
```

Expected: JSON response with AI-generated answer

---

## Step 18: Test S3 Access

```bash
kubectl logs -n zord deploy/zord-edge --tail=50 | grep -i "s3\|access denied"
kubectl logs -n zord deploy/zord-evidence --tail=50 | grep -i "s3\|access denied"
```

If you see `Access Denied`:
- Check: `kubectl describe sa zord-aws-access -n zord`
- Verify IAM role trust policy has correct OIDC provider
- Verify IAM policy has correct bucket ARNs

---

## Step 19: Verify No Backend Is Publicly Exposed

```bash
# Should only show zordnet.com → zord-console
kubectl get ingress -n zord -o yaml | grep -A5 "rules:"

# Should return nothing (no LoadBalancer services)
kubectl get svc -n zord | grep LoadBalancer
```

---

## Step 20: Final Success Checklist

```bash
echo "=== Nodes ===" && kubectl get nodes
echo "=== Pods ===" && kubectl get pods -n zord
echo "=== Secrets ===" && kubectl get externalsecret -n zord
echo "=== Services ===" && kubectl get svc -n zord
echo "=== Ingress ===" && kubectl get ingress -n zord
echo "=== HPA ===" && kubectl get hpa -n zord
echo "=== PDB ===" && kubectl get pdb -n zord
```

Deployment is healthy when ALL of these are true:

- [ ] All nodes are `Ready`
- [ ] All pods are `Running` (or `Completed` for jobs)
- [ ] Both ExternalSecrets show `SecretSynced` / `True`
- [ ] `zord-app-secrets` and `zord-edge-signing-key` secrets exist
- [ ] `zord-aws-access` service account has IAM role annotation
- [ ] Ingress shows ALB address
- [ ] `https://zordnet.com` opens in browser
- [ ] `https://zordnet.com/api/health` responds
- [ ] All 9 backend health endpoints respond from inside cluster
- [ ] Kafka has 28 topics created
- [ ] HPA targets show actual percentages (not `<unknown>`)
- [ ] No service is type `LoadBalancer`
- [ ] No S3 access denied errors in logs
- [ ] Frontend API calls go through `/api/...` not direct backend URLs

---

## Quick Test (Short Version)

```bash
kubectl get pods -n zord
kubectl get externalsecret -n zord
kubectl get ingress -n zord
kubectl exec -n zord zord-kafka-0 -- kafka-topics --bootstrap-server localhost:9092 --list
curl -s https://zordnet.com/api/health
```

Then open `https://zordnet.com` in browser.

---

## Troubleshooting Reference

| Symptom | Cause | Fix |
|---------|-------|-----|
| Pod `Pending` | No StorageClass or EBS CSI missing | `kubectl get storageclass`, install EBS CSI |
| Pod `ImagePullBackOff` | Image not in ECR or wrong tag | Push image, verify tag |
| Pod `CreateContainerConfigError` | Missing secret key | `kubectl describe pod`, check secret keys |
| Pod `CrashLoopBackOff` | App crash (DB/Kafka unreachable) | `kubectl logs <pod>` |
| Kafka OOM (exit 137) | Not enough memory | Already fixed: 4Gi limit + KAFKA_HEAP_OPTS |
| Kafka DNS error | KRaft quorum voter | Already fixed: uses `localhost:9093` |
| HPA `<unknown>` | metrics-server missing | Install metrics-server |
| ALB not created | LB Controller missing or bad cert | Check controller + certificate ARN |
| S3 Access Denied | IRSA not configured | Check SA annotation + IAM role |
| Services can't reach Kafka | Kafka not ready when services started | `kubectl rollout restart deployment <name> -n zord` |
| Postgres `lost+found` error | EBS mount at data dir root | Already fixed: `subPath: pgdata` |
| Kafka data dir not writable | EBS permissions | Already fixed: `fsGroup: 1000` |
