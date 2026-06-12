# Performance Testing — Zord Platform

---

## What This Does

Jenkins automatically runs load tests against your production platform every week and sends results to Slack.

```
Every Saturday 3 AM:
  Jenkins → Installs k6 + pandoc → Runs 6 load tests → Generates REPORT.md + REPORT.pdf → Sends to Slack → Archives results
```

---

## 6 Tests That Run

| # | Test | What it does | Virtual Users | Duration |
|---|------|-------------|---------------|----------|
| 1 | Health Check | Hits all 8 service health endpoints | 100 | 3.5 min |
| 2 | Tenant Registration | Creates tenants via admin API | 20 | 3 min |
| 3 | Bulk CSV Ingest | Uploads payment CSV files | 10 | 3 min |
| 4 | Full End-to-End Flow | Register → Ingest → Query Intents → AI Copilot | 20 | 5 min |
| 5 | Rate Limiting | Verifies Kong blocks after 30 req/min | 1 | 20 sec |
| 6 | Spike Test | 0 → 200 users sudden burst | 200 | 1 min |

---

## Performance Targets

| Test | Metric | Pass Condition |
|------|--------|---------------|
| Health Check | p95 latency | < 500ms |
| Tenant Registration | p95 latency | < 2s |
| Bulk Ingest | p95 latency | < 5s |
| Full Flow | p95 latency | < 3s |
| All Tests | Error rate | < 5% |
| Rate Limiting | HTTP 429 returned | After 30 requests |
| Spike Test | Error rate | < 20% |

---

## Jenkins Job Setup

1. Jenkins → **New Item**
2. Name: `performance-tests`
3. Type: **Pipeline**
4. Click **OK**
5. Scroll to **Pipeline**:
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: `https://github.com/Arealis-network/Arealis-Zord-intent.git`
   - Credentials: `github-pat`
   - Branch: `*/main`
   - Script Path: `performance-tests/Jenkinsfile.performance-tests`
6. Scroll to **Build Triggers**:
   - Check **Build periodically**
   - Schedule: `H 3 * * 6`
7. Click **Save**

---

## Slack Notification Setup

### Step 1: Create Slack Incoming Webhook

1. Open: `https://api.slack.com/apps`
2. Click **Create New App** → From scratch
3. Name: `Zord Performance Bot`
4. Select your workspace → Create App
5. Left sidebar → **Incoming Webhooks** → Toggle ON
6. Click **Add New Webhook to Workspace**
7. Select channel: `#zord-performance-testing-bot`
8. Click **Allow**
9. Copy the webhook URL

### Step 2: Add to Jenkins

1. Jenkins → **Manage Jenkins** → **Plugins** → Install **Slack Notification**
2. Jenkins → **Manage Jenkins** → **Credentials** → **Add Credentials**:
   - Kind: **Secret text**
   - Secret: paste webhook URL
   - ID: `slack-webhook`
   - Save
3. Jenkins → **Manage Jenkins** → **System** → Scroll to **Slack**:
   - Workspace: your workspace name
   - Credential: `slack-webhook`
   - Default channel: `#zord-performance-testing-bot`
   - Click **Test Connection** → must show "Success"
   - Save

---

## What Gets Delivered

### In Slack (`#zord-performance-testing-bot`):

```
🚀 Performance Test Results — Build #12
📊 Target: https://api.zordnet.com
⏱️ Duration: 16 min
📋 Full report in Jenkins artifacts

# Zord Platform — Performance Test Report
Date: Sat Jun 14 03:15:00 UTC 2026
Environment: Production (EKS)

| # | Test | Status |
| 01 | health-check | ✅ PASS |
| 02 | tenant-reg | ✅ PASS |
| 03 | bulk-ingest | ✅ PASS |
| 04 | full-flow | ❌ FAIL |
| 05 | rate-limit | ✅ PASS |
| 06 | spike-test | ✅ PASS |
```

### In Jenkins Artifacts (downloadable):

- `REPORT.md` — full markdown report
- `REPORT.pdf` — PDF version (shareable with founders/team)
- `01-health-check-output.txt` — detailed k6 output
- `01-health-check-summary.json` — machine-readable metrics
- `pre-test-nodes.txt` — cluster CPU/memory before tests
- `post-test-pods.txt` — pod status after tests
- `post-test-hpa.txt` — HPA scaling during tests

---

## What Jenkins Pipeline Does (Automatically)

```
1. Checkout code from GitHub
2. Install k6 (load testing tool) — auto, no manual
3. Install pandoc (PDF generator) — auto, no manual
4. Capture cluster state BEFORE tests (kubectl top nodes/pods)
5. Run Test 1: Health Check (100 users)
6. Run Test 2: Tenant Registration (20 users)
7. Run Test 3: Bulk Ingest (10 users)
8. Run Test 4: Full End-to-End Flow (20 users)
9. Run Test 5: Rate Limiting
10. Run Test 6: Spike Test (200 users)
11. Capture cluster state AFTER tests
12. Generate REPORT.md
13. Generate REPORT.pdf
14. Send Slack notification with summary
15. Archive all results as build artifacts
```

---

## View Results After Run

| Where | What you see |
|-------|-------------|
| **Slack** | Summary notification (pass/fail per test) |
| **Jenkins → Build → Artifacts** | Download REPORT.md, REPORT.pdf, all outputs |
| **Grafana** (`grafana.zordnet.com`) | Check Kong + Cluster dashboards for the test time period |
| **Kibana** (`kibana.zordnet.com`) | Filter logs by test time period → see any errors |

---

## Folder Structure

```
performance-tests/
├── README.md                         ← this file
├── Jenkinsfile.performance-tests     ← Jenkins pipeline
├── run-all.sh                        ← alternative: run from CLI
├── generate-report.sh                ← generates REPORT.md + REPORT.pdf
└── scripts/
    ├── 01-health-check.js
    ├── 02-tenant-registration.js
    ├── 03-bulk-ingest.js
    ├── 04-full-flow.js
    ├── 05-rate-limit.js
    └── 06-spike-test.js
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Job not triggering | Check Build Triggers → `H 3 * * 6` is set |
| k6 install fails | Pipeline has fallback (downloads binary directly) |
| All tests timeout | Check if Jenkins agent can reach `api.zordnet.com` |
| 100% failure rate | Check Kong + app pods are running |
| Slack not received | Check: Manage Jenkins → System → Slack → Test Connection |
| PDF not generated | pandoc install failed — .md report still works |
| Rate limit test fails | Kong rate-limiting plugin might be disabled |

---

## Prerequisites

- Jenkins running with Pipeline plugin
- GitHub PAT credential (`github-pat`) configured
- Internet access from Jenkins agent (for k6 + pandoc install)
- `api.zordnet.com` reachable from Jenkins agent
- (Optional) Slack Notification Plugin for Slack alerts
