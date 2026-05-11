import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function normalizePromptLayerBase(base: string) {
  return base.replace(/\/+$/, '').replace(/\/query$/, '')
}

function upstreamCandidates() {
  if (process.env.PROMPT_LAYER_URL) return [process.env.PROMPT_LAYER_URL]
  return ['http://localhost:8086', 'http://zord-prompt-layer:8086']
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const query = (url.searchParams.get('query') || '').trim()
  const tenantId = (url.searchParams.get('tenant_id') || '').trim()
  const topK = url.searchParams.get('top_k') || '6'

  if (!query || !tenantId) {
    return NextResponse.json(
      { details: 'Missing required query params: query, tenant_id' },
      { status: 400 },
    )
  }

  const candidates = upstreamCandidates().map((base) => {
    const upstream = new URL(`${normalizePromptLayerBase(base)}/query/stream`)
    upstream.searchParams.set('query', query)
    upstream.searchParams.set('tenant_id', tenantId)
    upstream.searchParams.set('top_k', topK)
    return upstream.toString()
  })

  let lastError: unknown = null
  let upstreamResponse: Response | null = null
  let lastUrl = candidates[candidates.length - 1]

  for (const candidate of candidates) {
    lastUrl = candidate
    try {
      const res = await fetch(candidate, {
        method: 'GET',
        headers: {
          accept: 'text/event-stream',
        },
        cache: 'no-store',
      })
      if (res.ok || res.status < 500) {
        upstreamResponse = res
        break
      }
    } catch (error) {
      lastError = error
    }
  }

  if (!upstreamResponse || !upstreamResponse.body) {
    return NextResponse.json(
      {
        details: 'Prompt-layer stream unavailable',
        upstream: lastUrl,
        error: lastError instanceof Error ? lastError.message : 'Unknown upstream error',
      },
      { status: 502 },
    )
  }

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    },
  })
}

