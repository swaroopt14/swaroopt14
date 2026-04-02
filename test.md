# 🧪 ZORD PLATFORM - END-TO-END TESTING GUIDE

## 📋 **OVERVIEW**

This document provides comprehensive end-to-end testing procedures for the Zord platform, covering all microservices, data flows, and integration scenarios from initial deployment to production readiness.

## 🎯 **TESTING OBJECTIVES**

- **Functional Testing**: Verify all services work as designed
- **Integration Testing**: Validate service-to-service communication
- **Performance Testing**: Ensure system meets performance requirements
- **Security Testing**: Validate authentication and authorization
- **Reliability Testing**: Test error handling and recovery
- **Observability Testing**: Verify monitoring and alerting

## 🚀 **QUICK START**

### **Prerequisites**
- Docker Desktop with 8GB+ RAM
- PowerShell 5.1+ (Windows) or PowerShell Core (Linux/Mac)
- All Zord services deployed via `docker-compose up -d --build`

### **Run Complete Test Suite**
```powershell
# Complete end-to-end validation
.\test-complete-deployment.ps1 -Mode all -Verbose -OpenBrowser

# Expected: 90%+ success rate for healthy deployment
```

## 📊 **TEST EXECUTION MODES**

| Mode | Description | Duration | Use Case |
|------|-------------|----------|----------|
| `all` | Complete end-to-end testing | 5-10 min | Full deployment validation |
| `quick` | Essential health checks | 1-2 min | Rapid status verification |
| `services` | Service health validation | 2-3 min | Service-specific testing |
| `databases` | Database connectivity | 1-2 min | Data layer validation |
| `integration` | API and data flow testing | 3-5 min | Integration validation |
| `load` | Performance and stress testing | 2-4 min | Load capacity testing |

## 🗄️ **DATABASE TESTING REFERENCE**

For comprehensive database testing, see the dedicated **[testdatabase.md](testdatabase.md)** guide which includes:

- **Step-by-step connection instructions** for all 7 database instances
- **Schema validation procedures** for each database
- **Data operation testing** with real SQL queries
- **Performance monitoring** commands
- **Automated testing scripts** for complete validation
- **Troubleshooting guide** for common database issues

### **Quick Database Health Check**
```bash
# Verify all database containers are running
docker ps --filter "name=postgres" --filter "name=redis" --filter "name=kafka" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Quick connectivity test for all databases
docker exec zord-edge-postgres pg_isready && echo "✅ zord-edge-postgres: Ready"
docker exec zord-vault-postgres pg_isready && echo "✅ zord-vault-postgres: Ready"
docker exec zord-intent-postgres pg_isready && echo "✅ zord-intent-postgres: Ready"
docker exec zord-relay-postgres pg_isready && echo "✅ zord-relay-postgres: Ready"
docker exec zord-redis redis-cli ping && echo "✅ zord-redis: Ready"
docker exec zord-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list > /dev/null 2>&1 && echo "✅ zord-kafka: Ready"
```

## 🔍 **DETAILED TEST PHASES**

### **PHASE 1: Infrastructure Validation**

**Objective**: Verify Docker environment and container orchestration

**Tests Performed**:
- Docker Engine availability and version
- Docker Compose functionality
- Container status and health
- Resource availability (CPU, memory, disk)
- Network connectivity between containers

**Success Criteria**:
- All containers in "running" state
- Docker system resources available
- Container networking functional

**Manual Verification**:
```bash
# Check container status
docker-compose ps

# Verify resource usage
docker stats --no-stream

# Test container networking
docker exec -it zord-edge-service ping zord-vault-journal-service
```

### **PHASE 2: Database Layer Testing**

**Objective**: Validate all database connections and schema integrity

**Databases Tested**:
- **zord-edge-postgres** (Port 5433): Tenant and API key management
- **zord-vault-postgres** (Port 5434): Immutable envelope storage
- **zord-intent-postgres** (Port 5436): Intent processing and outbox
- **zord-relay-postgres** (Port 5435): Message relay and contracts
- **zord-vault-redis** (Port 6379): Message queues and caching
- **zord-intent-redis** (Port 6380): Intent processing queues
- **Kafka** (Port 9092): Event streaming

