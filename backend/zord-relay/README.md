# Zord Relay Microservice

A high-performance message relay service for the Zord platform, built with Go, Kafka, and PostgreSQL. This service implements the outbox pattern for reliable message publishing and provides HTTP APIs for message ingestion.

## Overview

The Zord Relay service acts as a message broker between different components of the Zord platform. It uses Apache Kafka with KRaft consensus protocol for high-throughput message streaming and implements the transactional outbox pattern with PostgreSQL for guaranteed message delivery.

### KRaft Mode

This setup uses Kafka's KRaft (Kafka Raft) consensus protocol, which eliminates the need for Apache ZooKeeper for metadata management. KRaft provides:

- **Simplified Architecture**: No separate coordination service needed
- **Better Performance**: Reduced operational overhead
- **Easier Scaling**: Simplified cluster management
- **Modern Approach**: Recommended for new Kafka deployments

## Features

- **Apache Kafka Integration**: High-throughput message streaming with KRaft consensus protocol
- **Transactional Outbox Pattern**: Guaranteed message delivery with database transactions
- **HTTP API**: RESTful endpoints for message publishing and topic management
- **PostgreSQL Storage**: Reliable persistence for outbox messages
- **OpenTelemetry Tracing**: Distributed request tracking and observability
- **Health Monitoring**: Built-in health checks and service monitoring
- **Docker Ready**: Complete containerized setup with KRaft-based Kafka

## Technology Stack

- **Language**: Go 1.24.1
- **Message Broker**: Apache Kafka 7.4.0 (KRaft mode)
- **Database**: PostgreSQL 16
- **Web Framework**: Gin Gonic
- **Tracing**: OpenTelemetry integration
- **Deployment**: Docker & Docker Compose

#  Complete Architecture Flow
```bash
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   HTTP Client   │────│  Gin HTTP Server │────│ OutboxPublisher │
│                 │    │   (Port 8082)    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PostgreSQL    │────│ Background Worker │────│   Apache Kafka  │
│   Outbox Table  │    │  (Polling Loop)  │    │  (KRaft Mode)   │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```



### Prerequisites
1. **Install Docker and Docker Compose**
   ```bash
   # Verify installation
   docker --version
   docker-compose --version
   ```

2. **Install Go (for local development)**
   ```bash
   # Download from https://golang.org/dl/
   go version  # Should be 1.24.1 or later
   ```

### Step 1: Clone and Navigate to Project
```bash
cd /path/to/your/projects
git clone <repository-url>
cd backend/zord-relay
```

### Step 2: Environment Setup
```bash
# Copy environment template (if available)
cp .env.example .env

# Edit environment variables as needed
nano .env  # or your preferred editor
```

### Step 3: Build and Start Services
```bash
# Option 1: Build and run in foreground (recommended for first time)
docker-compose up --build

# Option 2: Build and run in background
docker-compose up -d --build

# Option 3: Build only
docker-compose build
```

### Step 4: Verify Services are Running
```bash
# Check all services status
docker-compose ps

# Expected output should show:
# - zord-kafka: Up (healthy)
# - zord-relay-postgres: Up
# - zord-relay-service: Up (healthy)
```

### Step 5: Check Service Logs
```bash
# View all service logs
docker-compose logs

# View specific service logs
docker-compose logs kafka
docker-compose logs zord-relay
docker-compose logs postgres

# Follow logs in real-time
docker-compose logs -f zord-relay
```

### Step 6: Test Health Endpoint
```bash
# Test health check
curl http://localhost:8082/health

# Expected response:
# {"service":"zord-relay","status":"healthy","time":"2026-01-22TXX:XX:XX.XXXZ"}
```

### Step 7: Test Message Publishing
```bash
# Publish a test message
curl -X POST http://localhost:8082/api/v1/publish/test-topic \
  -H "Content-Type: application/json" \
  -d '{
    "key": "test-key-123",
    "value": {
      "message": "Hello from Zord Relay!",
      "timestamp": "2026-01-22T12:00:00Z"
    }
  }'

# Expected response:
# {"message_id":"uuid-string","topic":"test-topic","status":"queued","message":"Message queued for publishing"}
```

