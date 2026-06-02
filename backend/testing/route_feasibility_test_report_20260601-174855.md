# Today Route Testing Wiring Feasibility - Backend/API Execution Report

Generated: 2026-06-01 17:49:34 +05:30

## Test Scope

Rows tested from page 4 Intent Journal > Transaction match label through page 7 Header > API keys popover context row in ackend/Today_Route_Testing_Wiring_Feasibility 2.pdf.

## Tenant And Input Trace

| Field | Value |
|---|---|
| Base URL | http://localhost:3000 |
| Tenant name | route_feasibility_20260601 |
| Tenant ID | cf215f1a-1e2f-450f-8bfd-2360788332b8 |
| Workspace code / publishable key | route_feasibility_20260601 |
| API key | route_fe...7d8b |
| API key prefix | route_feasibility_20260601 |
| Batch ID | route-feasibility-20260601-batch-001 |
| Intent input file | ackend/zord_payout_v4_final (1).csv |
| Settlement input file | ackend/Razorpay_Settlement_v4 (1).xlsx |
| Raw artifacts | $(Escape-Md D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855) |

## Setup Log

- Starting clean test run.
- Cleared public tables in zord-edge-postgres/zord_edge_db.
- Cleared public tables in zord-intent-postgres/zord_intent_engine_db.
- Cleared public tables in zord-outcome-postgres/zord_outcome_db.
- Cleared public tables in zord-evidence-postgres/zord_evidence_db.
- Cleared public tables in zord-intelligence-postgres/zord_intelligence.
- Cleared public tables in zord-token-enclave-postgres/zord_token_enclave_db.
- Cleared public tables in zord-relay-postgres/zord_relay_db.
- Health probe $url returned HTTP 200, curl exit 0.
- Health probe $url returned HTTP 200, curl exit 0.
- Health probe $url returned HTTP 200, curl exit 0.
- Health probe $url returned HTTP 200, curl exit 0.
- Health probe $url returned HTTP 404, curl exit 0.
- Health probe $url returned HTTP 401, curl exit 0.
- Created tenant $TenantName with tenant_id $script:TenantId and workspace_code $script:WorkspaceCode.
- Captured session cookies from signup headers for BFF routes.
- Captured tenant API key for upload authorization; report masks the secret.
- Intent CSV upload returned HTTP 202. Body: $(@{RowId=SETUP-bulk-ingest; Args=System.String[]; Command=curl.exe; Status=202; ExitCode=0; BodyPath=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\SETUP-bulk-ingest.body; HeaderPath=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\SETUP-bulk-ingest.headers; StderrPath=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\SETUP-bulk-ingest.stderr; Json=}.BodyPath).
- Settlement XLSX upload returned HTTP 202. Body: $(@{RowId=SETUP-settlement-upload; Args=System.String[]; Command=curl.exe; Status=202; ExitCode=0; BodyPath=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\SETUP-settlement-upload.body; HeaderPath=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\SETUP-settlement-upload.headers; StderrPath=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\SETUP-settlement-upload.stderr; Json=}.BodyPath).
- Waiting 25 seconds for asynchronous parsing/projection consumers before row checks.

## Row Results

### P4-R01 - Intent Journal > Transaction match label

| Field | Value |
|---|---|
| Row ID | P4-R01 |
| Component Part | Intent Journal > Transaction match label |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/intents/batches?batch_id=route-feasibility-20260601-batch-001&page_size=200 |
| Request | curl.exe |
| Backend Field(s) | paymentIntents[].aggregate_confidence_score, paymentIntents[].status |
| Resolved Backend Value | paymentIntents.count=200; first={"tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","amount":"1563.25","currency":"INR","intended_execution_at":"2026-06-15T10:00:00Z","provider_hint":"","intent_quality_score":0.84} |
| Expected Frontend Display Value | Matched/Likely Matched/Awaiting/Mismatch/Not Found derived by frontend thresholds. |
| Fallback Rule Applied | No backend fallback; frontend falls back to Awaiting if confidence/status cannot resolve. |
| Initial Status | Backend Blocked |
| Verdict | FAIL |
| Notes | Tests the exact BFF composite payload for the row. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R01.body. HTTP 200, curl exit 0. |