**Quick Database Health Check**:
```bash
# Verify all database containers are running
docker ps --filter "name=postgres" --filter "name=redis" --filter "name=kafka" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Test PostgreSQL connectivity
docker exec zord-edge-postgres pg_isready && echo "✅ zord-edge-postgres: Ready"
docker exec zord-vault-postgres pg_isready && echo "✅ zord-vault-postgres: Ready"
docker exec zord-intent-postgres pg_isready && echo "✅ zord-intent-postgres: Ready"
docker exec zord-relay-postgres pg_isready && echo "✅ zord-relay-postgres: Ready"

# Test Redis connectivity
docker exec zord-vault-redis redis-cli ping && echo "✅ zord-vault-redis: Ready"
docker exec zord-intent-redis redis-cli ping && echo "✅ zord-intent-redis: Ready"

# Test Kafka connectivity
docker exec zord-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list > /dev/null 2>&1 && echo "✅ zord-kafka: Ready"
```

**Detailed Database Testing**:

For comprehensive database testing including schema validation, data operations, and performance monitoring, refer to **[testdatabase.md](testdatabase.md)** which provides:

- **Step-by-step connection procedures** for each database
- **Schema validation commands** with expected table structures
- **Data operation testing** with real SQL queries and Redis commands
- **Performance monitoring** queries for each database type
- **Automated testing scripts** for complete validation
- **Troubleshooting procedures** for common database issues

**Database Connection Details**:
```bash
# PostgreSQL Connections
psql -h localhost -p 5433 -U edge_user -d zord_edge_db          # zord-edge
psql -h localhost -p 5434 -U vault_user -d zord_vault_journal_db # zord-vault
psql -h localhost -p 5436 -U intent_user -d zord_intent_engine_db # zord-intent
psql -h localhost -p 5435 -U relay_user -d zord_relay_db        # zord-relay

# Redis Connections
redis-cli -h localhost -p 6379  # zord-vault-redis
redis-cli -h localhost -p 6380  # zord-intent-redis

# Kafka Connection
docker exec -it zord-kafka bash  # Access Kafka container
```

**Tests Performed**:
```sql
-- PostgreSQL connectivity and schema validation
SELECT version();
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Redis functionality
PING
EXISTS Intent_Data
LLEN Intent_Processing

-- Kafka topic management
kafka-topics --bootstrap-server localhost:9092 --list
```

**Success Criteria**:
- All database connections successful
- Required tables/schemas present
- Message queues accessible
- Kafka topics available

### **PHASE 3: Service Health Validation**

**Objective**: Verify all microservices are operational and responsive

**Services Tested**:

| Service | Port | Health Endpoint | Expected Response |
|---------|------|-----------------|-------------------|
| zord-edge | 8080 | `/health` | `{"status":"healthy"}` |
| zord-vault-journal | 8081 | `/health` | `{"status":"healthy"}` |
| zord-intent-engine | 8083 | `/health` | `{"status":"healthy"}` |
| zord-relay | 8082 | `/health` | `{"status":"healthy"}` |
| zord-console | 3000 | `/api/health` | `{"status":"ok"}` |

**Additional Endpoints**:
- Metrics endpoints (`/metrics`) for Prometheus integration
- Service-specific status endpoints
- Version information endpoints

**Success Criteria**:
- All health endpoints return HTTP 200
- Service status reports "healthy" or "ok"
- Response times under 1 second
- Metrics endpoints accessible

### **PHASE 4: API Functionality Testing**

**Objective**: Validate core API functionality and business logic

#### **4.1 Tenant Registration**

**Test Case**: Create new tenant account
```bash
curl -X POST http://localhost:8080/v1/tenantReg \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_name": "test-deployment-tenant",
    "contact_email": "test@example.com"
  }'
```

**Expected Response**:
```json
{
  "tenant_id": "test-deployment-tenant",
  "API_KEY": "test_deployment_tenant.64_char_hex_secret",
  "status": "active",
  "created_at": "2024-01-01T12:00:00Z"
}
```

**Validation**:
- Tenant ID matches input (normalized)
- API key format: `{prefix}.{64_char_hex}`
- Database record created in `tenants` table

#### **4.2 Intent Ingestion**

**Test Case**: Submit payment intent
```bash
curl -X POST http://localhost:8080/v1/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {API_KEY}" \
  -d '{
    "tenant_id": "test-deployment-tenant",
    "intent_type": "PAYOUT",
    "amount": {
      "value": "100.00",
      "currency": "USD"
    },
    "recipient": {
      "name": "Test Recipient",
      "account": "1234567890",
      "bank_code": "TEST"
    },
    "metadata": {
      "reference": "TEST-DEPLOY-001",
      "description": "Deployment test transaction"
    }
  }'
```

