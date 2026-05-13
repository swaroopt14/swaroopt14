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

- `zord-edge`
- `zord-intent-engine`
- `zord-token-enclave`
- `zord-relay`
- `zord-outcome-engine`
- `zord-evidence`
- `zord-intelligence`
- `zord-prompt-layer`
- `zord-postgres`
- `zord-kafka`

That means users should open:

```text
https://zordnet.com
```

They should not directly open backend service URLs.

## Before You Start

You need these installed on your laptop or admin machine:

- `aws`
- `kubectl`
- access to the AWS account
- access to the EKS cluster

You also need these already prepared:

- Docker images pushed to ECR
- AWS Secrets Manager secret `zord/app-secrets`
- AWS Secrets Manager secret `zord/edge-signing-key`
- External Secrets Operator installed
- AWS Load Balancer Controller installed
- metrics-server installed
- ACM certificate for `zordnet.com`
- DNS record for `zordnet.com`

## Step 1: Confirm You Are Connected To EKS

Run:

```powershell
kubectl config current-context
```

Expected:

```text
arn:aws:eks:...
```

or a context name that clearly points to your EKS cluster.

Bad result:

```text
docker-desktop
```

If you see `docker-desktop`, stop. You are not connected to EKS.

Connect to EKS:

```powershell
aws eks update-kubeconfig --region ap-south-1 --name <your-cluster-name>
```

Then check nodes:

```powershell
kubectl get nodes
```

Expected:

```text
STATUS
Ready
```

If nodes are not ready, fix EKS/node group first.

## Step 2: Check Required Cluster Add-ons

### AWS Load Balancer Controller

Run:

```powershell
kubectl get deployment -A | Select-String aws-load-balancer-controller
```

Expected:

```text
aws-load-balancer-controller
```

If missing, ALB ingress will not work.

### External Secrets Operator

Run:

```powershell
kubectl get pods -n external-secrets
```

Expected:

```text
Running
```

If this namespace or pods do not exist, `ExternalSecret` and `SecretStore` will fail.

### metrics-server

Run:

```powershell
kubectl get pods -n kube-system | Select-String metrics-server
```

Expected:

```text
metrics-server ... Running
```

If missing, HPA will show unknown metrics.

### EBS CSI Driver

Run:

```powershell
kubectl get pods -n kube-system | Select-String ebs
kubectl get csidriver
```

Expected:

```text
ebs.csi.aws.com
```

If missing, Postgres/Kafka PVCs may not bind.

## Step 3: Build The Manifests Locally

From repo root:

```powershell
kubectl kustomize kubernetes/eks
```

Expected:

- A big YAML output
- No error

If this fails, fix YAML before applying.

## Step 4: Apply The Deployment

Run:

```powershell
kubectl apply -k kubernetes/eks
```

Expected:

```text
namespace/zord created
service/... created
deployment.apps/... created
statefulset.apps/... created
ingress.networking.k8s.io/zord-public created
```

If resources say `configured`, that is okay. It means they already existed and were updated.

## Step 5: Watch All Pods

Run:

```powershell
kubectl get pods -n zord -w
```

Wait until pods become:

```text
Running
```

You should see pods for:

- `zord-console`
- `zord-edge`
- `zord-intent-engine`
- `zord-token-enclave`
- `zord-relay`
- `zord-outcome-engine`
- `zord-evidence`
- `zord-intelligence`
- `zord-prompt-layer`
- `zord-postgres`
- `zord-kafka`
- `zord-kafka-topics`

Stop watching:

```text
Ctrl + C
```

## Step 6: Check Pod Health

Run:

```powershell
kubectl get pods -n zord
```

Good:

```text
Running
Completed
```

Bad:

```text
ImagePullBackOff
ErrImagePull
CrashLoopBackOff
CreateContainerConfigError
Pending
```

If bad, describe the pod:

```powershell
kubectl describe pod <pod-name> -n zord
```

Then check logs:

```powershell
kubectl logs -n zord <pod-name>
```

## Step 7: Check Secrets

Run:

```powershell
kubectl get externalsecret -n zord
kubectl get secret zord-app-secrets -n zord
kubectl get secret zord-edge-signing-key -n zord
```

Expected:

- `zord-app-secrets` exists
- `zord-edge-signing-key` exists

If missing, check:

```powershell
kubectl describe externalsecret zord-app-secrets -n zord
kubectl describe externalsecret zord-edge-signing-key -n zord
```

Common issue:

- AWS secret name is wrong
- External Secrets Operator IAM role cannot read Secrets Manager
- Secret key is missing inside `ZORD_APP_SECRETS_JSON`

## Step 8: Check S3 IAM Role On Service Account

Run:

```powershell
kubectl describe serviceaccount zord-aws-access -n zord
```

Expected annotation:

```text
eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/ZordAppS3AccessRole
```

If this annotation is missing, pods may fail when using S3.

Remember:

