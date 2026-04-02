# 🗄️ ZORD PLATFORM - DATABASE TESTING GUIDE

## 📋 **OVERVIEW**

This guide provides comprehensive step-by-step instructions for connecting to, testing, and validating all databases in the Zord platform deployment. Each database serves specific microservices and contains critical data for the platform's operation.

## 🎯 **DATABASE ARCHITECTURE**

| Database | Service | Port | Purpose | Container Name |
|----------|---------|------|---------|----------------|
| **zord-edge-postgres** | zord-edge | 5433 | Tenant & API key management | zord-edge-postgres |
| **zord-vault-postgres** | zord-vault-journal | 5434 | Immutable envelope storage | zord-vault-postgres |
| **zord-intent-postgres** | zord-intent-engine | 5436 | Intent processing & outbox | zord-intent-postgres |
| **zord-relay-postgres** | zord-relay | 5435 | Message relay & contracts | zord-relay-postgres |
| **Redis** | Message Queues | 6379 | Caching & queuing | zord-redis |
| **Kafka** | Event Streaming | 9092 | Event publishing | zord-kafka-1 |

## 🚀 **QUICK START - DATABASE CONNECTIVITY TEST**

### **Step 1: Verify All Containers Are Running**
```bash
# Check all database containers
docker ps --filter "name=postgres" --filter "name=redis" --filter "name=kafka" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**Expected Output:**
```
NAMES                   STATUS                PORTS
zord-edge-postgres      Up X days             0.0.0.0:5433->5432/tcp
zord-vault-postgres     Up X days             0.0.0.0:5434->5432/tcp
zord-intent-postgres    Up X days             0.0.0.0:5436->5432/tcp
zord-relay-postgres     Up X days             0.0.0.0:5435->5432/tcp
zord-vault-redis        Up X days             0.0.0.0:6379->6379/tcp
zord-intent-redis       Up X days (healthy)   0.0.0.0:6380->6379/tcp
zord-kafka              Up X days (healthy)   0.0.0.0:9092->9092/tcp
```

### **Step 2: Quick Health Check All Databases**
```bash
# PostgreSQL health checks
echo "Testing PostgreSQL databases..."
docker exec zord-edge-postgres pg_isready && echo "✅ zord-edge-postgres: Ready"
docker exec zord-vault-postgres pg_isready && echo "✅ zord-vault-postgres: Ready"
docker exec zord-intent-postgres pg_isready && echo "✅ zord-intent-postgres: Ready"
docker exec zord-relay-postgres pg_isready && echo "✅ zord-relay-postgres: Ready"

# Redis health checks
echo "Testing Redis instances..."
docker exec zord-vault-redis redis-cli ping && echo "✅ zord-vault-redis: Ready"
docker exec zord-intent-redis redis-cli ping && echo "✅ zord-intent-redis: Ready"

# Kafka health check
echo "Testing Kafka..."
docker exec zord-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list > /dev/null 2>&1 && echo "✅ zord-kafka: Ready"
```

## 📊 **DETAILED DATABASE TESTING**

---

## 🔵 **1. ZORD-EDGE DATABASE (PostgreSQL)**

### **Connection Details**
- **Host**: localhost
- **Port**: 5433
- **Database**: zord_edge_db
- **User**: zord_user
- **Password**: zord_password
- **Container**: zord-edge-postgres

### **Step 1: Connect to Database**
```bash
# Method 1: Connect via Docker container
docker exec -it zord-edge-postgres psql -U zord_user -d zord_edge_db

# Method 2: Connect from host (if psql installed)
psql -h localhost -p 5433 -U zord_user -d zord_edge_db
```

### **Step 2: Verify Database Schema**
```sql
-- List all tables
\dt

-- Expected tables:
-- tenants, api_keys, requests (if exists)

-- Check table structures
\d tenants
\d api_keys
```

### **Step 3: Test Data Operations**
```sql
-- Check database version
SELECT version();

