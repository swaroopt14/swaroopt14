# Arealis Zord - Comprehensive Project Analysis

## 📋 Project Overview

**Arealis Zord** is an **Ingestion Platform** designed to handle financial transaction intents with a focus on evidence tracking, multi-tenant support, and role-based access control. It consists of three main components:

1. **Frontend** - Next.js 14 React application with three role-based consoles
2. **Backend (Zord Edge)** - Go-based REST API for intent ingestion and authentication
3. **Backend (Zord Vault Journal)** - Go-based service for encrypted storage and audit trails

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js 14)                       │
│  ┌──────────────────┬──────────────┬──────────────────────────┐ │
│  │ Customer Console │ Ops Console  │  Admin Console           │ │
│  │ /console/...     │ /ops/...     │  /admin/...              │ │
│  └──────────────────┴──────────────┴──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
           │                          │
           │ HTTP REST Calls         │
           ▼                          ▼
┌──────────────────────┐    ┌─────────────────────────┐
│   ZORD EDGE (Go)     │    │ ZORD VAULT JOURNAL (Go) │
│   - Intent API       │    │ - Encrypted Storage     │
│   - Authentication   │    │ - Audit Trail           │
│   - Validation       │    │ - Evidence Management   │
│   PORT: 8080         │    │ PORT: 8081              │
└──────────────────────┘    └─────────────────────────┘
           │                          │
           └──────────────┬───────────┘
                          │
                          ▼
                    ┌────────────────┐
                    │  PostgreSQL    │
                    │  Database      │
                    └────────────────┘