- bucket names are in `zord/app-secrets`
- bucket permissions are in IAM role `ZordAppS3AccessRole`

## Step 9: Check Services

Run:

```powershell
kubectl get svc -n zord
```

Expected service names:

- `zord-console`
- `zord-edge`
- `zord-intent-engine`
- `zord-token-enclave`
- `zord-relay`
- `zord-outcome-engine`
- `zord-evidence`
- `zord-intelligence`
- `zord-prompt-layer`
- `zord-postgres`
- `zord-kafka`

These services should normally be `ClusterIP`, not public `LoadBalancer`.

## Step 10: Check Ingress And ALB

Run:

```powershell
kubectl get ingress -n zord
```

Expected:

```text
zord-public
```

Check details:

```powershell
kubectl describe ingress zord-public -n zord
```

You want to see:

- no error events
- ALB address is created
- certificate ARN accepted
- rule for `zordnet.com`

Current production model:

```text
zordnet.com -> zord-console
```

There should not be a public rule for every backend service.

## Step 11: Check DNS

Get ingress address:

```powershell
kubectl get ingress zord-public -n zord
```

You will see an ALB DNS name like:

```text
k8s-zord-xxxx.ap-south-1.elb.amazonaws.com
```

In your domain DNS provider, `zordnet.com` should point to the ALB.

Test DNS:

```powershell
nslookup zordnet.com
```

If DNS does not point to ALB yet, wait or fix DNS.

## Step 12: Test Frontend In Browser

Open:

```text
https://zordnet.com
```

Expected:

- page loads
- no browser certificate warning
- login or console UI appears

If page does not open, check:

```powershell
kubectl logs -n zord deploy/zord-console
kubectl describe ingress zord-public -n zord
```

## Step 13: Test Frontend Health

Run:

```powershell
curl https://zordnet.com/api/health
```

Expected:

```json
healthy
```

or a JSON response from Next.js health route.

If this fails:

- ALB routing may be wrong
- `zord-console` pod may be unhealthy
- certificate or DNS may be wrong

## Step 14: Test Backend Through Frontend

Backends are private. Do not test them through public URLs.

Test through frontend API routes:

```powershell
curl https://zordnet.com/api/prod/overview
```

Try:

```powershell
curl https://zordnet.com/api/prod/tenants
```

For tenant-protected routes:

```powershell
curl "https://zordnet.com/api/prod/intents?tenant_id=<tenant-id>"
```

Expected:

- JSON response
- maybe empty data, but route should respond
- no connection refused

If response says backend unreachable, check `zord-console` env vars and backend service health.

## Step 15: Test Private Backend From Inside Cluster

Run a temporary curl pod:

```powershell
kubectl run curl-test -n zord --rm -it --image=curlimages/curl -- sh
```

Inside the pod, test:

```sh
curl http://zord-console:3000/api/health
curl http://zord-edge:8080/health
curl http://zord-intent-engine:8083/health
curl http://zord-relay:8082/health
curl http://zord-token-enclave:8087/v1/health
curl http://zord-outcome-engine:8081/health
curl http://zord-evidence:8088/healthz
curl http://zord-intelligence:8089/healthz
curl http://zord-prompt-layer:8086/health
```

Exit:

```sh
exit
```

If a service fails:

- check the service port
- check the pod logs
- check if the app exposes a different health path

## Step 16: Test Postgres

Check Postgres pod:

```powershell
kubectl get pods -n zord | Select-String zord-postgres
```

Logs:

```powershell
kubectl logs -n zord statefulset/zord-postgres
```

Good signs:

- database system is ready to accept connections
- no password or init script errors

Bad signs:

- missing `POSTGRES_SUPERUSER_PASSWORD`
- bootstrap script error
- PVC mount problem

## Step 17: Test Kafka

Check Kafka pod:

```powershell
kubectl get pods -n zord | Select-String zord-kafka
```

Check Kafka topics job:

```powershell
kubectl get job zord-kafka-topics -n zord
kubectl logs -n zord job/zord-kafka-topics
```

Expected:

```text
created topic ...
```

or no errors if topics already exist.

If job fails:

- Kafka may not be ready
- service name may be wrong
- Kafka pod may be unhealthy

## Step 18: Test Login Flow

Open:

```text
https://zordnet.com
```

Try login/signup if configured.

Watch console logs:

```powershell
kubectl logs -n zord deploy/zord-console -f
```

Watch edge logs:

```powershell
kubectl logs -n zord deploy/zord-edge -f
```

Expected:

- frontend sends request to `/api/auth/login`
- Next.js server calls private `zord-edge`
- no browser call to `http://zord-edge:8080`

## Step 19: Test Ingestion Flow

If your UI has create payment / ingest page, submit a test payment.

Then check:

```powershell
kubectl logs -n zord deploy/zord-edge --tail=100
kubectl logs -n zord deploy/zord-intent-engine --tail=100
kubectl logs -n zord deploy/zord-token-enclave --tail=100
kubectl logs -n zord deploy/zord-relay --tail=100
```

