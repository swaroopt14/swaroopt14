# Simple End-to-End Test for Zord Platform
Write-Host "🚀 ZORD PLATFORM - SIMPLE END-TO-END TEST" -ForegroundColor Cyan

# Test service health endpoints
$services = @(
    @{ Name = "zord-edge"; Port = 8080; Path = "/health" }
    @{ Name = "zord-vault-journal"; Port = 8081; Path = "/health" }
    @{ Name = "zord-intent-engine"; Port = 8083; Path = "/health" }
    @{ Name = "zord-relay"; Port = 8082; Path = "/health" }
    @{ Name = "zord-console"; Port = 3000; Path = "/api/health" }
)

Write-Host "`n📊 TESTING SERVICE HEALTH ENDPOINTS:" -ForegroundColor Yellow

foreach ($service in $services) {
    $uri = "http://localhost:$($service.Port)$($service.Path)"
    try {
        $response = Invoke-WebRequest -Uri $uri -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ $($service.Name) - HTTP $($response.StatusCode)" -ForegroundColor Green
        } else {
            Write-Host "⚠️ $($service.Name) - HTTP $($response.StatusCode)" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "❌ $($service.Name) - Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test tenant registration
Write-Host "`n🔑 TESTING TENANT REGISTRATION:" -ForegroundColor Yellow

$tenantPayload = @{
    tenant_name = "test-e2e-tenant"
    contact_email = "test@example.com"
} | ConvertTo-Json

$headers = @{ "Content-Type" = "application/json" }

try {
    $regResponse = Invoke-WebRequest -Uri "http://localhost:8080/v1/tenantReg" -Method POST -Body $tenantPayload -Headers $headers -TimeoutSec 15 -UseBasicParsing
    
    if ($regResponse.StatusCode -eq 200) {
        Write-Host "✅ Tenant Registration - HTTP $($regResponse.StatusCode)" -ForegroundColor Green
        
        $regData = $regResponse.Content | ConvertFrom-Json
        $tenantId = $regData.tenant_id
        $apiKey = $regData.API_KEY
        
        Write-Host "   Tenant ID: $tenantId" -ForegroundColor Gray
        Write-Host "   API Key: $($apiKey.Substring(0, 20))..." -ForegroundColor Gray
        
        # Test intent ingestion
        Write-Host "`n💰 TESTING INTENT INGESTION:" -ForegroundColor Yellow
        
        $intentPayload = @{
            tenant_id = $tenantId
            intent_type = "PAYOUT"
            amount = @{
                value = "100.00"
                currency = "USD"
            }
            recipient = @{
                name = "Test User"
                account = "1234567890"
            }
            metadata = @{
                reference = "E2E-TEST-001"
                description = "End-to-end test transaction"
            }
        } | ConvertTo-Json -Depth 3
        
        $intentHeaders = @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $apiKey"
        }
        
        try {
            $intentResponse = Invoke-WebRequest -Uri "http://localhost:8080/v1/ingest" -Method POST -Body $intentPayload -Headers $intentHeaders -TimeoutSec 15 -UseBasicParsing
            
            if ($intentResponse.StatusCode -eq 200) {
                Write-Host "✅ Intent Ingestion - HTTP $($intentResponse.StatusCode)" -ForegroundColor Green
                
                $intentData = $intentResponse.Content | ConvertFrom-Json
                Write-Host "   Trace ID: $($intentData.trace_id)" -ForegroundColor Gray
                Write-Host "   Envelope ID: $($intentData.envelope_id)" -ForegroundColor Gray
            } else {
                Write-Host "⚠️ Intent Ingestion - HTTP $($intentResponse.StatusCode)" -ForegroundColor Yellow
            }
        }
        catch {
            Write-Host "❌ Intent Ingestion - Failed: $($_.Exception.Message)" -ForegroundColor Red
        }
        
    } else {
        Write-Host "⚠️ Tenant Registration - HTTP $($regResponse.StatusCode)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "❌ Tenant Registration - Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test database connectivity
Write-Host "`n🗄️ TESTING DATABASE CONNECTIVITY:" -ForegroundColor Yellow

$databases = @(
    @{ Name = "zord-edge-postgres"; Container = "zord-edge-postgres" }
    @{ Name = "zord-vault-postgres"; Container = "zord-vault-postgres" }
    @{ Name = "zord-intent-postgres"; Container = "zord-intent-postgres" }
    @{ Name = "zord-relay-postgres"; Container = "zord-relay-postgres" }
)

foreach ($db in $databases) {
    try {
        $result = docker exec $db.Container pg_isready 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $($db.Name) - Ready" -ForegroundColor Green
        } else {
            Write-Host "❌ $($db.Name) - Not Ready" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ $($db.Name) - Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test Redis connectivity
Write-Host "`n🔴 TESTING REDIS CONNECTIVITY:" -ForegroundColor Yellow
try {
    $redisResult = docker exec zord-vault-redis redis-cli ping 2>&1
    if ($redisResult -match "PONG") {
        Write-Host "✅ Redis - PONG received" -ForegroundColor Green
    } else {
        Write-Host "❌ Redis - No PONG response" -ForegroundColor Red
    }
}
catch {
    Write-Host "❌ Redis - Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Kafka connectivity
Write-Host "`n📨 TESTING KAFKA CONNECTIVITY:" -ForegroundColor Yellow
try {
    $kafkaResult = docker exec zord-kafka kafka-topics --bootstrap-server localhost:9092 --list 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Kafka - Connection successful" -ForegroundColor Green
    } else {
        Write-Host "❌ Kafka - Connection failed" -ForegroundColor Red
    }
}
catch {
    Write-Host "❌ Kafka - Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎯 END-TO-END TEST COMPLETED!" -ForegroundColor Cyan
Write-Host "📊 Access your services at:" -ForegroundColor White
Write-Host "   • Zord Console: http://localhost:3000" -ForegroundColor Gray
Write-Host "   • API Gateway: http://localhost:8080" -ForegroundColor Gray
Write-Host "   • Grafana: http://localhost:3001" -ForegroundColor Gray
Write-Host "   • Jaeger: http://localhost:16686" -ForegroundColor Gray