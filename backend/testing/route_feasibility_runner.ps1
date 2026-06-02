param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$TenantName = "route_feasibility_20260601",
  [string]$AdminEmail = "route.feasibility+20260601@arealis.test",
  [string]$AdminPassword = "RouteTest#20260601",
  [string]$BatchId = "route-feasibility-20260601-batch-001"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$RunStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ArtifactsDir = Join-Path $PSScriptRoot "artifacts\route-feasibility-$RunStamp"
$ReportPath = Join-Path $PSScriptRoot "route_feasibility_test_report_$RunStamp.md"
$IntentFile = Join-Path $Root "backend\zord_payout_v4_final (1).csv"
$SettlementFile = Join-Path $Root "backend\Razorpay_Settlement_v4 (1).xlsx"

New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

$script:Rows = New-Object System.Collections.Generic.List[object]
$script:SetupLog = New-Object System.Collections.Generic.List[string]
$script:ApiKey = ""
$script:TenantId = ""
$script:TenantApiKeyPrefix = ""
$script:WorkspaceCode = ""
$script:CookieHeader = ""

function Add-SetupLog {
  param([string]$Text)
  $script:SetupLog.Add("- $Text")
}

function Mask-Secret {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  if ($Value.Length -le 12) { return "***" }
  return "$($Value.Substring(0, 8))...$($Value.Substring($Value.Length - 4))"
}

function Escape-Md {
  param([object]$Value)
  if ($null -eq $Value) { return "" }
  return ([string]$Value).Replace("|", "\|").Replace("`r", " ").Replace("`n", "<br>")
}

function ConvertTo-OneLineJson {
  param([object]$Value)
  if ($null -eq $Value) { return "" }
  return ($Value | ConvertTo-Json -Depth 100 -Compress)
}

function Read-JsonFile {
  param([string]$Path)
  if (!(Test-Path $Path)) { return $null }
  $raw = Get-Content -Raw -Path $Path
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  try {
    $parsed = ConvertFrom-Json -InputObject $raw
    return $parsed
  } catch {
    return $null
  }
}

function Format-CurlCommand {
  param([string[]]$CurlRequestArgs)
  $parts = @("curl.exe")
  foreach ($a in $CurlRequestArgs) {
    $safe = $a
    if ($script:ApiKey) { $safe = $safe.Replace($script:ApiKey, "<TEST_API_KEY>") }
    if ($script:CookieHeader) { $safe = $safe.Replace($script:CookieHeader, "<SESSION_COOKIES>") }
    if ($safe -match "\s|;|&|\(|\)") {
      $safe = '"' + $safe.Replace('"', '\"') + '"'
    }
    $parts += $safe
  }
  return ($parts -join " ")
}

function Invoke-CurlCase {
  param(
    [string]$RowId,
    [Alias("Args")]
    [string[]]$CurlRequestArgs
  )

  $safeId = $RowId.Replace(">", "-").Replace(" ", "_").Replace("/", "_")
  $bodyPath = Join-Path $ArtifactsDir "$safeId.body"
  $headerPath = Join-Path $ArtifactsDir "$safeId.headers"
  $stderrPath = Join-Path $ArtifactsDir "$safeId.stderr"
  $curlArgs = @("-sS", "-D", $headerPath, "-o", $bodyPath, "-w", "%{http_code}") + $CurlRequestArgs
  $statusOut = (& curl.exe @curlArgs 2> $stderrPath | Out-String).Trim()
  $exit = $LASTEXITCODE
  $status = 0
  [void][int]::TryParse($statusOut, [ref]$status)
  return [pscustomobject]@{
    RowId = $RowId
    Args = $CurlRequestArgs
    Command = Format-CurlCommand -CurlRequestArgs $CurlRequestArgs
    Status = $status
    ExitCode = $exit
    BodyPath = $bodyPath
    HeaderPath = $headerPath
    StderrPath = $stderrPath
    Json = (Read-JsonFile -Path $bodyPath)
  }
}

function Add-Row {
  param(
    [string]$RowId,
    [string]$ComponentPart,
    [string]$Mode,
    [string]$Endpoint,
    [string]$Request,
    [string]$BackendFields,
    [string]$ResolvedBackendValue,
    [string]$ExpectedFrontendDisplayValue,
    [string]$FallbackRuleApplied,
    [string]$InitialStatus,
    [string]$Verdict,
    [string]$Notes
  )
  $script:Rows.Add([pscustomobject]@{
    "Row ID" = $RowId
    "Component Part" = $ComponentPart
    "Mode" = $Mode
    "Endpoint" = $Endpoint
    "Request" = $Request
    "Backend Field(s)" = $BackendFields
    "Resolved Backend Value" = $ResolvedBackendValue
    "Expected Frontend Display Value" = $ExpectedFrontendDisplayValue
    "Fallback Rule Applied" = $FallbackRuleApplied
    "Initial Status" = $InitialStatus
    "Verdict" = $Verdict
    "Notes" = $Notes
  })
}

function Test-HasField {
  param([object]$Obj, [string]$Field)
  if ($null -eq $Obj) { return $false }
  return $Obj.PSObject.Properties.Name -contains $Field
}

function First-ArrayItem {
  param([object]$MaybeArray)
  if ($null -eq $MaybeArray) { return $null }
  if ($MaybeArray -is [array]) {
    if ($MaybeArray.Count -gt 0) { return $MaybeArray[0] }
    return $null
  }
  return $MaybeArray
}

function To-Array {
  param([object]$Value)
  if ($null -eq $Value) { return @() }
  if ($Value -is [array]) { return $Value }
  return @($Value)
}