**Expected Response**:
```json
{
  "trace_id": "uuid-v4-trace-id",
  "envelope_id": "uuid-v4-envelope-id",
  "status": "accepted",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Success Criteria**:
- HTTP 200 response
- Valid trace_id and envelope_id returned
- Request authenticated successfully
- JSON schema validation passed

### **PHASE 5: Message Queue Flow Testing**

**Objective**: Verify asynchronous message processing between services

#### **5.1 Redis Queue Flow**

**Message Flow Path**:
1. `zord-edge` → Redis `Intent_Data` queue (LPUSH)
2. `zord-vault-journal` → Redis consumer (BRPOP)
3. `zord-vault-journal` → Redis `Ingest:ACK` queue
4. `zord-edge` → Redis ACK consumer

**Validation Commands**:
```bash
# Check queue lengths
docker exec -it zord-redis redis-cli LLEN Intent_Data
docker exec -it zord-redis redis-cli LLEN Intent_Processing
docker exec -it zord-redis redis-cli LLEN Intent_Validated
docker exec -it zord-redis redis-cli LLEN "Ingest:ACK"

# Monitor queue activity
docker exec -it zord-redis redis-cli MONITOR
```

#### **5.2 Kafka Event Flow**

**Event Topics**:
- `z.intent.created.v1` - Intent creation events
- `z.intent.rejected.v1` - Intent rejection events
- `z.vault.envelope.stored.v1` - Storage confirmation
- `z.relay.publish_failed.v1` - Publishing failures

**Validation Commands**:
```bash
# List Kafka topics
docker exec -it zord-kafka kafka-topics --bootstrap-server localhost:9092 --list

# Monitor topic messages
docker exec -it zord-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic z.intent.created.v1 \
  --from-beginning
```

**Success Criteria**:
- Messages flow through Redis queues
- Kafka topics receive events
- No messages stuck in queues
- Event ordering maintained

### **PHASE 6: End-to-End Data Flow Validation**

**Objective**: Verify complete transaction processing pipeline

#### **6.1 Data Persistence Verification**

**Wait Time**: 15-30 seconds for complete processing

**Database Checks**:

```sql
-- zord-vault-journal: Check envelope storage
SELECT envelope_id, tenant_id, parse_status, created_at 
FROM ingress_envelopes 
WHERE tenant_id = 'test-deployment-tenant' 
ORDER BY created_at DESC LIMIT 5;

-- zord-intent-engine: Check intent processing
SELECT intent_id, tenant_id, intent_type, status, confidence_score, created_at 
FROM payment_intents 
WHERE tenant_id = 'test-deployment-tenant' 
ORDER BY created_at DESC LIMIT 5;

-- zord-intent-engine: Check outbox events
SELECT outbox_id, aggregate_id, event_type, status, attempts, created_at 
FROM outbox 
WHERE trace_id = '{trace_id}' 
ORDER BY created_at DESC;

-- zord-relay: Check contract generation
SELECT contract_id, tenant_id, intent_id, status, created_at 
FROM payout_contracts 
WHERE tenant_id = 'test-deployment-tenant' 
ORDER BY created_at DESC LIMIT 5;
```

#### **6.2 Error Handling Validation**

**Dead Letter Queue Check**:
```sql
-- Check for processing failures
SELECT dlq_id, tenant_id, stage, reason_code, error_detail, replayable, created_at 
FROM dlq_items 
WHERE tenant_id = 'test-deployment-tenant' 
ORDER BY created_at DESC;
```

**Success Criteria**:
- Envelope stored in vault with `parse_status = 'success'`
- Intent processed with `status = 'processed'`
- Outbox events generated with `status = 'published'`
- No entries in DLQ for successful transactions
- Contract generated (if applicable)

### **PHASE 7: Performance and Load Testing**

**Objective**: Validate system performance under load

#### **7.1 Load Test Configuration**

**Default Parameters**:
- **Request Count**: 10 concurrent requests
- **Timeout**: 5 seconds per request
- **Success Threshold**: 90% success rate
- **Performance Threshold**: <1000ms average response time

**Load Test Execution**:
```powershell
# Standard load test
.\test-complete-deployment.ps1 -Mode load -LoadTestCount 10

