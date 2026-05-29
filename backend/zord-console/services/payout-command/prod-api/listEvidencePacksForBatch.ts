import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackSummaryRow } from './evidenceTypes'
import { getEvidencePacksForBatchIntents } from './getEvidencePacksForBatchIntents'
import { listEvidencePacks } from './getEvidencePacks'
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
  const [{ packs: intentPacks }, batchScoped] = await Promise.all([
    getEvidencePacksForBatchIntents(bid),
    listEvidencePacks({ batchId: bid }),
  ])

  const byId = new Map<string, EvidencePackSummaryRow>()
  const upsert = (row: EvidencePackSummaryRow) => {
    const id = apiTrimmedString(row.evidence_pack_id)
    if (!id) return
    const prev = byId.get(id)
    byId.set(id, prev ? { ...prev, ...row } : row)
  }

  for (const row of batchScoped?.packs ?? []) upsert(row)
  for (const row of intentPacks) upsert(row)

  const rows = [...byId.values()]
  rows.sort((a, b) => {
    const aIsBatch = !apiTrimmedString(a.intent_id) || (a.mode ?? '').toUpperCase().includes('BATCH')
    const bIsBatch = !apiTrimmedString(b.intent_id) || (b.mode ?? '').toUpperCase().includes('BATCH')
    if (aIsBatch !== bIsBatch) return aIsBatch ? -1 : 1
    return (a.created_at ?? '').localeCompare(b.created_at ?? '')
  })
  return rows
}
