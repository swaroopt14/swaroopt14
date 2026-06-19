# Elasticsearch + Kibana Security Setup

Production-grade password authentication for the EFK logging stack on Kubernetes.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY FLOW                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Browser (user) ──→ Kibana Login Page ──→ Elasticsearch          │
│       │                    │                     │                │
│  elastic/devops/      kibana_system         xpack.security       │
│  developer user       service account       enabled: true        │
│                                                                   │
│  Fluentd ──→ Elasticsearch (user: elastic, password from Secret) │
│                                                                   │
│  kibana-init Job ──→ Sets passwords, creates roles/users         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## What Changed (files modified)

| File | Change |
|------|--------|
| `elasticsearch/statefulset.yaml` | `xpack.security.enabled: true`, `ELASTIC_PASSWORD` from Secret |
| `elasticsearch/credentials-secret.yaml` | **NEW** — passwords for elastic, kibana_system, encryption key |
| `kibana/deployment.yaml` | Added `ELASTICSEARCH_USERNAME/PASSWORD`, encryption keys |
| `kibana/init-job.yaml` | All curl commands now use `-u elastic:$PASSWORD` auth |
| `fluentd/configmap.yaml` | Added `user` and `password` to ES output plugins |
| `fluentd/daemonset.yaml` | Added `FLUENT_ELASTICSEARCH_USER/PASSWORD` env vars |

---

## Login Credentials

| Username | Password | Role |
|----------|----------|------|
| `elastic` | `Arealiszord@2026` | Superuser (full admin — ES + Kibana) |
| `kibana_system` | `Arealiszord@2026` | (internal) Kibana ↔ ES connection only |

> Login to Kibana at `https://kibana.zordnet.com` with `elastic` / `Arealiszord@2026`

---

## Deployment Steps (on Bastion EC2)

### Step 1: Create the credentials secret

```bash
kubectl apply -f kubernetes/logging/elasticsearch/credentials-secret.yaml
```

### Step 2: Delete existing ES data (required for security migration)

> **WARNING:** Enabling security on an existing ES cluster requires re-indexing.
> Since ES only stores logs (not business data), it's safe to delete and start fresh.

```bash
# Delete existing elasticsearch PVC data
kubectl delete statefulset elasticsearch -n logging
kubectl delete pvc data-elasticsearch-0 -n logging
```

### Step 3: Deploy Elasticsearch with security enabled

```bash
kubectl apply -f kubernetes/logging/elasticsearch/statefulset.yaml
```

Wait for ES to become ready:
```bash
kubectl get pods -n logging -w
# Wait until elasticsearch-0 is 1/1 Running
```

Verify security is working:
```bash
# This should return 401 Unauthorized
kubectl exec -it elasticsearch-0 -n logging -- curl -s http://localhost:9200

# This should return cluster health
kubectl exec -it elasticsearch-0 -n logging -- curl -s -u "elastic:Arealiszord@2026" http://localhost:9200/_cluster/health
```

### Step 4: Deploy Kibana with authentication

```bash
kubectl apply -f kubernetes/logging/kibana/deployment.yaml
```

### Step 5: Restart Fluentd with credentials

```bash
kubectl rollout restart daemonset fluentd -n logging
```

### Step 6: Run the init job (sets passwords, creates users/roles)

```bash
# Delete old job if exists (jobs are immutable)
kubectl delete job kibana-init -n logging --ignore-not-found
kubectl apply -f kubernetes/logging/kibana/init-job.yaml
```

Watch the job logs:
```bash
kubectl logs -f job/kibana-init -n logging
```

### Step 7: Verify login

Open `https://kibana.zordnet.com` in your browser.
You should see a login page. Use:
- **Username:** `elastic`
- **Password:** `Arealiszord@2026`

---

## Changing Passwords Later

### Change the elastic superuser password:
```bash
# Update the secret
kubectl edit secret elasticsearch-credentials -n logging

# Restart everything
kubectl rollout restart statefulset elasticsearch -n logging
kubectl rollout restart daemonset fluentd -n logging
kubectl rollout restart deployment kibana -n logging
```

### Add a new user via Kibana UI:
1. Login as `elastic` or `devops`
2. Go to **Stack Management → Security → Users**
3. Click **Create User**
4. Assign role: `logs_viewer` (read-only) or `superuser` (admin)