-- Count total tenants
SELECT COUNT(*) as total_tenants FROM tenants;

-- View recent tenants (if any)
SELECT tenant_id, tenant_name, is_active, created_at 
FROM tenants 
ORDER BY created_at DESC 
LIMIT 5;

-- Check API keys
SELECT COUNT(*) as total_api_keys FROM api_keys;

-- View API key prefixes (without exposing secrets)
SELECT tenant_id, key_prefix, is_active, created_at 
FROM api_keys 
ORDER BY created_at DESC 
LIMIT 5;

-- Test database connectivity and performance
SELECT 
    current_database() as database_name,
    current_user as connected_user,
    inet_server_addr() as server_ip,
    inet_server_port() as server_port,
    now() as current_time;
```

### **Step 4: Create Test Data**
```sql
-- Insert test tenant
INSERT INTO tenants (tenant_id, tenant_name, contact_email, is_active, created_at) 
VALUES ('test-tenant-db', 'Test Database Tenant', 'test-db@example.com', true, NOW())
ON CONFLICT (tenant_id) DO NOTHING;

-- Verify insertion
SELECT * FROM tenants WHERE tenant_id = 'test-tenant-db';

-- Clean up test data
DELETE FROM tenants WHERE tenant_id = 'test-tenant-db';
```

### **Step 5: Exit Database**
```sql
-- Exit psql
\q
```

---

## 🟢 **2. ZORD-VAULT-JOURNAL DATABASE (PostgreSQL)**

### **Connection Details**
- **Host**: localhost
- **Port**: 5434
- **Database**: zord_vault_journal_db
- **User**: vault_user
- **Password**: vault_password
- **Container**: zord-vault-postgres

### **Step 1: Connect to Database**
```bash
# Connect via Docker container
docker exec -it zord-vault-postgres psql -U vault_user -d zord_vault_journal_db

# Connect from host
psql -h localhost -p 5434 -U vault_user -d zord_vault_journal_db
```

### **Step 2: Verify Database Schema**
```sql
-- List all tables
\dt

-- Expected tables:
-- ingress_envelopes

-- Check table structure
\d ingress_envelopes
```

### **Step 3: Test Data Operations**
```sql
-- Check database version
SELECT version();

-- Count total envelopes
SELECT COUNT(*) as total_envelopes FROM ingress_envelopes;

-- View recent envelopes
SELECT 
    envelope_id, 
    tenant_id, 
    source, 
    parse_status, 
    amount_value, 
    amount_currency, 
    created_at 
FROM ingress_envelopes 
ORDER BY created_at DESC 
LIMIT 10;

-- Check envelopes by tenant
SELECT 
    tenant_id, 
    COUNT(*) as envelope_count,
    MIN(created_at) as first_envelope,
    MAX(created_at) as latest_envelope
FROM ingress_envelopes 
GROUP BY tenant_id 
ORDER BY envelope_count DESC;

-- Check parse status distribution
SELECT 
    parse_status, 
    COUNT(*) as count 
FROM ingress_envelopes 
GROUP BY parse_status;

-- Check envelope sizes and storage
SELECT 
    AVG(LENGTH(object_ref)) as avg_object_ref_length,
    COUNT(CASE WHEN object_ref IS NOT NULL THEN 1 END) as envelopes_with_storage,
    COUNT(*) as total_envelopes
FROM ingress_envelopes;
```

### **Step 4: Test Envelope Storage**
```sql
-- Insert test envelope
INSERT INTO ingress_envelopes (
    trace_id, envelope_id, tenant_id, source, idempotency_key, 
    payload_hash, object_ref, parse_status, amount_value, amount_currency, created_at
) VALUES (
    gen_random_uuid()::text, 
    gen_random_uuid()::text, 
    'test-vault-tenant', 
    'api', 
    'test-key-' || extract(epoch from now()), 
    'test-hash-123', 
    's3://test-bucket/test-object', 
    'success', 
    100.00, 
    'USD', 
    NOW()
);

