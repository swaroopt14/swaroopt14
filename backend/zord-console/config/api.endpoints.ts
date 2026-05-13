// Backend API Endpoints Configuration
// All backend service URLs centralized in one place

export const BACKEND_SERVICES = {
  // zord-edge: API Gateway (Port 8080)
  EDGE: {
    BASE_URL: process.env.ZORD_EDGE_URL || 'http://localhost:8080',
    ENDPOINTS: {
      HEALTH: '/v1/health',
      OVERVIEW: '/v1/overview',
      INGEST: '/v1/ingest',
      TENANT_REGISTER: '/v1/tenantReg',
      TENANTS: '/v1/tenants',
      TENANT_BY_ID: (id: string) => `/v1/tenants/${id}`,
      AUTH_SIGNUP: '/v1/auth/signup',
      AUTH_LOGIN: '/v1/auth/login',
      AUTH_REFRESH: '/v1/auth/refresh',
      AUTH_LOGOUT: '/v1/auth/logout',
      AUTH_ME: '/v1/auth/me',
    },
  },

  // zord-relay: Message Relay / Provider Contracts (Port 8082)
  // Used by Ops "Payout Contracts" UI.
  RELAY: {
    BASE_URL: process.env.ZORD_RELAY_URL || 'http://localhost:8082',
    ENDPOINTS: {
      HEALTH: '/health',
      CONTRACTS: '/v1/contracts',
      CONTRACT_BY_ID: (id: string) => `/v1/contracts/${id}`,
    },
  },

  // zord-intent-engine: Intent Processing (Port 8083)
  INTENT_ENGINE: {
    BASE_URL: process.env.ZORD_INTENT_ENGINE_URL || 'http://localhost:8083',
    ENDPOINTS: {
      HEALTH: '/health',
      INTENTS: '/v1/intents',
      INTENT_BY_ID: (id: string) => `/v1/intents/${id}`,
      DLQ: '/v1/dlq',
      DLQ_BY_ID: (id: string) => `/v1/dlq/${id}`,
    },
  },

  // zord-vault-journal: Raw Storage (Port 8081)
  VAULT_JOURNAL: {
    BASE_URL: process.env.ZORD_VAULT_URL || 'http://localhost:8081',
    ENDPOINTS: {
      HEALTH: '/health',
      ENVELOPES: '/v1/envelopes',
      ENVELOPE_BY_ID: (id: string) => `/v1/envelopes/${id}`,
    },
  },

  // zord-contracts: Contract Service (Port 8084)
  CONTRACTS: {
    BASE_URL: process.env.ZORD_CONTRACTS_URL || 'http://localhost:8082',
    ENDPOINTS: {
      HEALTH: '/health',
      CONTRACTS: '/v1/contracts',
      CONTRACT_BY_ID: (id: string) => `/v1/contracts/${id}`,
    },
  },

  

  // zord-pii-enclave: PII Protection (Port 8085)
  PII_ENCLAVE: {
    BASE_URL: process.env.ZORD_PII_ENCLAVE_URL || 'http://localhost:8085',
    ENDPOINTS: {
      HEALTH: '/health',
    },
  },

  // zord-intelligence: KPI dashboards + batch intelligence (Port 8089)
  INTELLIGENCE: {
    BASE_URL: process.env.ZORD_INTELLIGENCE_URL || 'http://localhost:8089',
    ENDPOINTS: {
      LEAKAGE: '/v1/intelligence/dashboard/leakage',
      AMBIGUITY: '/v1/intelligence/dashboard/ambiguity',
      DEFENSIBILITY: '/v1/intelligence/dashboard/defensibility',
      PATTERNS: '/v1/intelligence/dashboard/patterns',
      RECOMMENDATIONS: '/v1/intelligence/dashboard/recommendations',
      BATCHES: '/v1/intelligence/batches',
      BATCH_BY_ID: (id: string) => `/v1/intelligence/batches/${id}`,
    },
  },

  // zord-evidence: evidence packs + Merkle (Port 8088)
  EVIDENCE: {
    BASE_URL: process.env.ZORD_EVIDENCE_URL || 'http://localhost:8088',
    ENDPOINTS: {
      PACKS: '/v1/evidence/packs',
      PACK_BY_ID: (packId: string) => `/v1/evidence/packs/${encodeURIComponent(packId)}`,
    },
  },
} as const

// Helper function to build full URL
export function buildUrl(
  service: keyof typeof BACKEND_SERVICES,
  endpoint: string
): string {
  const baseUrl = BACKEND_SERVICES[service].BASE_URL
  return `${baseUrl}${endpoint}`
}

// Common fetch options - disable Next.js fetch cache for real-time data
export const DEFAULT_FETCH_OPTIONS: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
  },
  cache: 'no-store',
}

// Timeout for API calls (ms)
export const API_TIMEOUT = 30000