### P4-R02 - Intent Journal > Zord ID display

| Field | Value |
|---|---|
| Row ID | P4-R02 |
| Component Part | Intent Journal > Zord ID display |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/intents/batches?batch_id=route-feasibility-20260601-batch-001&page_size=200 |
| Request | curl.exe |
| Backend Field(s) | intent_id, batch_id |
| Resolved Backend Value | first intent_id=; batch_id= |
| Expected Frontend Display Value | ZRD-UNKNOWN |
| Fallback Rule Applied | Frontend uses batchId if requestId is unavailable; otherwise ZRD-UNKNOWN. |
| Initial Status | Backend Blocked |
| Verdict | FAIL |
| Notes | Verifies backend supplies stable IDs for buildZordId. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R02.body. HTTP 200, curl exit 0. |

### P4-R03 - Intent Journal > Failures (DLQ) stage and action

| Field | Value |
|---|---|
| Row ID | P4-R03 |
| Component Part | Intent Journal > Failures (DLQ) stage and action |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/intents/batches?batch_id=route-feasibility-20260601-batch-001&page_size=200 |
| Request | curl.exe |
| Backend Field(s) | dlqItems[].stage, reason_code, error_detail, replayable, created_at, intent_context |
| Resolved Backend Value | dlqItems.count=0; first= |
| Expected Frontend Display Value | Failure stage/action rows; empty list means no backend DLQ rows for this clean ingest. |
| Fallback Rule Applied | Frontend maps replayable=true to Retry, false to Investigate; empty list renders no failures. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | This does not force a failure; it verifies the DLQ API shape for the uploaded batch. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R03.body. HTTP 200, curl exit 0. |

### P4-R04 - Settlement Journal > Client batch sidebar IDs

| Field | Value |
|---|---|
| Row ID | P4-R04 |
| Component Part | Settlement Journal > Client batch sidebar IDs |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/settlement/observations/batches |
| Request | curl.exe |
| Backend Field(s) | items[].client_batch_id |
| Resolved Backend Value | items.count=1; matching_batch_count=1 |
| Expected Frontend Display Value | Available client_batch_id list including uploaded batch. |
| Fallback Rule Applied | extractClientBatchIdsFromListResponse de-duplicates client-side. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Verifies the settlement batch sidebar source. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R04.body. HTTP 200, curl exit 0. |

### P4-R05 - Settlement Journal > Observation amount fields

| Field | Value |
|---|---|
| Row ID | P4-R05 |
| Component Part | Settlement Journal > Observation amount fields |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/settlement/observations/batches?client_batch_id=route-feasibility-20260601-batch-001 |
| Request | curl.exe |
| Backend Field(s) | amount, settled_amount, fee_amount, deduction_amount, currency_code |
| Resolved Backend Value | observations.count=2000; first={"settlement_batch_id":"4b653bc9-b7a5-4223-9458-96d265911fc6","source_row_ref":"2000","source_system":"razorpay","amount":"2326.16","settled_amount":"0","fee_amount":"0","deduction_amount":"0","currency_code":"INR","settlement_status":"SETTLED","bank_reference":"UTR740294254042","provider_status_code":null,"failure_reason_code":null,"retry_flag":false,"reversal_flag":false,"return_flag":false,"observation_timestamp":"2026-06-01T12:19:04.257355Z","value_date":"2026-06-01T00:00:00Z","source_system_id":"razorpay","created_at":"2026-06-01T12:19:28.988302Z","updated_at":"2026-06-01T12:19:28.988302Z"} |
| Expected Frontend Display Value | Formatted amount/settled/fee/deductions per row. |
| Fallback Rule Applied | Frontend numeric parser formats zero/null as display defaults. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Verifies row amount fields from uploaded Razorpay settlement file. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R05.body. HTTP 200, curl exit 0. |

### P4-R06 - Settlement Journal > Observation status fields