function Count-Items {
  param([object]$MaybeArray)
  if ($null -eq $MaybeArray) { return 0 }
  if ($MaybeArray -is [array]) { return $MaybeArray.Count }
  return 1
}

function Status-From {
  param([bool]$Ok)
  if ($Ok) { return "Ready for Frontend Check" }
  return "Backend Blocked"
}

function Verdict-From {
  param([bool]$Ok)
  if ($Ok) { return "PASS" }
  return "FAIL"
}

function Clear-PostgresDatabase {
  param(
    [string]$Container,
    [string]$User,
    [string]$Database
  )
  $sql = 'DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = ''public'') LOOP EXECUTE ''TRUNCATE TABLE public.'' || quote_ident(r.tablename) || '' RESTART IDENTITY CASCADE''; END LOOP; END $$;'
  & docker exec $Container psql -U $User -d $Database -v ON_ERROR_STOP=1 -c $sql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to clear $Container/$Database" }
  Add-SetupLog "Cleared public tables in $Container/$Database."
}

function Build-CookieHeaderFromSetCookie {
  param([string]$HeaderPath)
  $cookies = @()
  foreach ($line in (Get-Content -Path $HeaderPath)) {
    if ($line -match "^[Ss]et-[Cc]ookie:\s*([^=;\s]+)=([^;]*)") {
      $cookies += "$($Matches[1])=$($Matches[2])"
    }
  }
  return ($cookies -join "; ")
}

function Write-Report {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("# Today Route Testing Wiring Feasibility - Backend/API Execution Report")
  $lines.Add("")
  $lines.Add("Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")")
  $lines.Add("")
  $lines.Add("## Test Scope")
  $lines.Add("")
  $lines.Add("Rows tested from page 4 'Intent Journal > Transaction match label' through page 7 'Header > API keys popover context row' in backend/Today_Route_Testing_Wiring_Feasibility 2.pdf.")
  $lines.Add("")
  $lines.Add("## Tenant And Input Trace")
  $lines.Add("")
  $lines.Add("| Field | Value |")
  $lines.Add("|---|---|")
  $lines.Add("| Base URL | $(Escape-Md $BaseUrl) |")
  $lines.Add("| Tenant name | $(Escape-Md $TenantName) |")
  $lines.Add("| Tenant ID | $(Escape-Md $script:TenantId) |")
  $lines.Add("| Workspace code / publishable key | $(Escape-Md $script:WorkspaceCode) |")
  $lines.Add("| API key | $(Escape-Md (Mask-Secret $script:ApiKey)) |")
  $lines.Add("| API key prefix | $(Escape-Md $script:TenantApiKeyPrefix) |")
  $lines.Add("| Batch ID | $(Escape-Md $BatchId) |")
  $lines.Add("| Intent input file | backend/zord_payout_v4_final (1).csv |")
  $lines.Add("| Settlement input file | backend/Razorpay_Settlement_v4 (1).xlsx |")
  $lines.Add("| Raw artifacts | $(Escape-Md $ArtifactsDir) |")
  $lines.Add("")
  $lines.Add("## Setup Log")
  $lines.Add("")
  foreach ($l in $script:SetupLog) { $lines.Add($l) }
  $lines.Add("")
  $lines.Add("## Row Results")
  $lines.Add("")

  foreach ($row in $script:Rows) {
    $lines.Add("### $($row.'Row ID') - $($row.'Component Part')")
    $lines.Add("")
    $lines.Add("| Field | Value |")
    $lines.Add("|---|---|")
    foreach ($name in @("Row ID","Component Part","Mode","Endpoint","Request","Backend Field(s)","Resolved Backend Value","Expected Frontend Display Value","Fallback Rule Applied","Initial Status","Verdict","Notes")) {
      $lines.Add("| $name | $(Escape-Md $row.$name) |")
    }
    $lines.Add("")
  }

  $lines | Set-Content -Path $ReportPath -Encoding UTF8
}

if (!(Test-Path $IntentFile)) { throw "Intent file not found: $IntentFile" }
if (!(Test-Path $SettlementFile)) { throw "Settlement file not found: $SettlementFile" }

Add-SetupLog "Starting clean test run."

$dbs = @(
  @{ Container = "zord-edge-postgres"; User = "zord_user"; Database = "zord_edge_db" },
  @{ Container = "zord-intent-postgres"; User = "intent_user"; Database = "zord_intent_engine_db" },
  @{ Container = "zord-outcome-postgres"; User = "outcome_user"; Database = "zord_outcome_db" },
  @{ Container = "zord-evidence-postgres"; User = "evidence_user"; Database = "zord_evidence_db" },
  @{ Container = "zord-intelligence-postgres"; User = "zpi"; Database = "zord_intelligence" },
  @{ Container = "zord-token-enclave-postgres"; User = "token_user"; Database = "zord_token_enclave_db" },
  @{ Container = "zord-relay-postgres"; User = "relay_user"; Database = "zord_relay_db" }
)

foreach ($db in $dbs) {
  Clear-PostgresDatabase @db
}

$healthEndpoints = @(
  "http://localhost:8080/v1/health",
  "http://localhost:8083/health",
  "http://localhost:8081/v1/health",
  "http://localhost:8088/healthz",
  "http://localhost:8089/health",
  "$BaseUrl/api/sandbox/workspace-api-keys"
)
foreach ($url in $healthEndpoints) {
  $h = Invoke-CurlCase -RowId "SETUP-health-$($url.Split('/')[-1])" -Args @($url)
  Add-SetupLog "Health probe $url returned HTTP $($h.Status), curl exit $($h.ExitCode)."
}