# High volume test
.\test-complete-deployment.ps1 -Mode load -LoadTestCount 100

# Stress test
.\test-complete-deployment.ps1 -Mode load -LoadTestCount 500
```

#### **7.2 Performance Metrics**

**Measured Metrics**:
- **Throughput**: Requests per second
- **Latency**: Average response time
- **Success Rate**: Percentage of successful requests
- **Error Rate**: Failed request percentage
- **Resource Usage**: CPU, memory, disk I/O

**Performance Targets**:
- **Throughput**: >50 requests/second
- **Latency**: <500ms average response time
- **Success Rate**: >95% under normal load
- **Error Rate**: <5% under stress conditions

#### **7.3 Scalability Testing**

**Horizontal Scaling Test**:
```bash
# Scale services up
docker-compose up -d --scale zord-edge=3 --scale zord-vault-journal=2

# Run load test
.\test-complete-deployment.ps1 -Mode load -LoadTestCount 200

# Scale back down
docker-compose up -d --scale zord-edge=1 --scale zord-vault-journal=1
```

### **PHASE 8: Observability and Monitoring Testing**

**Objective**: Validate monitoring, metrics, and alerting systems

#### **8.1 Observability Stack Validation**

**Components Tested**:
- **Prometheus** (Port 9090): Metrics collection
- **Grafana** (Port 3001): Dashboards and visualization
- **Jaeger** (Port 16686): Distributed tracing
- **OpenTelemetry Collector**: Trace aggregation

**Health Checks**:
```bash
# Prometheus API
curl http://localhost:9090/api/v1/status/config

# Grafana API
curl http://localhost:3001/api/health

# Jaeger API
curl http://localhost:16686/api/services
```

#### **8.2 Metrics Validation**

**Key Metrics to Verify**:
```promql
# HTTP request metrics
http_requests_total{service="zord-edge"}
http_request_duration_seconds{service="zord-edge"}

# Message processing metrics
messages_processed_total{service="zord-vault-journal"}
messages_failed_total{service="zord-intent-engine"}

# Database metrics
database_connections_active{service="zord-edge"}
database_query_duration_seconds{service="zord-vault-journal"}

# System metrics
process_resident_memory_bytes{service="zord-intent-engine"}
process_cpu_seconds_total{service="zord-relay"}
```

#### **8.3 Distributed Tracing Validation**

**Trace Verification**:
1. Submit test transaction with trace_id
2. Wait 30 seconds for trace propagation
3. Search Jaeger for trace_id
4. Verify trace spans across all services

**Expected Trace Flow**:
```
zord-edge → zord-vault-journal → zord-intent-engine → zord-relay
```

### **PHASE 9: Security and Configuration Testing**

**Objective**: Validate security controls and configuration

#### **9.1 Authentication Testing**

**Test Cases**:

```bash
# Test 1: No authorization header
curl -X POST http://localhost:8080/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: HTTP 401 Unauthorized

# Test 2: Invalid API key format
curl -X POST http://localhost:8080/v1/ingest \
  -H "Authorization: Bearer invalid-key" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: HTTP 401 Unauthorized

# Test 3: Valid API key, invalid JSON
curl -X POST http://localhost:8080/v1/ingest \
  -H "Authorization: Bearer {valid_api_key}" \
  -H "Content-Type: application/json" \
  -d 'invalid-json'
# Expected: HTTP 400 Bad Request
```

#### **9.2 Input Validation Testing**

**Schema Validation Tests**:
```bash
# Test: Missing required fields
curl -X POST http://localhost:8080/v1/ingest \
  -H "Authorization: Bearer {valid_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "test-tenant"
    // Missing intent_type, amount, recipient
  }'
# Expected: HTTP 400 with validation errors

# Test: Invalid data types
curl -X POST http://localhost:8080/v1/ingest \
  -H "Authorization: Bearer {valid_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "test-tenant",
    "intent_type": "PAYOUT",
    "amount": {
      "value": "invalid-number",
      "currency": "USD"
    }
  }'
