import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'

const JSON_NO_STORE = { 'cache-control': 'no-store' } as const

function isKpiDashboardPath(path: string): boolean {
  return path.includes('/v1/intelligence/dashboard/')
}

function isBatchesListPath(path: string): boolean {
  return path === BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.BATCHES
}

function emptyKpiResponse(reason: string) {
  return NextResponse.json({ data_available: false as const, reason }, { status: 200, headers: JSON_NO_STORE })
}

function emptyBatchesResponse(tenantId: string, request: NextRequest) {
  const params = request.nextUrl.searchParams
  return NextResponse.json(
    {
      tenant_id: tenantId,
      intelligence_mode: 'offline',
      status_filter: params.get('status')?.trim() || '',
      batches: [] as const,
    },
    { status: 200, headers: JSON_NO_STORE },
  )
}

/**
 * Shared forwarder for `/api/prod/intelligence/*` Next routes → zord-intelligence (:8089).
 * Every intelligence endpoint requires `tenant_id`; we validate once here and pass through
 * the rest of the query string (e.g. `batch_id`, `status`, `limit`) unchanged.
 *
 * When zord-intelligence is down or returns 404 for dashboard KPIs, respond with
 * `data_available: false` (200) so the console does not spam 502/404 and surfaces
 * show empty states instead of broken fetches.
 */
export async function forwardIntelligence(request: NextRequest, path: string): Promise<NextResponse> {
  const params = request.nextUrl.searchParams
  const tenantId = params.get('tenant_id')?.trim() || ''
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  const url = `${BACKEND_SERVICES.INTELLIGENCE.BASE_URL}${path}?${params.toString()}`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
      },
      cache: 'no-store',
    })
    const text = await upstream.text()

    if (!upstream.ok) {
      if (isKpiDashboardPath(path)) {
        const reason =
          upstream.status === 404
            ? 'Intelligence KPIs not available (service or route missing).'
            : `Intelligence upstream returned HTTP ${upstream.status}.`
        return emptyKpiResponse(reason)
      }
      if (isBatchesListPath(path)) {
        return emptyBatchesResponse(tenantId, request)
      }
    }

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    if (isKpiDashboardPath(path)) {
      return emptyKpiResponse(
        `Intelligence service unreachable (${error instanceof Error ? error.message : 'unknown'}).`,
      )
    }
    if (isBatchesListPath(path)) {
      return emptyBatchesResponse(tenantId, request)
    }
    return NextResponse.json(
      {
        error: 'intelligence service unreachable',
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 502 },
    )
  }
}