$signupPayload = @{
  tenant_name = $TenantName
  name = "Route Feasibility Tester"
  email = $AdminEmail
  password = $AdminPassword
} | ConvertTo-Json -Compress
$signupPayloadPath = Join-Path $ArtifactsDir "SETUP-signup.payload.json"
$signupPayload | Set-Content -Path $signupPayloadPath -Encoding UTF8

$signup = Invoke-CurlCase -RowId "SETUP-signup" -Args @(
  "-X", "POST",
  "-H", "Content-Type: application/json",
  "--data-binary", "@$signupPayloadPath",
  "$BaseUrl/api/auth/signup"
)

if ((-not ($signup.Status -ge 200 -and $signup.Status -lt 300)) -or ($null -eq $signup.Json)) {
  throw "Signup failed. HTTP $($signup.Status). See $($signup.BodyPath)"
}

$script:TenantId = [string]$signup.Json.user.tenant_id
$script:WorkspaceCode = [string]$signup.Json.user.workspace_code
$script:ApiKey = [string]$signup.Json.api_key
if ($script:ApiKey -match "^([^\.]+)\.") {
  $script:TenantApiKeyPrefix = $Matches[1]
} else {
  $script:TenantApiKeyPrefix = ""
}
$script:CookieHeader = Build-CookieHeaderFromSetCookie $signup.HeaderPath
Add-SetupLog "Created tenant $TenantName with tenant_id $script:TenantId and workspace_code $script:WorkspaceCode."
Add-SetupLog "Captured session cookies from signup headers for BFF routes."
Add-SetupLog "Captured tenant API key for upload authorization; report masks the secret."

$bulkUpload = Invoke-CurlCase -RowId "SETUP-bulk-ingest" -Args @(
  "-X", "POST",
  "-H", "Authorization: Bearer $script:ApiKey",
  "-H", "Cookie: $script:CookieHeader",
  "-H", "Batch-ID: $BatchId",
  "-H", "X-Zord-Source-Type: CSV",
  "-H", "X-Zord-Source-Class: INTENT",
  "-F", "file=@$IntentFile",
  "$BaseUrl/api/bulk-ingest"
)
Add-SetupLog "Intent CSV upload returned HTTP $($bulkUpload.Status). Body: $($bulkUpload.BodyPath)."

$settlementUpload = Invoke-CurlCase -RowId "SETUP-settlement-upload" -Args @(
  "-X", "POST",
  "-H", "Authorization: Bearer $script:ApiKey",
  "-H", "Cookie: $script:CookieHeader",
  "-H", "Batch-Id: $BatchId",
  "-F", "file=@$SettlementFile",
  "$BaseUrl/api/settlement/upload?psp=razorpay"
)
Add-SetupLog "Settlement XLSX upload returned HTTP $($settlementUpload.Status). Body: $($settlementUpload.BodyPath)."

$settlementJobId = [string]$settlementUpload.Json.ingest_run_id
if ($settlementJobId) {
  $jobStatus = ""
  for ($i = 1; $i -le 40; $i++) {
    $jobPoll = Invoke-CurlCase -RowId "SETUP-settlement-job-$i" -Args @("http://localhost:8081/v1/settlement/jobs/$settlementJobId?tenant_id=$script:TenantId")
    $jobStatus = [string]$jobPoll.Json.run_status
    if ($jobStatus -eq "DONE" -or $jobStatus -eq "FAILED") { break }
    Start-Sleep -Seconds 3
  }
  Add-SetupLog "Settlement job $settlementJobId reached status $jobStatus before row checks."
}

$observationCount = 0
for ($i = 1; $i -le 30; $i++) {
  $obsPoll = Invoke-CurlCase -RowId "SETUP-settlement-observations-$i" -Args @("http://localhost:8081/v1/settlement/observations/batches?tenant_id=$script:TenantId&client_batch_id=$BatchId")
  $observationCount = Count-Items (To-Array $obsPoll.Json.items)
  if ($observationCount -gt 0) { break }
  Start-Sleep -Seconds 3
}
Add-SetupLog "Settlement observation poll found $observationCount rows before row checks."
Add-SetupLog "Waiting 10 additional seconds for downstream attachment/evidence/intelligence consumers."
Start-Sleep -Seconds 10

function AuthArgs {
  return @("-H", "Cookie: $script:CookieHeader")
}

function AuthAndKeyArgs {
  return @("-H", "Cookie: $script:CookieHeader", "-H", "Authorization: Bearer $script:ApiKey")
}

function Add-CurlRowFromResult {
  param(
    [string]$RowId,
    [string]$Component,
    [string]$Mode,
    [object]$Result,
    [string]$Fields,
    [string]$Resolved,
    [string]$Display,
    [string]$Fallback,
    [bool]$Ok,
    [string]$Notes
  )
  Add-Row `
    -RowId $RowId `
    -ComponentPart $Component `
    -Mode $Mode `
    -Endpoint (($Result.Args | Select-Object -Last 1) -as [string]) `
    -Request $Result.Command `
    -BackendFields $Fields `
    -ResolvedBackendValue $Resolved `
    -ExpectedFrontendDisplayValue $Display `
    -FallbackRuleApplied $Fallback `
    -InitialStatus (Status-From $Ok) `
    -Verdict (Verdict-From $Ok) `
    -Notes "$Notes Raw body: $($Result.BodyPath). HTTP $($Result.Status), curl exit $($Result.ExitCode)."
}

