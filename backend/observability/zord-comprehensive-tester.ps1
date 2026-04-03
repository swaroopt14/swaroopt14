#!/usr/bin/env powershell

# ============================================================================
# ZORD COMPREHENSIVE OBSERVABILITY TESTER
# One script to test all observability components and microservices
# ============================================================================

param(
    [string]$Mode = "all",
    [string]$Service = "",
    [int]$TrafficCount = 50,
    [switch]$OpenBrowser,
    [switch]$Detailed,
    [switch]$Help
)

if ($Help) {
    Write-Host "ZORD COMPREHENSIVE OBSERVABILITY TESTER" -ForegroundColor Cyan
    Write-Host "=======================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  .\zord-comprehensive-tester.ps1 [OPTIONS]" -ForegroundColor White
    Write-Host ""
    Write-Host "OPTIONS:" -ForegroundColor Yellow
    Write-Host "  -Mode <mode>        Test mode: 'all', 'observability', 'services', 'traffic', 'traces'" -ForegroundColor White
    Write-Host "  -Service <name>     Test specific service: 'edge', 'vault', 'relay', 'intent', 'console'" -ForegroundColor White
    Write-Host "  -TrafficCount <n>   Number of requests per service (default: 50)" -ForegroundColor White
    Write-Host "  -OpenBrowser        Automatically open observability UIs in browser" -ForegroundColor White
    Write-Host "  -Detailed           Run detailed analysis with metrics breakdown" -ForegroundColor White
    Write-Host "  -Help               Show this help message" -ForegroundColor White
    Write-Host ""
    Write-Host "EXAMPLES:" -ForegroundColor Yellow
    Write-Host "  .\zord-comprehensive-tester.ps1                    # Test everything" -ForegroundColor White
    Write-Host "  .\zord-comprehensive-tester.ps1 -Mode observability # Test only observability stack" -ForegroundColor White
    Write-Host "  .\zord-comprehensive-tester.ps1 -Service edge       # Test only zord-edge" -ForegroundColor White
    Write-Host "  .\zord-comprehensive-tester.ps1 -OpenBrowser        # Test all and open UIs" -ForegroundColor White
    Write-Host ""
    exit 0
}

Write-Host "🧪 ZORD COMPREHENSIVE OBSERVABILITY TESTER" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "Mode: $Mode | Service: $Service | Traffic Count: $TrafficCount" -ForegroundColor White
Write-Host ""

# ============================================================================
# CONFIGURATION
# ============================================================================

$ObservabilityEndpoints = @{
    "Prometheus Web UI" = "http://localhost:9090"
    "Prometheus API" = "http://localhost:9090/api/v1/query?query=up"
    "Grafana Health" = "http://localhost:3001/api/health"
    "Grafana Login" = "http://localhost:3001/login"
    "Jaeger UI" = "http://localhost:16686"
    "Jaeger API" = "http://localhost:16686/api/services"
    "OTEL Collector Metrics" = "http://localhost:8888/metrics"
    "OTEL Collector Export" = "http://localhost:8889/metrics"
}

$MicroserviceEndpoints = @{
    "zord-edge" = @{ Url = "http://localhost:8080/health"; Port = "8080" }
    "zord-vault-journal" = @{ Url = "http://localhost:8081/health"; Port = "8081" }
    "zord-relay" = @{ Url = "http://localhost:8082/health"; Port = "8082" }
    "zord-intent-engine" = @{ Url = "http://localhost:8083/health"; Port = "8083" }
    "zord-console" = @{ Url = "http://localhost:3000/api/health"; Port = "3000" }
}

