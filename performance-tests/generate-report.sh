#!/bin/bash
# Generates a markdown + HTML performance report from k6 JSON summaries
RESULTS_DIR="${1:-.}"

cat > "${RESULTS_DIR}/REPORT.md" << EOF
# Zord Platform — Performance Test Report

**Date:** $(date)
**Environment:** Production (EKS)
**Base URL:** https://api.zordnet.com

---

## Test Summary

| # | Test | Status | Details |
|---|------|--------|---------|
EOF

# Parse each summary JSON and add to report
for i in 01 02 03 04 05 06; do
  SUMMARY="${RESULTS_DIR}/${i}-*-summary.json"
  OUTPUT="${RESULTS_DIR}/${i}-*-output.txt"

  SUMMARY_FILE=$(ls ${SUMMARY} 2>/dev/null | head -1)
  OUTPUT_FILE=$(ls ${OUTPUT} 2>/dev/null | head -1)

  if [ -z "${SUMMARY_FILE}" ] && [ -z "${OUTPUT_FILE}" ]; then
    continue
  fi

  # Extract test name from filename
  TEST_NAME=$(basename "${OUTPUT_FILE}" | sed 's/-output.txt//' | sed "s/${i}-//")

  # Check if thresholds passed — look for k6 threshold error message
  if grep -q 'level=error msg="thresholds' "${OUTPUT_FILE}" 2>/dev/null; then
    STATUS="❌ FAIL"
  else
    STATUS="✅ PASS"
  fi

  echo "| ${i} | ${TEST_NAME} | ${STATUS} | [output](${i}-${TEST_NAME}-output.txt) |" >> "${RESULTS_DIR}/REPORT.md"
done

cat >> "${RESULTS_DIR}/REPORT.md" << 'EOF'

---

## Cluster State Before Tests

```
EOF

cat "${RESULTS_DIR}/pre-test-nodes.txt" >> "${RESULTS_DIR}/REPORT.md" 2>/dev/null
echo '```' >> "${RESULTS_DIR}/REPORT.md"

cat >> "${RESULTS_DIR}/REPORT.md" << 'EOF'

## Cluster State After Tests

```
EOF

cat "${RESULTS_DIR}/post-test-nodes.txt" >> "${RESULTS_DIR}/REPORT.md" 2>/dev/null
echo '```' >> "${RESULTS_DIR}/REPORT.md"

cat >> "${RESULTS_DIR}/REPORT.md" << 'EOF'

## Pod Status After Tests

```
EOF

cat "${RESULTS_DIR}/post-test-pod-status.txt" >> "${RESULTS_DIR}/REPORT.md" 2>/dev/null
echo '```' >> "${RESULTS_DIR}/REPORT.md"

cat >> "${RESULTS_DIR}/REPORT.md" << 'EOF'

## HPA Status After Tests

```
EOF

cat "${RESULTS_DIR}/post-test-hpa.txt" >> "${RESULTS_DIR}/REPORT.md" 2>/dev/null
echo '```' >> "${RESULTS_DIR}/REPORT.md"

cat >> "${RESULTS_DIR}/REPORT.md" << 'EOF'

---

## Performance Targets vs Actual

| Metric | Target | Test |
|--------|--------|------|
| Health check p95 latency | < 500ms | Test 1 |
| Tenant registration p95 | < 2s | Test 2 |
| Bulk ingest p95 | < 5s | Test 3 |
| Full flow p95 | < 3s | Test 4 |
| Rate limiting triggers | At 30 req/min | Test 5 |
| Spike handling (200 users) | < 20% errors | Test 6 |

---

## How to Read Results

Each test output file contains:
- `http_req_duration` — response time (p50, p90, p95, p99, max)
- `http_req_failed` — percentage of failed requests
- `http_reqs` — total requests made
- `checks` — pass/fail for custom assertions
- `vus` — concurrent virtual users

---

## Next Steps

- [ ] Review any FAILED tests
- [ ] Check Grafana for CPU/memory spikes during test period
- [ ] Check Kibana for error logs during test period
- [ ] Share report with team
EOF

echo "Report generated: ${RESULTS_DIR}/REPORT.md"

# Generate styled HTML report (no LaTeX dependency needed)
if command -v pandoc &> /dev/null; then
  pandoc "${RESULTS_DIR}/REPORT.md" \
    -o "${RESULTS_DIR}/REPORT.html" \
    --standalone \
    --metadata title="Zord Performance Report" \
    --css="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown.min.css" \
    2>/dev/null && echo "HTML report generated: ${RESULTS_DIR}/REPORT.html"
else
  # Fallback: generate basic HTML without pandoc
  echo "Note: Install pandoc for HTML report generation: sudo yum install -y pandoc"
  cat > "${RESULTS_DIR}/REPORT.html" << HTMLEOF
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Zord Performance Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #24292f; background: #f6f8fa; }
    .card { background: white; border-radius: 8px; padding: 24px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
    h1 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #f1f5f9; text-align: left; padding: 10px 12px; border: 1px solid #e2e8f0; }
    td { padding: 10px 12px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    .pass { color: #16a34a; font-weight: 600; }
    .fail { color: #dc2626; font-weight: 600; }
    pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 6px; overflow-x: auto; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 32px; border-radius: 8px; margin-bottom: 24px; }
    .header h1 { color: white; border: none; margin: 0; }
    .header p { opacity: 0.9; margin: 8px 0 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Zord Performance Test Report</h1>
    <p>Generated: $(date) | Environment: Production (EKS)</p>
  </div>
  <div class="card">
HTMLEOF

  # Convert markdown table to HTML (basic conversion)
  sed 's/✅ PASS/<span class="pass">✅ PASS<\/span>/g; s/❌ FAIL/<span class="fail">❌ FAIL<\/span>/g' "${RESULTS_DIR}/REPORT.md" | \
    sed 's/^# /<h1>/; s/^## /<h2>/; s/^---/<hr>/' >> "${RESULTS_DIR}/REPORT.html" 2>/dev/null

  echo '</div></body></html>' >> "${RESULTS_DIR}/REPORT.html"
  echo "HTML report generated: ${RESULTS_DIR}/REPORT.html"
fi