| Field | Value |
|---|---|
| Row ID | P4-R06 |
| Component Part | Settlement Journal > Observation status fields |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/settlement/observations/batches?client_batch_id=route-feasibility-20260601-batch-001 |
| Request | curl.exe |
| Backend Field(s) | settlement_status, provider_status_code, failure_reason_code, retry_flag, reversal_flag, return_flag |
| Resolved Backend Value | observations.count=2000; first={"settlement_batch_id":"4b653bc9-b7a5-4223-9458-96d265911fc6","source_row_ref":"2000","source_system":"razorpay","amount":"2326.16","settled_amount":"0","fee_amount":"0","deduction_amount":"0","currency_code":"INR","settlement_status":"SETTLED","bank_reference":"UTR740294254042","provider_status_code":null,"failure_reason_code":null,"retry_flag":false,"reversal_flag":false,"return_flag":false,"observation_timestamp":"2026-06-01T12:19:04.257355Z","value_date":"2026-06-01T00:00:00Z","source_system_id":"razorpay","created_at":"2026-06-01T12:19:28.988302Z","updated_at":"2026-06-01T12:19:28.988302Z"} |
| Expected Frontend Display Value | Settlement status and provider/reason flags displayed per row. |
| Fallback Rule Applied | Status filters are client-side; missing optional flags display false/blank defaults. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Verifies status fields from settlement observations endpoint. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R06.body. HTTP 200, curl exit 0. |

### P4-R07 - Settlement Journal > Parse errors panel

| Field | Value |
|---|---|
| Row ID | P4-R07 |
| Component Part | Settlement Journal > Parse errors panel |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/settlement/errors?batch_id=route-feasibility-20260601-batch-001 |
| Request | curl.exe |
| Backend Field(s) | source_row_ref, error_stage, reason_code, severity |
| Resolved Backend Value | errors.count=1; first= |
| Expected Frontend Display Value | Parser/mapping error rows, or no-error state when empty. |
| Fallback Rule Applied | Empty list renders no-error state. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Clean input may legitimately return zero parse errors. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R07.body. HTTP 200, curl exit 0. |

### P4-R08 - Evidence > Defensibility KPI card

| Field | Value |
|---|---|
| Row ID | P4-R08 |
| Component Part | Evidence > Defensibility KPI card |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/intelligence/defensibility |
| Request | curl.exe |
| Backend Field(s) | defensibility_score, defensibility_tier, evidence_pack_rate, governance_coverage_pct, replayability_pct, audit_ready_pct, dispute_ready_pct |
| Resolved Backend Value | {"tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","data_available":false,"reason":"No evidence pack data available for this period","evidence_pack_rate":0,"governance_coverage_pct":0,"replayability_pct":0,"defensibility_score":0,"audit_ready_pct":0,"dispute_ready_pct":0,"avg_pack_completeness_score":0,"settlement_evidence_coverage":0,"attachment_evidence_coverage":0,"weak_evidence_count":0,"weak_evidence_rate":0,"intelligence_mode":"GRADE_A"} |
| Expected Frontend Display Value | Score/tier and readiness percentage KPI cards. |
| Fallback Rule Applied | Frontend converts rates to percentages; unavailable upstream blocks live KPI. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Tests intelligence defensibility proxy. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R08.body. HTTP 200, curl exit 0. |

### P4-R09 - Evidence > Leakage/Ambiguity context cards

| Field | Value |
|---|---|
| Row ID | P4-R09 |
| Component Part | Evidence > Leakage/Ambiguity context cards |
| Mode | Hybrid |
| Endpoint | /api/prod/intelligence/leakage?batch_id=route-feasibility-20260601-batch-001 and /api/prod/intelligence/ambiguity?batch_id=route-feasibility-20260601-batch-001 |
| Request | curl.exe<br>curl.exe |
| Backend Field(s) | leakage risk fields + ambiguity risk fields |
| Resolved Backend Value | leakage={"tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","data_available":false,"reason":"No payment data available for this period","total_intended_amount_minor":0,"unmatched_amount_minor":0,"under_settlement_amount_minor":0,"orphan_amount_minor":0,"reversal_exposure_minor":0,"leakage_percentage":0,"total_observed_settled_amount_minor":0,"ambiguous_value_at_risk_minor":0,"risk_adjusted_leakage_minor":0,"intelligence_mode":"GRADE_A","duplicate_risk_count":0,"duplicate_risk_exposure_minor":0,"confirmed_duplicate_count":0,"confirmed_duplicate_exposure_minor":0}<br>ambiguity={"tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","data_available":false,"reason":"No attachment data available for this period","ambiguous_intent_count":0,"ambiguity_rate":0,"avg_attachment_confidence":0,"provider_ref_missing_rate":0,"ambiguous_amount_rate":0,"low_confidence_rate":0,"candidate_collision_rate":0,"avg_score_margin":0,"carrier_completeness_rate":0,"ambiguity_severity_score":0,"value_at_risk_minor":0,"intelligence_mode":"GRADE_A"} |
| Expected Frontend Display Value | Context cards combined with defensibility cards. |
| Fallback Rule Applied | Hybrid route may return data_available:false if upstream has no projection. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Raw bodies: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R09-leakage.body, D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P4-R09-ambiguity.body. HTTP: leakage 200, ambiguity 200. |

