import { fetchProdJsonGet, fetchProdJsonGetWithMeta } from './fetchProdJsonGet'
import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackFull, ListPacksResponse } from './evidenceTypes'
import {
  evidenceMockFallbackEnabled,
  getMockEvidencePackFull,
  getMockEvidencePackList,
  isMockEvidencePackId,
} from './mockEvidencePacks'

const EVIDENCE_BASE = '/api/prod/evidence'

function evidenceQueryPath(path: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(extra)) {
    if (v) params.set(k, v)
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export type ListEvidencePacksOptions = {
  batchId?: string
  intentId?: string
}

/** Evidence pack list — BFF injects session tenant; fallback packs when live data is missing. */
export async function listEvidencePacks(opts: ListEvidencePacksOptions = {}): Promise<ListPacksResponse | null> {
  const batchId = apiTrimmedString(opts.batchId)
  const intentId = apiTrimmedString(opts.intentId)
  const extra: Record<string, string> = {}
  if (batchId) extra.batch_id = batchId
  if (intentId) extra.intent_id = intentId
  const path = evidenceQueryPath(`${EVIDENCE_BASE}/packs`, extra)
  const res = await fetchProdJsonGetWithMeta<ListPacksResponse>(path)

  if (res.ok && res.data && (res.data.packs?.length ?? 0) > 0) {
    return res.data
  }

  if (!res.ok && res.status === 401) {
    console.warn('[evidence] packs list unauthorized — sign in so BFF can inject session tenant', res.url)
  } else if (!res.ok) {
    console.warn('[evidence] packs list failed', res.status, res.errorText?.slice(0, 200) ?? res.url)
  }

  if (!evidenceMockFallbackEnabled()) {
    return res.data ?? null
  }

  return getMockEvidencePackList(batchId)
}

export async function getEvidencePackFull(
  packId: string,
  scope?: { batchId?: string },
): Promise<EvidencePackFull | null> {
  const pid = apiTrimmedString(packId)
  if (!pid) return null
  if (isMockEvidencePackId(pid)) {
    return getMockEvidencePackFull(pid, scope?.batchId)
  }
  const live = await fetchProdJsonGet<EvidencePackFull>(
    evidenceQueryPath(`${EVIDENCE_BASE}/packs/${encodeURIComponent(pid)}`),
  )
  if (live) return live
  if (!evidenceMockFallbackEnabled()) return null
  return getMockEvidencePackFull(pid, scope?.batchId)
}