-- Verify insertion
SELECT * FROM ingress_envelopes WHERE tenant_id = 'test-vault-tenant';

-- Clean up test data
DELETE FROM ingress_envelopes WHERE tenant_id = 'test-vault-tenant';
```

### **Step 5: Exit Database**
```sql
\q
```

---

## 🟡 **3. ZORD-INTENT-ENGINE DATABASE (PostgreSQL)**

### **Connection Details**
- **Host**: localhost
- **Port**: 5436
- **Database**: zord_intent_engine_db
- **User**: intent_user
- **Password**: intent_password
- **Container**: zord-intent-postgres

### **Step 1: Connect to Database**
```bash
# Connect via Docker container
docker exec -it zord-intent-postgres psql -U intent_user -d zord_intent_engine_db

# Connect from host
psql -h localhost -p 5436 -U intent_user -d zord_intent_engine_db
```

### **Step 2: Verify Database Schema**
```sql
-- List all tables
\dt

-- Expected tables:
-- payment_intents, outbox, dlq_items, canonical_intents

-- Check table structures
\d payment_intents
\d outbox
\d dlq_items
```

### **Step 3: Test Intent Processing Data**
```sql
-- Check database version
SELECT version();

-- Count processed intents
SELECT COUNT(*) as total_intents FROM payment_intents;

-- View recent intents
SELECT 
    intent_id, 
    tenant_id, 
    intent_type, 
    status, 
    confidence_score, 
    amount, 
    currency, 
    created_at 
FROM payment_intents 
ORDER BY created_at DESC 
LIMIT 10;

-- Check intent status distribution
SELECT 
    status, 
    COUNT(*) as count 
FROM payment_intents 
GROUP BY status;

-- Check intent types
SELECT 
    intent_type, 
    COUNT(*) as count,
    AVG(confidence_score) as avg_confidence
FROM payment_intents 
GROUP BY intent_type;

-- Check outbox events
SELECT COUNT(*) as total_outbox_events FROM outbox;

-- View recent outbox events
SELECT 
    outbox_id, 
    aggregate_id, 
    event_type, 
    status, 
    attempts, 
    trace_id, 
    created_at 
FROM outbox 
ORDER BY created_at DESC 
LIMIT 10;

-- Check outbox status distribution
SELECT 
    status, 
    COUNT(*) as count 
FROM outbox 
GROUP BY status;

-- Check DLQ (Dead Letter Queue) items
SELECT COUNT(*) as total_dlq_items FROM dlq_items;

-- View DLQ items (if any)
SELECT 
    dlq_id, 
    tenant_id, 
    stage, 
    reason_code, 
    error_detail, 
    replayable, 
    created_at 
FROM dlq_items 
ORDER BY created_at DESC 
LIMIT 10;
```

### **Step 4: Test Intent Processing**
```sql
-- Insert test intent
INSERT INTO payment_intents (
    intent_id, envelope_id, tenant_id, intent_type, canonical_version,
    amount, currency, status, confidence_score, created_at
) VALUES (
    gen_random_uuid()::text,
    gen_random_uuid()::text,
    'test-intent-tenant',
    'PAYOUT',
    '1.0',
    150.00,
    'USD',
    'processed',
    0.95,
    NOW()
);

-- Verify insertion
SELECT * FROM payment_intents WHERE tenant_id = 'test-intent-tenant';

-- Clean up test data
DELETE FROM payment_intents WHERE tenant_id = 'test-intent-tenant';
```

### **Step 5: Exit Database**
```sql
\q
```

---

## 🟠 **4. ZORD-RELAY DATABASE (PostgreSQL)**

### **Connection Details**
- **Host**: localhost
- **Port**: 5435
- **Database**: zord_relay_db
- **User**: relay_user
- **Password**: relay_password
- **Container**: zord-relay-postgres

### **Step 1: Connect to Database**
```bash
# Connect via Docker container
docker exec -it zord-relay-postgres psql -U relay_user -d zord_relay_db