Expected flow:

```text
zord-console
  -> zord-edge
  -> Kafka
  -> zord-intent-engine
  -> zord-token-enclave if PII tokenization is needed
  -> zord-relay / outcome / evidence depending on workflow
```

## Step 20: Test Prompt Layer

If Ask Zord or copilot is enabled, test it in UI.

Or call:

```powershell
curl -X POST https://zordnet.com/api/prompt-layer/query `
  -H "Content-Type: application/json" `
  -d "{\"query\":\"show me recent payout risk\"}"
```

Expected:

- JSON response
- no upstream connection error

If it fails:

```powershell
kubectl logs -n zord deploy/zord-console --tail=100
kubectl logs -n zord deploy/zord-prompt-layer --tail=100
```

## Step 21: Check HPA

Run:

```powershell
kubectl get hpa -n zord
```

Good:

```text
TARGETS
10%/70%
```

Bad:

```text
<unknown>
```

If bad, metrics-server is missing or broken.

## Step 22: Check PDB

Run:

```powershell
kubectl get pdb -n zord
```

Expected:

- PDBs exist for app services
- `ALLOWED DISRUPTIONS` should not be broken forever

## Step 23: Check No Backend Is Public

Run:

```powershell
kubectl get ingress -n zord -o yaml
```

Expected public rule:

```text
zordnet.com -> zord-console
```

There should not be public rules like:

```text
intent.zordnet.com
relay.zordnet.com
evidence.zordnet.com
token.zordnet.com
```

Also check services:

```powershell
kubectl get svc -n zord
```

Backend services should not be type `LoadBalancer`.

## Step 24: Common Failure Fixes

### ImagePullBackOff

Check:

```powershell
kubectl describe pod <pod-name> -n zord
```

Likely causes:

- image tag is wrong
- image repo is wrong
- ECR permission problem
- image was not pushed

### CreateContainerConfigError

Likely causes:

- missing secret
- missing key inside `zord-app-secrets`
- missing `zord-edge-signing-key`

Check:

```powershell
kubectl describe pod <pod-name> -n zord
kubectl get secret zord-app-secrets -n zord
```

### CrashLoopBackOff

Check:

```powershell
kubectl logs -n zord <pod-name> --previous
kubectl logs -n zord <pod-name>
```

Likely causes:

- DB password wrong
- Kafka unreachable
- S3 permission denied
- missing env var
- app health path mismatch

### Pending

Check:

```powershell
kubectl describe pod <pod-name> -n zord
```

Likely causes:

- not enough CPU/memory
- PVC not bound
- node affinity / anti-affinity too strict
- EBS CSI missing

### Ingress Has No Address

Check:

```powershell
kubectl describe ingress zord-public -n zord
kubectl logs -n kube-system deployment/aws-load-balancer-controller
```

Likely causes:

- AWS Load Balancer Controller not installed
- subnet tags missing
- invalid ACM certificate ARN
- IAM permission issue for controller

### S3 Access Denied

Check app logs:

```powershell
kubectl logs -n zord deploy/zord-edge --tail=100
kubectl logs -n zord deploy/zord-intent-engine --tail=100
kubectl logs -n zord deploy/zord-outcome-engine --tail=100
kubectl logs -n zord deploy/zord-evidence --tail=100
```

Check service account annotation:

```powershell
kubectl describe serviceaccount zord-aws-access -n zord
```

Likely causes:

- missing IRSA annotation
- IAM trust policy has wrong OIDC provider
- IAM trust policy has wrong service account namespace/name
- IAM policy has wrong bucket ARN
- bucket name in `zord/app-secrets` does not match IAM policy

## Final Success Checklist

Deployment is healthy when:

- `kubectl get nodes` shows nodes `Ready`
- all pods in `zord` are `Running` or jobs `Completed`
- `zord-app-secrets` exists
- `zord-edge-signing-key` exists
- `zord-aws-access` has IAM role annotation
- `kubectl get ingress -n zord` shows ALB address
- `https://zordnet.com` opens
- `https://zordnet.com/api/health` responds
- frontend pages call `/api/...`, not private backend URLs in browser
- private service curl tests work inside cluster
- Postgres logs are clean
- Kafka topics job completed
- no `ImagePullBackOff`
- no `CrashLoopBackOff`
- no S3 access denied errors
- HPA metrics are not `<unknown>`

## Short Testing Order

If you want the tiny version:

```powershell
kubectl config current-context
kubectl get nodes
kubectl apply -k kubernetes/eks
kubectl get pods -n zord -w
kubectl get externalsecret -n zord
kubectl get secret zord-app-secrets -n zord
kubectl get ingress -n zord
curl https://zordnet.com/api/health
kubectl logs -n zord deploy/zord-console --tail=100
kubectl logs -n zord deploy/zord-edge --tail=100
```

Then open:

```text
https://zordnet.com
```
