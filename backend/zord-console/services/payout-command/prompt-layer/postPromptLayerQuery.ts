/**
 * Ask Zord workspace → `/api/prompt-layer/query` (RAG / evidence layer).
 * Breakpoint-friendly: request + JSON parse live here.
 */
export const PROMPT_LAYER_QUERY_PATH = '/api/prompt-layer/query'

/** Demo tenant used when the workspace has no tenant picker wired yet. */
export const PROMPT_LAYER_DEMO_TENANT_ID = '11111111-1111-4111-8111-111111111111'

export type PostPromptLayerQueryBody = {
  query: string
  tenant_id: string
  top_k: number
}

export type PostPromptLayerQueryResult = {
  ok: boolean
  httpStatus: number
  payload: unknown
}

export async function postPromptLayerQuery(body: PostPromptLayerQueryBody): Promise<PostPromptLayerQueryResult> {
  const response = await fetch(PROMPT_LAYER_QUERY_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  return { ok: response.ok, httpStatus: response.status, payload }
}
