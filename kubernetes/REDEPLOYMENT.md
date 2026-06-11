# Redeployment Guide — Deploy Latest Code Changes

---

## Redeploy Config Changes Only (No Image Rebuild)

When you change ConfigMap, secrets, or environment variables (no code change):

```bash
# Pull latest
git pull

# Apply changes
kubectl apply -k kubernetes/eks

# Restart affected services to pick up new config
kubectl rollout restart deployment zord-edge zord-intent-engine -n zord
```

---

## Redeploy Kong Config Changes

When you change routes, plugins, or rate limits in `kong/configmap.yaml`:

```bash
git pull
kubectl apply -k kubernetes/api-gateway
kubectl rollout restart deployment kong-gateway -n api-gateway
kubectl rollout status deployment/kong-gateway -n api-gateway --timeout=60s
```

---

## Redeploy Observability Changes

```bash
git pull

# Monitoring (Grafana/Prometheus)
kubectl apply -k kubernetes/monitoring
kubectl rollout restart deployment grafana prometheus -n monitoring

# Logging (Kibana/Fluentd)
kubectl apply -k kubernetes/logging

# Tracing (Jaeger/OTel)
kubectl apply -k kubernetes/tracing
kubectl rollout restart deployment otel-collector jaeger -n tracing
```

---

## Rollback (If Something Goes Wrong)

### Rollback to previous version

```bash
# Check rollout history
kubectl rollout history deployment/zord-edge -n zord

# Rollback to previous version
kubectl rollout undo deployment/zord-edge -n zord

# Rollback to specific revision
kubectl rollout undo deployment/zord-edge -n zord --to-revision=2

# Watch
kubectl rollout status deployment/zord-edge -n zord
```

### Rollback all services

```bash
for service in zord-edge zord-intent-engine zord-token-enclave zord-relay zord-outcome-engine zord-evidence zord-intelligence zord-prompt-layer zord-console; do
  kubectl rollout undo deployment/${service} -n zord
done
```

---

## Verify After Redeployment

```bash
# Check all pods are running
kubectl get pods -n zord

# Check no CrashLoopBackOff
kubectl get pods -n zord | grep -v Running | grep -v Completed

# Check health endpoints
curl -sk https://api.zordnet.com/edge/health

# Check logs for errors
kubectl logs -n zord deploy/zord-edge --tail=10
```
