# Kubernetes Deployment Guide

This guide explains how to deploy the Arealis Zord services from this repo to an EKS cluster.

There are two separate pieces:

- AWS infrastructure repo: `C:\Users\Yaswanth Reddy\OneDrive - vitap.ac.in\Desktop\Zord-Infrastructure-aws`
- Zord app manifests in this repo: `kubernetes/eks`

The infrastructure repo creates AWS Secrets Manager secrets and the EKS cluster. This repo deploys the Zord application stack into that cluster.

## Full Deployment Order

Follow this order from a clean AWS account or fresh deployment.

1. In `Zord-Infrastructure-aws/secret-manager`, create the AWS Secrets Manager containers and write secret values.
2. In `Zord-Infrastructure-aws/EKS-terraform`, create or update the EKS cluster and platform add-ons.
3. In this app repo, build and push all service images to ECR.
4. In this app repo, update Kubernetes manifest values such as image tags, ALB certificate ARN, region, service account IAM role ARN, and relay config.
5. Apply the app manifests:

```powershell
kubectl apply -k kubernetes/eks
```

6. Test the deployment using:

```text
kubernetes/eks_deployment_end-to-end_testing/Readme.md
```

Short version:

```text
Secret Manager -> EKS Terraform -> ECR images -> Kubernetes manifests -> End-to-end testing
```

## Infrastructure Repo Order

### 1. Secret Manager

Folder:

```text
C:\Users\Yaswanth Reddy\OneDrive - vitap.ac.in\Desktop\Zord-Infrastructure-aws\secret-manager
```

GitHub Actions workflow:

```text
Secret Manager Terraform
```

Run:

```text
action = apply
```

This creates and fills:

- `zord/app-secrets`
- `zord/edge-signing-key`

Before running it, make sure GitHub Actions secrets exist:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `TF_STATE_BUCKET`
- `ZORD_APP_SECRETS_JSON`
- `ZORD_EDGE_SIGNING_KEY_JSON`

`ZORD_APP_SECRETS_JSON` must include DB passwords, DSNs, API keys, vault keys, and S3 bucket names.

Important S3 keys:

- `EDGE_S3_BUCKET`
- `INTENT_S3_BUCKET`
- `OUTCOME_S3_BUCKET`
- `EVIDENCE_S3_BUCKET`

### 2. EKS Terraform

Folder:

```text
C:\Users\Yaswanth Reddy\OneDrive - vitap.ac.in\Desktop\Zord-Infrastructure-aws\EKS-terraform
```

GitHub Actions workflow:

```text
EKS Terraform
```

Run:

```text
action = apply
```

This creates or configures:

- EKS cluster
- node group
- VPC/subnets/security groups
- EBS CSI support
- Cluster Autoscaler
- External Secrets Operator IAM access
- other platform IAM roles/outputs

After this step, connect your terminal to EKS:

```powershell
aws eks update-kubeconfig --region <region> --name <cluster-name>
kubectl config current-context
kubectl get nodes
```

Do not continue until nodes show `Ready`.

## Current Manifest Status

All YAML files under `kubernetes/eks` are used. They are all referenced by `kubernetes/eks/kustomization.yaml`, so there are no unused Kubernetes manifest files to delete right now.

The local manifest build passes:

```powershell
kubectl kustomize kubernetes/eks
```

The app manifests will not fully dry-run on a cluster unless the External Secrets CRDs are installed, because this repo uses:

- `ExternalSecret`
- `SecretStore`

## What Gets Deployed

The Kustomize entrypoint is:

```powershell
kubectl apply -k kubernetes/eks
```

It deploys:

- namespace `zord`
- service account `zord-aws-access`
- AWS Secrets Manager wiring through External Secrets
- shared relay and Postgres bootstrap config
- one in-cluster PostgreSQL StatefulSet
- one in-cluster Kafka StatefulSet
- Kafka topic creation Job
- all Zord services
- PDBs and HPAs for app services
- public ALB Ingress for the frontend only

Services:

- `zord-edge`
- `zord-intent-engine`
- `zord-token-enclave`
- `zord-relay`
- `zord-outcome-engine`
- `zord-evidence`
- `zord-intelligence`
- `zord-prompt-layer`
- `zord-console`

## Required EKS Add-ons Before App Deploy

Install these in the EKS cluster before applying `kubernetes/eks`:

- AWS Load Balancer Controller, required by `ingressClassName: alb`
- External Secrets Operator, required by `ExternalSecret` and `SecretStore`
- metrics-server, required by the HPA objects
- EBS CSI driver, required for StatefulSet PVCs if your cluster does not already provide EBS storage