```

---

## 📁 Folder Structure & Functioning

### **FRONTEND** - `/frontend`

#### **Purpose**: Multi-tenant ingestion console with role-based access

#### **Key Folders**:

##### **1. `/app` - Next.js Pages & Routes**
- **`layout.tsx`** - Root layout wrapper with global setup
- **`globals.css`** - Global styles applied across the app
- **`page.tsx`** - Home page (entry point)
- **`/console`** - Customer console routes
  - `/login` - Customer login/signup
  - `/ingestion` - Ingestion management
  - `/ingestion/batch/[id]` - Batch detail view
  - `/ingestion/receipt/[id]` - Receipt detail view
- **`/ops`** - Operations team console
  - `/login` - Ops login
  - `/ingestion` - Ingestion monitoring
- **`/admin`** - Admin console
  - `/login` - Admin login
  - `/tenants` - Tenant management

##### **2. `/components` - React Components (Feature-Based)**

**Auth Components** (`/auth/`)
- `LoginForm.tsx` - Login form UI
- `SignUpForm.tsx` - User registration form
- `DarkLoginLayout.tsx` - Dark-themed login layout
- `RoleSwitcher.tsx` - Switch between customer/ops/admin roles

**Ingestion Components** (`/ingestion/`)
- `ReceiptTimeline.tsx` - Display receipt processing timeline
- `StatusBadge.tsx` - Visual status indicator component
- `EvidenceTree.tsx` - Tree view of evidence files
- `EvidenceFileViewer.tsx` - View evidence file content
- `BatchSummaryCard.tsx` - Summary card for batch ingestion
- `ErrorExplanationBox.tsx` - Display error details

**AWS Components** (`/aws/`)
- AWS integration components (S3, CloudFront, etc.)

##### **3. `/hooks` - Custom React Hooks**

**`useAuth.ts`** - Authentication state management
```typescript
Returns: {
  user, role, isLoading, isAuthenticated, checkAuth()
}
```

**`usePolling.ts`** - Polling for receipt status updates
```typescript
- Automatically polls API for status changes
- Stops when terminal state reached
- Configurable interval (default: 3 seconds)
```

##### **4. `/services` - Business Logic & API Calls**

**`/api` - API Service Layer**
- `receiptService.ts` - Receipt-related API calls
  - Get receipt by ID
  - Get all receipts
  - Create receipt

**`/auth` - Authentication Service**
- `authService.ts` - Auth operations
  - `getCurrentUser()` - Get current logged-in user
  - `isAuthenticated()` - Check auth status
  - `getCurrentRole()` - Get user's role

##### **5. `/types` - TypeScript Definitions**

**`auth.ts`**
```typescript
- UserRole: 'CUSTOMER_USER' | 'CUSTOMER_ADMIN' | 'OPS' | 'ADMIN'
- User interface
```

**`receipt.ts`**
```typescript
- ReceiptStatus: 'RECEIVED' | 'RAW_STORED' | 'VALIDATING' | 'CANONICALIZED' | 'FAILED'
- Receipt interface with ID, source, status, evidence flag
- ReceiptTimelineEvent: status + timestamp + message
```

**`batch.ts`**
```typescript
- Batch interface: batchId, tenant, totalRecords, canonicalized, failed, processing
- FailedRow: rowNumber, error, errorType
```

**`evidence.ts`**
```typescript
- EvidenceNode: tree structure for evidence files
- EvidenceFile: individual file with content and metadata
- EvidenceTree: root structure containing all evidence
```

**`intent.ts`**
```typescript
- IntentStatus: 'RECEIVED' | 'REJECTED_PREACC' | 'QUEUED_ACC' | 'CANONICALIZED'
- Intent: id, source, amount, currency, instrument, status, timestamps
- IntentDetail: full lifecycle with canonical form and evidence references
```

##### **6. `/utils` - Utility Functions**

**`/errors/errorHandler.ts`** - Centralized error handling
**`/validation/formValidation.ts`** - Form validation logic
**`/formatting/dateFormatting.ts`** - Date formatting utilities
**`permissions.ts`** - Role-based permission checks
**`polling.ts`** - Polling utility function

##### **7. `/constants` - Application Constants**

- `APP_NAME`, `APP_VERSION`, `API_BASE_URL`
- `POLLING_INTERVAL`: 3 seconds
- `ROUTES`: All app routes mapped
- `STORAGE_KEYS`: LocalStorage keys for auth, theme, role
- `RECEIPT_STATUS_CONFIG`: Status → color mapping
- `TERMINAL_STATES`: States where polling stops

##### **8. `/config` - Configuration Files**

**`api.config.ts`**
```typescript
- baseURL: '/api/v1'
- timeout: 30 seconds
- retries: 3
- endpoints: receipts, batches, evidence paths
```

##### **9. `/public` - Static Assets**

- `/images` - Logo and image files
- `/login` - Login page carousel images

##### **10. `/documents` - Documentation**

- `ARCHITECTURE.md` - Project architecture
- `PROJECT_STRUCTURE.md` - Folder structure guide
- `CONTRIBUTING.md` - Development guidelines
- `DEBUGGING.md` - Debugging tips
- `ZORD_DESIGN_SYSTEM.md` - UI/UX design system
- `CONFIG_ORGANIZATION.md` - Configuration management

---

### **BACKEND - ZORD EDGE** - `/backend/zord-edge`

#### **Purpose**: REST API for receiving financial intents, managing tenants, authenticating requests

#### **Key Folders**:

##### **1. `/cmd/main.go` - Entry Point**
```go
- Initializes Gin HTTP server
- Calls config.InitDB() to connect PostgreSQL
- Calls db.CreateTable() to create tenants table
- Calls routes.Routes() to set up API routes
- Starts server on port 8080
```

##### **2. `/config/config.go` - Configuration Management**
```go
- LoadConfig() function reads environment variables
- Sets up PostgreSQL DSN (Data Source Name)
- Env vars: DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME, DB_SSLMODE
- Validates database connection with db.Ping()
- Panic on connection failure
```

##### **3. `/db/db.go` - Database Schema**
```go
- Exports global DB *sql.DB connection
- CreateTable() creates "tenants" PostgreSQL table
  ┌─────────────────────────────────────────┐
  │ TABLE: tenants                          │
  ├─────────────────────────────────────────┤
  │ tenant_id: UUID PRIMARY KEY             │
  │ tenant_name: TEXT UNIQUE                │
  │ key_prefix: TEXT UNIQUE                 │
  │ key_hash: TEXT (bcrypt hashed)          │
  │ is_active: BOOLEAN (default: true)      │
  │ created_at: TIMESTAMPTZ (auto)          │
  └─────────────────────────────────────────┘
