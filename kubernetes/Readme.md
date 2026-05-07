# Kubernetes Deployment Guide

This guide is written in a slow, simple way.

Think of deployment like this:

1. Build all app images.
2. Push those images to AWS ECR.
3. Fill real passwords and real AWS values into the YAML files.
4. Apply the Kubernetes manifests to EKS.
5. Check that pods, services, and ingress are healthy.

This repo already has Kubernetes files in `kubernetes/eks/`.
Your main job is to update the placeholder values before you apply them.

This repo now uses AWS Secrets Manager wiring through External Secrets:

- `kubernetes/eks/shared/secret-store.yaml`
- `kubernetes/eks/shared/external-secret-app-secrets.yaml`
- `kubernetes/eks/shared/external-secret-edge-signing-key.yaml`
- `kubernetes/eks/shared/aws-secretsmanager-zord-app-secrets.template.json`
- `kubernetes/eks/shared/aws-secretsmanager-zord-edge-signing-key.template.json`

## Folder You Will Work In

Most of your work will be inside:

`kubernetes/eks/`

Important subfolders:

- `kubernetes/eks/shared/`
- `kubernetes/eks/infrastructure/`
- `kubernetes/eks/services/`
- `kubernetes/eks/ingress/`

## Big Picture

Your EKS deployment has:

- 1 shared PostgreSQL server
- 1 shared Kafka broker
- many app services

That means:

- PostgreSQL has one admin password for the full DB server
- each app service also has its own DB user password
- some services need S3 bucket names
- the console needs domain names
- the ingress needs an ACM certificate ARN

## Step 0: Make Sure You Have These Ready

Before editing files, keep these values with you in a notebook or text file:

- AWS account ID
- AWS region
- EKS cluster name
- ECR repository URLs for each service image
- one ACM certificate ARN for your domain
- one public hostname for console
- one public hostname for API
- S3 bucket names
- PostgreSQL passwords
- vault key
- internal admin key
- token master key
- token secret
- Gemini API key(s)
- edge signing private key
- evidence signing private key
- evidence archive encryption key
- relay auth tokens

## Step 1: Build and Push Docker Images

Every service needs an image in ECR.

Services in this repo:

- `zord-edge`
- `zord-intent-engine`
- `zord-token-enclave`
- `zord-relay`
- `zord-outcome-engine`
- `zord-evidence`
- `zord-intelligence`
- `zord-prompt-layer`
- `zord-console`

Example flow for one service:

```powershell
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 522189039032.dkr.ecr.ap-south-1.amazonaws.com
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-edge:v1 .\backend\zord-edge
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-edge:v1
```

Do the same for all services.

After you push, update image tags in the deployment YAML files.

## Step 2: Update Image Names in Deployment Files

Open every deployment file inside `kubernetes/eks/services/`.

Files to check:

- `kubernetes/eks/services/zord-edge/deployment.yaml`
- `kubernetes/eks/services/zord-intent-engine/deployment.yaml`
- `kubernetes/eks/services/zord-token-enclave/deployment.yaml`
- `kubernetes/eks/services/zord-relay/deployment.yaml`
- `kubernetes/eks/services/zord-outcome-engine/deployment.yaml`
- `kubernetes/eks/services/zord-evidence/deployment.yaml`
- `kubernetes/eks/services/zord-intelligence/deployment.yaml`
- `kubernetes/eks/services/zord-prompt-layer/deployment.yaml`
- `kubernetes/eks/services/zord-console/deployment.yaml`

In each file, find the `image:` line and replace it with your real ECR image and tag.

Example:

```yaml
image: 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-edge:v1
```

## Step 3: Use AWS Secrets Manager

For this repo, the production path is:

1. store real values in AWS Secrets Manager
2. let External Secrets create Kubernetes secrets
3. keep the same Kubernetes secret names already used by deployments

The Kubernetes secret names expected by your code are:

- `zord-app-secrets`
- `zord-edge-signing-key`

You do not need the old plain Kubernetes secret YAML files anymore.

## Step 4: Create the AWS Secrets

Use these AWS secret names:

- `zord/app-secrets`
- `zord/edge-signing-key`

### AWS secret 1: `zord/app-secrets`

Create one JSON secret in AWS Secrets Manager.

Start from this file:

