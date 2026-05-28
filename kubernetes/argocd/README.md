# Argo CD GitOps — Deployment Guide

Argo CD watches your GitHub repo and automatically deploys changes to EKS. No more manual `kubectl apply`.

---

## How It Works

```
Developer pushes code → Jenkins builds image → Jenkins updates deployment.yaml → Git push
                                                                                    │
                                                                    Argo CD detects change
                                                                                    │
                                                                    Auto-deploys to EKS
                                                                                    │
                                                                    You see it in Argo CD UI
```

**Before (manual):**
```bash
# You had to run this every time
kubectl apply -k kubernetes/eks
```

**After (automated):**
```
Jenkins pushes updated deployment.yaml to GitHub → Argo CD auto-deploys → done
```

---

## What Argo CD Watches

| App Name | GitHub Path | Deploys To | What It Contains |
|----------|-------------|-----------|-----------------|
| `zord-platform` | `kubernetes/eks` | `zord` namespace | All 9 microservices + Postgres + Kafka |
| `kong-api-gateway` | `kubernetes/api-gateway` | `api-gateway` namespace | Kong Gateway + Admin UI |
| `monitoring` | `kubernetes/monitoring` | `monitoring` namespace | Prometheus + Grafana |
| `logging` | `kubernetes/logging` | `logging` namespace | Elasticsearch + Fluentd + Kibana |
| `tracing` | `kubernetes/tracing` | `tracing` namespace | OTel Collector + Jaeger |

---

## Install Argo CD (One-Time Setup)

### Step 1: Create Namespace

```bash
kubectl apply -f kubernetes/argocd/namespace.yaml
```

### Step 2: Install Argo CD

```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.3/manifests/install.yaml
```

Wait for all pods to be ready:

```bash
kubectl get pods -n argocd -w
```

Expected (all Running):
```
argocd-application-controller-0    1/1   Running
argocd-dex-server-xxx              1/1   Running
argocd-notifications-controller-xxx 1/1  Running
argocd-redis-xxx                   1/1   Running
argocd-repo-server-xxx             1/1   Running
argocd-server-xxx                  1/1   Running
```

### Step 3: Configure Argo CD (Disable Internal TLS)

```bash
kubectl apply -f kubernetes/argocd/argocd-cm-patch.yaml
```

Restart the server to pick up the config:

```bash
kubectl rollout restart deployment argocd-server -n argocd
```

### Step 4: Get Initial Admin Password

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

Save this password. Username is `admin`.

### Step 5: Create ALB Ingress (Public Access)

```bash
kubectl apply -f kubernetes/argocd/ingress.yaml
```

### Step 6: Get ALB Address

```bash
kubectl get ingress -n argocd
```

Add DNS record:
```
argocd.zordnet.com → CNAME → (ALB address from above)
```

### Step 7: Access Argo CD UI

Open: `https://argocd.zordnet.com`

Login:
- Username: `admin`
- Password: (from Step 4)

**Change the password immediately after first login:**
- Settings → User Info → Update Password

---

## Register Your GitHub Repo

### Option A: Via UI

1. Open `https://argocd.zordnet.com`
2. Go to **Settings** → **Repositories** → **Connect Repo**
3. Fill in:
   - Connection method: `HTTPS`
   - Repository URL: `https://github.com/Arealis-network/Arealis-Zord-intent.git`
   - Username: your GitHub username
   - Password: GitHub Personal Access Token (with repo read access)
4. Click **Connect**

### Option B: Via CLI

```bash
# Install Argo CD CLI
# macOS: brew install argocd
# Linux: curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64 && chmod +x argocd && sudo mv argocd /usr/local/bin/

# Login
argocd login argocd.zordnet.com --username admin --password <your-password>

# Add repo
argocd repo add https://github.com/Arealis-network/Arealis-Zord-intent.git \
  --username <github-username> \
  --password <github-pat>
```