```

##### **4. `/routes/intent_route.go` - API Route Registration**

**Public Routes**:
- `POST /v1/tenantReg` - Register new tenant (no auth required)
  - Handler: `handler.Tenant_Registry`

**Protected Routes** (all require auth + validation + trace):
- `POST /v1/ingest` - Submit financial intent
  - Middleware: 
    1. `middleware.Authenticate()` - Validate API key
    2. `middleware.ValidateIntentRequest()` - Validate request schema
    3. `middleware.TraceMiddleware()` - Generate trace ID
  - Handler: `handler.IntentHandler`

##### **5. `/handler` - HTTP Request Handlers**

**`intent_handler.go`**
```go
- IntentHandler(context *gin.Context) - Processes /v1/ingest requests
- Extracts trace_id and tenant_id from context
- Returns HTTP 202 Accepted with:
  { trace_id, Response: "Accepted", TenantId }
```

**`status_handler.go`**
```go
- HealthCheck(c *gin.Context) - GET /health endpoint
- Returns: { status: "healthy", service: "zord-edge", version: "1.0.0" }
```

**`TenantReg_handler.go`**
```go
- Tenant_Registry(context *gin.Context) - POST /v1/tenantReg
- Receives: { name: "MerchantName" }
- Calls services.TenantReg() to register tenant
- Returns HTTP 201 Created with:
  { Message, TenantId, APIKEY }
```

##### **6. `/middleware` - Request Processing Middleware**

**`auth.go` - Authentication Middleware**
```go
- Authenticate() gin.HandlerFunc
- Extracts "Bearer {apikey}" from Authorization header
- Calls services.ValidateApiKey() to validate
- Stores tenant_id in context for downstream handlers
- Returns 401 Unauthorized if validation fails
```

**`validation.go` - Request Validation Middleware**
```go
- ValidateIntentRequest() gin.HandlerFunc
- Reads entire request body as JSON
- Validates JSON format
- Calls validator.ValidateIntentRequestJSON() for schema validation
- Returns 400 Bad Request with detailed error if validation fails
- Restores request body for handler to use
```

**`trace.go` - Trace ID Generation Middleware**
```go
- TraceMiddleware() gin.HandlerFunc
- Generates UUID for trace_id
- Stores trace_id in context for logging/auditing
```

**`tenant.go`** - Empty (placeholder for tenant isolation)

**`rate_limit.go`** - Empty (placeholder for rate limiting)

##### **7. `/services/auth_service.go` - Business Logic**

**`TenantReg(ctx, db, merchantName)`**
```go
- Generates API key: "{prefix}.{secret}"
  - prefix: merchant name (lowercase, spaces → underscore)
  - secret: 32 random bytes encoded as hex
- Hashes secret with bcrypt
- Inserts into tenants table
- Returns: tenantID, fullApiKey, error
```

**`GenerateApiKey(prefix)`**
```go
- Creates full API key format
- Returns: fullApiKey, prefix, secret
```

**`splitAPIKey(raw)`**
```go
- Parses "prefix.secret" format
- Returns: prefix, secret
```

**`ValidateApiKey(ctx, db, rawapikey)`**
```go
- Splits API key
- Queries DB for tenant with matching prefix
- Compares provided secret with bcrypt hash
- Returns: tenant_id if valid
- Returns: error if invalid
```

##### **8. `/security/auth_hash.go` - Cryptography**

**`HashApiKey(key string)`**
```go
- Uses bcrypt with default cost (10)
- Returns: hashed key string
```

**`CompareApiKey(hash, rawkey)`**
```go
- Validates raw key against bcrypt hash
- Returns: error if mismatch
```

##### **9. `/validator/schema_validator.go` - JSON Schema Validation**

**`InitSchemaValidator()`**
```go
- Loads JSON schema from:
  /schemas/incoming_intent.request.v1.json