`kubernetes/eks/shared/aws-secretsmanager-zord-app-secrets.template.json`

This file already uses the same password pattern found in your current service docker-compose files:

- `zord_password`
- `intent_password`
- `relay_password`
- `token_password`
- `outcome_password`
- `evidence_password`
- `zpi_secret`
- `dev-dummy-token-123`
- `MASTER_KEY` copied from `zord-token-enclave/docker-compose.yml`

You should still replace the unsafe placeholder values before real production:

- `POSTGRES_SUPERUSER_PASSWORD`
- `ZORD_VAULT_KEY`
- `INTERNAL_ADMIN_KEY`
- `TOKEN_SECRET`
- `EVIDENCE_SIGNING_PRIVATE_KEY_BASE64`
- `EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64`
- `GEMINI_API_KEYS`

Use these exact keys:

- `POSTGRES_SUPERUSER_PASSWORD`
- `EDGE_DB_PASSWORD`
- `INTENT_DB_PASSWORD`
- `RELAY_DB_PASSWORD`
- `TOKEN_DB_PASSWORD`
- `OUTCOME_DB_PASSWORD`
- `EVIDENCE_DB_PASSWORD`
- `INTELLIGENCE_DB_PASSWORD`
- `ZORD_VAULT_KEY`
- `INTERNAL_ADMIN_KEY`
- `MASTER_KEY`
- `TOKEN_SECRET`
- `EVIDENCE_SIGNING_PRIVATE_KEY_BASE64`
- `EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64`
- `GEMINI_API_KEYS`
- `RELAY_SERVICES_0_AUTH_TOKEN`
- `RELAY_SERVICES_1_AUTH_TOKEN`
- `RELAY_SERVICES_2_AUTH_TOKEN`
- `RELAY_DB_URL`
- `INTELLIGENCE_DATABASE_URL`
- `EDGE_READ_DSN`
- `INTENT_READ_DSN`
- `RELAY_READ_DSN`
- `INTELLIGENCE_READ_DSN`
- `EVIDENCE_READ_DSN`

That list is the exact key set your deployments already read through `secretKeyRef`.

### AWS secret 2: `zord/edge-signing-key`

Create one JSON secret in AWS Secrets Manager with this key:

- `ed25519_private.pem`

Start from this file:

`kubernetes/eks/shared/aws-secretsmanager-zord-edge-signing-key.template.json`

Example value:

```json
{
  "ed25519_private.pem": "-----BEGIN PRIVATE KEY-----\nREAL_KEY_HERE\n-----END PRIVATE KEY-----"
}
```

### Exact AWS CLI commands

Create the app secret:

```powershell
aws secretsmanager create-secret `
  --name zord/app-secrets `
  --secret-string file://kubernetes/eks/shared/aws-secretsmanager-zord-app-secrets.template.json `
  --region ap-south-1
```

Create the edge signing key secret:

```powershell
aws secretsmanager create-secret `
  --name zord/edge-signing-key `
  --secret-string file://kubernetes/eks/shared/aws-secretsmanager-zord-edge-signing-key.template.json `
  --region ap-south-1
```

If the secret already exists, update it:

```powershell
aws secretsmanager update-secret `
  --secret-id zord/app-secrets `
  --secret-string file://kubernetes/eks/shared/aws-secretsmanager-zord-app-secrets.template.json `
  --region ap-south-1
```

```powershell
aws secretsmanager update-secret `
  --secret-id zord/edge-signing-key `
  --secret-string file://kubernetes/eks/shared/aws-secretsmanager-zord-edge-signing-key.template.json `
  --region ap-south-1