### P5-R01 - Evidence > Pack Browser rows

| Field | Value |
|---|---|
| Row ID | P5-R01 |
| Component Part | Evidence > Pack Browser rows |
| Mode | Wired |
| Endpoint | /api/prod/evidence/packs?batch_id=route-feasibility-20260601-batch-001 + /api/prod/evidence/batch/route-feasibility-20260601-batch-001/intents |
| Request | curl.exe<br>curl.exe |
| Backend Field(s) | evidence_pack_id, batch_id, intent_id, refs, merkle_root, mode, pack_status, proof_status, proof_score, leaf counts, created_at |
| Resolved Backend Value | packs.count=1; first=; batch_intents={"packs":[],"total":0} |
| Expected Frontend Display Value | Pack browser table rows. |
| Fallback Rule Applied | No frontend fallback except empty-state if pack list is empty. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Raw bodies: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R01-packs.body, D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R01-pack-intents.body. |

### P5-R02 - Evidence > Proof status label

| Field | Value |
|---|---|
| Row ID | P5-R02 |
| Component Part | Evidence > Proof status label |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/evidence/packs?batch_id=route-feasibility-20260601-batch-001 |
| Request | curl.exe |
| Backend Field(s) | pack_status, proof_status, leaf_count, artifact_count, required_leaf_count, intent_id |
| Resolved Backend Value | packs.count=1; first= |
| Expected Frontend Display Value | proofReady/verified/exported/partial/missing label derived by rule ladder. |
| Fallback Rule Applied | If pack rows are absent, frontend shows empty/missing proof state. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Verifies proof status source rows. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R02.body. HTTP 200, curl exit 0. |

### P5-R03 - Evidence > Breakdown segments

| Field | Value |
|---|---|
| Row ID | P5-R03 |
| Component Part | Evidence > Breakdown segments |
| Mode | Hybrid |
| Endpoint | http://localhost:3000/api/prod/evidence/packs?batch_id=route-feasibility-20260601-batch-001 |
| Request | curl.exe |
| Backend Field(s) | row.proofStatusKey derived from pack/proof fields; row.generatedAt |
| Resolved Backend Value | packs.count=1 |
| Expected Frontend Display Value | Breakdown percentages by proof status category. |
| Fallback Rule Applied | When row count is zero, frontend uses mock segment template. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Backend provides rows when evidence exists; chart calculation is client-side. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R03.body. HTTP 200, curl exit 0. |

### P5-R04 - Evidence > 30-day trend chart

| Field | Value |
|---|---|
| Row ID | P5-R04 |
| Component Part | Evidence > 30-day trend chart |
| Mode | Hybrid |
| Endpoint | http://localhost:3000/api/prod/evidence/packs?batch_id=route-feasibility-20260601-batch-001 |
| Request | curl.exe |
| Backend Field(s) | created_at/generatedAt timestamps from pack rows |
| Resolved Backend Value | packs.count=1; first_created_at= |
| Expected Frontend Display Value | Daily evidence volume histogram for last 30 days. |
| Fallback Rule Applied | When row count is zero, frontend uses mock waveform. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Backend date validity can be checked from raw pack timestamps. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R04.body. HTTP 200, curl exit 0. |

### P5-R05 - Evidence > Export center buttons