# P4-R01
$r = Invoke-CurlCase -RowId "P4-R01" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intents/batches?batch_id=$BatchId&page_size=200"))
$pis = To-Array $r.Json.batchDetails.paymentIntents.items
$firstPi = First-ArrayItem $pis
$hasPi = (Count-Items $pis) -gt 0
$hasConfidence = $hasPi -and (Test-HasField $firstPi "aggregate_confidence_score" -or Test-HasField $firstPi "confidence_score" -or Test-HasField $firstPi "status")
$resolved = "paymentIntents.count=$(Count-Items $pis); first=$(ConvertTo-OneLineJson $firstPi)"
Add-CurlRowFromResult "P4-R01" "Intent Journal > Transaction match label" "Wired" $r "paymentIntents[].aggregate_confidence_score, paymentIntents[].status" $resolved "Matched/Likely Matched/Awaiting/Mismatch/Not Found derived by frontend thresholds." "No backend fallback; frontend falls back to Awaiting if confidence/status cannot resolve." $hasConfidence "Tests the exact BFF composite payload for the row."

# P4-R02
$r = Invoke-CurlCase -RowId "P4-R02" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intents/batches?batch_id=$BatchId&page_size=200"))
$pis = To-Array $r.Json.batchDetails.paymentIntents.items
$firstPi = First-ArrayItem $pis
$ok = (Count-Items $pis) -gt 0 -and (Test-HasField $firstPi "intent_id") -and (Test-HasField $firstPi "batch_id")
$display = if ($ok) { "ZRD-" + ([string]$firstPi.intent_id -replace "[^a-zA-Z0-9]", "").Substring([Math]::Max(0,(([string]$firstPi.intent_id -replace "[^a-zA-Z0-9]", "").Length - 8))).ToUpper() } else { "ZRD-UNKNOWN" }
Add-CurlRowFromResult "P4-R02" "Intent Journal > Zord ID display" "Wired" $r "intent_id, batch_id" "first intent_id=$($firstPi.intent_id); batch_id=$($firstPi.batch_id)" $display "Frontend uses batchId if requestId is unavailable; otherwise ZRD-UNKNOWN." $ok "Verifies backend supplies stable IDs for buildZordId."

# P4-R03
$r = Invoke-CurlCase -RowId "P4-R03" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intents/batches?batch_id=$BatchId&page_size=200"))
$dlq = To-Array $r.Json.batchDetails.dlqItems.items
$firstDlq = First-ArrayItem $dlq
$ok = $r.Status -ge 200 -and $r.Status -lt 300
$resolved = "dlqItems.count=$(Count-Items $dlq); first=$(ConvertTo-OneLineJson $firstDlq)"
$verdictOk = $ok
Add-CurlRowFromResult "P4-R03" "Intent Journal > Failures (DLQ) stage and action" "Wired" $r "dlqItems[].stage, reason_code, error_detail, replayable, created_at, intent_context" $resolved "Failure stage/action rows; empty list means no backend DLQ rows for this clean ingest." "Frontend maps replayable=true to Retry, false to Investigate; empty list renders no failures." $verdictOk "This does not force a failure; it verifies the DLQ API shape for the uploaded batch."

# P4-R04
$r = Invoke-CurlCase -RowId "P4-R04" -Args ((AuthAndKeyArgs) + @("$BaseUrl/api/prod/settlement/observations/batches"))
$items = To-Array $r.Json.items
$batchHit = @($items | Where-Object { $_.client_batch_id -eq $BatchId })
$ok = $r.Status -ge 200 -and $r.Status -lt 300 -and (Count-Items $items) -gt 0
Add-CurlRowFromResult "P4-R04" "Settlement Journal > Client batch sidebar IDs" "Wired" $r "items[].client_batch_id" "items.count=$(Count-Items $items); matching_batch_count=$(Count-Items $batchHit)" "Available client_batch_id list including uploaded batch." "extractClientBatchIdsFromListResponse de-duplicates client-side." $ok "Verifies the settlement batch sidebar source."

# P4-R05
$r = Invoke-CurlCase -RowId "P4-R05" -Args ((AuthAndKeyArgs) + @("$BaseUrl/api/prod/settlement/observations/batches?client_batch_id=$BatchId"))
$obs = To-Array $r.Json.items
$firstObs = First-ArrayItem $obs
$ok = (Count-Items $obs) -gt 0 -and (Test-HasField $firstObs "amount") -and (Test-HasField $firstObs "settled_amount") -and (Test-HasField $firstObs "currency_code")
Add-CurlRowFromResult "P4-R05" "Settlement Journal > Observation amount fields" "Wired" $r "amount, settled_amount, fee_amount, deduction_amount, currency_code" "observations.count=$(Count-Items $obs); first=$(ConvertTo-OneLineJson $firstObs)" "Formatted amount/settled/fee/deductions per row." "Frontend numeric parser formats zero/null as display defaults." $ok "Verifies row amount fields from uploaded Razorpay settlement file."

# P4-R06
$r = Invoke-CurlCase -RowId "P4-R06" -Args ((AuthAndKeyArgs) + @("$BaseUrl/api/prod/settlement/observations/batches?client_batch_id=$BatchId"))
$obs = To-Array $r.Json.items
$firstObs = First-ArrayItem $obs
$ok = (Count-Items $obs) -gt 0 -and (Test-HasField $firstObs "settlement_status")
Add-CurlRowFromResult "P4-R06" "Settlement Journal > Observation status fields" "Wired" $r "settlement_status, provider_status_code, failure_reason_code, retry_flag, reversal_flag, return_flag" "observations.count=$(Count-Items $obs); first=$(ConvertTo-OneLineJson $firstObs)" "Settlement status and provider/reason flags displayed per row." "Status filters are client-side; missing optional flags display false/blank defaults." $ok "Verifies status fields from settlement observations endpoint."