### Add a new user via CLI:
```bash
kubectl exec -it elasticsearch-0 -n logging -- curl -s \
  -u "elastic:Arealiszord@2026" \
  -X PUT "http://localhost:9200/_security/user/newuser" \
  -H "Content-Type: application/json" \
  -d '{"password":"NewUser@2025","roles":["logs_viewer","kibana_user"],"full_name":"New User"}'
```

---

## How It Works (Technical Details)

### Elasticsearch Security (X-Pack — free tier)

Since ES 8.0, X-Pack security is included free in the Basic license:
- **Authentication:** HTTP Basic Auth (username:password)
- **Authorization:** Role-Based Access Control (RBAC)
- **Built-in users:** `elastic` (superuser), `kibana_system` (kibana service)
- **No TLS required** for single-node within cluster (internal traffic only)

Reference: [Elastic Minimal Security Setup](https://www.elastic.co/docs/deploy-manage/security/set-up-minimal-security)

### How passwords are bootstrapped

1. ES starts with `ELASTIC_PASSWORD` env var → sets the `elastic` superuser password
2. `kibana-init` job runs and calls `POST /_security/user/kibana_system/_password` to set that password
3. Kibana connects to ES using `kibana_system` credentials
4. Users login to Kibana with `elastic`, `devops`, or `developer` credentials

### Fluentd authentication

The Fluentd ES output plugin supports `user` and `password` parameters:
```
<match kubernetes.**>
  @type elasticsearch
  user "#{ENV['FLUENT_ELASTICSEARCH_USER']}"
  password "#{ENV['FLUENT_ELASTICSEARCH_PASSWORD']}"
  ...
</match>
```

Reference: [Fluentd Elasticsearch Plugin](https://docs.fluentd.org/v1.0/articles/out_elasticsearch)

---

## Troubleshooting

### Elasticsearch returns 401 to Fluentd
```bash
kubectl logs -l app=fluentd -n logging --tail=5
# If you see: [401] {"error":"security_exception"...}
# Fix: Check FLUENT_ELASTICSEARCH_PASSWORD in fluentd daemonset
kubectl rollout restart daemonset fluentd -n logging
```

### Kibana shows "Kibana server is not ready yet"
```bash
kubectl logs deploy/kibana -n logging --tail=10
# If: "Unable to retrieve version information from Elasticsearch nodes"
# Fix: ELASTICSEARCH_PASSWORD in kibana deployment doesn't match
kubectl rollout restart deployment kibana -n logging
```

### kibana-init job fails
```bash
kubectl logs job/kibana-init -n logging
# Common: ES not ready yet (job retries 10 times)
# If persistent: delete job and re-apply
kubectl delete job kibana-init -n logging
kubectl apply -f kubernetes/logging/kibana/init-job.yaml
```

### Reset elastic password (forgot it)
```bash
# Delete the PVC and restart (loses all logs)
kubectl delete statefulset elasticsearch -n logging
kubectl delete pvc data-elasticsearch-0 -n logging
# Update credentials-secret.yaml with new password
kubectl apply -f kubernetes/logging/elasticsearch/credentials-secret.yaml
kubectl apply -f kubernetes/logging/elasticsearch/statefulset.yaml
```

---

## Security Best Practices Applied

| Practice | Implementation |
|----------|---------------|
| Separate service accounts | Kibana uses `kibana_system`, not `elastic` |
| Least-privilege roles | `developer` user can only read logs |
| Secrets in K8s Secrets | Passwords not hardcoded in YAML |
| Encryption keys | Kibana encrypted saved objects |
| No anonymous access | Every request requires credentials |
| Network isolation | ES not exposed outside cluster |
| Audit logging possible | `xpack.security.audit.enabled` can be turned on |

---

**References:**
- [Elastic: Minimal Security Setup](https://www.elastic.co/docs/deploy-manage/security/set-up-minimal-security)
- [Elastic: Built-in Users](https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/built-in-users)
- [Elastic: Docker Environment Variables](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-configure)
- [Fluentd: ES Output Plugin Auth](https://docs.fluentd.org/v1.0/articles/out_elasticsearch)
- [ACA Group: EFK on K8s with X-Pack](https://acagroup.be/en/blog/how-to-deploy-an-efk-stack-to-kubernetes-with-xpack-security/)

---

**Last Updated:** June 2025  
**Author:** Yaswanth Reddy — Lead DevOps Engineer, Arealis Networks