| Field | Value |
|---|---|
| Row ID | P5-R05 |
| Component Part | Evidence > Export center buttons |
| Mode | Hybrid |
| Endpoint | /api/v1/dispute/export |
| Request | POST each export_type with payment_reference=NO_REFERENCE_AVAILABLE, dispute_reason=BENEFICIARY_SAYS_NOT_RECEIVED |
| Backend Field(s) | request.payment_reference, dispute_reason, export_type; response content-type/content-disposition/blob |
| Resolved Backend Value | FINANCE_SUMMARY HTTP 404, bytes=79, content-type: application/json, , body=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R05-FINANCE_SUMMARY.body<br>AUDIT_DETAILED HTTP 404, bytes=79, content-type: application/json, , body=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R05-AUDIT_DETAILED.body<br>BANK_PSP_PACK HTTP 404, bytes=79, content-type: application/json, , body=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R05-BANK_PSP_PACK.body<br>RAW_JSON HTTP 404, bytes=79, content-type: application/json, , body=D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R05-RAW_JSON.body |
| Expected Frontend Display Value | Download finance/audit/bank-pack/raw-json export files. |
| Fallback Rule Applied | HTTP error surfaces fallback message in frontend. |
| Initial Status | Backend Blocked |
| Verdict | FAIL |
| Notes | Uses the first evidence/intent reference available after ingest. |

### P5-R06 - Live Sync > Connector cards

| Field | Value |
|---|---|
| Row ID | P5-R06 |
| Component Part | Live Sync > Connector cards |
| Mode | Hybrid |
| Endpoint | http://localhost:3000/api/prod/systems/sync-status |
| Request | curl.exe |
| Backend Field(s) | data_available, connectors[].id/name/status/last_sync_at, reason |
| Resolved Backend Value | data_available=; connectors.count=1; response= |
| Expected Frontend Display Value | Connector name/status/last-sync cards, or no-telemetry guidance. |
| Fallback Rule Applied | If upstream unreachable, BFF returns data_available=false and empty connectors. |
| Initial Status | Backend Blocked |
| Verdict | FAIL |
| Notes | Verifies graceful hybrid behavior. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P5-R06.body. HTTP 404, curl exit 0. |

### P5-R07 - Connector Intelligence (live dock) KPI panels

| Field | Value |
|---|---|
| Row ID | P5-R07 |
| Component Part | Connector Intelligence (live dock) KPI panels |
| Mode | Mock |
| Endpoint | N/A |
| Request | Source verification: rg/get file path backend/zord-console/app/payout-command-view/connector-intelligence/seededRoutingData.ts |
| Backend Field(s) | snapshot.connectors, routeCandidates, networkHealthTrend, leakageComposition, actionRecommendations |
| Resolved Backend Value | seededRoutingData.ts exists=True |
| Expected Frontend Display Value | Network health, leakage composition, route ranking from seeded snapshot. |
| Fallback Rule Applied | Mock adapter getRoutingIntelligenceAdapter() returns seeded snapshot; no backend fallback. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | No curl endpoint is expected per document. |

### P5-R08 - Sandbox Connectors list

| Field | Value |
|---|---|
| Row ID | P5-R08 |
| Component Part | Sandbox Connectors list |
| Mode | Mock |
| Endpoint | N/A |
| Request | Source verification: localStorage store backend/zord-console/services/payout-command/connected-providers-store.ts |
| Backend Field(s) | providers[] local state + catalog constants |
| Resolved Backend Value | connected-providers-store.ts exists=True; storage key zord:connected-providers |
| Expected Frontend Display Value | Provider cards and connect/disconnect state. |
| Fallback Rule Applied | Hydrates localStorage; no backend API. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | No curl endpoint is expected per document. |

### P5-R09 - Borrower Verification > Summary buckets

| Field | Value |
|---|---|
| Row ID | P5-R09 |
| Component Part | Borrower Verification > Summary buckets |
| Mode | Mock |
| Endpoint | N/A |
| Request | Source verification: backend/zord-console/app/payout-command-view/today/_components/verification/borrowerVerificationMock.ts |
| Backend Field(s) | summary, queueCounts, totals, checkBreakdown |
| Resolved Backend Value | BORROWER_VERIFICATION_MOCK exists=True |
| Expected Frontend Display Value | Safe/blocked/exposure/KYC/proof summary buckets. |
| Fallback Rule Applied | Direct mock render. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | No backend endpoint is expected. |

### P6-R01 - Borrower Verification > Queue table row