$AccessUrls = @{
    "Grafana" = "http://localhost:3001 (admin/admin)"
    "Prometheus" = "http://localhost:9090"
    "Jaeger" = "http://localhost:16686"
    "Zord Console" = "http://localhost:3000"
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$ExpectedContent = $null,
        [bool]$Silent = $false
    )
    
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            if ($ExpectedContent -and $response.Content -notlike "*$ExpectedContent*") {
                if (-not $Silent) { Write-Host "⚠️  $Name - Response OK but content unexpected" -ForegroundColor Yellow }
                return @{ Name = $Name; Status = "Warning"; Details = "Unexpected content"; Url = $Url }
            } else {
                if (-not $Silent) { Write-Host "✅ $Name - OK" -ForegroundColor Green }
                return @{ Name = $Name; Status = "Success"; Details = "HTTP 200"; Url = $Url }
            }
        } else {
            if (-not $Silent) { Write-Host "❌ $Name - HTTP $($response.StatusCode)" -ForegroundColor Red }
            return @{ Name = $Name; Status = "Failed"; Details = "HTTP $($response.StatusCode)"; Url = $Url }
        }
    } catch {
        if (-not $Silent) { Write-Host "❌ $Name - Error: $($_.Exception.Message)" -ForegroundColor Red }
        return @{ Name = $Name; Status = "Failed"; Details = $_.Exception.Message; Url = $Url }
    }
}

function Invoke-PrometheusQuery {
    param([string]$Query, [string]$Description)
    
    if ($Detailed) {
        Write-Host "Query: $Description" -ForegroundColor Yellow
        Write-Host "PromQL: $Query" -ForegroundColor Cyan
    }
    
    try {
        Add-Type -AssemblyName System.Web
        $encodedQuery = [System.Web.HttpUtility]::UrlEncode($Query)
        $url = "http://localhost:9090/api/v1/query?query=$encodedQuery"
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing
        $data = $response.Content | ConvertFrom-Json
        
        if ($data.status -eq "success") {
            if ($Detailed) {
                Write-Host "Results:" -ForegroundColor Green
                foreach ($result in $data.data.result) {
                    $metric = $result.metric
                    $value = $result.value[1]
                    Write-Host "  $($metric.job) @ $($metric.instance): $value" -ForegroundColor White
                }
            }
            return $data.data.result
        } else {
            Write-Host "Query failed: $($data.error)" -ForegroundColor Red
            return $null
        }
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function Generate-TrafficToService {
    param(
        [string]$ServiceName,
        [string]$Url,
        [int]$RequestCount = 50
    )
    
    Write-Host "🚀 Generating $RequestCount requests to $ServiceName..." -ForegroundColor Cyan
    
    $successCount = 0
    for ($i = 1; $i -le $RequestCount; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                $successCount++
            }
        } catch {
            # Ignore errors for traffic generation
        }
        Start-Sleep -Milliseconds 100
    }
    
    Write-Host "✅ $ServiceName: $successCount/$RequestCount successful requests" -ForegroundColor Green
    return @{ Service = $ServiceName; Success = $successCount; Total = $RequestCount }
}

function Open-ObservabilityUIs {
    Write-Host "🌐 Opening Observability UIs..." -ForegroundColor Cyan
    
    $urls = @(
        "http://localhost:3001",  # Grafana
        "http://localhost:9090",  # Prometheus
        "http://localhost:16686"  # Jaeger
    )
    
    foreach ($url in $urls) {
        try {
            Start-Process $url
            Start-Sleep -Seconds 1
        } catch {
            Write-Host "⚠️  Could not open $url" -ForegroundColor Yellow
        }
    }
    
    Write-Host "✅ Observability UIs opened in browser" -ForegroundColor Green
}

# ============================================================================
# TEST FUNCTIONS
# ============================================================================

function Test-ObservabilityStack {
    Write-Host "🔍 TESTING OBSERVABILITY STACK" -ForegroundColor Yellow
    Write-Host "===============================" -ForegroundColor Yellow
    
    $results = @()
    
    foreach ($endpoint in $ObservabilityEndpoints.GetEnumerator()) {
        $result = Test-Endpoint -Name $endpoint.Key -Url $endpoint.Value
        $results += $result
    }
    
    return $results
}