# Connect from host
psql -h localhost -p 5435 -U relay_user -d zord_relay_db
```

### **Step 2: Verify Database Schema**
```sql
-- List all tables
\dt

-- Expected tables:
-- outbox, payout_contracts

-- Check table structures
\d outbox
\d payout_contracts
```

### **Step 3: Test Relay Data**
```sql
-- Check database version
SELECT version();

-- Count outbox messages
SELECT COUNT(*) as total_outbox_messages FROM outbox;

-- View recent outbox messages
SELECT 
    id, 
    topic, 
    status, 
    attempts, 
    created_at, 
    updated_at 
FROM outbox 
ORDER BY created_at DESC 
LIMIT 10;

-- Check outbox status distribution
SELECT 
    status, 
    COUNT(*) as count 
FROM outbox 
GROUP BY status;

-- Check message topics
SELECT 
    topic, 
    COUNT(*) as count 
FROM outbox 
GROUP BY topic 
ORDER BY count DESC;

-- Count payout contracts
SELECT COUNT(*) as total_contracts FROM payout_contracts;

-- View recent contracts
SELECT 
    contract_id, 
    tenant_id, 
    intent_id, 
    status, 
    created_at 
FROM payout_contracts 
ORDER BY created_at DESC 
LIMIT 10;

-- Check contract status distribution
SELECT 
    status, 
    COUNT(*) as count 
FROM payout_contracts 
GROUP BY status;
```

### **Step 4: Test Message Relay**
```sql
-- Insert test outbox message
INSERT INTO outbox (
    topic, payload, status, attempts, created_at, updated_at
) VALUES (
    'test.topic.v1',
    '{"test": "message", "timestamp": "' || NOW() || '"}',
    'pending',
    0,
    NOW(),
    NOW()
);

-- Verify insertion
SELECT * FROM outbox WHERE topic = 'test.topic.v1';

-- Clean up test data
DELETE FROM outbox WHERE topic = 'test.topic.v1';
```

### **Step 5: Exit Database**
```sql
\q
```

---

## 🔴 **5. REDIS TESTING**

### **Redis Instance: zord-redis (Port 6379)**

### **Step 1: Connect to Redis**
```bash
# Connect via Docker container
docker exec -it zord-redis redis-cli

# Connect from host (if redis-cli installed)
redis-cli -h localhost -p 6379
```

### **Step 2: Test Basic Operations**
```redis
# Test connection
PING

# Check Redis info
INFO server

# Check memory usage
INFO memory

# List all keys (be careful in production)
KEYS *

# Check specific queues
LLEN Intent_Data
LLEN Intent_Processing
LLEN Intent_Validated
LLEN "Ingest:ACK"

# View queue contents (first 5 items, without removing)
LRANGE Intent_Data 0 4
LRANGE Intent_Processing 0 4

# Check Redis configuration
CONFIG GET maxmemory
CONFIG GET maxmemory-policy

# Test set/get operations
SET test:key "test-value"
GET test:key
DEL test:key

# Exit Redis CLI
EXIT
```

### **Redis Instance 2: zord-intent-redis (Port 6380)**

### **Step 1: Connect to Redis**
```bash
# Connect via Docker container
docker exec -it zord-intent-redis redis-cli

# Connect from host
redis-cli -h localhost -p 6380
```

### **Step 2: Test Intent Processing Queues**
```redis
# Test connection
PING

# Check intent processing queues
KEYS *intent*
KEYS *processing*

# Check queue lengths
LLEN intent_queue
LLEN processing_queue

# Monitor Redis commands (in separate terminal)
MONITOR