### Step 8: Verify Message in Kafka
```bash
# Consume messages from Kafka
docker-compose exec kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic test-topic \
  --from-beginning

# You should see your published message
```

### Step 9: Check Database
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U relay_user -d zord_relay_db

# Check outbox table
SELECT * FROM outbox ORDER BY created_at DESC LIMIT 5;

# Check message status (should be 'processed' after publishing)
SELECT id, topic, status, created_at, processed_at FROM outbox;
```

### Step 10: List Available Topics
```bash
# Get list of Kafka topics
curl http://localhost:8082/api/v1/topics

# Expected response:
# {"topics":["test-topic"],"count":1}
```

### Step 11: Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: This deletes all data)
docker-compose down -v
```

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Go 1.24.1 (for local development)

### Docker Deployment

#### Start All Services
```bash
# Build and start with Docker Compose
docker-compose up --build

# Run in background
docker-compose up -d --build

# View logs
docker-compose logs -f zord-relay

# Stop services
docker-compose down
```

#### Service URLs
- **Zord Relay API**: `http://localhost:8082`
- **Kafka Broker**: `localhost:9092`
- **PostgreSQL**: `localhost:5435`

### Local Development

#### Setup
```bash
# Install dependencies
go mod download

# Set up environment variables
cp .env.example .env

# Run the application
go run ./cmd/main.go
```

## API Endpoints

### Health Check
```http
GET /health
```
Returns service health status.

### Publish Message
```http
POST /api/v1/publish/{topic}
Content-Type: application/json

{
  "key": "message-key",
  "value": {
    "data": "your message data",
    "timestamp": "2024-01-20T12:00:00Z"
  }
}
```

**Response:**
```json
{
  "message_id": "uuid-generated-id",
  "topic": "your-topic",
  "status": "queued",
  "message": "Message queued for publishing"
}
```

### List Topics
```http
GET /api/v1/topics
```

**Response:**
```json
{
  "topics": ["topic1", "topic2", "topic3"],
  "count": 3
}
```

## Configuration

Environment variables:

### Kafka Configuration
```env
KAFKA_BROKERS=kafka:9092
KAFKA_CONSUMER_GROUP=zord-relay-group
```

### HTTP Server
```env
HTTP_PORT=8082
```

### Database
```env
DATABASE_URL=postgres://relay_user:relay_password@postgres:5432/zord_relay_db?sslmode=disable
```

### Outbox Pattern
```env
OUTBOX_POLL_INTERVAL=5s
OUTBOX_BATCH_SIZE=10
```

### Service
```env
ENVIRONMENT=production
SERVICE_NAME=zord-relay
```

## Architecture

### Outbox Pattern Implementation

The service implements the transactional outbox pattern for reliable message publishing:

1. **Message Ingestion**: Messages are first stored in the `outbox` table within a database transaction
2. **Background Processing**: A background worker polls the outbox table for pending messages
3. **Kafka Publishing**: Messages are published to Kafka topics
4. **Status Updates**: Message status is updated to `processed` after successful publishing

### Database Schema

```sql
CREATE TABLE outbox (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic      TEXT NOT NULL,
    key        TEXT,
    value      TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_status ON outbox(status);
CREATE INDEX idx_outbox_created_at ON outbox(created_at);
```

## Development

### Project Structure

```
/cmd              # Application entry point
/config           # Configuration management
/kafka            # Kafka producer and consumer
/services         # Business logic (outbox publisher)
/docker-compose.yml # Multi-service orchestration
/Dockerfile       # Container build configuration
/go.mod          # Go module dependencies
```

### Building

#### Local Build
```bash
go build -o zord-relay ./cmd/main.go
```

#### Docker Build
```bash
docker-compose build --no-cache
```

### Testing

