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

export async function listEvidencePacks(
  tenantId: string,
  opts: ListEvidencePacksOptions = {},
): Promise<ListPacksResponse | null> {
  if (!tenantId.trim()) return null
  const extra: Record<string, string> = {}
  if (opts.batchId?.trim()) extra.batch_id = opts.batchId.trim()
  if (opts.intentId?.trim()) extra.intent_id = opts.intentId.trim()
  return fetchProdJsonGet<ListPacksResponse>(evidenceQueryPath(`${EVIDENCE_BASE}/packs`, extra))
}

export async function getEvidencePackFull(
  tenantId: string,
  packId: string,
): Promise<EvidencePackFull | null> {
  if (!tenantId.trim() || !packId.trim()) return null
  return fetchProdJsonGet<EvidencePackFull>(
    evidenceQueryPath(`${EVIDENCE_BASE}/packs/${encodeURIComponent(packId.trim())}`),
  )
}