function Test-MicroserviceHealth {
    Write-Host "🚀 TESTING MICROSERVICE HEALTH" -ForegroundColor Yellow
    Write-Host "===============================" -ForegroundColor Yellow
    
    $results = @()
    
    if ($Service) {
        if ($MicroserviceEndpoints.ContainsKey($Service)) {
            $endpoint = $MicroserviceEndpoints[$Service]
            $result = Test-Endpoint -Name $Service -Url $endpoint.Url
            $results += $result
        } else {
            Write-Host "❌ Unknown service: $Service" -ForegroundColor Red
            Write-Host "Available services: $($MicroserviceEndpoints.Keys -join ', ')" -ForegroundColor White
        }
    } else {
        foreach ($service in $MicroserviceEndpoints.GetEnumerator()) {
            $result = Test-Endpoint -Name $service.Key -Url $service.Value.Url
            $results += $result
        }
    }
    
    return $results
}

function Test-PrometheusMetrics {
    Write-Host "📊 TESTING PROMETHEUS METRICS" -ForegroundColor Yellow
    Write-Host "==============================" -ForegroundColor Yellow
    
    try {
        $upResults = Invoke-PrometheusQuery -Query "up" -Description "Service Status"
        
        if ($upResults) {
            $upServices = $upResults | Where-Object { $_.value[1] -eq "1" }
            $downServices = $upResults | Where-Object { $_.value[1] -eq "0" }
            
            Write-Host "✅ Services UP: $($upServices.Count)" -ForegroundColor Green
            foreach ($service in $upServices) {
                Write-Host "   - $($service.metric.job): $($service.metric.instance)" -ForegroundColor Green
            }
            
            if ($downServices.Count -gt 0) {
                Write-Host "❌ Services DOWN: $($downServices.Count)" -ForegroundColor Red
                foreach ($service in $downServices) {
                    Write-Host "   - $($service.metric.job): $($service.metric.instance)" -ForegroundColor Red
                }
            }
            
            return @{ Up = $upServices.Count; Down = $downServices.Count }
        }
    } catch {
        Write-Host "❌ Error querying Prometheus: $($_.Exception.Message)" -ForegroundColor Red
        return @{ Up = 0; Down = 0; Error = $_.Exception.Message }
    }
}

function Test-JaegerTraces {
    Write-Host "🔍 TESTING JAEGER TRACES" -ForegroundColor Yellow
    Write-Host "=========================" -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:16686/api/services" -UseBasicParsing
        $services = $response.Content | ConvertFrom-Json
        
        if ($services.data -and $services.data.Count -gt 0) {
            Write-Host "✅ Found $($services.data.Count) services in Jaeger:" -ForegroundColor Green
            foreach ($service in $services.data) {
                if ($service -like "zord-*") {
                    Write-Host "   🚀 $service (Microservice)" -ForegroundColor Green
                } else {
                    Write-Host "   📊 $service (Infrastructure)" -ForegroundColor Cyan
                }
            }
            return @{ ServiceCount = $services.data.Count; Services = $services.data }
        } else {
            Write-Host "⚠️  No services found in Jaeger" -ForegroundColor Yellow
            Write-Host "This may indicate tracing configuration needs adjustment" -ForegroundColor White
            return @{ ServiceCount = 0; Services = @() }
        }
    } catch {
        Write-Host "❌ Error checking Jaeger: $($_.Exception.Message)" -ForegroundColor Red
        return @{ ServiceCount = 0; Services = @(); Error = $_.Exception.Message }
    }
}