# Exit
EXIT
```

---

## 📨 **6. KAFKA TESTING**

### **Connection Details**
- **Host**: localhost
- **Port**: 9092
- **Container**: zord-kafka-1

### **Step 1: Connect to Kafka**
```bash
# Connect via Docker container
docker exec -it zord-kafka-1 bash
```

### **Step 2: Test Kafka Operations**
```bash
# List all topics
kafka-topics --bootstrap-server localhost:9092 --list

# Describe topics
kafka-topics --bootstrap-server localhost:9092 --describe

# Create test topic
kafka-topics --bootstrap-server localhost:9092 --create --topic test-db-topic --partitions 1 --replication-factor 1

# List topics again to verify creation
kafka-topics --bootstrap-server localhost:9092 --list

# Produce test message
echo "Test message from database testing" | kafka-console-producer --bootstrap-server localhost:9092 --topic test-db-topic

# Consume messages (in separate terminal)
kafka-console-consumer --bootstrap-server localhost:9092 --topic test-db-topic --from-beginning

# Check consumer groups
kafka-consumer-groups --bootstrap-server localhost:9092 --list

# Delete test topic
kafka-topics --bootstrap-server localhost:9092 --delete --topic test-db-topic

# Exit container
exit
```

### **Step 3: Test Zord-specific Topics**
```bash
# Check for Zord topics
docker exec zord-kafka-1 kafka-topics --bootstrap-server localhost:9092 --list | grep "^z\."

# Expected topics:
# z.intent.canonical.v1
# z.intent.dlq.v1
# z.intent.ingress.v1
# z.intent.ready.v1

# Describe Zord topics
docker exec zord-kafka-1 kafka-topics --bootstrap-server localhost:9092 --describe --topic z.intent.ready.v1

# Monitor Zord topic messages
docker exec zord-kafka-1 kafka-console-consumer --bootstrap-server localhost:9092 --topic z.intent.ready.v1 --from-beginning --timeout-ms 5000
```

---

## 🔍 **COMPREHENSIVE DATABASE HEALTH CHECK SCRIPT**

### **Create and Run Complete Test Script**

```bash
# Create comprehensive test script
cat > complete-db-test.sh << 'EOF'
#!/bin/bash

echo "🗄️ ZORD PLATFORM - COMPREHENSIVE DATABASE TESTING"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0

test_result() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ $2${NC}"
    fi
}

echo -e "\n${BLUE}🔍 Phase 1: Container Status Check${NC}"
docker ps --filter "name=postgres" --filter "name=redis" --filter "name=kafka" --format "table {{.Names}}\t{{.Status}}" | grep -E "(postgres|redis|kafka)"

echo -e "\n${BLUE}🔍 Phase 2: PostgreSQL Connectivity Tests${NC}"

# Test PostgreSQL databases
docker exec zord-edge-postgres pg_isready > /dev/null 2>&1
test_result $? "zord-edge-postgres connectivity"

docker exec zord-vault-postgres pg_isready > /dev/null 2>&1
test_result $? "zord-vault-postgres connectivity"

docker exec zord-intent-postgres pg_isready > /dev/null 2>&1
test_result $? "zord-intent-postgres connectivity"

docker exec zord-relay-postgres pg_isready > /dev/null 2>&1
test_result $? "zord-relay-postgres connectivity"

echo -e "\n${BLUE}🔍 Phase 3: PostgreSQL Schema Validation${NC}"

