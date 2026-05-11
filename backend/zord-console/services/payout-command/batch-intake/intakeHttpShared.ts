/** Shared helpers for batch intake API calls (intent + settlement). */

/**
 * zord-edge `/v1/*` API-key middleware only accepts `Authorization: Bearer <prefix>.<secret>`.
 * Strip optional `Bearer` / `ApiKey` / `API-Key` prefix from pasted values, then always send `Bearer`.
 */
export function normalizeAuthorizationHeader(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  let token = v
  if (/^(Bearer|ApiKey|API-Key)\s+/i.test(token)) {
    token = token.replace(/^(Bearer|ApiKey|API-Key)\s+/i, '').trim()
  }
  if (!token) return null
  return `Bearer ${token}`
}

export function extractBatchIdFromBulkIngestResponse(text: string): string | null {
  if (!text.trim()) return null
  try {
    const j = JSON.parse(text) as Record<string, unknown>
    const data = j.data && typeof j.data === 'object' ? (j.data as Record<string, unknown>) : null
    const candidates: unknown[] = [j.batchId, j.batch_id, j.BatchId, data?.batchId, data?.batch_id, data?.BatchId]
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
  } catch {
    /* ignore */
  }
  return null
}

export function errorMessageFromProxyResponse(status: number, responseText: string): string {
  if (!responseText.trim()) return `HTTP ${status}`
  let parsed: unknown = null
  try {
    parsed = JSON.parse(responseText)
  } catch {
    return responseText.slice(0, 500)
  }
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>
    if (typeof o.error === 'string' && o.error.trim()) return o.error
    if (typeof o.details === 'string' && o.details.trim()) return o.details
    if (typeof o.message === 'string' && o.message.trim()) return o.message
  }
  return `HTTP ${status}`
}