#### Unit Tests
```bash
go test ./...
```

#### Integration Tests
```bash
# Start services (KRaft mode - no ZooKeeper needed)
docker-compose up -d kafka postgres

# Run integration tests
go test -tags=integration ./...
```

### Code Quality
```bash
# Format code
go fmt ./...

# Lint code
golangci-lint run

# Run tests with coverage
go test -cover ./...
```

## Docker Configuration

### Services Overview

#### Zord Relay (Port 8082)
- Main application service
- HTTP API endpoints
- Outbox message processing
- Health checks

#### Apache Kafka with KRaft (Port 9092)
- Message broker using KRaft consensus protocol (no ZooKeeper needed)
- Self-managed metadata and coordination
- Auto topic creation enabled
- Single node setup for development

#### PostgreSQL (Port 5435)
- Outbox table storage
- Transactional message persistence
- Data persistence with volumes

### Networking

All services communicate through the `zord-network` bridge network:
- **Internal Communication**: Services use container names (e.g., `kafka:9092`)
- **External Access**: Mapped ports for development and testing
- **Isolation**: Services are isolated from external networks

### Volumes

Persistent data storage:
- `kafka_data`: Kafka broker message logs and data
- `kafka_metadata`: KRaft controller metadata and quorum logs
- `postgres_relay_data`: Outbox messages and database files

## Monitoring and Observability

### Health Checks
- **HTTP Endpoint**: `/health` returns service status
- **Database Connectivity**: Automatic database connection verification
- **Kafka Connectivity**: Producer/consumer health monitoring

### Logging
- Structured logging with service context
- Message publishing events
- Error tracking and debugging information

### Metrics
- Message throughput monitoring
- Outbox processing statistics
- Database connection pool metrics

## Troubleshooting

### Common Issues and Solutions

#### 1. Kafka CLUSTER_ID Error
**Error:** `CLUSTER_ID is required.`
**Solution:** Add `CLUSTER_ID=abcdefghijklmnopqrstuv` to Kafka environment variables in `docker-compose.yml`

#### 2. Kafka Permission Denied
**Error:** `Permission denied` when writing to `/tmp/kraft-broker-logs/`
**Solution:** Add `user: root` to Kafka service in `docker-compose.yml`

#### 3. Go Module Dependencies Missing
**Error:** `missing go.sum entry for module providing package`
**Solution:** 
```bash
# In Dockerfile, ensure this order:
COPY go.mod ./
COPY . .
RUN go mod tidy && go mod download && go mod verify
```

#### 4. Service Health Check Failing
**Error:** Service shows as `unhealthy`
**Solution:** Ensure both GET and HEAD routes are defined for `/health` endpoint

#### 5. Kafka Connection Refused
**Error:** `dial tcp 172.x.x.x:9092: connect: connection refused`
**Solution:** Wait for Kafka to fully initialize (may take 30-60 seconds)

#### 6. PostgreSQL Connection Issues
**Error:** Cannot connect to database
**Solution:** 
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Verify database exists
docker-compose exec postgres psql -U relay_user -d zord_relay_db -c "\l"
```

#### 7. Port Already in Use
**Error:** `Port already in use`
**Solution:** Change ports in `docker-compose.yml`:
- Kafka: Change `9092:9092` to `9093:9092`
- PostgreSQL: Change `5435:5432` to `5436:5432`
- Zord Relay: Change `8082:8082` to `8083:8082`

### Debug Commands

```bash
# Check all container logs
docker-compose logs

# Check specific service
docker-compose logs kafka
docker-compose logs zord-relay
docker-compose logs postgres

# Enter container shell
docker-compose exec kafka bash
docker-compose exec zord-relay sh
docker-compose exec postgres bash

# Restart specific service
docker-compose restart zord-relay

# Rebuild specific service
docker-compose up -d --build zord-relay

# Clean restart (removes volumes)
docker-compose down -v
docker-compose up -d --build
```

## Troubleshooting

### Common Issues

#### Kafka Connection Errors
```bash
# Check Kafka logs
docker-compose logs kafka