- Uses gojsonschema library
- Initializes global intentSchema variable
```

**`ValidateIntentRequest(data)`**
```go
- Validates JSON data against schema
- Returns: validation result with errors
```

**`FormatValidationErrors(result)`**
```go
- Converts validation errors to string array
```

**`ValidateIntentRequestJSON(data)`**
```go
- High-level validation function
- Returns: formatted error if invalid
```

##### **10. `/schemas/incoming_intent.request.v1.json` - Request Schema**

**Required Fields**:
- `intent_type`: PAYOUT | COLLECTION | REFUND | FX
- `account_number`: string
- `amount`: { value, currency (3-char code) }
- `beneficiary`: { instrument: { kind: BANK|UPI|CARD|WALLET|OTHER }, optional: name_token_ref, address_token_ref, country }
- `idempotency_key`: string (1-128 chars)
- `purpose_code`: string

**Optional Fields**:
- `schema_version`: string
- `remitter`: object
- `constraints`: object
- `metadata`: object

##### **11. `/dto/intent_request.go` - Data Transfer Object**

```go
IncomingIntentRequestV1 struct {
  SchemaVersion: string
  IntentType: string (required)
  Amount: Amount struct { Value, Currency }
  Beneficiary: Beneficiary struct { Type, Instrument, NameTokenRef, AddressTokenRef, Country }
  Remitter: map[string]interface{}
  PurposeCode: string (required)
  Constraints: map[string]interface{}
  Metadata: map[string]interface{}
  IdempotencyKey: string (required)
}
```

##### **12. `/model/api_key.go` - Database Models**

```go
MerchantRequest struct {
  Name: string (required)
}

Tenant struct {
  TenantID: UUID
  TenantName: string
  KeyPrefix: string
  KeyHash: string
  IsActive: bool
  CreatedAt: timestamp
}
```

##### **13. `/error/api_error.go` - Error Response Format**

```go
APIError struct {
  Code: string
  Message: string
  Hint: string (optional)
  TraceID: string
}
```

---

### **BACKEND - ZORD VAULT JOURNAL** - `/backend/zord-vault-journal`

#### **Purpose**: Encrypted storage and audit trail management for evidence

#### **Key Folders**:

##### **1. `/cmd/main.go` - Entry Point (WIP)**
```go
- TODO: Initialize database connection
- TODO: Initialize encryption services
- TODO: Set up API routes
- Currently: Prints startup message
- Port: 8081 (commented out)
```

##### **2. `/config/config.go` - Configuration**
```go
- LoadConfig() loads environment variables
- Config struct contains:
  - DatabaseURL: PostgreSQL connection string
  - EncryptionKey: For data encryption (production: use strong key)
  - StoragePath: /data/vault
  - Port: 8081
  - Environment: development/production
```

##### **3. `/crypto/encrypt.go`** - Encryption (placeholder)

##### **4. `/handler/ingest.go`** - Ingest handler (empty)

##### **5. `/service/ingest_service.go`** - Ingest service (placeholder)

##### **6. `/storage/object_store.go`** - Object storage (placeholder)

##### **7. `/model/ingress_envelope.go`** - Data model (empty)

##### **8. `/db/migration.sql`** - Database migrations (empty - needs implementation)

---

## 🔄 Data Flow & Request Lifecycle

### **Tenant Registration Flow**

```
1. POST /v1/tenantReg
   ├─ Request: { name: "MerchantName" }
   └─ Response: HTTP 201 Created
     {
       "Message": "Merchant Registered",
       "TenantId": "uuid",
       "APIKEY": "merchant_name.{hex_secret}"
     }

2. Handler Flow:
   ├─ Bind JSON to MerchantRequest
   ├─ Call services.TenantReg()
   │   ├─ Generate API key (prefix.secret)
   │   ├─ Hash secret with bcrypt
   │   ├─ INSERT into tenants table
   │   └─ Return tenantId + fullApiKey
   └─ Return to client
```

### **Intent Submission Flow**

```
1. POST /v1/ingest
   ├─ Headers: Authorization: Bearer {tenant_apikey}
   ├─ Body: Financial intent JSON
   └─ Response: HTTP 202 Accepted

2. Middleware Chain:
   ├─ Authenticate()
   │   ├─ Extract API key from header
   │   ├─ Query DB for tenant by prefix
   │   ├─ Validate secret against bcrypt hash
   │   └─ Store tenant_id in context
   │
   ├─ ValidateIntentRequest()
   │   ├─ Read request body
   │   ├─ Validate JSON format
   │   ├─ Validate against JSON schema
   │   └─ Restore body for handler
   │
   └─ TraceMiddleware()
       └─ Generate UUID trace_id

3. IntentHandler
   ├─ Extract trace_id and tenant_id from context
   └─ Return: { trace_id, Response: "Accepted", TenantId }