```

### Kubernetes files already prepared for this

These files are already set up to read from Secrets Manager:

- `kubernetes/eks/shared/secret-store.yaml`
- `kubernetes/eks/shared/external-secret-app-secrets.yaml`
- `kubernetes/eks/shared/external-secret-edge-signing-key.yaml`

### Important note

External Secrets Operator must be installed in the cluster first.

Also, the operator must have AWS IAM permission to read:

- `zord/app-secrets`
- `zord/edge-signing-key`

Usually this is done with IRSA.

## Step 5: What Each Secret Means

| Key | What it is for |
| --- | --- |
| `POSTGRES_SUPERUSER_PASSWORD` | one admin password for the whole PostgreSQL server |
| `EDGE_DB_PASSWORD` | DB password for `zord-edge` |
| `INTENT_DB_PASSWORD` | DB password for `zord-intent-engine` |
| `RELAY_DB_PASSWORD` | DB password for `zord-relay` |
| `TOKEN_DB_PASSWORD` | DB password for `zord-token-enclave` |
| `OUTCOME_DB_PASSWORD` | DB password for `zord-outcome-engine` |
| `EVIDENCE_DB_PASSWORD` | DB password for `zord-evidence` |
| `INTELLIGENCE_DB_PASSWORD` | DB password for `zord-intelligence` |
| `ZORD_VAULT_KEY` | shared vault key used by services that encrypt data |
| `INTERNAL_ADMIN_KEY` | admin API key used by internal protected routes |
| `MASTER_KEY` | base64-encoded 32-byte key for token-enclave |
| `TOKEN_SECRET` | base64 secret used for token logic |
| `EVIDENCE_SIGNING_PRIVATE_KEY_BASE64` | base64 private key for evidence signing |
| `EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64` | base64 key for evidence archive encryption |
| `GEMINI_API_KEYS` | comma-separated Gemini API keys |
| `RELAY_SERVICES_0_AUTH_TOKEN` | relay token for `zord-intent-engine` internal outbox APIs |
| `RELAY_SERVICES_1_AUTH_TOKEN` | relay token for `zord-edge` internal outbox APIs |
| `RELAY_SERVICES_2_AUTH_TOKEN` | relay token for `zord-outcome-engine` internal outbox APIs |

### DSN values inside the AWS secret

Your `zord/app-secrets` JSON also contains:

- `RELAY_DB_URL`
- `INTELLIGENCE_DATABASE_URL`
- `EDGE_READ_DSN`
- `INTENT_READ_DSN`
- `RELAY_READ_DSN`
- `INTELLIGENCE_READ_DSN`
- `EVIDENCE_READ_DSN`

These are connection strings.
When you change a DB password, also update the matching password inside the DSN.

## Step 6: Update Relay Config

File:

`kubernetes/eks/shared/relay-config.yaml`

Things to check in this file:

- `psp.base_url`
- `db.url`
- `services[].auth_token`
- `token_enclave.base_url`
- Kafka settings if you use a different broker

### What to change here

1. `psp.base_url`
   Put your real PSP endpoint if you have one.

2. `db.url`
   Make sure the password inside it matches `RELAY_DB_PASSWORD`.

3. `services.auth_token`
   If you want the config file values to match your secrets file, replace:
   - `intent-engine` auth token
   - `edge` auth token
   - `outcome-engine` auth token

4. `tracing`
   If you use OpenTelemetry later, set `enabled: true` and add the real endpoint.

## Step 7: Update AWS S3 Bucket Names

Some services need S3 bucket names.

Check these files:

- `kubernetes/eks/services/zord-edge/deployment.yaml`
- `kubernetes/eks/services/zord-intent-engine/deployment.yaml`
- `kubernetes/eks/services/zord-outcome-engine/deployment.yaml`
- `kubernetes/eks/services/zord-evidence/deployment.yaml`

Look for:

- `S3_BUCKET`

Replace values like:

- `replace-me-edge-bucket`
- `replace-me-intent-bucket`
- `replace-me-outcome-bucket`
- `replace-me-evidence-bucket`

with real bucket names.

## Step 8: Update AWS Region

Most files currently use:

`ap-south-1`

If your AWS region is different, change it anywhere you see:

- `AWS_REGION`
- ECR image URLs
- ACM ARN in ingress

## Step 9: Update the ALB Ingress

File:

`kubernetes/eks/ingress/public-alb.yaml`

Change these values:

1. `alb.ingress.kubernetes.io/certificate-arn`
   Replace the fake ACM ARN with your real ACM certificate ARN.

2. `console.example.com`
   Replace with your real console domain.

3. `api.example.com`
   Replace with your real API domain.

Example:

```yaml
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-south-1:111111111111:certificate/your-real-id
```

## Step 10: Give External Secrets AWS Permission

External Secrets Operator must be able to read Secrets Manager.

Best production method:

- use IRSA
- attach a role to the External Secrets Operator service account
- allow:
  - `secretsmanager:GetSecretValue`
  - `secretsmanager:DescribeSecret`

If you want least privilege, allow only these secret ARNs:

- `zord/app-secrets`
- `zord/edge-signing-key`

## Step 11: Update IAM / Service Account for App Pods If Needed

File:

`kubernetes/eks/shared/serviceaccount.yaml`

Right now this file only creates the service account.

If your pods need AWS IAM permissions through IRSA, add annotation like this:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: zord-aws-access
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/<your-irsa-role>
```

