import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { EvidencePackFull, ListPacksResponse } from './evidenceTypes'

const EVIDENCE_BASE = '/api/prod/evidence'

function withTenant(path: string, tenantId: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ tenant_id: tenantId.trim() })
  for (const [k, v] of Object.entries(extra)) {
    if (v) params.set(k, v)
  }
  return `${path}?${params.toString()}`
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
  return fetchProdJsonGet<ListPacksResponse>(withTenant(`${EVIDENCE_BASE}/packs`, tenantId, extra))
}

export async function getEvidencePackFull(
  tenantId: string,
  packId: string,
): Promise<EvidencePackFull | null> {
  if (!tenantId.trim() || !packId.trim()) return null
  return fetchProdJsonGet<EvidencePackFull>(
    withTenant(`${EVIDENCE_BASE}/packs/${encodeURIComponent(packId.trim())}`, tenantId),
  )
}