---

## Create Applications (Auto-Deploy)

### Option A: Via UI (Click-by-Click)

1. Open Argo CD UI → **New App**
2. Fill in for each app:

**App: zord-platform**
| Field | Value |
|-------|-------|
| Application Name | `zord-platform` |
| Project | `default` |
| Sync Policy | `Automatic` |
| Repository URL | `https://github.com/Arealis-network/Arealis-Zord-intent.git` |
| Revision | `main` |
| Path | `kubernetes/eks` |
| Cluster URL | `https://kubernetes.default.svc` |
| Namespace | `zord` |
| Auto-Create Namespace | ✅ |
| Self Heal | ✅ |
| Prune | ✅ |

Repeat for:
- `kong-api-gateway` → Path: `kubernetes/api-gateway` → Namespace: `api-gateway`
- `monitoring` → Path: `kubernetes/monitoring` → Namespace: `monitoring`
- `logging` → Path: `kubernetes/logging` → Namespace: `logging`
- `tracing` → Path: `kubernetes/tracing` → Namespace: `tracing`

### Option B: Via YAML (Recommended — GitOps way)

```bash
kubectl apply -f kubernetes/argocd/apps/
```

This creates all 5 applications at once. Argo CD immediately starts syncing.

---

## Verify Deployment

### Check in UI

Open `https://argocd.zordnet.com` → you should see 5 apps:

| App | Status | Health |
|-----|--------|--------|
| zord-platform | Synced ✅ | Healthy 💚 |
| kong-api-gateway | Synced ✅ | Healthy 💚 |
| monitoring | Synced ✅ | Healthy 💚 |
| logging | Synced ✅ | Healthy 💚 |
| tracing | Synced ✅ | Healthy 💚 |

### Check via CLI

```bash
argocd app list
argocd app get zord-platform
argocd app get kong-api-gateway
```

---

## How Auto-Deploy Works

### Scenario 1: Jenkins builds new image

1. Jenkins builds `zord-edge:v4`
2. Jenkins pushes to ECR
3. Jenkins updates `kubernetes/eks/services/zord-edge/deployment.yaml` (image tag → v4)
4. Jenkins pushes to GitHub (`main` branch)
5. **Argo CD detects the change within 3 minutes**
6. Argo CD applies the new deployment.yaml
7. Kubernetes does rolling update (zero downtime)
8. You see "Synced" in Argo CD UI

### Scenario 2: You change Kong config

1. You edit `kubernetes/api-gateway/kong/configmap.yaml` (add a new route)
2. You push to GitHub
3. **Argo CD detects the change**
4. Argo CD applies the updated ConfigMap
5. Kong picks up the new config on next restart

### Scenario 3: You change rate limits

1. Edit `kubernetes/api-gateway/kong/configmap.yaml`
2. Push to GitHub
3. Argo CD syncs
4. Restart Kong: Argo CD won't auto-restart pods for ConfigMap changes
5. Manual restart needed: `kubectl rollout restart deployment/kong-gateway -n api-gateway`

---

## Sync Settings Explained

| Setting | What it does |
|---------|-------------|
| `automated` | Argo CD syncs automatically (no manual click needed) |
| `prune: true` | If you delete a file from Git, Argo CD deletes it from cluster |
| `selfHeal: true` | If someone manually changes something in cluster, Argo CD reverts it to match Git |
| `CreateNamespace=true` | Creates the namespace if it doesn't exist |
| `retry: 3` | Retries failed syncs up to 3 times |

---

## Polling Interval

By default, Argo CD checks your repo every **3 minutes**. To make it faster:

### Option 1: Webhook (Instant — Recommended)

Add a GitHub webhook so Argo CD syncs immediately on push:

1. Go to GitHub repo → Settings → Webhooks → Add webhook
2. Payload URL: `https://argocd.zordnet.com/api/webhook`
3. Content type: `application/json`
4. Events: `Just the push event`
5. Click Add webhook