Your Terraform repo already includes EBS CSI and Cluster Autoscaler setup. It does not install the Zord app manifests.

## Important Terraform Repo Notes

In `Zord-Infrastructure-aws/EKS-terraform`, the cluster is currently documented as:

- cluster name: `eksprod`
- region: `us-east-1`

This app repo currently uses several `ap-south-1` values in manifests and ECR image URLs. Before deployment, make the region consistent across:

- EKS cluster region
- ECR image URLs
- `AWS_REGION` environment variables
- `shared/secret-store.yaml`
- ALB ACM certificate ARN

If the cluster is in `us-east-1`, do not leave app manifests pointing to `ap-south-1` unless those resources really live there and cross-region access is intentional.

## Files To Check Before Deployment

### Kustomize entrypoint

File:

```text
kubernetes/eks/kustomization.yaml
```

This is the only file you apply directly. It references every manifest in the deployment set.

### Service account

File:

```text
kubernetes/eks/shared/serviceaccount.yaml
```

Current file only creates:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: zord-aws-access
```

If app pods need S3 or other AWS access, add an IAM role annotation:

```yaml
metadata:
  name: zord-aws-access
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/<zord-app-role>
```

This role should allow only the AWS actions the app needs, for example S3 access to your Zord buckets.

Minimum S3 permissions shape:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::<edge-bucket>/*",
        "arn:aws:s3:::<intent-bucket>/*",
        "arn:aws:s3:::<outcome-bucket>/*",
        "arn:aws:s3:::<evidence-bucket>/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::<edge-bucket>",
        "arn:aws:s3:::<intent-bucket>",
        "arn:aws:s3:::<outcome-bucket>",
        "arn:aws:s3:::<evidence-bucket>"
      ]
    }
  ]
}
```

Important: `EDGE_S3_BUCKET`, `INTENT_S3_BUCKET`, `OUTCOME_S3_BUCKET`, and `EVIDENCE_S3_BUCKET` are only bucket names for the app. The service account annotation is what gives the pods AWS permission to use those buckets.

### Create the S3 IAM role in AWS Console

Use this when you want to create the role manually in AWS Console.

#### 1. Copy the EKS OIDC provider

Open AWS Console:

```text
EKS -> Clusters -> your cluster -> Overview
```

Find:

```text
OpenID Connect provider URL
```

Copy it. It looks like:

```text
https://oidc.eks.ap-south-1.amazonaws.com/id/ABC123
```

For IAM trust policy, remove `https://`.

Use this shape:

```text
oidc.eks.ap-south-1.amazonaws.com/id/ABC123
```

#### 2. Create the S3 policy

Go to:

```text
IAM -> Policies -> Create policy -> JSON
```