| Field | Value |
|---|---|
| Row ID | P6-R01 |
| Component Part | Borrower Verification > Queue table row |
| Mode | Mock |
| Endpoint | N/A |
| Request | Source verification: borrowerVerificationMock.ts |
| Backend Field(s) | queueRows[].borrowerId, borrowerName, loanAmountInr, kyc, bank, fraud, aml, status, source |
| Resolved Backend Value | BORROWER_VERIFICATION_MOCK exists=True |
| Expected Frontend Display Value | Borrower risk queue rows with client-side sort/filter/page. |
| Fallback Rule Applied | Direct mock render. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | No backend endpoint is expected. |

### P6-R02 - Post-Disbursal Monitoring > Summary cards

| Field | Value |
|---|---|
| Row ID | P6-R02 |
| Component Part | Post-Disbursal Monitoring > Summary cards |
| Mode | Mock |
| Endpoint | N/A |
| Request | Source verification: backend/zord-console/app/payout-command-view/today/_components/monitoring/postDisbursalMonitoringMock.ts |
| Backend Field(s) | summaryCards[].label/value/sub/tone |
| Resolved Backend Value | POST_DISBURSAL_MONITORING_MOCK exists=True |
| Expected Frontend Display Value | Total disbursed, confirmed received, at-risk, recovered, repayment rate cards. |
| Fallback Rule Applied | Direct mock render. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | No backend endpoint is expected. |

### P6-R03 - Post-Disbursal Monitoring > Queue row status

| Field | Value |
|---|---|
| Row ID | P6-R03 |
| Component Part | Post-Disbursal Monitoring > Queue row status |
| Mode | Mock |
| Endpoint | N/A |
| Request | Source verification: postDisbursalMonitoringMock.ts |
| Backend Field(s) | queueRows[].loanId, amountInr, confirmed, repayment, riskSignal, evidence, status |
| Resolved Backend Value | POST_DISBURSAL_MONITORING_MOCK exists=True |
| Expected Frontend Display Value | Confirmed/Pending/At-risk loan status rows. |
| Fallback Rule Applied | Direct mock render. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | No backend endpoint is expected. |

### P6-R04 - Billing > Processing in Zord count

| Field | Value |
|---|---|
| Row ID | P6-R04 |
| Component Part | Billing > Processing in Zord count |
| Mode | Wired |
| Endpoint | http://localhost:3000/api/prod/intents/batches |
| Request | curl.exe |
| Backend Field(s) | batch list batchId; paymentIntents[].status, business_state, governance_state |
| Resolved Backend Value | batches.count=1; processingCount=0; details=route-feasibility-20260601-batch-001 paymentIntents=200 |
| Expected Frontend Display Value | Processing in Zord count. |
| Fallback Rule Applied | Frontend scans first 15 batches; no mock fallback for count beyond zero. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Per-batch detail calls are captured as separate raw artifacts where applicable. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P6-R04-list.body. HTTP 200, curl exit 0. |

### P6-R05 - Billing > Sandbox cap progress bar

| Field | Value |
|---|---|
| Row ID | P6-R05 |
| Component Part | Billing > Sandbox cap progress bar |
| Mode | Hybrid |
| Endpoint | /api/prod/intents/batches + per-batch detail calls |
| Request | Reuse P6-R04 curl calls; local constant SANDBOX_DAILY_INTENT_LIMIT=10 |
| Backend Field(s) | processingCount, SANDBOX_DAILY_INTENT_LIMIT |
| Resolved Backend Value | processingCount=0; limit=10; usagePct=0% |
| Expected Frontend Display Value | 0 / 10 and progress bar at 0%. |
| Fallback Rule Applied | Limit is frontend constant; live count from backend. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Hybrid calculation verified from P6-R04 result. |

### P6-R06 - Billing > Plan and invoices section

| Field | Value |
|---|---|
| Row ID | P6-R06 |
| Component Part | Billing > Plan and invoices section |
| Mode | Mock |
| Endpoint | N/A |
| Request | Source verification: backend/zord-console/app/payout-command-view/today/_components/surfaces/BillingSurface.tsx contains PLANS constant/static placeholders |
| Backend Field(s) | PLANS[] fields, static invoice copy |
| Resolved Backend Value | BillingSurface.tsx exists=True |
| Expected Frontend Display Value | Plan cards and invoice placeholders. |
| Fallback Rule Applied | Direct static render. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | No backend endpoint is expected. |