4. (Future) Zord Vault Journal
   ├─ Receive intent from Zord Edge
   ├─ Encrypt and store in vault
   ├─ Create evidence trail
   └─ Return receipt/confirmation
```

---

## 🔐 Security Features

### **Authentication**
- **API Key Format**: `{prefix}.{secret}`
  - Prefix: Tenant identifier
  - Secret: 32 random bytes (256-bit entropy)
- **Hashing**: bcrypt with default cost (10 rounds)
- **Validation**: On every protected endpoint

### **Request Validation**
- JSON schema validation using gojsonschema
- Mandatory fields enforcement
- Type checking and format validation
- Beneficiary instrument validation

### **Multi-Tenancy**
- Each tenant has unique API key
- Tenant ID extracted from API key
- Requests isolated by tenant

### **Tracing**
- UUID trace ID for every request
- Enables audit trail and debugging
- Passed through entire request lifecycle

---

## 📊 Frontend UI/UX Features

### **Three Role-Based Consoles**

#### **Customer Console** (`/console`)
- View ingestion history
- Upload batches
- Track receipt status
- View evidence trail
- Real-time polling (every 3 seconds)

#### **Operations Console** (`/ops`)
- Monitor ingestion pipeline
- View dead-letter queue (DLQ)
- Track processing metrics

#### **Admin Console** (`/admin`)
- Manage tenants
- Configure system settings
- View audit logs

### **Key UI Components**
- **ReceiptTimeline**: Visual status progression
- **EvidenceTree**: File tree navigation
- **StatusBadge**: Color-coded status indicator
- **ErrorExplanationBox**: Detailed error info
- **BatchSummaryCard**: Batch overview card

### **Auto-Polling**
- Polls every 3 seconds for status updates
- Stops at terminal states (CANONICALIZED, FAILED)
- Updates UI in real-time without page refresh

---

## 🛠️ Technology Stack

### **Frontend**
- **Framework**: Next.js 14 (React 18)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Next.js built-in
- **Package Manager**: npm

### **Backend - Zord Edge**
- **Language**: Go 1.24.1
- **HTTP Framework**: Gin
- **Database**: PostgreSQL
- **Libraries**:
  - `gojsonschema`: JSON schema validation
  - `bcrypt`: API key hashing
  - `uuid`: ID generation
  - `godotenv`: Environment variable loading

### **Backend - Zord Vault Journal**
- **Language**: Go 1.24.1
- **HTTP Framework**: Gin
- **Status**: Early stage (mostly TODOs)

### **Database**
- **Type**: PostgreSQL
- **Tables**: tenants (schema defined), others TBD
- **Features**: UUID support, timestamps, JSON support

---

## 📈 Project Status

### **✅ Completed**
- Frontend: All three consoles with UI components
- Zord Edge: Tenant registration, API key generation, authentication, intent validation
- Database: Tenants table schema
- Documentation: Architecture and structure guides

### **🚧 In Development**
- Zord Vault Journal: Encryption, storage, evidence management
- Intent processing pipeline
- Evidence tree implementation
- Receipt status updates

### **⏳ TODO**
- Implement vault encryption services
- Complete intent processing logic
- Add rate limiting
- Add comprehensive logging
- Add monitoring/observability
- Complete database migrations
- Add caching layer
- Performance optimization
- Load testing

---

## 🔄 Deployment

### **Docker Support**
- Frontend: `Dockerfile` + `docker-compose.yml`
- Zord Edge: `DockerFile` + `docker-compose.yml`
- Zord Vault Journal: `DockerFile` + `docker-compose.yml`

### **Development Setup**
```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend (requires Go 1.24.1)
cd backend/zord-edge && go run cmd/main.go
```

---

## 📝 Summary

**Arealis Zord** is a comprehensive financial intent ingestion platform with:
1. **Multi-tenant support** via secure API keys
2. **Real-time UI** with auto-polling for status updates
3. **Role-based access control** (Customer, Ops, Admin)
4. **Schema validation** for intent data
5. **Evidence tracking** for regulatory compliance
6. **Microservice architecture** (Edge API + Vault storage)

The platform is designed for financial transaction processing with emphasis on security, auditability, and multi-tenant isolation.
