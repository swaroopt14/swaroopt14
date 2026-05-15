import { NextRequest, NextResponse } from 'next/server'
import { applyAuthCookies } from '@/services/auth/server'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  resolveProxyForwardAuthorization,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function settlementBase() {
  if (process.env.ZORD_SETTLEMENT_URL) return process.env.ZORD_SETTLEMENT_URL.replace(/\/$/, '')
  return 'http://localhost:8081'
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type')
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data with file.' }, { status: 400 })
  }

  const gate = await requireSessionTenantForProdProxy(req)
  if (!gate.ok) return gate.response

  const psp = req.nextUrl.searchParams.get('psp')
  if (!psp?.trim()) {
    return NextResponse.json({ error: 'Query parameter psp is required.' }, { status: 400 })
  }

  const authResolution = await resolveProxyForwardAuthorization(
    req,
    process.env.ZORD_SETTLEMENT_API_KEY ?? process.env.ZORD_BULK_INGEST_API_KEY,
  )
  if (!authResolution.ok) return authResolution.response

  const bodyBuffer = Buffer.from(await req.arrayBuffer())
  const url = `${settlementBase()}/v1/settlement/upload?tenant_id=${encodeURIComponent(gate.tenantId)}&psp=${encodeURIComponent(psp.trim())}`

  const headers: Record<string, string> = {
    'content-type': contentType,
    authorization: authResolution.authorization,
  }

  const batchId =
    req.headers.get('batch-id') || req.headers.get('Batch-Id') || req.headers.get('batchid') || req.headers.get('BatchId')
  if (batchId?.trim()) headers['Batch-Id'] = batchId.trim()

  const force = req.headers.get('x-zord-force-reprocess') ?? 'true'
  headers['X-Zord-Force-Reprocess'] = force

  const reason = req.headers.get('x-zord-force-reprocess-reason') ?? 'CLIENT_CORRECTED_FILE'
  headers['X-Zord-Force-Reprocess-Reason'] = reason

  let lastError: unknown = null
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyBuffer,
      cache: 'no-store',
    })
    const payload = await upstream.text()
    const res = new NextResponse(payload, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store, max-age=0',
      },
    })
    if (authResolution.refreshedPayload) {
      applyAuthCookies(res, authResolution.refreshedPayload)
    }
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    lastError = error
  }

  const res = NextResponse.json(
    {
      error: 'Settlement upload upstream unavailable',
      upstream: url,
      details: lastError instanceof Error ? lastError.message : 'Unknown upstream error',
    },
    { status: 502 },
  )
  if (authResolution.refreshedPayload) applyAuthCookies(res, authResolution.refreshedPayload)
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}
