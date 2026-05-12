import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function candidateBases() {
  if (process.env.ZORD_INTELLIGENCE_URL) return [process.env.ZORD_INTELLIGENCE_URL]
  return ['http://localhost:8080', 'http://zord-intelligence:8080']
}

function resolveAuthHeader(req: NextRequest) {
  const incoming = req.headers.get('authorization')
  if (incoming) return incoming
  const apiKey = process.env.ZORD_BULK_INGEST_API_KEY
  if (!apiKey) return null
  return apiKey.startsWith('Bearer ') || apiKey.startsWith('ApiKey ') ? apiKey : `ApiKey ${apiKey}`
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type')
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data with a file field.' }, { status: 400 })
  }

  const bodyBuffer = Buffer.from(await req.arrayBuffer())
  const authHeader = resolveAuthHeader(req)
  const sourceType = req.headers.get('x-zord-source-type') || process.env.ZORD_BULK_INGEST_SOURCE_TYPE || 'batch_upload'
  const sourceClass = req.headers.get('x-zord-source-class') || process.env.ZORD_BULK_INGEST_SOURCE_CLASS || 'operator'

  const headers: Record<string, string> = {
    'content-type': contentType,
    'x-zord-source-type': sourceType,
    'x-zord-source-class': sourceClass,
  }
  if (authHeader) headers.authorization = authHeader

  const candidateUrls = candidateBases().map((base) => `${base.replace(/\/$/, '')}/v1/bulk-ingest`)
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