# Check table counts
EDGE_TABLES=$(docker exec zord-edge-postgres psql -U edge_user -d zord_edge_db -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
test_result $([ "$EDGE_TABLES" -gt 0 ] && echo 0 || echo 1) "zord-edge schema ($EDGE_TABLES tables)"

VAULT_TABLES=$(docker exec zord-vault-postgres psql -U vault_user -d zord_vault_journal_db -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
test_result $([ "$VAULT_TABLES" -gt 0 ] && echo 0 || echo 1) "zord-vault schema ($VAULT_TABLES tables)"

INTENT_TABLES=$(docker exec zord-intent-postgres psql -U intent_user -d zord_intent_engine_db -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
test_result $([ "$INTENT_TABLES" -gt 0 ] && echo 0 || echo 1) "zord-intent schema ($INTENT_TABLES tables)"

RELAY_TABLES=$(docker exec zord-relay-postgres psql -U relay_user -d zord_relay_db -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
test_result $([ "$RELAY_TABLES" -gt 0 ] && echo 0 || echo 1) "zord-relay schema ($RELAY_TABLES tables)"

echo -e "\n${BLUE}🔍 Phase 4: Redis Connectivity Tests${NC}"

# Test Redis instances
docker exec zord-vault-redis redis-cli ping > /dev/null 2>&1
test_result $? "zord-vault-redis connectivity"

docker exec zord-intent-redis redis-cli ping > /dev/null 2>&1
test_result $? "zord-intent-redis connectivity"

echo -e "\n${BLUE}🔍 Phase 5: Kafka Connectivity Tests${NC}"

# Test Kafka
docker exec zord-kafka kafka-topics --bootstrap-server localhost:9092 --list > /dev/null 2>&1
test_result $? "zord-kafka connectivity"

# Count Kafka topics
KAFKA_TOPICS=$(docker exec zord-kafka kafka-topics --bootstrap-server localhost:9092 --list 2>/dev/null | wc -l)
test_result $([ "$KAFKA_TOPICS" -gt 0 ] && echo 0 || echo 1) "kafka topics available ($KAFKA_TOPICS topics)"

echo -e "\n${BLUE}🔍 Phase 6: Data Validation Tests${NC}"

# Check for data in key tables
TENANT_COUNT=$(docker exec zord-edge-postgres psql -U edge_user -d zord_edge_db -t -c "SELECT count(*) FROM tenants;" 2>/dev/null | tr -d ' ')
echo -e "${YELLOW}ℹ️ Tenants in system: $TENANT_COUNT${NC}"

ENVELOPE_COUNT=$(docker exec zord-vault-postgres psql -U vault_user -d zord_vault_journal_db -t -c "SELECT count(*) FROM ingress_envelopes;" 2>/dev/null | tr -d ' ')
echo -e "${YELLOW}ℹ️ Envelopes stored: $ENVELOPE_COUNT${NC}"

INTENT_COUNT=$(docker exec zord-intent-postgres psql -U intent_user -d zord_intent_engine_db -t -c "SELECT count(*) FROM payment_intents;" 2>/dev/null | tr -d ' ')
echo -e "${YELLOW}ℹ️ Intents processed: $INTENT_COUNT${NC}"

echo -e "\n${BLUE}📊 TEST SUMMARY${NC}"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $((TOTAL_TESTS - PASSED_TESTS))"

SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
if [ $SUCCESS_RATE -ge 90 ]; then
    echo -e "${GREEN}🎉 Database testing: SUCCESS ($SUCCESS_RATE%)${NC}"
elif [ $SUCCESS_RATE -ge 70 ]; then
    echo -e "${YELLOW}⚠️ Database testing: PARTIAL SUCCESS ($SUCCESS_RATE%)${NC}"
else
    echo -e "${RED}❌ Database testing: ISSUES DETECTED ($SUCCESS_RATE%)${NC}"
fi

echo -e "\n${BLUE}🌐 Database Access Information:${NC}"
echo "PostgreSQL Databases:"
echo "  • zord-edge: localhost:5433 (edge_user/edge_password)"
echo "  • zord-vault: localhost:5434 (vault_user/vault_password)"
echo "  • zord-intent: localhost:5436 (intent_user/intent_password)"
echo "  • zord-relay: localhost:5435 (relay_user/relay_password)"
echo "Redis Instances:"
echo "  • zord-vault-redis: localhost:6379"
echo "  • zord-intent-redis: localhost:6380"
echo "Kafka:"
echo "  • zord-kafka: localhost:9092"
EOF

# Make script executable and run
chmod +x complete-db-test.sh
./complete-db-test.sh
```

---

## 🛠️ **TROUBLESHOOTING GUIDE**

### **Common Issues and Solutions**

#### **1. Connection Refused Errors**
```bash
# Check if containers are running
docker ps | grep -E "(postgres|redis|kafka)"

# Restart specific database
docker restart zord-edge-postgres

# Check container logs
docker logs zord-edge-postgres
```

#### **2. Authentication Failures**
```bash
# Verify environment variables
docker exec zord-edge-postgres env | grep POSTGRES

# Reset password (if needed)
docker exec zord-edge-postgres psql -U postgres -c "ALTER USER edge_user PASSWORD 'edge_password';"
```

#### **3. Schema Missing**
```bash
# Check if database initialization completed
docker logs zord-edge-postgres | grep "database system is ready"

# Manually run schema creation (if needed)
docker exec zord-edge-postgres psql -U edge_user -d zord_edge_db -c "\dt"
```

#### **4. Redis Connection Issues**
```bash
# Check Redis configuration
docker exec zord-vault-redis redis-cli CONFIG GET "*"

# Check Redis logs
docker logs zord-vault-redis
```

#### **5. Kafka Topic Issues**
```bash
# Recreate topics if missing
docker exec zord-kafka kafka-topics --bootstrap-server localhost:9092 --create --topic z.intent.created.v1 --partitions 1 --replication-factor 1

# Check Kafka logs
docker logs zord-kafka
```

---

## 📈 **PERFORMANCE MONITORING**

### **Database Performance Queries**

#### **PostgreSQL Performance**
```sql
-- Check active connections
SELECT count(*) as active_connections 
FROM pg_stat_activity 
WHERE state = 'active';

-- Check slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 10;

-- Check database size
SELECT 
    datname as database_name,
    pg_size_pretty(pg_database_size(datname)) as size
FROM pg_database 
WHERE datname IN ('zord_edge_db', 'zord_vault_journal_db', 'zord_intent_engine_db', 'zord_relay_db');
```

#### **Redis Performance**
```redis
# Check memory usage
INFO memory

# Check connected clients
INFO clients

# Check command statistics
INFO commandstats

# Check keyspace statistics
INFO keyspace
```

#### **Kafka Performance**
```bash
# Check consumer lag
docker exec zord-kafka kafka-consumer-groups --bootstrap-server localhost:9092 --describe --all-groups

# Check topic details
docker exec zord-kafka kafka-topics --bootstrap-server localhost:9092 --describe
```

---

## 🎯 **SUCCESS CRITERIA**

Your database testing is successful when:

- ✅ All PostgreSQL instances respond to `pg_isready`
- ✅ All databases contain expected tables/schemas
- ✅ Redis instances respond to `PING` with `PONG`
- ✅ Kafka can list topics without errors
- ✅ All containers show "healthy" or "running" status
- ✅ No connection errors in application logs
- ✅ Data can be inserted and retrieved successfully

---

## 📞 **SUPPORT COMMANDS**

### **Quick Reference**
```bash
# Stop all databases
docker stop zord-edge-postgres zord-vault-postgres zord-intent-postgres zord-relay-postgres zord-vault-redis zord-intent-redis zord-kafka

# Start all databases
docker start zord-edge-postgres zord-vault-postgres zord-intent-postgres zord-relay-postgres zord-vault-redis zord-intent-redis zord-kafka

# View all database logs
docker logs zord-edge-postgres
docker logs zord-vault-postgres
docker logs zord-intent-postgres
docker logs zord-relay-postgres
docker logs zord-vault-redis
docker logs zord-intent-redis
docker logs zord-kafka

# Database backup commands
docker exec zord-edge-postgres pg_dump -U edge_user zord_edge_db > zord_edge_backup.sql
docker exec zord-vault-postgres pg_dump -U vault_user zord_vault_journal_db > zord_vault_backup.sql
```

---

**🎉 Your Zord platform databases are now fully tested and validated!**