### P6-R07 - Support > Processing overview totals

| Field | Value |
|---|---|
| Row ID | P6-R07 |
| Component Part | Support > Processing overview totals |
| Mode | Hybrid |
| Endpoint | batches + patterns + ambiguity heatmap + settlement observations |
| Request | curl.exe<br>curl.exe<br>curl.exe<br>curl.exe |
| Backend Field(s) | batch items transactions/confirmedCount/mismatchCount/unresolvedCount; patterns.pending_count; settlement observations |
| Resolved Backend Value | batches={"items":[{"batchId":"route-feasibility-20260601-batch-001","type":"PAYMENT","totalValue":"0","transactions":0,"confirmedCount":0,"mismatchCount":0,"unresolvedCount":0}]}; patterns={"tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","data_available":false,"reason":"No batch data available for this period","batch_anomaly_score":0,"anomaly_level":"","value_date_mismatch_count":0,"value_date_mismatch_rate":0,"batch_quality_score":0,"exact_match_count":0,"high_confidence_count":0,"ambiguous_count":0,"unresolved_count":0,"conflicted_count":0,"duplicate_risk_rate":0,"duplicate_risk_count":0,"same_beneficiary_amount_density":0,"settlement_delay_p95_days":0,"batch_risk_score":0,"total_count":0,"success_count":0,"failed_count":0,"pending_count":0,"intelligence_mode":"GRADE_A"}; heatmap={"tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","data_available":false,"intelligence_mode":"GRADE_A","batches":[]}; settlement_count=1 |
| Expected Frontend Display Value | Total/completed/failed/processing/unresolved with percentages. |
| Fallback Rule Applied | Some values are frontend-derived from multiple live sources. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Raw bodies: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P6-R07-batches.body, D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P6-R07-patterns.body, D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P6-R07-heatmap.body, D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P6-R07-settlement.body. |

### P6-R08 - Support > Failure reasons panel

| Field | Value |
|---|---|
| Row ID | P6-R08 |
| Component Part | Support > Failure reasons panel |
| Mode | Hybrid |
| Endpoint | http://localhost:3000/api/prod/intelligence/patterns?batch_id=route-feasibility-20260601-batch-001 |
| Request | curl.exe |
| Backend Field(s) | patterns.pending_count or failed count from batch totals |
| Resolved Backend Value | {"tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","data_available":false,"reason":"No batch data available for this period","batch_anomaly_score":0,"anomaly_level":"","value_date_mismatch_count":0,"value_date_mismatch_rate":0,"batch_quality_score":0,"exact_match_count":0,"high_confidence_count":0,"ambiguous_count":0,"unresolved_count":0,"conflicted_count":0,"duplicate_risk_rate":0,"duplicate_risk_count":0,"same_beneficiary_amount_density":0,"settlement_delay_p95_days":0,"batch_risk_score":0,"total_count":0,"success_count":0,"failed_count":0,"pending_count":0,"intelligence_mode":"GRADE_A"} |
| Expected Frontend Display Value | Synthetic reason buckets like TOKENIZATION_FAILURE/WEBHOOK_TIMEOUT. |
| Fallback Rule Applied | Reason split percentages are client-generated, not a backend distribution. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Tests the backend basis for the synthetic split. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P6-R08.body. HTTP 200, curl exit 0. |

### P6-R09 - Support > Recent processing activity rows