Use this when your services need access to:

- S3
- KMS
- Secrets Manager
- other AWS services

## Step 12: Check Service-Specific Things

### `zord-edge`

File:

`kubernetes/eks/services/zord-edge/deployment.yaml`

Check:

- `image`
- `S3_BUCKET`
- `AWS_REGION`
- `VAULT_KEY_ID`
- `RELAY_AUTH_TOKEN`

### `zord-intent-engine`

File:

`kubernetes/eks/services/zord-intent-engine/deployment.yaml`

Check:

- `image`
- `S3_BUCKET`
- `KAFKA_BROKERS`
- `KAFKA_TOPIC`
- `KAFKA_TOPIC_PII_TOKENIZE_REQUEST`
- `KAFKA_TOPIC_PII_TOKENIZE_RESULT`
- `RELAY_AUTH_TOKEN`

### `zord-token-enclave`

File:

`kubernetes/eks/services/zord-token-enclave/deployment.yaml`

Check:

- `image`
- `MASTER_KEY`
- `TOKEN_SECRET`
- `KAFKA_BROKERS`

### `zord-relay`

File:

`kubernetes/eks/services/zord-relay/deployment.yaml`

Check:

- `image`
- `RELAY_DB_URL`
- `RELAY_PSP_BASE_URL`
- `RELAY_TOKEN_ENCLAVE_BASE_URL`
- `RELAY_SERVICES_0_AUTH_TOKEN`
- `RELAY_SERVICES_1_AUTH_TOKEN`
- `RELAY_SERVICES_2_AUTH_TOKEN`

### `zord-outcome-engine`

File:

`kubernetes/eks/services/zord-outcome-engine/deployment.yaml`

Check:

- `image`
- `S3_BUCKET`
- `KAFKA_BROKERS`
- `KAFKA_TOPIC`
- `KAFKA_INTENT_TOPIC`
- `RELAY_AUTH_TOKEN`

### `zord-evidence`

File:

`kubernetes/eks/services/zord-evidence/deployment.yaml`

Check:

- `image`
- `S3_BUCKET`
- `EVIDENCE_SIGNING_PRIVATE_KEY_BASE64`
- `EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64`

### `zord-intelligence`

File:

`kubernetes/eks/services/zord-intelligence/deployment.yaml`

Check:

- `image`
- `DATABASE_URL`
- `KAFKA_BROKERS`
- `INTELLIGENCE_MODE`

### `zord-prompt-layer`

File:

`kubernetes/eks/services/zord-prompt-layer/deployment.yaml`

Check:

- `image`
- `GEMINI_API_KEYS`
- read-only DSNs
- `INTELLIGENCE_BASE_URL`

### `zord-console`

File:

`kubernetes/eks/services/zord-console/deployment.yaml`

Check:

- `image`
- internal service URLs
- prompt layer URL

## Step 13: Install External Secrets Operator

Install it before applying your app manifests.

Docs:

- `https://external-secrets.io/latest/introduction/getting-started/`
- `https://external-secrets.io/latest/provider/aws-secrets-manager/`

After install, check:

```powershell
kubectl get pods -n external-secrets
```

## Step 14: Create or Check Your EKS Cluster

Make sure:

- your EKS cluster exists
- your `kubectl` points to the correct cluster
- your node group has enough CPU and memory
- the AWS Load Balancer Controller is installed
- `metrics-server` is installed

Check cluster connection:

```powershell
kubectl config current-context
kubectl get nodes
```

## Step 15: Check That External Secrets Work Before Full Deploy

Apply only the shared secrets wiring first if you want to test it:

```powershell
kubectl apply -f kubernetes/eks/shared/secret-store.yaml -n zord
kubectl apply -f kubernetes/eks/shared/external-secret-app-secrets.yaml -n zord
kubectl apply -f kubernetes/eks/shared/external-secret-edge-signing-key.yaml -n zord
```

