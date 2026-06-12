#!/bin/bash
# Generates a markdown performance report from k6 JSON summaries
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

  if [ -z "${SUMMARY_FILE}" ]; then
    continue
  fi

  # Extract test name from filename
  TEST_NAME=$(basename "${OUTPUT_FILE}" | sed 's/-output.txt//' | sed "s/${i}-//")

  # Check if thresholds passed
  if grep -q "✓" "${OUTPUT_FILE}" 2>/dev/null && ! grep -q "✗.*threshold" "${OUTPUT_FILE}" 2>/dev/null; then
    STATUS="✅ PASS"
  else
    STATUS="❌ FAIL"
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

# Generate PDF from markdown (if pandoc is installed)
if command -v pandoc &> /dev/null; then
  pandoc "${RESULTS_DIR}/REPORT.md" \
    -o "${RESULTS_DIR}/REPORT.pdf" \
    --pdf-engine=wkhtmltopdf \
    -V geometry:margin=1in \
    -V title="Zord Performance Test Report" \
    2>/dev/null || {
      # Fallback: try without wkhtmltopdf
      pandoc "${RESULTS_DIR}/REPORT.md" \
        -o "${RESULTS_DIR}/REPORT.pdf" \
        2>/dev/null || echo "PDF generation failed (pandoc/wkhtmltopdf not fully configured)"
    }
  if [ -f "${RESULTS_DIR}/REPORT.pdf" ]; then
    echo "PDF generated: ${RESULTS_DIR}/REPORT.pdf"
  fi
else
  echo "Note: Install pandoc for PDF generation: sudo yum install -y pandoc wkhtmltopdf"
fi