# Verify Kafka is healthy
docker-compose ps kafka

# Test Kafka connectivity
docker-compose exec kafka kafka-console-producer --bootstrap-server localhost:9092 --topic test

# Check KRaft controller status
docker-compose exec kafka kafka-metadata-quorum --bootstrap-server localhost:9092 describe --status
```

#### Database Connection Issues
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Verify database connectivity
docker-compose exec postgres psql -U relay_user -d zord_relay_db

# Reset database
docker-compose down -v postgres
docker-compose up -d postgres
```

#### Message Publishing Failures
```bash
# Check outbox table status
docker-compose exec postgres psql -U relay_user -d zord_relay_db -c "SELECT * FROM outbox LIMIT 10;"

# View application logs
docker-compose logs zord-relay
```

### Performance Tuning

#### Kafka Configuration
- Adjust `OUTBOX_BATCH_SIZE` for higher throughput
- Modify `OUTBOX_POLL_INTERVAL` for different latency requirements
- Scale Kafka brokers for production workloads

#### Database Optimization
- Add database indexes for high-volume topics
- Configure connection pooling
- Monitor query performance

## Production Deployment

### Security Considerations
1. **Network Security**: Use internal networks only, no external Kafka ports
2. **Authentication**: Enable Kafka SASL authentication
3. **Encryption**: Configure TLS for all communications
4. **Database Security**: Use strong passwords, enable SSL
5. **Access Control**: Implement proper authorization

### Scaling Considerations
1. **Kafka Cluster**: Add multiple brokers for high availability
2. **Database**: Use read replicas for query scaling
3. **Application**: Deploy multiple instances with load balancing
4. **Monitoring**: Implement comprehensive observability

### Backup and Recovery
1. **Database Backups**: Regular PostgreSQL backups
2. **Kafka Data**: Configure data retention policies
3. **Application Logs**: Centralized logging with retention
4. **Disaster Recovery**: Multi-region deployment strategy

## Integration Examples

### Publishing a Message
```bash
curl -X POST http://localhost:8082/api/v1/publish/user-events \
  -H "Content-Type: application/json" \
  -d '{
    "key": "user-123",
    "value": {
      "event": "user_login",
      "user_id": "123",
      "timestamp": "2024-01-20T12:00:00Z"
    }
  }'
```

### Consuming Messages (External Consumer)
```bash
# Using Kafka console consumer
docker-compose exec kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic user-events \
  --from-beginning
```

## Contributing

1. Follow Go coding standards
2. Add tests for new features
3. Update documentation
4. Ensure Docker compatibility

## Observability & Monitoring

### OpenTelemetry Integration
- **Distributed Tracing**: End-to-end request tracking
- **Jaeger Export**: Traces visible at http://localhost:16686
- **Span Creation**: Detailed operation tracking for message processing
- **Context Propagation**: Trace context across Kafka operations

### Metrics Collection
- **Prometheus Metrics**: Available at `/metrics` endpoint
- **Kafka Metrics**: Producer/consumer performance metrics
- **Database Metrics**: Outbox processing statistics
- **Health Checks**: Service and dependency monitoring

### Key Metrics to Monitor
- `kafka_messages_published_total`: Total messages published to Kafka
- `outbox_messages_processed_total`: Outbox pattern processing metrics
- `database_connections_active`: Active PostgreSQL connections
- `http_requests_total`: HTTP API request metrics
- `message_processing_duration_seconds`: Message processing latency

### Health Monitoring
```bash
# Check service health
curl http://localhost:8082/health

# View Prometheus metrics
curl http://localhost:8082/metrics

# Check traces in Jaeger
# Open http://localhost:16686 and select 'zord-relay' service

# Monitor Kafka topics
curl http://localhost:8082/api/v1/topics
```

## License

This project is part of the Zord platform. See main project license for details.

## Support

For issues or questions, refer to the project documentation or contact the development team.