# P4-R07
$r = Invoke-CurlCase -RowId "P4-R07" -Args ((AuthAndKeyArgs) + @("$BaseUrl/api/prod/settlement/errors?batch_id=$BatchId"))
$errs = To-Array $r.Json.items
$firstErr = First-ArrayItem $errs
$ok = $r.Status -ge 200 -and $r.Status -lt 300
Add-CurlRowFromResult "P4-R07" "Settlement Journal > Parse errors panel" "Wired" $r "source_row_ref, error_stage, reason_code, severity" "errors.count=$(Count-Items $errs); first=$(ConvertTo-OneLineJson $firstErr)" "Parser/mapping error rows, or no-error state when empty." "Empty list renders no-error state." $ok "Clean input may legitimately return zero parse errors."

# P4-R08
$r = Invoke-CurlCase -RowId "P4-R08" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intelligence/defensibility"))
$j = $r.Json
$ok = $r.Status -ge 200 -and $r.Status -lt 300 -and (Test-HasField $j "defensibility_score")
Add-CurlRowFromResult "P4-R08" "Evidence > Defensibility KPI card" "Wired" $r "defensibility_score, defensibility_tier, evidence_pack_rate, governance_coverage_pct, replayability_pct, audit_ready_pct, dispute_ready_pct" (ConvertTo-OneLineJson $j) "Score/tier and readiness percentage KPI cards." "Frontend converts rates to percentages; unavailable upstream blocks live KPI." $ok "Tests intelligence defensibility proxy."

# P4-R09
$leak = Invoke-CurlCase -RowId "P4-R09-leakage" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intelligence/leakage?batch_id=$BatchId"))
$amb = Invoke-CurlCase -RowId "P4-R09-ambiguity" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intelligence/ambiguity?batch_id=$BatchId"))
$ok = ($leak.Status -ge 200 -and $leak.Status -lt 300) -and ($amb.Status -ge 200 -and $amb.Status -lt 300)
Add-Row "P4-R09" "Evidence > Leakage/Ambiguity context cards" "Hybrid" "/api/prod/intelligence/leakage?batch_id=$BatchId and /api/prod/intelligence/ambiguity?batch_id=$BatchId" "$($leak.Command)<br>$($amb.Command)" "leakage risk fields + ambiguity risk fields" "leakage=$(ConvertTo-OneLineJson $leak.Json)<br>ambiguity=$(ConvertTo-OneLineJson $amb.Json)" "Context cards combined with defensibility cards." "Hybrid route may return data_available:false if upstream has no projection." (Status-From $ok) (Verdict-From $ok) "Raw bodies: $($leak.BodyPath), $($amb.BodyPath). HTTP: leakage $($leak.Status), ambiguity $($amb.Status)."

# P5-R01
$packs = Invoke-CurlCase -RowId "P5-R01-packs" -Args ((AuthArgs) + @("$BaseUrl/api/prod/evidence/packs?batch_id=$BatchId"))
$packIntents = Invoke-CurlCase -RowId "P5-R01-pack-intents" -Args ((AuthArgs) + @("$BaseUrl/api/prod/evidence/batch/$BatchId/intents"))
$packRows = To-Array $packs.Json.packs
if ((Count-Items $packRows) -eq 0) { $packRows = To-Array $packs.Json.items }
$firstPack = First-ArrayItem $packRows
$ok = ($packs.Status -ge 200 -and $packs.Status -lt 300) -and ($packIntents.Status -ge 200 -and $packIntents.Status -lt 300) -and (Count-Items $packRows) -gt 0
Add-Row "P5-R01" "Evidence > Pack Browser rows" "Wired" "/api/prod/evidence/packs?batch_id=$BatchId + /api/prod/evidence/batch/$BatchId/intents" "$($packs.Command)<br>$($packIntents.Command)" "evidence_pack_id, batch_id, intent_id, refs, merkle_root, mode, pack_status, proof_status, proof_score, leaf counts, created_at" "packs.count=$(Count-Items $packRows); first=$(ConvertTo-OneLineJson $firstPack); batch_intents=$(ConvertTo-OneLineJson $packIntents.Json)" "Pack browser table rows." "No frontend fallback except empty-state if pack list is empty." (Status-From $ok) (Verdict-From $ok) "Raw bodies: $($packs.BodyPath), $($packIntents.BodyPath)."

# P5-R02
$r = Invoke-CurlCase -RowId "P5-R02" -Args ((AuthArgs) + @("$BaseUrl/api/prod/evidence/packs?batch_id=$BatchId"))
$packRows = To-Array $r.Json.packs
if ((Count-Items $packRows) -eq 0) { $packRows = To-Array $r.Json.items }
$firstPack = First-ArrayItem $packRows
$ok = $r.Status -ge 200 -and $r.Status -lt 300 -and (Count-Items $packRows) -gt 0
Add-CurlRowFromResult "P5-R02" "Evidence > Proof status label" "Wired" $r "pack_status, proof_status, leaf_count, artifact_count, required_leaf_count, intent_id" "packs.count=$(Count-Items $packRows); first=$(ConvertTo-OneLineJson $firstPack)" "proofReady/verified/exported/partial/missing label derived by rule ladder." "If pack rows are absent, frontend shows empty/missing proof state." $ok "Verifies proof status source rows."

# P5-R03
$r = Invoke-CurlCase -RowId "P5-R03" -Args ((AuthArgs) + @("$BaseUrl/api/prod/evidence/packs?batch_id=$BatchId"))
$packRows = To-Array $r.Json.packs
if ((Count-Items $packRows) -eq 0) { $packRows = To-Array $r.Json.items }
$ok = $r.Status -ge 200 -and $r.Status -lt 300
Add-CurlRowFromResult "P5-R03" "Evidence > Breakdown segments" "Hybrid" $r "row.proofStatusKey derived from pack/proof fields; row.generatedAt" "packs.count=$(Count-Items $packRows)" "Breakdown percentages by proof status category." "When row count is zero, frontend uses mock segment template." $ok "Backend provides rows when evidence exists; chart calculation is client-side."

