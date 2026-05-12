const BASE = '/api/prod/zord'

async function fetchJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  return response.json() as Promise<T>
}

export async function fetchZordOverview(tenantId: string, timeRange = '24h'): Promise<Record<string, any>> {
  return fetchJson(`/metrics/overview?tenant_id=${encodeURIComponent(tenantId)}&time_range=${encodeURIComponent(timeRange)}`)
}

export async function fetchZordPayoutIntelligence(tenantId: string, timeRange = '24h'): Promise<Record<string, any>> {
  return fetchJson(`/metrics/payout-intelligence?tenant_id=${encodeURIComponent(tenantId)}&time_range=${encodeURIComponent(timeRange)}`)
}

export async function fetchZordReconciliation(tenantId: string, timeRange = '24h'): Promise<Record<string, any>> {
  return fetchJson(`/metrics/reconciliation?tenant_id=${encodeURIComponent(tenantId)}&time_range=${encodeURIComponent(timeRange)}`)
}

export async function fetchZordPSPHealth(tenantId: string, timeRange = '24h'): Promise<Record<string, any>> {
  return fetchJson(`/metrics/psp-health?tenant_id=${encodeURIComponent(tenantId)}&time_range=${encodeURIComponent(timeRange)}`)
}

export async function fetchZordErrors(tenantId: string, timeRange = '24h'): Promise<Record<string, any>> {
  return fetchJson(`/metrics/errors?tenant_id=${encodeURIComponent(tenantId)}&time_range=${encodeURIComponent(timeRange)}`)
}

export async function fetchZordIntentDetail(tenantId: string, intentId: string): Promise<Record<string, any>> {
  return fetchJson(`/intent/${encodeURIComponent(intentId)}/detail?tenant_id=${encodeURIComponent(tenantId)}`)
}

export async function searchZord(tenantId: string, query: string, limit = 20): Promise<{ items: Array<{ id: string; display: string; matched_on: string }> }> {
  return fetchJson(`/search?tenant_id=${encodeURIComponent(tenantId)}&q=${encodeURIComponent(query)}&limit=${limit}`)
}

export async function fetchZordAlerts(tenantId: string): Promise<{ items: any[]; active_count: number }> {
  return fetchJson(`/alerts?tenant_id=${encodeURIComponent(tenantId)}`)
}

export async function fetchZordExportQueue(tenantId: string): Promise<{ items: any[]; queued_count: number }> {
  return fetchJson(`/exports/recent?tenant_id=${encodeURIComponent(tenantId)}`)
}

export async function ingestZordEvent(payload: Record<string, unknown>): Promise<Record<string, any>> {
  return fetchJson('/events/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
