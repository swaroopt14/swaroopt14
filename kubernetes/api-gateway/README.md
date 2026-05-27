# Kong API Gateway

Kong Gateway sits in front of all Zord backend services. It handles routing,
rate limiting, authentication, logging, and other API gateway concerns.

## Architecture (Phase 5 — Production)

```
Internet
   ↓ HTTPS (TLS terminated at ALB)
AWS ALB (zordnet.com:443)
   ↓ HTTP
Kong Gateway (api-gateway namespace, 2+ replicas with HPA)
   ├── /api/* → JWT validation → backend services (zord namespace)
   └── /* → zord-console (no JWT, serves Next.js frontend)
```

## Folder Structure

```
kubernetes/api-gateway/
├── kustomization.yaml
├── namespace.yaml
├── README.md
└── kong/
│   ├── configmap.yaml          ← Declarative kong.yaml (routes, plugins, consumers)
│   ├── deployment.yaml         ← Kong 3.7, init container for JWT key injection
│   ├── service.yaml            ← kong-proxy (80/443), kong-admin (8001), kong-metrics (8100)
│   ├── ingress.yaml            ← ALB Ingress → Kong (Phase 5 cutover)
│   ├── jwt-secret.yaml         ← ExternalSecret for RSA public key
│   ├── networkpolicy.yaml      ← Restrict admin API access
│   ├── pdb.yaml                ← PodDisruptionBudget (minAvailable: 1)
│   └── hpa.yaml                ← HorizontalPodAutoscaler (2-6 replicas)
└── konga/
    ├── deployment.yaml         ← Free admin UI for Kong
    └── service.yaml            ← ClusterIP on port 1337
```

## Phase 1 — Core Routing ✅

- Kong runs in DB-less mode (YAML config, no Postgres needed for Kong itself)
- 2 replicas, anti-affinity, rolling updates
- Routes traffic by URL path

## Phase 2 — Security ✅

Plugins added on top of Phase 1 routing:

| Plugin | Scope | Purpose |
|--------|-------|---------|
| `rate-limiting` | Per route | 100 req/min for public APIs, 30 req/min for admin |
| `ip-restriction` | Admin route only | Whitelist office/VPN IPs for `/api/edge/v1/admin/*` |
| `cors` | Global | Allow `zordnet.com` and `localhost:3000` to call APIs |
| `correlation-id` | Global | Auto-generate `X-Request-ID` for tracing |
| `request-size-limiting` | Global | Block payloads larger than 10 MB |

JWT auth setup is staged in the ConfigMap (`consumers: []`) — uncomment when
you wire up the JWT signing key.

## Phase 3 — Observability ✅

| Plugin | Purpose |
|--------|---------|
| `prometheus` | Expose Kong metrics on `:8100/metrics` (RPS, latency, status codes, bandwidth, upstream health) |
| `http-log` | Ship every request log to Fluentd → Elasticsearch (`kong-access-*` index in Kibana) |
| `opentelemetry` | Send traces to OTel Collector → Jaeger; propagates W3C `traceparent` header to backends |

What this gives you:
- **Grafana** can graph Kong RPS, p95 latency, 4xx/5xx rate per route
- **Kibana** has a `kong-access-*` index showing every request hitting the gateway
- **Jaeger** shows a parent span for Kong + child spans for backend services (full request flow)

## Phase 4 — Advanced ✅ (current)

Phase 4 adds upstream-aware features that were not possible with simple `url:`
based services. Three high-traffic services (`zord-edge`, `zord-intent-engine`,
`zord-relay`) and the canary candidate (`zord-intelligence`) now route through
Kong **upstreams** instead of direct URLs.