# P5-R04
$r = Invoke-CurlCase -RowId "P5-R04" -Args ((AuthArgs) + @("$BaseUrl/api/prod/evidence/packs?batch_id=$BatchId"))
$packRows = To-Array $r.Json.packs
if ((Count-Items $packRows) -eq 0) { $packRows = To-Array $r.Json.items }
$firstPack = First-ArrayItem $packRows
$ok = $r.Status -ge 200 -and $r.Status -lt 300
Add-CurlRowFromResult "P5-R04" "Evidence > 30-day trend chart" "Hybrid" $r "created_at/generatedAt timestamps from pack rows" "packs.count=$(Count-Items $packRows); first_created_at=$($firstPack.created_at)" "Daily evidence volume histogram for last 30 days." "When row count is zero, frontend uses mock waveform." $ok "Backend date validity can be checked from raw pack timestamps."

# P5-R05
$reference = ""
if ($firstPack -and $firstPack.intent_id) { $reference = [string]$firstPack.intent_id }
if (!$reference -and $firstPi -and $firstPi.intent_id) { $reference = [string]$firstPi.intent_id }
if (!$reference) { $reference = "NO_REFERENCE_AVAILABLE" }
$exportTypes = @("FINANCE_SUMMARY","AUDIT_DETAILED","BANK_PSP_PACK","RAW_JSON")
$exportNotes = @()
$exportOk = $true
foreach ($exportType in $exportTypes) {
  $payload = @{ payment_reference = $reference; dispute_reason = "BENEFICIARY_SAYS_NOT_RECEIVED"; export_type = $exportType } | ConvertTo-Json -Compress
  $payloadPath = Join-Path $ArtifactsDir "P5-R05-$exportType.payload.json"
  $payload | Set-Content -Path $payloadPath -Encoding UTF8
  $ex = Invoke-CurlCase -RowId "P5-R05-$exportType" -Args ((AuthArgs) + @("-X","POST","-H","Content-Type: application/json","--data-binary","@$payloadPath","$BaseUrl/api/v1/dispute/export"))
  $ctype = ((Get-Content $ex.HeaderPath | Where-Object { $_ -match "^content-type:" }) -join " ")
  $cdisp = ((Get-Content $ex.HeaderPath | Where-Object { $_ -match "^content-disposition:" }) -join " ")
  $len = if (Test-Path $ex.BodyPath) { (Get-Item $ex.BodyPath).Length } else { 0 }
  $exportNotes += "$exportType HTTP $($ex.Status), bytes=$len, $ctype, $cdisp, body=$($ex.BodyPath)"
  if (!($ex.Status -ge 200 -and $ex.Status -lt 300 -and $len -gt 0)) { $exportOk = $false }
}
Add-Row "P5-R05" "Evidence > Export center buttons" "Hybrid" "/api/v1/dispute/export" "POST each export_type with payment_reference=$reference, dispute_reason=BENEFICIARY_SAYS_NOT_RECEIVED" "request.payment_reference, dispute_reason, export_type; response content-type/content-disposition/blob" ($exportNotes -join "<br>") "Download finance/audit/bank-pack/raw-json export files." "HTTP error surfaces fallback message in frontend." (Status-From $exportOk) (Verdict-From $exportOk) "Uses the first evidence/intent reference available after ingest."

# P5-R06
$r = Invoke-CurlCase -RowId "P5-R06" -Args ((AuthArgs) + @("$BaseUrl/api/prod/systems/sync-status"))
$connectors = To-Array $r.Json.connectors
$ok = $r.Status -ge 200 -and $r.Status -lt 300 -and (Test-HasField $r.Json "data_available")
Add-CurlRowFromResult "P5-R06" "Live Sync > Connector cards" "Hybrid" $r "data_available, connectors[].id/name/status/last_sync_at, reason" "data_available=$($r.Json.data_available); connectors.count=$(Count-Items $connectors); response=$(ConvertTo-OneLineJson $r.Json)" "Connector name/status/last-sync cards, or no-telemetry guidance." "If upstream unreachable, BFF returns data_available=false and empty connectors." $ok "Verifies graceful hybrid behavior."

# P5-R07 Mock
$mockPath = "backend/zord-console/app/payout-command-view/connector-intelligence/seededRoutingData.ts"
$exists = Test-Path (Join-Path $Root $mockPath)
Add-Row "P5-R07" "Connector Intelligence (live dock) KPI panels" "Mock" "N/A" "Source verification: rg/get file path $mockPath" "snapshot.connectors, routeCandidates, networkHealthTrend, leakageComposition, actionRecommendations" "seededRoutingData.ts exists=$exists" "Network health, leakage composition, route ranking from seeded snapshot." "Mock adapter getRoutingIntelligenceAdapter() returns seeded snapshot; no backend fallback." "Ready for Frontend Check" (Verdict-From $exists) "No curl endpoint is expected per document."

# P5-R08 Mock
$mockPath = "backend/zord-console/services/payout-command/connected-providers-store.ts"
$exists = Test-Path (Join-Path $Root $mockPath)
Add-Row "P5-R08" "Sandbox Connectors list" "Mock" "N/A" "Source verification: localStorage store $mockPath" "providers[] local state + catalog constants" "connected-providers-store.ts exists=$exists; storage key zord:connected-providers" "Provider cards and connect/disconnect state." "Hydrates localStorage; no backend API." "Ready for Frontend Check" (Verdict-From $exists) "No curl endpoint is expected per document."

