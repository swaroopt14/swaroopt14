# 🎯 ZORD OBSERVABILITY COMPLETE GUIDE

## 🚀 QUICK START - GET OBSERVABILITY RUNNING

### Prerequisites
- **Docker Desktop** installed and **RUNNING** ⚠️
- Ensure ports 3001, 9090, and 16686 are available
- Windows: Ensure Docker Desktop has access to your project directory

### Step 1: Start Observability Stack
```bash
cd backend/observability
docker compose up -d
```

### Step 2: Verify Services Are Running
```bash
docker compose ps
```
**Expected:** All services show "running" status

### Step 3: Access Observability Tools
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686

### Step 4: Run Comprehensive Tests
```powershell
# Run the comprehensive testing script
.\zord-comprehensive-tester.ps1

# Or with specific options
.\zord-comprehensive-tester.ps1 -Mode all -OpenBrowser -Detailed
```

---

## 📊 OBSERVABILITY COMPONENTS

### 🔍 Jaeger - Distributed Tracing
- **Purpose**: Track requests across microservices
- **Port**: 16686
- **Access**: http://localhost:16686
- **What it shows**: Request flow, performance bottlenecks, service dependencies

### 📈 Prometheus - Metrics Collection
- **Purpose**: Collect and store metrics from all services
- **Port**: 9090
- **Access**: http://localhost:9090
- **What it shows**: Service health, performance metrics, custom business metrics

### 📊 Grafana - Dashboards & Visualization
- **Purpose**: Create dashboards and visualize metrics
- **Port**: 3001
- **Access**: http://localhost:3001
- **Default Credentials**: admin/admin
- **What it shows**: Real-time dashboards, alerts, data visualization

### 📡 OpenTelemetry Collector
- **Purpose**: Collect, process, and export telemetry data
- **Ports**: 4317 (gRPC), 4318 (HTTP), 8888 (metrics)
- **What it does**: Aggregates traces and metrics from all services

---

## 🧪 TESTING YOUR OBSERVABILITY STACK

### Using the PowerShell Testing Script

The `zord-comprehensive-tester.ps1` script provides comprehensive testing capabilities:

#### Basic Usage
```powershell
# Test everything (recommended first run)
.\zord-comprehensive-tester.ps1

# Get help and see all options
.\zord-comprehensive-tester.ps1 -Help
```

#### Test Modes
```powershell
# Test only observability stack (Prometheus, Grafana, Jaeger)
.\zord-comprehensive-tester.ps1 -Mode observability

# Test only microservice health endpoints
.\zord-comprehensive-tester.ps1 -Mode services

# Generate traffic for trace creation
.\zord-comprehensive-tester.ps1 -Mode traffic -TrafficCount 100

# Focus on tracing functionality
.\zord-comprehensive-tester.ps1 -Mode traces
```

#### Advanced Options
```powershell
# Test specific service only
.\zord-comprehensive-tester.ps1 -Service edge

# Open observability UIs automatically
.\zord-comprehensive-tester.ps1 -OpenBrowser

# Run detailed analysis with metrics breakdown
.\zord-comprehensive-tester.ps1 -Detailed

# Comprehensive test with all features
.\zord-comprehensive-tester.ps1 -Mode all -OpenBrowser -Detailed -TrafficCount 100
```

### Manual Testing Steps

#### 1. Test Prometheus
```bash
# Check Prometheus health
curl http://localhost:9090/-/healthy

# Test basic query
curl "http://localhost:9090/api/v1/query?query=up"
```

#### 2. Test Grafana
- Open http://localhost:3001
- Login with admin/admin
- Navigate to Dashboards > Browse
- Open "Zord Platform - Comprehensive Monitoring"

#### 3. Test Jaeger
- Open http://localhost:16686
- Check if services appear in dropdown
- Generate traffic to create traces

---

## 📈 PROMETHEUS QUERIES GUIDE

### Essential Queries to Try

#### Service Health Status
```promql
up
```
Shows which services are up (1) or down (0)

#### Services Currently Running
```promql
up == 1
```
Only shows services that are currently running

#### HTTP Request Rate
```promql
rate(http_requests_total[5m])
```
Shows HTTP requests per second over last 5 minutes

#### Memory Usage by Service
```promql
process_resident_memory_bytes
```
Shows memory usage for each service

#### CPU Usage Rate
```promql
rate(process_cpu_seconds_total[5m])
```
Shows CPU usage rate

#### OpenTelemetry Collector Metrics
```promql
otelcol_receiver_accepted_spans_total
```
Shows spans received by OTEL collector