function Generate-TestTraffic {
    Write-Host "🔄 GENERATING TEST TRAFFIC" -ForegroundColor Yellow
    Write-Host "===========================" -ForegroundColor Yellow
    
    $trafficResults = @()
    
    if ($Service) {
        if ($MicroserviceEndpoints.ContainsKey($Service)) {
            $endpoint = $MicroserviceEndpoints[$Service]
            $result = Generate-TrafficToService -ServiceName $Service -Url $endpoint.Url -RequestCount $TrafficCount
            $trafficResults += $result
        }
    } else {
        foreach ($service in $MicroserviceEndpoints.GetEnumerator()) {
            $result = Generate-TrafficToService -ServiceName $service.Key -Url $service.Value.Url -RequestCount $TrafficCount
            $trafficResults += $result
        }
    }
    
    # Wait for traces to be processed
    Write-Host "⏳ Waiting for traces to be processed..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    return $trafficResults
}

function Show-DetailedAnalysis {
    Write-Host "🔬 DETAILED OBSERVABILITY ANALYSIS" -ForegroundColor Yellow
    Write-Host "===================================" -ForegroundColor Yellow
    
    # Test OpenTelemetry Collector
    try {
        $otelResponse = Invoke-WebRequest -Uri "http://localhost:8888/metrics" -UseBasicParsing
        $metricsContent = $otelResponse.Content
        
        $receiverMetrics = ($metricsContent -split "`n" | Where-Object { $_ -like "*otelcol_receiver*" }).Count
        $processorMetrics = ($metricsContent -split "`n" | Where-Object { $_ -like "*otelcol_processor*" }).Count
        $exporterMetrics = ($metricsContent -split "`n" | Where-Object { $_ -like "*otelcol_exporter*" }).Count
        
        Write-Host "✅ OpenTelemetry Collector Metrics:" -ForegroundColor Green
        Write-Host "   - Receiver metrics: $receiverMetrics" -ForegroundColor Cyan
        Write-Host "   - Processor metrics: $processorMetrics" -ForegroundColor Cyan
        Write-Host "   - Exporter metrics: $exporterMetrics" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ OpenTelemetry Collector Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Test Grafana datasources
    try {
        $dsResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/datasources" -UseBasicParsing -Headers @{Authorization="Basic YWRtaW46YWRtaW4="}
        $datasources = $dsResponse.Content | ConvertFrom-Json
        
        Write-Host "✅ Grafana Datasources:" -ForegroundColor Green
        foreach ($ds in $datasources) {
            Write-Host "   - $($ds.name) ($($ds.type)): $($ds.url)" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "⚠️  Could not fetch Grafana datasources (authentication required)" -ForegroundColor Yellow
    }
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

$TestResults = @()
$StartTime = Get-Date

switch ($Mode.ToLower()) {
    "observability" {
        $TestResults += Test-ObservabilityStack
    }
    "services" {
        $TestResults += Test-MicroserviceHealth
    }
    "traffic" {
        $TrafficResults = Generate-TestTraffic
    }
    "traces" {
        $TrafficResults = Generate-TestTraffic
        $JaegerResults = Test-JaegerTraces
    }
    "all" {
        Write-Host "🎯 COMPREHENSIVE TESTING MODE" -ForegroundColor Cyan
        Write-Host ""
        
        # Test observability stack
        $TestResults += Test-ObservabilityStack
        Write-Host ""
        
        # Test microservices
        $TestResults += Test-MicroserviceHealth
        Write-Host ""
        
        # Test Prometheus metrics
        $PrometheusResults = Test-PrometheusMetrics
        Write-Host ""
        
        # Generate traffic
        $TrafficResults = Generate-TestTraffic
        Write-Host ""
        
        # Test Jaeger traces
        $JaegerResults = Test-JaegerTraces
        Write-Host ""
        
        # Detailed analysis if requested
        if ($Detailed) {
            Show-DetailedAnalysis
            Write-Host ""
        }
    }
    default {
        Write-Host "❌ Unknown mode: $Mode" -ForegroundColor Red
        Write-Host "Available modes: all, observability, services, traffic, traces" -ForegroundColor White
        exit 1
    }
}

# ============================================================================
# RESULTS SUMMARY
# ============================================================================

$EndTime = Get-Date
$Duration = $EndTime - $StartTime

Write-Host "📋 TEST RESULTS SUMMARY" -ForegroundColor Yellow
Write-Host "========================" -ForegroundColor Yellow
Write-Host "Duration: $($Duration.TotalSeconds) seconds" -ForegroundColor White
Write-Host ""

if ($TestResults.Count -gt 0) {
    $successCount = ($TestResults | Where-Object { $_.Status -eq "Success" }).Count
    $warningCount = ($TestResults | Where-Object { $_.Status -eq "Warning" }).Count
    $failedCount = ($TestResults | Where-Object { $_.Status -eq "Failed" }).Count
    
    Write-Host "ENDPOINT TESTS:" -ForegroundColor Cyan
    Write-Host "✅ Successful: $successCount" -ForegroundColor Green
    Write-Host "⚠️  Warnings: $warningCount" -ForegroundColor Yellow
    Write-Host "❌ Failed: $failedCount" -ForegroundColor Red
    Write-Host ""
}

if ($TrafficResults) {
    $totalRequests = ($TrafficResults | Measure-Object -Property Total -Sum).Sum
    $totalSuccess = ($TrafficResults | Measure-Object -Property Success -Sum).Sum
    
    Write-Host "TRAFFIC GENERATION:" -ForegroundColor Cyan
    Write-Host "📊 Total Requests: $totalRequests" -ForegroundColor White
    Write-Host "✅ Successful: $totalSuccess" -ForegroundColor Green
    Write-Host "❌ Failed: $($totalRequests - $totalSuccess)" -ForegroundColor Red
    Write-Host ""
}

if ($PrometheusResults) {
    Write-Host "PROMETHEUS METRICS:" -ForegroundColor Cyan
    Write-Host "🟢 Services Up: $($PrometheusResults.Up)" -ForegroundColor Green
    Write-Host "🔴 Services Down: $($PrometheusResults.Down)" -ForegroundColor Red
    Write-Host ""
}

if ($JaegerResults) {
    Write-Host "JAEGER TRACING:" -ForegroundColor Cyan
    Write-Host "📊 Services Found: $($JaegerResults.ServiceCount)" -ForegroundColor White
    if ($JaegerResults.Services.Count -gt 0) {
        Write-Host "Services: $($JaegerResults.Services -join ', ')" -ForegroundColor Cyan
    }
    Write-Host ""
}

# Overall status
$overallStatus = "SUCCESS"
if ($TestResults.Count -gt 0) {
    $failedCount = ($TestResults | Where-Object { $_.Status -eq "Failed" }).Count
    if ($failedCount -gt 0) {
        $overallStatus = "ISSUES DETECTED"
    }
}

Write-Host "🎯 OVERALL STATUS: $overallStatus" -ForegroundColor $(if ($overallStatus -eq "SUCCESS") { "Green" } else { "Red" })
Write-Host ""

# Access URLs
Write-Host "🌐 QUICK ACCESS URLS:" -ForegroundColor Cyan
foreach ($url in $AccessUrls.GetEnumerator()) {
    Write-Host "- $($url.Key): $($url.Value)" -ForegroundColor White
}
Write-Host ""

# Open browsers if requested
if ($OpenBrowser) {
    Open-ObservabilityUIs
}

# Detailed results if requested
if ($Detailed -and $TestResults.Count -gt 0) {
    Write-Host "📊 DETAILED RESULTS:" -ForegroundColor Cyan
    foreach ($result in $TestResults) {
        $color = switch ($result.Status) {
            "Success" { "Green" }
            "Warning" { "Yellow" }
            "Failed" { "Red" }
        }
        Write-Host "[$($result.Status)] $($result.Name): $($result.Details)" -ForegroundColor $color
    }
}

Write-Host ""
Write-Host "🎉 TESTING COMPLETE!" -ForegroundColor Green