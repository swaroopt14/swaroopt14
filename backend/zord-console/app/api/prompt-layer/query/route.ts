import { NextResponse } from 'next/server'

// Always proxy at request time (no caching), since this depends on runtime env + backend state.
export const dynamic = 'force-dynamic'

function upstreamBaseUrl() {
  // In docker-compose, set PROMPT_LAYER_URL=http://zord-prompt-layer:8086
  // For local dev without docker, you can set PROMPT_LAYER_URL=http://localhost:8086
  return process.env.PROMPT_LAYER_URL || 'http://zord-prompt-layer:8086'
}

export async function POST(req: Request) {
  const url = `${upstreamBaseUrl()}/query`

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ details: 'Invalid JSON body' }, { status: 400 })
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    // Avoid any unintended caching semantics.
    cache: 'no-store',
  })

  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export async function OPTIONS() {
  // Same-origin calls to /api/... typically don't require CORS, but OPTIONS may happen in some setups.
  return new NextResponse(null, { status: 204 })
}

