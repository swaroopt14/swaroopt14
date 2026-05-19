import { NextRequest, NextResponse } from 'next/server'
import {
  applyRefreshedSessionCookies,
  resolveProxyForwardAuthorization,
} from '@/services/auth/resolvePayoutTenant.server'

/** Proxies multipart bulk file to zord-edge `POST /v1/bulk-ingest` only (never zord-intelligence).
 * Enforces session vs API-key tenant match when both are present; never trusts client tenant_id. */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function candidateEdgeBases(): string[] {
  if (process.env.ZORD_EDGE_URL?.trim()) return [process.env.ZORD_EDGE_URL.trim()]
  return ['http://localhost:8080', 'http://zord-edge:8080']
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type')
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data with a file field.' }, { status: 400 })
  }

  const authResolution = await resolveProxyForwardAuthorization(req, process.env.ZORD_BULK_INGEST_API_KEY)
  if (!authResolution.ok) return authResolution.response

  const bodyBuffer = Buffer.from(await req.arrayBuffer())
  const sourceType = req.headers.get('x-zord-source-type') || process.env.ZORD_BULK_INGEST_SOURCE_TYPE || 'CSV'
  const sourceClass = req.headers.get('x-zord-source-class') || process.env.ZORD_BULK_INGEST_SOURCE_CLASS || 'INTENT'
  const tenantType =
    req.headers.get('x-zord-tenant-type') || process.env.ZORD_BULK_INGEST_TENANT_TYPE || 'MERCHANT'

  const headers: Record<string, string> = {
    'content-type': contentType,
    'x-zord-source-type': sourceType,
    'x-zord-source-class': sourceClass,
    'x-zord-tenant-type': tenantType,
    authorization: authResolution.authorization,
  }

  const batchId =
    req.headers.get('batch-id') || req.headers.get('Batch-Id') || req.headers.get('batchid') || req.headers.get('BatchId')
  if (batchId?.trim()) headers['Batch-Id'] = batchId.trim()

  const idempotencyKey =
    req.headers.get('x-idempotency-key')?.trim() || req.headers.get('X-Idempotency-Key')?.trim()
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey

  const sourceSystem =
    req.headers.get('x-zord-source-system')?.trim() || req.headers.get('X-Zord-Source-System')?.trim()
  if (sourceSystem) headers['X-Zord-Source-System'] = sourceSystem

  const forceReprocess =
    req.headers.get('x-zord-force-reprocess')?.trim().toLowerCase() === 'true' ||
    req.headers.get('X-Zord-Force-Reprocess')?.trim().toLowerCase() === 'true'
  if (forceReprocess) headers['X-Zord-Force-Reprocess'] = 'true'

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
    const res = NextResponse.json(
      {
        error: 'Bulk ingest upstream unavailable',
        upstream: lastUrl,
        details: lastError instanceof Error ? lastError.message : 'Unknown upstream error',
      },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, authResolution.refreshedPayload)
    return res
  }

  const payload = await lastResponse.text()
  const res = new NextResponse(payload, {
    status: lastResponse.status,
    headers: {
      'content-type': lastResponse.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  })
  applyRefreshedSessionCookies(res, authResolution.refreshedPayload)
  return res
}