| Feature | Plugin / Mechanism | Where |
|---------|--------------------|-------|
| Request transformation | `request-transformer` | `/api/edge/v1/bulk-ingest` adds `X-Forwarded-By: kong-gateway` and `X-Gateway-Version: 3.7` |
| Response caching | `proxy-cache` (in-memory) | 60s TTL on `/api/intent/*` and `/api/intelligence/*`, 120s TTL on `/api/evidence/*` |
| Circuit breaker | `upstreams.healthchecks` (active + passive) | Auto-disables a target after 3 active failures or 5 passive 5xx responses; re-enables after 2 successes |
| Canary routing | `upstreams.targets` weights | `zord-intelligence-canary-upstream` configured for 90/10 split (canary target commented out until canary deployment exists) |
| Response hardening | `response-transformer` (global) | Strips `X-Powered-By` and `Server`; adds `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `Referrer-Policy` |

### Circuit breaker behavior

Each upstream runs an active probe to the service's `/health` (or `/healthz`
for intelligence) every 10s. If a target fails 3 consecutive checks, Kong
marks it unhealthy and stops routing to it. Passive checks layer on top:
real-traffic 5xx responses also count toward unhealthy. A target re-enters
rotation after 2 consecutive successful probes.

This works because each backend Service load-balances across multiple pods
already; if one pod is bad, Kong stops using the upstream Service briefly,
then recovers automatically.

### Cache behavior

`proxy-cache` only caches `GET` and `HEAD` responses with status `200` and
`Content-Type: application/json`. Cache is in-memory per Kong pod (no Redis
needed). Each pod has its own cache, so with 2 replicas you'll see ~50% hit
rate on average. Add a `Cache-Control: no-cache` request header from the
client to force a fresh response.

Response includes:
- `X-Cache-Status: Hit` — served from cache
- `X-Cache-Status: Miss` — fetched from upstream and cached
- `X-Cache-Status: Bypass` — request method or status not cacheable

### Enable the canary target

Edit `kong/configmap.yaml`, find `zord-intelligence-canary-upstream`, and
uncomment the second target:

```yaml
targets:
  - target: zord-intelligence.zord.svc.cluster.local:8089
    weight: 90
  - target: zord-intelligence-canary.zord.svc.cluster.local:8089
    weight: 10
