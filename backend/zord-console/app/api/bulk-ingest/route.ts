import { NextRequest, NextResponse } from 'next/server'
import { normalizeAuthorizationHeader } from '@/services/payout-command/batch-intake/intakeHttpShared'

/** Proxies multipart bulk file to zord-edge `POST /v1/bulk-ingest` only (never zord-intelligence).
 * Row-level failures stay as intents / line items; DLQ is for true dead letters. See `postIntentBulkIngest.ts`. */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function candidateEdgeBases(): string[] {
  if (process.env.ZORD_EDGE_URL?.trim()) return [process.env.ZORD_EDGE_URL.trim()]
  return ['http://localhost:8080', 'http://zord-edge:8080']
}

function resolveAuthHeader(req: NextRequest) {
  // Order: explicit Authorization header (power users / curl) → signed-in user's
  // access token cookie → shared bootstrap API key env. zord-edge's Authenticate()
  // middleware accepts both JWTs and legacy API keys in the same Bearer header.
  const incoming = req.headers.get('authorization')
  if (incoming) return normalizeAuthorizationHeader(incoming)

  const accessToken = req.cookies.get('zord_access_token')?.value
  if (accessToken) return normalizeAuthorizationHeader(accessToken)

  const apiKey = process.env.ZORD_BULK_INGEST_API_KEY
  return normalizeAuthorizationHeader(apiKey ?? '')
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type')
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data with a file field.' }, { status: 400 })
  }

  const bodyBuffer = Buffer.from(await req.arrayBuffer())
  const authHeader = resolveAuthHeader(req)
  const sourceType = req.headers.get('x-zord-source-type') || process.env.ZORD_BULK_INGEST_SOURCE_TYPE || 'CSV'
  const sourceClass = req.headers.get('x-zord-source-class') || process.env.ZORD_BULK_INGEST_SOURCE_CLASS || 'INTENT'
  const tenantType =
    req.headers.get('x-zord-tenant-type') || process.env.ZORD_BULK_INGEST_TENANT_TYPE || 'MERCHANT'

  const headers: Record<string, string> = {
    'content-type': contentType,
    'x-zord-source-type': sourceType,
    'x-zord-source-class': sourceClass,
    'x-zord-tenant-type': tenantType,
  }
  if (authHeader) headers.authorization = authHeader

  const batchId =
    req.headers.get('batch-id') || req.headers.get('Batch-Id') || req.headers.get('batchid') || req.headers.get('BatchId')
  if (batchId?.trim()) headers['Batch-Id'] = batchId.trim()

  const candidateUrls = candidateEdgeBases().map((base) => `${base.replace(/\/$/, '')}/v1/bulk-ingest`)
  let lastError: unknown = null
  let lastResponse: Response | null = null
  let lastUrl = candidateUrls[candidateUrls.length - 1]

  for (const url of candidateUrls) {
    lastUrl = url
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyBuffer,
        cache: 'no-store',
      })
      lastResponse = upstream
      if (upstream.ok || upstream.status < 500) break
    } catch (error) {
      lastError = error
    }
  }

  if (!lastResponse) {
    return NextResponse.json(
      {
        error: 'Bulk ingest upstream unavailable',
        upstream: lastUrl,
        details: lastError instanceof Error ? lastError.message : 'Unknown upstream error',
      },
      { status: 502 },
    )
  }

  const payload = await lastResponse.text()
  return new NextResponse(payload, {
    status: lastResponse.status,
    headers: {
      'content-type': lastResponse.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  })
}
