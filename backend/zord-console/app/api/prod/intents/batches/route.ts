import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'

export const dynamic = 'force-dynamic'

// Proxy: GET /api/prod/intents/batches?tenant_id=… → zord-intent-engine /api/prod/intents/batches.
// Intent-engine requires tenant_id both as a query param AND as a header.
export async function GET(request: NextRequest) {
  const tenantId =
    request.nextUrl.searchParams.get('tenant_id')?.trim() ||
    request.headers.get('x-tenant-id')?.trim() ||
    ''

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  const url = `${BACKEND_SERVICES.INTENT_ENGINE.BASE_URL}/api/prod/intents/batches?tenant_id=${encodeURIComponent(tenantId)}`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
        'tenant-id': tenantId,
        'tenant_id': tenantId,
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
      { error: 'intent-engine unreachable', details: error instanceof Error ? error.message : 'unknown' },
      { status: 502 },
    )
  }
}