```

Then create a `zord-intelligence-canary` Service + Deployment in the `zord`
namespace pointing to a new pod tag. Apply and roll Kong:

```bash
kubectl apply -k kubernetes/api-gateway
kubectl rollout restart deployment/kong -n api-gateway
```

## Routes

| URL Pattern | Forwards To | Plugins |
|-------------|-------------|---------|
| `/api/edge/v1/bulk-ingest` | zord-edge | rate-limit (100/min) |
| `/api/edge/v1/admin/*` | zord-edge | ip-restriction + rate-limit (30/min) |
| `/api/edge/*` | zord-edge | rate-limit (100/min) |
| `/api/intent/*` | zord-intent-engine | rate-limit (100/min) |
| `/api/relay/*` | zord-relay | rate-limit (100/min) |
| `/api/token/*` | zord-token-enclave | rate-limit (100/min) |
| `/api/outcome/*` | zord-outcome-engine | rate-limit (100/min) |
| `/api/evidence/*` | zord-evidence | rate-limit (100/min) |
| `/api/intelligence/*` | zord-intelligence | rate-limit (100/min) |
| `/api/prompt/*` | zord-prompt-layer | rate-limit (100/min) |
| `/*` (catch-all) | zord-console | global plugins only |

`strip_path: true` means `/api/edge/v1/health` is forwarded as `/v1/health`
to zord-edge. The console route preserves the path.

## Update Office IPs for Admin Whitelist

Edit `kong/configmap.yaml` and add your public IP under
`edge-admin` route → `ip-restriction` plugin → `allow:` list:

```yaml
- name: ip-restriction
  config:
    allow:
      - 10.0.0.0/8           # in-cluster traffic
      - 172.16.0.0/12        # private VPC
      - 192.168.0.0/16       # private LAN
      - 203.0.113.10/32      # YOUR OFFICE IP
```

Find your office public IP: `curl ifconfig.me`

Then redeploy:

```bash
kubectl apply -k kubernetes/api-gateway
kubectl rollout restart deployment/kong -n api-gateway
```

## Deploy

```bash
kubectl apply -k kubernetes/api-gateway
```

## Verify

```bash
# All Kong pods running
kubectl get pods -n api-gateway

# Inspect routes + plugins
kubectl port-forward -n api-gateway svc/kong-admin 8001:8001 &
sleep 2
curl -s http://localhost:8001/services | python3 -m json.tool | head -30
curl -s http://localhost:8001/routes | python3 -m json.tool | head -50
curl -s http://localhost:8001/plugins | python3 -m json.tool | head -50
pkill -f "port-forward"

# Test routing through Kong
kubectl port-forward -n api-gateway svc/kong-proxy 8080:80 &
sleep 2
curl -i http://localhost:8080/api/edge/health
curl -i http://localhost:8080/api/intent/health
pkill -f "port-forward"
```

## Test Rate Limit (should fail at request 101)

```bash
kubectl port-forward -n api-gateway svc/kong-proxy 8080:80 &
sleep 2
for i in $(seq 1 105); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/edge/health)
  echo "request $i → $code"
done
pkill -f "port-forward"
# Expect: requests 1-100 → 200, requests 101-105 → 429
```

## Test CORS Preflight

```bash
kubectl port-forward -n api-gateway svc/kong-proxy 8080:80 &
sleep 2
curl -i -X OPTIONS http://localhost:8080/api/edge/health \
  -H "Origin: https://zordnet.com" \
  -H "Access-Control-Request-Method: POST"
pkill -f "port-forward"
# Expect: Access-Control-Allow-Origin: https://zordnet.com
```

## Test IP Restriction on Admin

```bash
kubectl port-forward -n api-gateway svc/kong-proxy 8080:80 &
sleep 2
curl -i http://localhost:8080/api/edge/v1/admin/tenantReg
pkill -f "port-forward"
# Expect: 403 if your IP is not whitelisted
# (port-forward sources from 127.0.0.1 which IS in 10.0.0.0/8 — passes)
```

## Test Cache Behavior (Phase 4)

```bash
kubectl port-forward -n api-gateway svc/kong-proxy 8080:80 &
sleep 2

# First request — Miss (fetched from upstream, cached)
curl -i http://localhost:8080/api/intent/health | grep -i "x-cache-status"
# Expect: X-Cache-Status: Miss

# Second request within 60s — Hit (served from cache)
curl -i http://localhost:8080/api/intent/health | grep -i "x-cache-status"
# Expect: X-Cache-Status: Hit

# Force bypass with Cache-Control header
curl -i -H "Cache-Control: no-cache" http://localhost:8080/api/intent/health | grep -i "x-cache-status"
# Expect: X-Cache-Status: Bypass

pkill -f "port-forward"
```

## Test Circuit Breaker (Phase 4)

```bash
# Watch upstream health via admin API
kubectl port-forward -n api-gateway svc/kong-admin 8001:8001 &
sleep 2

# Check current health of zord-edge-upstream targets
curl -s http://localhost:8001/upstreams/zord-edge-upstream/health | python3 -m json.tool

# Simulate failure: kill all zord-edge pods
kubectl scale deployment/zord-edge -n zord --replicas=0

# Wait ~30s for Kong active health checks to detect (3 fails × 10s interval)
sleep 35
curl -s http://localhost:8001/upstreams/zord-edge-upstream/health | python3 -m json.tool
# Expect: target now shows "health": "UNHEALTHY"

# Restore
kubectl scale deployment/zord-edge -n zord --replicas=1
sleep 30
curl -s http://localhost:8001/upstreams/zord-edge-upstream/health | python3 -m json.tool
# Expect: target back to "HEALTHY" after 2 successful probes

pkill -f "port-forward"
```

## Test Request/Response Headers (Phase 4)

```bash
kubectl port-forward -n api-gateway svc/kong-proxy 8080:80 &
sleep 2

# Verify response headers (security headers added, X-Powered-By removed)
curl -i http://localhost:8080/api/edge/health | grep -iE "x-frame-options|x-content-type-options|strict-transport-security|referrer-policy"
# Expect all 4 headers present

# Verify request headers added on /bulk-ingest path
# (backend logs should show X-Forwarded-By and X-Gateway-Version)
kubectl logs -n zord deploy/zord-edge --tail=20 | grep -i "X-Forwarded-By"

pkill -f "port-forward"
```



Edit `kong/configmap.yaml`, then:

```bash
kubectl apply -k kubernetes/api-gateway
kubectl rollout restart deployment/kong -n api-gateway
```

## Phase 5 — JWT Auth + ALB Cutover ✅

### What Changed

1. **ALB Ingress moved** from `kubernetes/eks/ingress/public-alb.yaml` to
   `kubernetes/api-gateway/kong/ingress.yaml`. The ALB now targets
   `kong-proxy:80` in the `api-gateway` namespace instead of
   `zord-console:3000` in the `zord` namespace.

2. **JWT authentication** enabled on all `/api/*` routes. The `jwt` plugin
   validates RS256 tokens before forwarding to backend services. The
   catch-all `/` route (console frontend) does NOT require JWT — it serves
   the Next.js app directly.

3. **JWT public key** loaded from AWS Secrets Manager via ExternalSecret
   (`zord/kong-jwt-public-key` → `kong-jwt-public-key` Secret in
   `api-gateway` namespace). Mounted at `/kong/jwt/jwt.pub` in the Kong pod.

4. **Three consumers** pre-configured:
   - `zord-frontend` (issuer: `zord-frontend-iss`) — browser sessions
   - `zord-mobile` (issuer: `zord-mobile-iss`) — mobile app
   - `zord-service-account` (issuer: `zord-service-iss`) — service-to-service

### Traffic Flow (Phase 5)

```
Internet
   ↓ HTTPS (TLS terminated at ALB)
AWS ALB (zordnet.com:443)
   ↓ HTTP
Kong Gateway (api-gateway namespace, port 80)
   ├── /api/* routes → JWT validation → backend services (zord namespace)
   └── /* catch-all → zord-console (no JWT, serves frontend)
```

### JWT Token Format

Your auth service must issue tokens with:

```json
{
  "iss": "zord-frontend-iss",
  "exp": 1716825600,
  "sub": "user-id-or-tenant-id",
  "iat": 1716822000
}
```

Sign with the RS256 private key that matches the public key in
`zord/kong-jwt-public-key` in AWS Secrets Manager.

Pass the token as:
- `Authorization: Bearer <token>` header (preferred)
- `?jwt=<token>` query parameter (fallback)

### Setup Steps

1. **Generate RSA key pair** (if you don't have one):
   ```bash
   openssl genrsa -out jwt.key 2048
   openssl rsa -in jwt.key -pubout -out jwt.pub
   ```

2. **Store public key in AWS Secrets Manager**:
   ```bash
   aws secretsmanager create-secret \
     --name zord/kong-jwt-public-key \
     --secret-string "{\"public_key\": \"$(cat jwt.pub)\"}" \
     --region ap-south-1
   ```

3. **Deploy**:
   ```bash
   # Apply Kong with JWT + new ALB Ingress
   kubectl apply -k kubernetes/api-gateway

   # Apply EKS services (old ALB ingress is now commented out)
   kubectl apply -k kubernetes/eks

   # Restart Kong to pick up new config
   kubectl rollout restart deployment/kong -n api-gateway
   ```

4. **Verify ALB targets Kong**:
   ```bash
   # Check the new ALB Ingress is created
   kubectl get ingress -n api-gateway
   # Should show: kong-public → zordnet.com → kong-proxy:80

   # Old ingress should be gone
   kubectl get ingress -n zord
   # Should show: no resources (or empty)
   ```

5. **Test JWT enforcement**:
   ```bash
   # Without token — should get 401
   curl -i https://zordnet.com/api/edge/health
   # Expect: 401 Unauthorized

   # With valid token — should get 200
   curl -i https://zordnet.com/api/edge/health \
     -H "Authorization: Bearer <your-jwt-token>"
   # Expect: 200 OK

   # Frontend (no JWT needed) — should get 200
   curl -i https://zordnet.com/
   # Expect: 200 OK (Next.js HTML)
   ```

### Rollback

If something goes wrong, revert to direct ALB → console routing:

```bash
# 1. Restore old ingress
cd kubernetes/eks/ingress
# Uncomment the Ingress in public-alb.yaml
# Uncomment the resource in kubernetes/eks/kustomization.yaml

# 2. Remove Kong ingress
kubectl delete ingress kong-public -n api-gateway

# 3. Re-apply
kubectl apply -k kubernetes/eks
```

## Phases

- ✅ Phase 1 — Routing
- ✅ Phase 2 — Rate limiting, IP restriction, CORS, correlation IDs, size limit
- ✅ Phase 3 — Prometheus metrics, HTTP logging to EFK, OpenTelemetry tracing
- ✅ Phase 4 — Request transformation, response caching, circuit breakers, canary routing, security headers
- ✅ Phase 5 — JWT auth + ALB cutover (Internet → ALB → Kong → services)

## Konga Admin UI

Konga is a free open-source admin UI for Kong (alternative to paid Kong Manager).

### Access Konga

```bash
kubectl port-forward -n api-gateway svc/konga 1337:1337 &
# Open http://localhost:1337
```

### First-time Setup

1. Create an admin account (username + password)
2. Add a Kong connection:
   - **Name**: `kong-local`
   - **Kong Admin URL**: `http://kong-admin:8001`
3. You can now manage routes, plugins, consumers, and upstreams from the UI

### What You Can Do in Konga

- View all routes and services
- Enable/disable plugins per route
- Manage consumers and their credentials
- Monitor upstream health
- View active connections and request stats

## Production Hardening

| Feature | File | Purpose |
|---------|------|---------|
| PodDisruptionBudget | `kong/pdb.yaml` | Ensures at least 1 Kong pod during node drains |
| HPA (2-6 replicas) | `kong/hpa.yaml` | Auto-scales on CPU (70%) and memory (80%) |
| NetworkPolicy | `kong/networkpolicy.yaml` | Restricts admin API to api-gateway + monitoring namespaces |
| Init container | `kong/deployment.yaml` | Injects JWT public key into kong.yaml at startup |
| Anti-affinity | `kong/deployment.yaml` | Spreads replicas across nodes |
| Rolling update | `kong/deployment.yaml` | Zero-downtime deploys (maxUnavailable: 0) |

## Full Deploy Command

```bash
# Deploy everything
kubectl apply -k kubernetes/api-gateway
kubectl apply -k kubernetes/eks

# Verify
kubectl get pods -n api-gateway
kubectl get ingress -n api-gateway
kubectl get hpa -n api-gateway
```