# Expected: HTTP 400 with type validation error
```

#### **9.3 Environment Configuration Testing**

**Configuration Validation**:
```bash
# Check critical environment variables
docker exec -it zord-edge-service printenv | grep -E '^(DB_|REDIS_|VAULT_)'
docker exec -it zord-vault-journal-service printenv | grep -E '^(DB_|REDIS_|S3_)'
docker exec -it zord-intent-engine-service printenv | grep -E '^(DB_|REDIS_|PII_)'
docker exec -it zord-relay-service printenv | grep -E '^(DATABASE_URL|KAFKA_)'
```

**Security Configuration Checks**:
- Database passwords are not default values
- Encryption keys are properly configured
- SSL/TLS settings are appropriate for environment
- API rate limiting is configured

## 📈 **CONTINUOUS TESTING STRATEGIES**

### **Automated Testing Pipeline**

**Pre-deployment Testing**:
```bash
# Quick validation before deployment
.\test-complete-deployment.ps1 -Mode quick

# Full validation after deployment
.\test-complete-deployment.ps1 -Mode all
```

**Scheduled Health Checks**:
```bash
# Hourly health monitoring
.\test-complete-deployment.ps1 -Mode services

# Daily integration testing
.\test-complete-deployment.ps1 -Mode integration
```

### **Monitoring and Alerting**

**Key Metrics to Monitor**:
- Service health endpoint availability (>99%)
- API response times (<500ms p95)
- Database connection pool utilization (<80%)
- Message queue depth (<100 messages)
- Error rates (<1% for critical paths)

**Alert Conditions**:
- Any service health check fails
- API response time >2 seconds
- Database connections >90% utilized
- Message queue depth >1000
- Error rate >5% over 5 minutes

## 🔧 **TROUBLESHOOTING GUIDE**

### **Common Issues and Solutions**

#### **Service Health Check Failures**

**Symptoms**: Health endpoints return HTTP 500 or timeout
**Diagnosis**:
```bash
# Check service logs
docker-compose logs zord-edge
docker-compose logs zord-vault-journal

# Check container status
docker-compose ps

# Check resource usage
docker stats
```

**Solutions**:
- Restart failing service: `docker-compose restart zord-edge`
- Check database connectivity
- Verify environment variables
- Increase Docker memory allocation

#### **Database Connection Issues**

**Symptoms**: Database connectivity tests fail
**Diagnosis**:
```bash
# Test database containers
docker exec -it zord-edge-postgres pg_isready -U edge_user

# Check database logs
docker-compose logs postgres-edge
```

**Solutions**:
- Restart database containers
- Check port conflicts
- Verify database credentials
- Reset database volumes if corrupted

#### **Message Queue Processing Delays**

**Symptoms**: Messages accumulating in Redis queues
**Diagnosis**:
```bash
# Check queue lengths
docker exec -it zord-redis redis-cli LLEN Intent_Data

# Monitor queue activity
docker exec -it zord-redis redis-cli MONITOR
```

**Solutions**:
- Restart message consumers
- Check Redis memory usage
- Scale consumer services
- Clear stuck messages if necessary

#### **Performance Degradation**

**Symptoms**: High response times, low throughput
**Diagnosis**:
```bash
# Check system resources
docker stats

# Monitor database performance
docker exec -it zord-edge-postgres psql -U edge_user -d zord_edge_db -c "
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC LIMIT 10;"
```

**Solutions**:
- Scale services horizontally
- Optimize database queries
- Increase resource allocation
- Implement caching strategies

## 📊 **TEST REPORTING AND METRICS**

### **Test Execution Report Template**

```
ZORD PLATFORM - TEST EXECUTION REPORT
=====================================
Date: {timestamp}
Environment: {environment}
Test Mode: {mode}
Duration: {execution_time}

RESULTS SUMMARY:
- Total Tests: {total_tests}
- Passed: {passed_tests}
- Failed: {failed_tests}
- Success Rate: {success_rate}%

FAILED TESTS:
{list_of_failed_tests}

PERFORMANCE METRICS:
- Average Response Time: {avg_response_time}ms
- Throughput: {requests_per_second} req/s
- Error Rate: {error_rate}%

