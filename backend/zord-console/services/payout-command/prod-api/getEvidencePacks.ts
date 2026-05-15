import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { EvidencePackFull, ListPacksResponse } from './evidenceTypes'

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

/** Evidence pack list — BFF injects session tenant. */
export async function listEvidencePacks(opts: ListEvidencePacksOptions = {}): Promise<ListPacksResponse | null> {
  const extra: Record<string, string> = {}
  if (opts.batchId?.trim()) extra.batch_id = opts.batchId.trim()
  if (opts.intentId?.trim()) extra.intent_id = opts.intentId.trim()
  return fetchProdJsonGet<ListPacksResponse>(evidenceQueryPath(`${EVIDENCE_BASE}/packs`, extra))
}

export async function getEvidencePackFull(packId: string): Promise<EvidencePackFull | null> {
  const pid = packId.trim()
  if (!pid) return null
  return fetchProdJsonGet<EvidencePackFull>(evidenceQueryPath(`${EVIDENCE_BASE}/packs/${encodeURIComponent(pid)}`))
}