Paste this policy and replace the bucket names:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_EDGE_BUCKET/*",
        "arn:aws:s3:::YOUR_INTENT_BUCKET/*",
        "arn:aws:s3:::YOUR_OUTCOME_BUCKET/*",
        "arn:aws:s3:::YOUR_EVIDENCE_BUCKET/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_EDGE_BUCKET",
        "arn:aws:s3:::YOUR_INTENT_BUCKET",
        "arn:aws:s3:::YOUR_OUTCOME_BUCKET",
        "arn:aws:s3:::YOUR_EVIDENCE_BUCKET"
      ]
    }
  ]
}
```

Click `Next`.

Use this policy name:

```text
ZordAppS3AccessPolicy
```

Click `Create policy`.

#### 3. Create the IAM role

Go to:

```text
IAM -> Roles -> Create role
```

For trusted entity type, choose:

```text
Custom trust policy
```

Paste this trust policy and replace:

- `<ACCOUNT_ID>`
- `<OIDC_WITHOUT_HTTPS>`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/<OIDC_WITHOUT_HTTPS>"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "<OIDC_WITHOUT_HTTPS>:aud": "sts.amazonaws.com",
          "<OIDC_WITHOUT_HTTPS>:sub": "system:serviceaccount:zord:zord-aws-access"
        }
      }
    }
  ]
}
```

Example:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::522189039032:oidc-provider/oidc.eks.ap-south-1.amazonaws.com/id/ABC123"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.ap-south-1.amazonaws.com/id/ABC123:aud": "sts.amazonaws.com",
          "oidc.eks.ap-south-1.amazonaws.com/id/ABC123:sub": "system:serviceaccount:zord:zord-aws-access"
        }
      }
    }
  ]
}
```

Click `Next`.

#### 4. Attach the S3 policy

Search for:

```text
ZordAppS3AccessPolicy
```

Select it, then click `Next`.

Use this role name:

```text
ZordAppS3AccessRole
```

Click `Create role`.

#### 5. Copy the role ARN

Open:

```text
IAM -> Roles -> ZordAppS3AccessRole
```

Copy the ARN. It looks like:

```text
arn:aws:iam::522189039032:role/ZordAppS3AccessRole
```

#### 6. Add the role ARN to the Kubernetes service account

Open:

```text
kubernetes/eks/shared/serviceaccount.yaml
```

Use:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: zord-aws-access
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::522189039032:role/ZordAppS3AccessRole
```

Replace the ARN with your real role ARN.

#### 7. Apply and restart the S3 services

Apply:

```powershell
kubectl apply -k kubernetes/eks
```

Restart the services that use S3:

```powershell
kubectl rollout restart deploy/zord-edge -n zord
kubectl rollout restart deploy/zord-intent-engine -n zord
kubectl rollout restart deploy/zord-outcome-engine -n zord
kubectl rollout restart deploy/zord-evidence -n zord
```

### External Secrets

Files:

```text
kubernetes/eks/shared/secret-store.yaml
kubernetes/eks/shared/external-secret-app-secrets.yaml
kubernetes/eks/shared/external-secret-edge-signing-key.yaml
```

These expect AWS Secrets Manager secrets:

- `zord/app-secrets`
- `zord/edge-signing-key`

`zord/app-secrets` must contain the keys referenced by all deployments, including:

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
- `EDGE_S3_BUCKET`
- `INTENT_S3_BUCKET`
- `OUTCOME_S3_BUCKET`
- `EVIDENCE_S3_BUCKET`
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

`zord/edge-signing-key` must contain:

- `ed25519_private.pem`

### Relay config

File:

```text
kubernetes/eks/shared/relay-config.yaml
```

Replace all unsafe placeholders:

- `replace-me`
- `postgres://relay_user:replace-me@zord-postgres:5432/zord_relay_db?sslmode=disable`
- `https://replace-me-psp.example.com`

Also check that the relay DB password inside the URL matches `RELAY_DB_PASSWORD`.

### Service deployments

Folder:

```text
kubernetes/eks/services
```

Each service has:

- `deployment.yaml`
- `service.yaml`
- `pdb.yaml`
- `hpa.yaml`

Before deployment, confirm every `image:` points to an image that exists in ECR and is pullable by your EKS nodes.

Current image account/region pattern:

```text
522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/<service>:<tag>
```

Change these if your ECR account, region, repo name, or tag is different.

### S3 bucket names

S3 bucket names are not hardcoded in deployment YAML.

Do not edit the service deployment files just to change bucket names. Update the AWS Secrets Manager value instead:

```text
AWS Secrets Manager secret: zord/app-secrets
GitHub Actions secret source: ZORD_APP_SECRETS_JSON
Infrastructure repo guide: Zord-Infrastructure-aws/secret-manager/README.md
```

These services still receive the app environment variable `S3_BUCKET`, but Kubernetes loads it from `zord-app-secrets`:

- `zord-edge` reads `EDGE_S3_BUCKET`
- `zord-intent-engine` reads `INTENT_S3_BUCKET`
- `zord-outcome-engine` reads `OUTCOME_S3_BUCKET`
- `zord-evidence` reads `EVIDENCE_S3_BUCKET`

Files to check:

- `kubernetes/eks/services/zord-edge/deployment.yaml`
- `kubernetes/eks/services/zord-intent-engine/deployment.yaml`
- `kubernetes/eks/services/zord-outcome-engine/deployment.yaml`
- `kubernetes/eks/services/zord-evidence/deployment.yaml`

Those files should contain `valueFrom.secretKeyRef`, not real bucket names.

### Public ALB ingress

File:

```text
kubernetes/eks/ingress/public-alb.yaml
```

Current public host:

- `zordnet.com`

Production access pattern:

```text
Public internet -> zordnet.com -> zord-console
zord-console server-side API routes -> private Kubernetes services
```

The backend services are not exposed through the public ingress. The browser should call same-origin frontend API routes such as `/api/prod/...` and `/api/prompt-layer/...`; then the Next.js server calls internal cluster DNS names like `http://zord-edge:8080` and `http://zord-intent-engine:8083`.

If you later need public API access for outside partners, create a separate reviewed ingress host such as `api.zordnet.com` and expose only the gateway service `zord-edge`, not every backend service.

Important: the certificate annotation must be a real ACM certificate ARN.

Current file uses this shape:

```yaml
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-south-1:522189039032:certificate/6dc91f57-59fd-4e76-b6ae-8cc53ffc6564
```

If you change AWS account, region, certificate, or domain, replace it with the new ACM ARN.

Required shape:

```yaml
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:<region>:<account-id>:certificate/<certificate-id>
```

For ALB HTTPS, the ACM certificate must be in the same region as the ALB/EKS cluster.

## Build And Push Images

Build each service and push to ECR before applying the manifests.

Example for `zord-edge`:

```powershell
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 522189039032.dkr.ecr.ap-south-1.amazonaws.com
docker build -t 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-edge:v2 .\backend\zord-edge
docker push 522189039032.dkr.ecr.ap-south-1.amazonaws.com/zord/zord-edge:v2
```

Repeat for:

- `backend/zord-edge`
- `backend/zord-intent-engine`
- `backend/zord-token-enclave`
- `backend/zord-relay`
- `backend/zord-outcome-engine`
- `backend/zord-evidence`
- `backend/zord-intelligence`
- `backend/zord-prompt-layer`
- `backend/zord-console`

## Create Or Update AWS Secrets

Create `zord/app-secrets` as JSON in AWS Secrets Manager.

If you are using the infrastructure repo workflow, update the GitHub repository secret named:

```text
ZORD_APP_SECRETS_JSON
```

Then rerun the `secret-manager` workflow with `apply`. That workflow writes the JSON into AWS Secrets Manager secret `zord/app-secrets`.

Example shape:

```json
{
  "POSTGRES_SUPERUSER_PASSWORD": "replace-with-real-value",
  "EDGE_DB_PASSWORD": "replace-with-real-value",
  "INTENT_DB_PASSWORD": "replace-with-real-value",
  "RELAY_DB_PASSWORD": "replace-with-real-value",
  "TOKEN_DB_PASSWORD": "replace-with-real-value",
  "OUTCOME_DB_PASSWORD": "replace-with-real-value",
  "EVIDENCE_DB_PASSWORD": "replace-with-real-value",
  "INTELLIGENCE_DB_PASSWORD": "replace-with-real-value",
  "ZORD_VAULT_KEY": "replace-with-real-value",
  "INTERNAL_ADMIN_KEY": "replace-with-real-value",
  "MASTER_KEY": "replace-with-real-value",
  "TOKEN_SECRET": "replace-with-real-value",
  "EVIDENCE_SIGNING_PRIVATE_KEY_BASE64": "replace-with-real-value",
  "EVIDENCE_ARCHIVE_ENCRYPTION_KEY_BASE64": "replace-with-real-value",
  "GEMINI_API_KEYS": "replace-with-real-value",
  "EDGE_S3_BUCKET": "your-edge-bucket-name",
  "INTENT_S3_BUCKET": "your-intent-bucket-name",
  "OUTCOME_S3_BUCKET": "your-outcome-bucket-name",
  "EVIDENCE_S3_BUCKET": "your-evidence-bucket-name",
  "RELAY_SERVICES_0_AUTH_TOKEN": "replace-with-real-value",
  "RELAY_SERVICES_1_AUTH_TOKEN": "replace-with-real-value",
  "RELAY_SERVICES_2_AUTH_TOKEN": "replace-with-real-value",
  "RELAY_DB_URL": "postgres://relay_user:replace-with-real-value@zord-postgres:5432/zord_relay_db?sslmode=disable",
  "INTELLIGENCE_DATABASE_URL": "postgres://zpi:replace-with-real-value@zord-postgres:5432/zord_intelligence?sslmode=disable",
  "EDGE_READ_DSN": "postgres://zord_user:replace-with-real-value@zord-postgres:5432/zord_edge_db?sslmode=disable",
  "INTENT_READ_DSN": "postgres://intent_user:replace-with-real-value@zord-postgres:5432/zord_intent_engine_db?sslmode=disable",
  "RELAY_READ_DSN": "postgres://relay_user:replace-with-real-value@zord-postgres:5432/zord_relay_db?sslmode=disable",
  "INTELLIGENCE_READ_DSN": "postgres://zpi:replace-with-real-value@zord-postgres:5432/zord_intelligence?sslmode=disable",
  "EVIDENCE_READ_DSN": "postgres://evidence_user:replace-with-real-value@zord-postgres:5432/zord_evidence_db?sslmode=disable"
}
```

Create `zord/edge-signing-key` as JSON:

```json
{
  "ed25519_private.pem": "-----BEGIN PRIVATE KEY-----\nREAL_KEY_HERE\n-----END PRIVATE KEY-----"
}
```

AWS CLI example:

```powershell
aws secretsmanager create-secret --name zord/app-secrets --secret-string file://zord-app-secrets.json --region ap-south-1
aws secretsmanager create-secret --name zord/edge-signing-key --secret-string file://zord-edge-signing-key.json --region ap-south-1
```

If they already exist:

```powershell
aws secretsmanager update-secret --secret-id zord/app-secrets --secret-string file://zord-app-secrets.json --region ap-south-1
aws secretsmanager update-secret --secret-id zord/edge-signing-key --secret-string file://zord-edge-signing-key.json --region ap-south-1
```

## Deployment Order

Use this checklist when you are ready to deploy the app manifests from this repo.

1. Confirm Secret Manager workflow already succeeded.
2. Confirm EKS Terraform workflow already succeeded.
3. Confirm `kubectl` is connected to EKS:

```powershell
aws eks update-kubeconfig --region <region> --name <cluster-name>
kubectl config current-context
kubectl get nodes
```

4. Confirm required add-ons exist:

```powershell
kubectl get pods -n external-secrets
kubectl get pods -n kube-system | Select-String metrics-server
kubectl get deployment -A | Select-String aws-load-balancer-controller
kubectl get csidriver
```

5. Push all service images to ECR.
6. Update image names, regions, relay config, service account IAM annotation, and ingress certificate ARN.
7. Create or update AWS Secrets Manager secrets. For S3 bucket names, update `ZORD_APP_SECRETS_JSON` in GitHub or update `zord/app-secrets` directly in AWS Secrets Manager.
8. Build manifests locally:

```powershell
kubectl kustomize kubernetes/eks
```

9. Apply:

```powershell
kubectl apply -k kubernetes/eks
```

10. Watch pods:

```powershell
kubectl get pods -n zord -w
```

11. Run full end-to-end testing:

```text
kubernetes/eks_deployment_end-to-end_testing/Readme.md
```

## Verify Deployment

Quick verification:

```powershell
kubectl get ns
kubectl get pods -n zord
kubectl get svc -n zord
kubectl get ingress -n zord
kubectl get hpa -n zord
kubectl get pdb -n zord
kubectl get externalsecret -n zord
kubectl get secret zord-app-secrets -n zord
kubectl get secret zord-edge-signing-key -n zord
```

Frontend verification:

```powershell
curl https://zordnet.com/api/health
```

Browser verification:

```text
https://zordnet.com
```

Check important logs:

```powershell
kubectl logs -n zord statefulset/zord-postgres
kubectl logs -n zord statefulset/zord-kafka
kubectl logs -n zord job/zord-kafka-topics
kubectl logs -n zord deploy/zord-edge
kubectl logs -n zord deploy/zord-intent-engine
kubectl logs -n zord deploy/zord-relay
kubectl logs -n zord deploy/zord-console
```

## Common Errors

### Wrong kubectl context

If this prints `docker-desktop`, you are not deploying to EKS:

```powershell
kubectl config current-context
```

Run `aws eks update-kubeconfig` first.

### ExternalSecret or SecretStore not found

Error:

```text
no matches for kind "ExternalSecret"
no matches for kind "SecretStore"
```

Fix: install External Secrets Operator before applying this repo.

### Ingress does not create ALB

Check:

- AWS Load Balancer Controller is installed
- `ingressClassName: alb` is supported
- ACM certificate ARN is valid
- public subnets are tagged correctly
- domain DNS points to the ALB after it is created

### Pods stuck in CreateContainerConfigError

Most likely a missing secret key. Check:

```powershell
kubectl describe pod <pod-name> -n zord
kubectl describe externalsecret zord-app-secrets -n zord
```

### ImagePullBackOff

Check:

- image exists in ECR
- tag is correct
- node IAM role can pull ECR images
- ECR region matches the image URL

### HPA shows unknown metrics

Install or fix metrics-server:

```powershell
kubectl get pods -n kube-system | Select-String metrics-server
```

## Final Pre-Deploy Checklist

- kubectl context points to EKS, not Docker Desktop
- all service images are pushed to ECR
- all `image:` values are correct
- AWS region is consistent
- `zord/app-secrets` exists in AWS Secrets Manager
- `zord/edge-signing-key` exists in AWS Secrets Manager
- External Secrets Operator can read both AWS secrets
- `zord-aws-access` has IAM permissions if services need S3 access
- S3 bucket names are present in `zord/app-secrets`
- relay PSP URL and auth tokens are real
- ALB certificate ARN is real
- AWS Load Balancer Controller is installed
- metrics-server is installed
- `kubectl kustomize kubernetes/eks` succeeds

Do not deploy with placeholder values. One wrong bucket, password, image tag, or certificate ARN can stop part of the stack from starting.
