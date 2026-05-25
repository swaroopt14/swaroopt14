import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackSummaryRow } from './evidenceTypes'
import { listEvidencePacks } from './getEvidencePacks'
import {
  getIntentJournalBatchIdsForSession,
  getIntentJournalPaymentIntentsForSession,
} from './intentJournalApi'

const MAX_INTENT_PACK_QUERIES = 32

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
 * Batch-scoped packs plus per-intent packs for intents in the batch (deduped by evidence_pack_id).
 */
export async function listEvidencePacksForBatch(batchId: string): Promise<EvidencePackSummaryRow[]> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return []

  const [batchList, intentsRes] = await Promise.all([
    listEvidencePacks({ batchId: bid }),
    getIntentJournalPaymentIntentsForSession(bid),
  ])

  const byId = new Map<string, EvidencePackSummaryRow>()
  for (const pack of batchList?.packs ?? []) {
    const id = apiTrimmedString(pack.evidence_pack_id)
    if (id) byId.set(id, pack)
  }

  const intentIds = [
    ...new Set(
      (intentsRes.data?.items ?? [])
        .map((item) => apiTrimmedString(item.intent_id))
        .filter((id): id is string => Boolean(id)),
    ),
  ].slice(0, MAX_INTENT_PACK_QUERIES)

  if (intentIds.length) {
    const intentLists = await Promise.all(intentIds.map((intentId) => listEvidencePacks({ intentId })))
    for (const list of intentLists) {
      for (const pack of list?.packs ?? []) {
        const id = apiTrimmedString(pack.evidence_pack_id)
        if (id && !byId.has(id)) byId.set(id, pack)
      }
    }
  }

  return [...byId.values()]
}