#### Service Uptime
```promql
time() - process_start_time_seconds
```
Shows how long each service has been running

### How to Use Queries
1. Open http://localhost:9090
2. Click "Graph" tab
3. Enter any query above in the expression box
4. Click "Execute"
5. View results in table or graph format

---

## 🔍 JAEGER TRACING GUIDE

### Accessing Jaeger
- **URL**: http://localhost:16686
- **Expected Services**: jaeger-all-in-one, zord-edge, zord-vault-journal (when configured)

### Exploring Traces
1. **Select Service**: Choose from dropdown (e.g., "zord-edge")
2. **Find Traces**: Click "Find Traces" button
3. **View Details**: Click on any trace to see detailed spans
4. **Analyze Performance**: Check request durations and timing

### What You'll See in Traces
- **Trace Timeline**: Visual representation of request flow
- **Span Details**: Individual operation details
- **Tags and Logs**: Metadata and debugging information
- **Duration Analysis**: Performance timing data
- **Service Dependencies**: How services interact

### Generating Traces
Use the PowerShell script to generate test traffic:
```powershell
.\zord-comprehensive-tester.ps1 -Mode traces -TrafficCount 100
```

---

## 📊 GRAFANA DASHBOARDS GUIDE

### Accessing Grafana
- **URL**: http://localhost:3001
- **Username**: admin
- **Password**: admin

### Available Dashboards
1. **Zord Platform - Comprehensive Monitoring**
   - Service Health Overview
   - HTTP Request Rates
   - System Performance Metrics

2. **Zord Services Monitoring**
   - HTTP Requests per Service
   - Request Duration Analysis
   - Message Processing Stats

### Exploring Dashboards
1. Login to Grafana
2. Click "Dashboards" in left menu
3. Click "Browse"
4. Select "Zord Platform - Comprehensive Monitoring"
5. Explore panels showing:
   - Service uptime status (green = up, red = down)
   - HTTP request rates and response times
   - Error rates and success percentages
   - Resource utilization (CPU, memory)

### Creating Custom Dashboards
1. Click "+" in left menu
2. Select "Dashboard"
3. Add panels with Prometheus queries
4. Configure visualizations
5. Save dashboard

---

## 🏗️ MICROSERVICE INTEGRATION

### Zord Services Configuration

The observability stack monitors these Zord microservices:

| Service | Port | Health Endpoint | Purpose |
|---------|------|----------------|---------|
| **zord-edge** | 8080 | `/health` | API Gateway & Request Ingestion |
| **zord-vault-journal** | 8081 | `/health` | Secure Data Storage |
| **zord-relay** | 8082 | `/health` | Message Relay & Processing |
| **zord-intent-engine** | 8083 | `/health` | Intent Processing & Validation |
| **zord-console** | 3000 | `/api/health` | Web Console & Dashboard |

### Adding New Services to Monitoring

#### 1. Add to Prometheus Configuration
Edit `prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'your-new-service'
    static_configs:
      - targets: ['your-service:port']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

#### 2. Restart Prometheus
```bash
docker compose restart prometheus
```

#### 3. Verify in Prometheus
- Go to Status > Targets
- Check your service appears and is UP

---

## 🔧 ADVANCED CONFIGURATION

### Docker Compose Profiles

#### Core Stack (Default)
```bash
docker compose up -d
```
Includes: Prometheus, Grafana, Jaeger, OpenTelemetry Collector

#### Full Stack
```bash
docker compose --profile full up -d
```
Includes: Core + Logging + Infrastructure monitoring

#### Logging Only
```bash
docker compose --profile logging up -d
```
Adds: Loki, Promtail for centralized logging

#### Infrastructure Only
```bash
docker compose --profile infrastructure up -d
```
Adds: Node Exporter, Redis Exporter, PostgreSQL Exporter

### Environment Variables

Key environment variables you can customize:

```bash
# OpenTelemetry Collector
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Jaeger
JAEGER_AGENT_HOST=localhost
JAEGER_AGENT_PORT=6831

# Prometheus
PROMETHEUS_RETENTION_TIME=15d
```

---

## 🚨 TROUBLESHOOTING

### Common Issues and Solutions

#### Services Won't Start
```bash
# Check Docker Desktop is running
docker ps

# Check logs for specific service
docker compose logs prometheus
docker compose logs grafana
docker compose logs jaeger