RECOMMENDATIONS:
{recommendations_based_on_results}
```

### **Key Performance Indicators (KPIs)**

**Availability Metrics**:
- Service uptime: >99.9%
- Health check success rate: >99%
- Database availability: >99.9%

**Performance Metrics**:
- API response time p95: <500ms
- API response time p99: <1000ms
- Throughput: >100 requests/second
- Message processing latency: <100ms

**Quality Metrics**:
- Test success rate: >95%
- Code coverage: >80%
- Security scan pass rate: 100%

## 🎯 **SUCCESS CRITERIA**

### **Deployment Readiness Checklist**

- [ ] All infrastructure tests pass (100%)
- [ ] All database connectivity tests pass (100%)
- [ ] All service health checks pass (100%)
- [ ] API functionality tests pass (>95%)
- [ ] Message queue processing works correctly
- [ ] End-to-end data flow validated
- [ ] Performance meets requirements
- [ ] Security controls validated
- [ ] Observability stack operational
- [ ] Error handling works correctly

### **Production Readiness Criteria**

- [ ] Load testing passes with >95% success rate
- [ ] Performance targets met under load
- [ ] Security testing passes all checks
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery procedures tested
- [ ] Documentation complete and accurate
- [ ] Team trained on operations procedures

## 🚀 **NEXT STEPS AFTER TESTING**

### **Post-Test Actions**

1. **Review Results**: Analyze test results and address any failures
2. **Performance Tuning**: Optimize based on performance test results
3. **Security Hardening**: Implement additional security measures
4. **Monitoring Setup**: Configure production monitoring and alerting
5. **Documentation**: Update operational procedures and runbooks
6. **Team Training**: Train operations team on system management

### **Ongoing Testing Strategy**

1. **Continuous Integration**: Integrate tests into CI/CD pipeline
2. **Scheduled Testing**: Run automated tests on regular schedule
3. **Chaos Engineering**: Implement failure injection testing
4. **User Acceptance Testing**: Conduct business user validation
5. **Performance Monitoring**: Continuous performance tracking
6. **Security Scanning**: Regular security vulnerability assessments

---

## 📞 **SUPPORT AND RESOURCES**

### **Quick Reference Commands**

```bash
# Complete deployment test
.\test-complete-deployment.ps1 -Mode all -Verbose -OpenBrowser

# Service health check
.\test-complete-deployment.ps1 -Mode services

# Performance testing
.\test-complete-deployment.ps1 -Mode load -LoadTestCount 50

# Database connectivity test
.\test-complete-deployment.ps1 -Mode databases

# View service logs
docker-compose logs -f zord-edge

# Check container status
docker-compose ps

# Monitor system resources
docker stats
```

### **Database Testing Commands**

```bash
# Quick database health check
docker exec zord-edge-postgres pg_isready
docker exec zord-vault-postgres pg_isready
docker exec zord-intent-postgres pg_isready
docker exec zord-relay-postgres pg_isready
docker exec zord-vault-redis redis-cli ping
docker exec zord-intent-redis redis-cli ping
docker exec zord-kafka kafka-topics --bootstrap-server localhost:9092 --list

# Run comprehensive database test
chmod +x complete-db-test.sh && ./complete-db-test.sh

# Connect to specific databases
docker exec -it zord-edge-postgres psql -U edge_user -d zord_edge_db
docker exec -it zord-vault-postgres psql -U vault_user -d zord_vault_journal_db
docker exec -it zord-intent-postgres psql -U intent_user -d zord_intent_engine_db
docker exec -it zord-relay-postgres psql -U relay_user -d zord_relay_db
docker exec -it zord-vault-redis redis-cli
docker exec -it zord-intent-redis redis-cli
```

### **Testing Documentation**

- **[test.md](test.md)** - Complete end-to-end testing procedures
- **[testdatabase.md](testdatabase.md)** - Comprehensive database testing guide
- **[DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md)** - Full deployment and validation guide

### **Useful URLs**

- **Zord Console**: http://localhost:3000
- **API Gateway**: http://localhost:8080
- **Grafana Dashboards**: http://localhost:3001 (admin/admin)
- **Prometheus Metrics**: http://localhost:9090
- **Jaeger Tracing**: http://localhost:16686

### **Emergency Procedures**

**Complete System Restart**:
```bash
docker-compose down
docker-compose up -d --build
.\test-complete-deployment.ps1 -Mode quick
```

**Database Reset** (⚠️ Data Loss):
```bash
docker-compose down
docker volume prune -f
docker-compose up -d --build
```

**Log Collection**:
```bash
docker-compose logs > zord-platform-logs.txt
```

---

**🎉 Your Zord platform is now comprehensively tested and ready for production use!**