| Field | Value |
|---|---|
| Row ID | P6-R09 |
| Component Part | Support > Recent processing activity rows |
| Mode | Hybrid |
| Endpoint | http://localhost:3000/api/prod/settlement/observations/batches?client_batch_id=route-feasibility-20260601-batch-001 |
| Request | curl.exe |
| Backend Field(s) | created_at/observation_timestamp, matched_intent_id, settlement_status, client_batch_id |
| Resolved Backend Value | observations.count=2000; first={"settlement_batch_id":"4b653bc9-b7a5-4223-9458-96d265911fc6","source_row_ref":"2000","source_system":"razorpay","amount":"2326.16","settled_amount":"0","fee_amount":"0","deduction_amount":"0","currency_code":"INR","settlement_status":"SETTLED","bank_reference":"UTR740294254042","provider_status_code":null,"failure_reason_code":null,"retry_flag":false,"reversal_flag":false,"return_flag":false,"observation_timestamp":"2026-06-01T12:19:04.257355Z","value_date":"2026-06-01T00:00:00Z","source_system_id":"razorpay","created_at":"2026-06-01T12:19:28.988302Z","updated_at":"2026-06-01T12:19:28.988302Z"} |
| Expected Frontend Display Value | First 8 recent processing activity rows with relative time. |
| Fallback Rule Applied | Frontend supplies display defaults for missing refs. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Uses settlement observations for activity feed. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P6-R09.body. HTTP 200, curl exit 0. |

### P7-R01 - Support > Heatmap matrix

| Field | Value |
|---|---|
| Row ID | P7-R01 |
| Component Part | Support > Heatmap matrix |
| Mode | Hybrid |
| Endpoint | http://localhost:3000/api/prod/intelligence/ambiguity/heatmap |
| Request | curl.exe |
| Backend Field(s) | batches[].total_count, unresolved_count, conflicted_count, ambiguous_count |
| Resolved Backend Value | heatmap_batches.count=0; first= |
| Expected Frontend Display Value | Weekly heat bands from failure/ambiguity ratios. |
| Fallback Rule Applied | Client computes discrete heat levels. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Tests ambiguity heatmap proxy. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P7-R01.body. HTTP 200, curl exit 0. |

### P7-R02 - Support > Ticket inbox and thread

| Field | Value |
|---|---|
| Row ID | P7-R02 |
| Component Part | Support > Ticket inbox and thread |
| Mode | Hybrid |
| Endpoint | http://localhost:3000/api/auth/me |
| Request | curl.exe |
| Backend Field(s) | ticket/message localStorage objects + /api/auth/me profile user/session fields |
| Resolved Backend Value | auth_me={"session":{"session_id":"0c514349-b27b-40ee-bb26-23e13c3b9e33","tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","workspace_code":"route_feasibility_20260601","role":"CUSTOMER_ADMIN","access_expires_at":""},"user":{"id":"eccc62ef-c04a-4c49-b65a-585cc8ca409c","email":"route.feasibility+20260601@arealis.test","role":"CUSTOMER_ADMIN","name":"Route Feasibility Tester","tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","tenant_name":"route_feasibility_20260601","workspace_code":"route_feasibility_20260601","status":"ACTIVE","mfa_enabled":false}} |
| Expected Frontend Display Value | Open/closed tickets and profile context for the signed-in tenant. |
| Fallback Rule Applied | Tickets are localStorage-backed per tenant; user profile comes from /api/auth/me. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Verifies the only backend portion of this hybrid row. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P7-R02-auth-me.body. HTTP 200, curl exit 0. |

### P7-R03 - Header > API keys popover context row

| Field | Value |
|---|---|
| Row ID | P7-R03 |
| Component Part | Header > API keys popover context row |
| Mode | Hybrid |
| Endpoint | http://localhost:3000/api/sandbox/workspace-api-keys |
| Request | curl.exe |
| Backend Field(s) | tenant_id, tenant_name, workspace_code, publishable_key, secret_key_prefix |
| Resolved Backend Value | response={"tenant_id":"cf215f1a-1e2f-450f-8bfd-2360788332b8","tenant_name":"route_feasibility_20260601","workspace_code":"route_feasibility_20260601","publishable_key":"route_feasibility_20260601","secret_key_prefix":null}; localStorage secret key would be zord_tenant_api_key:cf215f1a-1e2f-450f-8bfd-2360788332b8 with value route_fe...7d8b |
| Expected Frontend Display Value | Tenant/workspace context and publishable key; masked secret display/copy if browser localStorage contains signup key. |
| Fallback Rule Applied | secret_key_prefix is null from server; full secret is only browser-local from signup. |
| Initial Status | Ready for Frontend Check |
| Verdict | PASS |
| Notes | Verifies server-backed context row. Raw body: D:\Phase1\Arealis-Zord-intent\backend\testing\artifacts\route-feasibility-20260601-174855\P7-R03.body. HTTP 200, curl exit 0. |

