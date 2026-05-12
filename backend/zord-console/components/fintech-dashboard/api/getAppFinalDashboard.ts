import type { AppFinalDashboardQuery, AppFinalDashboardResponse } from '../types/appFinalDashboard'

function toQueryString(input: AppFinalDashboardQuery): string {
  const params = new URLSearchParams()
  params.set('tenant_id', input.tenant_id)
  if (input.period) params.set('period', input.period)
  if (input.range) params.set('range', input.range)
  if (input.activity_mode) params.set('activity_mode', input.activity_mode)
  if (input.from) params.set('from', input.from)
  if (input.to) params.set('to', input.to)
  return params.toString()
}

function assertResponseShape(payload: unknown): asserts payload is AppFinalDashboardResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid dashboard payload: expected object')
  }

  const candidate = payload as Partial<AppFinalDashboardResponse>
  if (!candidate.tenant_id || !candidate.generated_at || !candidate.payments_funnel || !candidate.gross_volume || !candidate.retention || !candidate.activity || !candidate.ai_insights) {
    throw new Error('Invalid dashboard payload: missing required keys')
  }
}

export async function getAppFinalDashboard(
  query: AppFinalDashboardQuery,
  init?: RequestInit
): Promise<AppFinalDashboardResponse> {
  const queryString = toQueryString(query)
  const res = await fetch(`/api/v1/app-final/dashboard?${queryString}`, {
    method: 'GET',
    cache: 'no-store',
    ...init,
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch app-final dashboard: ${res.status}`)
  }

  const json = (await res.json()) as unknown
  assertResponseShape(json)
  return json
}
