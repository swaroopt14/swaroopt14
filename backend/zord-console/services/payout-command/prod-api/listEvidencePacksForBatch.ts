import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackSummaryRow } from './evidenceTypes'
import { getEvidencePacksForBatchIntents } from './getEvidencePacksForBatchIntents'
import { getIntentJournalBatchIdsForSession } from './intentJournalApi'

/** Session-scoped batch ids from intent-engine BFF (tenant injected server-side). */
export async function getEvidenceBatchIdsForSession(): Promise<string[]> {
  const res = await getIntentJournalBatchIdsForSession()
  if (!res.ok || !res.data?.items?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of res.data.items) {
    const id = apiTrimmedString(item.batch_id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Intent-level packs for a batch via GET /v1/evidence/batch/:batchId/intents (single BFF call).
 */
export async function listEvidencePacksForBatch(batchId: string): Promise<EvidencePackSummaryRow[]> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return []
  const { packs } = await getEvidencePacksForBatchIntents(bid)
  return packs
}
