import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'

/**
 * Forward `/api/prod/evidence/*` → zord-evidence (:8088).
 * Requires `tenant_id` on the query string (or `x-tenant-id` header); other params pass through
 * (`batch_id`, `intent_id`, etc.) so deployments can list by batch or by intent without console changes.
 */
export async function forwardEvidence(request: NextRequest, upstreamPath: string): Promise<NextResponse> {
  const params = request.nextUrl.searchParams
  const tenantId =
    params.get('tenant_id')?.trim() || request.headers.get('x-tenant-id')?.trim() || ''
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required (query or x-tenant-id header)' }, { status: 400 })
  }
  if (!params.has('tenant_id')) {
    params.set('tenant_id', tenantId)
  }

  const url = `${BACKEND_SERVICES.EVIDENCE.BASE_URL}${upstreamPath}?${params.toString()}`

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
        error: 'evidence service unreachable',
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 502 },
    )
  }
}