# Check port conflicts
netstat -an | findstr :9090
netstat -an | findstr :3001
netstat -an | findstr :16686
```

#### Metrics Not Appearing
1. **Check Prometheus Targets**: Go to Status > Targets in Prometheus UI
2. **Verify Service Endpoints**: Ensure services expose `/metrics` endpoint
3. **Check Network Connectivity**: Verify services can reach each other
4. **Review Configuration**: Check `prometheus.yml` scrape configs

#### Traces Not Visible
1. **Check OTEL Collector**: Ensure it's running and accessible
2. **Verify Service Configuration**: Check OpenTelemetry setup in services
3. **Generate Traffic**: Use the PowerShell script to create traces
4. **Check Jaeger Logs**: Look for errors in Jaeger container logs

#### Grafana Dashboards Empty
1. **Verify Data Source**: Check Prometheus connection in Grafana
2. **Check Time Range**: Ensure time range includes recent data
3. **Test Queries**: Verify Prometheus queries work directly
4. **Generate Metrics**: Ensure services are producing metrics

### Health Check Commands
```bash
# Check all services status
docker compose ps

# Test Prometheus
curl http://localhost:9090/-/healthy

# Test Grafana
curl http://localhost:3001/api/health

# Test Jaeger
curl http://localhost:16686/api/services

# Test OTEL Collector
curl http://localhost:8888/metrics
```

---

## 📋 TESTING CHECKLIST

### ✅ Phase 1: Basic Setup
- [ ] Docker Desktop running
- [ ] Observability stack started (`docker compose up -d`)
- [ ] All containers showing "running" status
- [ ] Can access Grafana (http://localhost:3001)
- [ ] Can access Prometheus (http://localhost:9090)
- [ ] Can access Jaeger (http://localhost:16686)

### ✅ Phase 2: Functionality Testing
- [ ] Run comprehensive test script: `.\zord-comprehensive-tester.ps1`
- [ ] Prometheus shows "up" metrics
- [ ] Grafana dashboards load with data
- [ ] Can execute Prometheus queries
- [ ] Jaeger UI accessible

### ✅ Phase 3: Integration Testing
- [ ] Start Zord microservices
- [ ] Services appear in Prometheus targets
- [ ] Generate test traffic
- [ ] Metrics collected from services
- [ ] Traces visible in Jaeger (if configured)

### ✅ Phase 4: Advanced Features
- [ ] Custom Grafana dashboards created
- [ ] Prometheus alerts configured (optional)
- [ ] Log aggregation working (if using logging profile)
- [ ] Infrastructure monitoring active (if using infrastructure profile)

---

## 🎯 SUCCESS CRITERIA

After completing this guide, you should have:

### ✅ **Monitoring Capabilities**
- All Zord services visible in Prometheus
- Real-time metrics collection working
- Service health monitoring active
- Custom business metrics tracked

### ✅ **Visualization & Dashboards**
- Grafana dashboards showing live data
- Service performance metrics visible
- Error rates and success percentages tracked
- Custom visualizations created

### ✅ **Distributed Tracing**
- Request traces visible in Jaeger
- End-to-end request flow tracked
- Performance bottlenecks identified
- Service dependencies mapped

### ✅ **Operational Readiness**
- Automated testing script working
- Health checks passing
- Troubleshooting procedures tested
- Documentation accessible and clear

---

## 🚀 NEXT STEPS FOR PRODUCTION

1. **Enhanced Tracing**: Add OpenTelemetry instrumentation to all microservices
2. **Custom Dashboards**: Create business-specific monitoring dashboards
3. **Alerting Rules**: Set up Prometheus alerts for critical metrics
4. **Log Aggregation**: Enable Loki for centralized logging
5. **Performance Baselines**: Establish SLA monitoring and alerting
6. **Security**: Change default passwords and implement proper authentication
7. **Backup Strategy**: Set up data retention and backup procedures

---

## 📞 SUPPORT & RESOURCES

### Quick Access URLs
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686
- **Zord Console**: http://localhost:3000

### Testing Script
```powershell
# Run comprehensive tests
.\zord-comprehensive-tester.ps1 -Help

# Quick test everything
.\zord-comprehensive-tester.ps1 -Mode all -OpenBrowser
```

### Configuration Files
- **Prometheus**: `prometheus.yml`
- **Grafana Dashboards**: `grafana/dashboards/`
- **OTEL Collector**: `otel/otel-collector-config.yml`
- **Docker Compose**: `docker-compose.yml`

**🎉 Your observability stack is now production-ready for comprehensive monitoring, alerting, and performance analysis!**
