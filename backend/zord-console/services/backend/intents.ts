// Intent Service - Fetches data from zord-intent-engine
import { BACKEND_SERVICES, buildUrl, DEFAULT_FETCH_OPTIONS, API_TIMEOUT } from '@/config/api.endpoints'

export interface BackendIntent {
  intent_id: string
  envelope_id: string
  tenant_id: string
  intent_type: string
  canonical_version: string
  schema_version?: string
  amount: string
  currency: string
  deadline_at?: string
  constraints?: Record<string, unknown>
  beneficiary_type?: string
  pii_tokens?: Record<string, unknown>
  beneficiary?: Record<string, unknown>
  status: string
  confidence_score?: number
  created_at: string
}

export interface IntentListResponse {
  items: BackendIntent[]
  pagination: {
    page: number
    page_size: number
    total: number
  }
}

export interface IntentListParams {
  page?: number
  page_size?: number
  tenant_id?: string
  status?: string
}

/**
 * Fetch list of intents from zord-intent-engine
 * Endpoint: GET http://localhost:8083/v1/intents
 */
export async function fetchIntents(params: IntentListParams = {}): Promise<IntentListResponse> {
  const { page = 1, page_size = 50, tenant_id, status } = params

  const queryParams = new URLSearchParams()
  queryParams.set('page', String(page))
  queryParams.set('page_size', String(page_size))
  if (tenant_id) queryParams.set('tenant_id', tenant_id)
  if (status) queryParams.set('status', status)

  const url = buildUrl('INTENT_ENGINE', BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.INTENTS)
  const fullUrl = `${url}?${queryParams.toString()}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(fullUrl, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Failed to fetch intents: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: Intent engine not responding')
    }
    throw error
  }
}

/**
 * Fetch single intent by ID from zord-intent-engine
 * Endpoint: GET http://localhost:8083/v1/intents/:id
 */
export async function fetchIntentById(intentId: string): Promise<BackendIntent | null> {
  const url = buildUrl(
    'INTENT_ENGINE',
    BACKEND_SERVICES.INTENT_ENGINE.ENDPOINTS.INTENT_BY_ID(intentId)
  )

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...DEFAULT_FETCH_OPTIONS,
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch intent: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: Intent engine not responding')
    }
    throw error
  }
}
