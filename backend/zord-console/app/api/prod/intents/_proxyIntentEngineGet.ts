import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  TENANT_MISMATCH_BODY,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

type ProxyOptions = {
  upstreamPath: string
  /** Extra query params forwarded upstream (tenant_id is always injected). */
  query?: Record<string, string | undefined>
  /** Extra headers forwarded upstream (tenant headers always set). */
  headers?: Record<string, string | undefined>
}

/** Proxy GET to zord-intent-engine; tenant from session only. */
export async function proxyIntentEngineGet(request: NextRequest, options: ProxyOptions) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  const queryTenant = request.nextUrl.searchParams.get('tenant_id')?.trim()
  if (queryTenant && queryTenant !== tenantId) {
    const res = NextResponse.json(TENANT_MISMATCH_BODY, { status: 403 })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }

  const upstreamParams = new URLSearchParams({ tenant_id: tenantId })
  for (const [k, v] of Object.entries(options.query ?? {})) {
    const trimmed = v?.trim()
    if (trimmed) upstreamParams.set(k, trimmed)
  }
  for (const [k, v] of request.nextUrl.searchParams.entries()) {
    if (k === 'tenant_id') continue
    if (!upstreamParams.has(k) && v.trim()) upstreamParams.set(k, v)
  }

  const url = `${BACKEND_SERVICES.INTENT_ENGINE.BASE_URL}${options.upstreamPath}?${upstreamParams.toString()}`

  const batchId =
    options.query?.batch_id?.trim() ||
    request.nextUrl.searchParams.get('batch_id')?.trim() ||
    options.headers?.batch_id?.trim()

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
        'tenant-id': tenantId,
        tenant_id: tenantId,
        ...(batchId ? { batch_id: batchId } : {}),
      },
      cache: 'no-store',
    })
    const text = await upstream.text()
    const res = new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      { error: 'intent-engine unreachable', details: error instanceof Error ? error.message : 'unknown' },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
