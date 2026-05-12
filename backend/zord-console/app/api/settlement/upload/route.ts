import { NextRequest, NextResponse } from 'next/server'
import { normalizeAuthorizationHeader } from '@/services/payout-command/batch-intake/intakeHttpShared'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function settlementBase() {
  if (process.env.ZORD_SETTLEMENT_URL) return process.env.ZORD_SETTLEMENT_URL.replace(/\/$/, '')
  return 'http://localhost:8081'
}

function resolveAuthHeader(req: NextRequest) {
  const incoming = req.headers.get('authorization')
  if (incoming) return normalizeAuthorizationHeader(incoming)
  const accessToken = req.cookies.get('zord_access_token')?.value
  if (accessToken) return normalizeAuthorizationHeader(accessToken)
  const apiKey = process.env.ZORD_SETTLEMENT_API_KEY ?? process.env.ZORD_BULK_INGEST_API_KEY
  return normalizeAuthorizationHeader(apiKey ?? '')
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type')
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data with file.' }, { status: 400 })
  }

  const tenantId = req.nextUrl.searchParams.get('tenant_id')
  const psp = req.nextUrl.searchParams.get('psp')
  if (!tenantId?.trim() || !psp?.trim()) {
    return NextResponse.json({ error: 'Query parameters tenant_id and psp are required.' }, { status: 400 })
  }

  const bodyBuffer = Buffer.from(await req.arrayBuffer())
  const url = `${settlementBase()}/v1/settlement/upload?tenant_id=${encodeURIComponent(tenantId.trim())}&psp=${encodeURIComponent(psp.trim())}`

  const headers: Record<string, string> = {
    'content-type': contentType,
  }

  const auth = resolveAuthHeader(req)
  if (auth) headers.authorization = auth

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
    return new NextResponse(payload, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store, max-age=0',
      },
    })
  } catch (error) {
    lastError = error
  }

  return NextResponse.json(
    {
      error: 'Settlement upload upstream unavailable',
      upstream: url,
      details: lastError instanceof Error ? lastError.message : 'Unknown upstream error',
    },
    { status: 502 },
  )
}