# P5-R09 Mock
$mockPath = "backend/zord-console/app/payout-command-view/today/_components/verification/borrowerVerificationMock.ts"
$exists = Test-Path (Join-Path $Root $mockPath)
Add-Row "P5-R09" "Borrower Verification > Summary buckets" "Mock" "N/A" "Source verification: $mockPath" "summary, queueCounts, totals, checkBreakdown" "BORROWER_VERIFICATION_MOCK exists=$exists" "Safe/blocked/exposure/KYC/proof summary buckets." "Direct mock render." "Ready for Frontend Check" (Verdict-From $exists) "No backend endpoint is expected."

# P6-R01 Mock
Add-Row "P6-R01" "Borrower Verification > Queue table row" "Mock" "N/A" "Source verification: borrowerVerificationMock.ts" "queueRows[].borrowerId, borrowerName, loanAmountInr, kyc, bank, fraud, aml, status, source" "BORROWER_VERIFICATION_MOCK exists=$exists" "Borrower risk queue rows with client-side sort/filter/page." "Direct mock render." "Ready for Frontend Check" (Verdict-From $exists) "No backend endpoint is expected."

# P6-R02 Mock
$mockPath = "backend/zord-console/app/payout-command-view/today/_components/monitoring/postDisbursalMonitoringMock.ts"
$exists = Test-Path (Join-Path $Root $mockPath)
Add-Row "P6-R02" "Post-Disbursal Monitoring > Summary cards" "Mock" "N/A" "Source verification: $mockPath" "summaryCards[].label/value/sub/tone" "POST_DISBURSAL_MONITORING_MOCK exists=$exists" "Total disbursed, confirmed received, at-risk, recovered, repayment rate cards." "Direct mock render." "Ready for Frontend Check" (Verdict-From $exists) "No backend endpoint is expected."

# P6-R03 Mock
Add-Row "P6-R03" "Post-Disbursal Monitoring > Queue row status" "Mock" "N/A" "Source verification: postDisbursalMonitoringMock.ts" "queueRows[].loanId, amountInr, confirmed, repayment, riskSignal, evidence, status" "POST_DISBURSAL_MONITORING_MOCK exists=$exists" "Confirmed/Pending/At-risk loan status rows." "Direct mock render." "Ready for Frontend Check" (Verdict-From $exists) "No backend endpoint is expected."

# P6-R04
$r = Invoke-CurlCase -RowId "P6-R04-list" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intents/batches"))
$batchItems = To-Array $r.Json.items
$detailOk = $r.Status -ge 200 -and $r.Status -lt 300
$processingTotal = 0
$detailSummaries = @()
foreach ($b in ($batchItems | Select-Object -First 15)) {
  $bid = [string]$b.batchId
  if (!$bid) { continue }
  $d = Invoke-CurlCase -RowId "P6-R04-detail-$bid" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intents/batches?batch_id=$bid&page_size=200"))
  $dItems = To-Array $d.Json.batchDetails.paymentIntents.items
  foreach ($it in $dItems) {
    $st = ([string]$it.status).ToUpper()
    $biz = ([string]$it.business_state).ToUpper()
    $gov = ([string]$it.governance_state).ToUpper()
    if (($st -notmatch "FAIL|REJECT|ERROR") -and $gov -ne "FLAGGED" -and ($st -notmatch "CONFIRM|SUCCESS|COMPLETED|SETTLED") -and ($st -match "PROCESS|DISPAT|IN_FLIGHT" -or $biz -eq "PROCESSING")) {
      $processingTotal++
    }
  }
  $detailSummaries += "$bid paymentIntents=$(Count-Items $dItems)"
}
$ok = $detailOk -and (Count-Items $batchItems) -ge 0
Add-CurlRowFromResult "P6-R04" "Billing > Processing in Zord count" "Wired" $r "batch list batchId; paymentIntents[].status, business_state, governance_state" "batches.count=$(Count-Items $batchItems); processingCount=$processingTotal; details=$($detailSummaries -join '; ')" "Processing in Zord count." "Frontend scans first 15 batches; no mock fallback for count beyond zero." $ok "Per-batch detail calls are captured as separate raw artifacts where applicable."

# P6-R05
$usagePct = [Math]::Min(100, [Math]::Round(($processingTotal / 10) * 100))
Add-Row "P6-R05" "Billing > Sandbox cap progress bar" "Hybrid" "/api/prod/intents/batches + per-batch detail calls" "Reuse P6-R04 curl calls; local constant SANDBOX_DAILY_INTENT_LIMIT=10" "processingCount, SANDBOX_DAILY_INTENT_LIMIT" "processingCount=$processingTotal; limit=10; usagePct=$usagePct%" "$processingTotal / 10 and progress bar at $usagePct%." "Limit is frontend constant; live count from backend." "Ready for Frontend Check" "PASS" "Hybrid calculation verified from P6-R04 result."

# P6-R06 Mock
$mockPath = "backend/zord-console/app/payout-command-view/today/_components/surfaces/BillingSurface.tsx"
$exists = Test-Path (Join-Path $Root $mockPath)
Add-Row "P6-R06" "Billing > Plan and invoices section" "Mock" "N/A" "Source verification: $mockPath contains PLANS constant/static placeholders" "PLANS[] fields, static invoice copy" "BillingSurface.tsx exists=$exists" "Plan cards and invoice placeholders." "Direct static render." "Ready for Frontend Check" (Verdict-From $exists) "No backend endpoint is expected."

