import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'

/**
 * Shared forwarder for `/api/prod/intelligence/*` Next routes → zord-intelligence (:8089).
 * Every intelligence endpoint requires `tenant_id`; we validate once here and pass through
 * the rest of the query string (e.g. `batch_id`, `status`, `limit`) unchanged.
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
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'intelligence service unreachable',
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 502 },
    )
  }
}