Then check:

```powershell
kubectl get externalsecret -n zord
kubectl get secret zord-app-secrets -n zord
kubectl get secret zord-edge-signing-key -n zord
```

If those Kubernetes secrets appear, your AWS Secrets Manager link is working.

## Step 16: Optional Check Before Apply

Build the final manifest:

```powershell
kubectl kustomize kubernetes/eks
```

If this prints YAML without error, your manifest structure is okay.

## Step 17: Apply Everything

Run:

```powershell
kubectl apply -k kubernetes/eks
```

This creates:

- namespace
- secrets
- config maps
- postgres
- kafka
- all services
- ingress

## Step 18: Watch Pods Start

Run:

```powershell
kubectl get pods -n zord -w
```

You want to see pods become:

`Running`

If some pod becomes:

- `CrashLoopBackOff`
- `ImagePullBackOff`
- `ErrImagePull`
- `CreateContainerConfigError`

then stop and inspect logs or describe output.

## Step 19: Debug Problems

### If image pull fails

Check:

- image name
- image tag
- ECR permissions

Command:

```powershell
kubectl describe pod <pod-name> -n zord
```

### If secret is wrong

Check:

- `kubectl describe externalsecret zord-app-secrets -n zord`
- `kubectl describe externalsecret zord-edge-signing-key -n zord`
- AWS secret JSON keys match exactly
- DSN password match
- base64 values are real

### If database fails

Check postgres pod:

```powershell
kubectl logs -n zord statefulset/zord-postgres
```

### If ingress is not working

Check:

- AWS Load Balancer Controller installed
- certificate ARN is real
- hostnames are real

Commands:

```powershell
kubectl get ingress -n zord
kubectl describe ingress zord-public -n zord
```

## Step 20: Useful Check Commands

```powershell
kubectl get all -n zord
kubectl get pods -n zord
kubectl get svc -n zord
kubectl get ingress -n zord
kubectl logs -n zord deploy/zord-edge
kubectl logs -n zord deploy/zord-intent-engine
kubectl logs -n zord deploy/zord-relay
kubectl logs -n zord deploy/zord-outcome-engine
kubectl logs -n zord deploy/zord-evidence
kubectl logs -n zord deploy/zord-intelligence
kubectl logs -n zord deploy/zord-prompt-layer
kubectl logs -n zord deploy/zord-console
```

## Step 21: Very Short Checklist

Before deploy, make sure you changed:

- all `image:` values
- create `zord/app-secrets` and `zord/edge-signing-key` in AWS Secrets Manager
- replace unsafe placeholders inside the two JSON template files before uploading
- bucket names in service deployment files
- domain names and ACM ARN in `ingress/public-alb.yaml`
- relay config placeholders in `shared/relay-config.yaml`
- External Secrets Operator is installed
- IRSA permission exists for External Secrets Operator
- app service account IRSA annotation exists if needed

Then run:

```powershell
kubectl apply -k kubernetes/eks
```

## Password Summary

Simple answer:

- `POSTGRES_SUPERUSER_PASSWORD` = one master password for the whole PostgreSQL server
- `EDGE_DB_PASSWORD` etc. = separate app passwords for each service DB user

That is the correct design.

## Best Order To Do Work

If you want the easiest path, do it in this order:

1. push Docker images to ECR
2. update every `image:` line
3. edit `aws-secretsmanager-zord-app-secrets.template.json`
4. edit `aws-secretsmanager-zord-edge-signing-key.template.json`
5. create or update the 2 AWS Secrets Manager secrets
6. install External Secrets Operator
7. give External Secrets Operator IRSA permission
8. fill `shared/relay-config.yaml`
9. fill S3 bucket names in deployment files
10. fill `ingress/public-alb.yaml`
11. add IRSA annotation in `shared/serviceaccount.yaml` if needed
12. run `kubectl kustomize kubernetes/eks`
13. run `kubectl apply -k kubernetes/eks`
14. watch pods and check logs

## Final Note

Do not deploy with placeholder values.

Even if only one password or one bucket name is wrong, some pods will fail to start.

If you want, the next best thing is to make a second document with real example values for your exact AWS account, domains, buckets, and ECR repos.