Now changes deploy within **seconds** of pushing.

### Option 2: Reduce polling interval

Edit Argo CD config:
```bash
kubectl edit configmap argocd-cm -n argocd
```

Add:
```yaml
data:
  timeout.reconciliation: 60s
```

This checks every 60 seconds instead of 180.

---

## Rollback

### Via UI

1. Open app in Argo CD UI
2. Click **History and Rollback**
3. Select previous version
4. Click **Rollback**

### Via CLI

```bash
# See history
argocd app history zord-platform

# Rollback to previous version
argocd app rollback zord-platform
```

---

## Troubleshooting

### App shows "OutOfSync"

```bash
argocd app get zord-platform
argocd app diff zord-platform
```

This shows what's different between Git and cluster.

### App shows "Degraded"

A pod is unhealthy. Click the app in UI → find the red resource → check events/logs.

### App shows "Unknown"

Argo CD can't reach the cluster or the namespace doesn't exist.

```bash
kubectl get pods -n argocd
# Check argocd-application-controller is running
```

### Sync failed

```bash
argocd app sync zord-platform --force
```

### Can't connect to repo

```bash
argocd repo list
# Check if repo shows "Successful" connection status
```

If not, re-add the repo with correct credentials.

---

## Folder Structure

```
kubernetes/argocd/
├── kustomization.yaml          ← reference (not used for install)
├── namespace.yaml              ← argocd namespace
├── secret.yaml                 ← admin credentials reference
├── argocd-cm-patch.yaml        ← disable internal TLS (ALB handles it)
├── ingress.yaml                ← argocd.zordnet.com ALB Ingress
├── apps/
│   ├── zord-app.yaml           ← watches kubernetes/eks
│   ├── kong-app.yaml           ← watches kubernetes/api-gateway
│   ├── monitoring-app.yaml     ← watches kubernetes/monitoring
│   ├── logging-app.yaml        ← watches kubernetes/logging
│   └── tracing-app.yaml        ← watches kubernetes/tracing
└── README.md                   ← this file
```

---

## DNS Record

| Domain | Points to | Purpose |
|--------|-----------|---------|
| `argocd.zordnet.com` | Observability ALB (shared) | Argo CD UI |

---

## Security Notes

- Argo CD UI requires login (admin + password)
- Change the default password immediately after first login
- GitHub repo access uses a Personal Access Token (read-only is sufficient)
- Argo CD server internal TLS is disabled (ALB handles HTTPS termination)
- The `argocd-server` is only accessible via the ALB Ingress (not directly)
- Consider enabling SSO (GitHub OAuth) for team access instead of shared admin password

---

## Complete Deploy Order (Fresh Cluster)

```bash
# 1. Install Argo CD
kubectl apply -f kubernetes/argocd/namespace.yaml
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.3/manifests/install.yaml
kubectl get pods -n argocd -w  # wait for all Running

# 2. Configure
kubectl apply -f kubernetes/argocd/argocd-cm-patch.yaml
kubectl rollout restart deployment argocd-server -n argocd

# 3. Get password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 4. Expose UI
kubectl apply -f kubernetes/argocd/ingress.yaml

# 5. Add DNS: argocd.zordnet.com → ALB

# 6. Login to UI, connect GitHub repo

# 7. Create all apps (auto-deploys everything)
kubectl apply -f kubernetes/argocd/apps/

# Done! Argo CD now manages all deployments automatically.
# Any push to main branch → auto-deploy within 3 minutes (or instantly with webhook)
```

---

## After Setup — Your New Workflow

**Old workflow:**
```
Code change → Jenkins build → kubectl apply (manual) → hope it works
```

**New workflow:**
```
Code change → Jenkins build → Git push → Argo CD auto-deploys → see status in UI → rollback if needed
```

You never run `kubectl apply` again. Everything is automated.