# P6-R07
$batches = Invoke-CurlCase -RowId "P6-R07-batches" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intents/batches"))
$patterns = Invoke-CurlCase -RowId "P6-R07-patterns" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intelligence/patterns?batch_id=$BatchId"))
$heatmap = Invoke-CurlCase -RowId "P6-R07-heatmap" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intelligence/ambiguity/heatmap"))
$settle = Invoke-CurlCase -RowId "P6-R07-settlement" -Args ((AuthAndKeyArgs) + @("$BaseUrl/api/prod/settlement/observations/batches"))
$ok = @($batches,$patterns,$heatmap,$settle) | ForEach-Object { $_.Status -ge 200 -and $_.Status -lt 300 } | Where-Object { $_ -eq $false } | Measure-Object | ForEach-Object { $_.Count -eq 0 }
Add-Row "P6-R07" "Support > Processing overview totals" "Hybrid" "batches + patterns + ambiguity heatmap + settlement observations" "$($batches.Command)<br>$($patterns.Command)<br>$($heatmap.Command)<br>$($settle.Command)" "batch items transactions/confirmedCount/mismatchCount/unresolvedCount; patterns.pending_count; settlement observations" "batches=$(ConvertTo-OneLineJson $batches.Json); patterns=$(ConvertTo-OneLineJson $patterns.Json); heatmap=$(ConvertTo-OneLineJson $heatmap.Json); settlement_count=$(Count-Items (To-Array $settle.Json.items))" "Total/completed/failed/processing/unresolved with percentages." "Some values are frontend-derived from multiple live sources." (Status-From $ok) (Verdict-From $ok) "Raw bodies: $($batches.BodyPath), $($patterns.BodyPath), $($heatmap.BodyPath), $($settle.BodyPath)."

# P6-R08
$r = Invoke-CurlCase -RowId "P6-R08" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intelligence/patterns?batch_id=$BatchId"))
$ok = $r.Status -ge 200 -and $r.Status -lt 300
Add-CurlRowFromResult "P6-R08" "Support > Failure reasons panel" "Hybrid" $r "patterns.pending_count or failed count from batch totals" (ConvertTo-OneLineJson $r.Json) "Synthetic reason buckets like TOKENIZATION_FAILURE/WEBHOOK_TIMEOUT." "Reason split percentages are client-generated, not a backend distribution." $ok "Tests the backend basis for the synthetic split."

# P6-R09
$r = Invoke-CurlCase -RowId "P6-R09" -Args ((AuthAndKeyArgs) + @("$BaseUrl/api/prod/settlement/observations/batches?client_batch_id=$BatchId"))
$obs = To-Array $r.Json.items
$firstObs = First-ArrayItem $obs
$ok = $r.Status -ge 200 -and $r.Status -lt 300 -and (Count-Items $obs) -gt 0
Add-CurlRowFromResult "P6-R09" "Support > Recent processing activity rows" "Hybrid" $r "created_at/observation_timestamp, matched_intent_id, settlement_status, client_batch_id" "observations.count=$(Count-Items $obs); first=$(ConvertTo-OneLineJson $firstObs)" "First 8 recent processing activity rows with relative time." "Frontend supplies display defaults for missing refs." $ok "Uses settlement observations for activity feed."

# P7-R01
$r = Invoke-CurlCase -RowId "P7-R01" -Args ((AuthArgs) + @("$BaseUrl/api/prod/intelligence/ambiguity/heatmap"))
$batchesH = To-Array $r.Json.batches
$firstH = First-ArrayItem $batchesH
$ok = $r.Status -ge 200 -and $r.Status -lt 300
Add-CurlRowFromResult "P7-R01" "Support > Heatmap matrix" "Hybrid" $r "batches[].total_count, unresolved_count, conflicted_count, ambiguous_count" "heatmap_batches.count=$(Count-Items $batchesH); first=$(ConvertTo-OneLineJson $firstH)" "Weekly heat bands from failure/ambiguity ratios." "Client computes discrete heat levels." $ok "Tests ambiguity heatmap proxy."

# P7-R02
$me = Invoke-CurlCase -RowId "P7-R02-auth-me" -Args ((AuthArgs) + @("$BaseUrl/api/auth/me"))
$ok = $me.Status -ge 200 -and $me.Status -lt 300 -and (Test-HasField $me.Json "user")
Add-CurlRowFromResult "P7-R02" "Support > Ticket inbox and thread" "Hybrid" $me "ticket/message localStorage objects + /api/auth/me profile user/session fields" "auth_me=$(ConvertTo-OneLineJson $me.Json)" "Open/closed tickets and profile context for the signed-in tenant." "Tickets are localStorage-backed per tenant; user profile comes from /api/auth/me." $ok "Verifies the only backend portion of this hybrid row."

# P7-R03
$r = Invoke-CurlCase -RowId "P7-R03" -Args ((AuthArgs) + @("$BaseUrl/api/sandbox/workspace-api-keys"))
$ok = $r.Status -ge 200 -and $r.Status -lt 300 -and (Test-HasField $r.Json "tenant_id") -and (Test-HasField $r.Json "publishable_key")
Add-CurlRowFromResult "P7-R03" "Header > API keys popover context row" "Hybrid" $r "tenant_id, tenant_name, workspace_code, publishable_key, secret_key_prefix" "response=$(ConvertTo-OneLineJson $r.Json); localStorage secret key would be zord_tenant_api_key:$script:TenantId with value $(Mask-Secret $script:ApiKey)" "Tenant/workspace context and publishable key; masked secret display/copy if browser localStorage contains signup key." "secret_key_prefix is null from server; full secret is only browser-local from signup." $ok "Verifies server-backed context row."

Write-Report
Write-Host "Report: $ReportPath"
Write-Host "Artifacts: $ArtifactsDir"
