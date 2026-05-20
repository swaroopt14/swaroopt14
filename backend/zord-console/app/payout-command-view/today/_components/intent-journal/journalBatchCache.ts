/**
 * In-flight dedupe for journal widgets — each hook calls these helpers independently;
 * concurrent requests for the same key share one promise.
 */
import {
  getProdIntentEngineBatchDetailAll,
  getProdIntentEngineBatchesForSession,
  type IntentEngineBatchesDetailResponse,
} from '@/services/payout-command/prod-api/getProdIntentEngineBatches'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import {
  mapIntelligenceRowToBatchRecord,
  mapSidebarItemToBatchRecord,
  type JournalBatchRecord,
} from '@/services/payout-command/prod-api/mapIntentEngineBatch'

const listInflight = new Map<string, Promise<JournalBatchRecord[]>>()
const detailInflight = new Map<string, Promise<IntentEngineBatchesDetailResponse | null>>()

export async function fetchJournalSidebarBatches(tenantId: string): Promise<JournalBatchRecord[]> {
  const key = `list:${tenantId || 'anon'}`
  const existing = listInflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const fetchRes = await getProdIntentEngineBatchesForSession()
    if (!fetchRes.ok || !fetchRes.data) return []
    let batchRows = (fetchRes.data.items ?? []).map(mapSidebarItemToBatchRecord)
    if (batchRows.length === 0 && tenantId.trim()) {
      try {
        const batchesRes = await getIntelligenceBatches({ limit: 100 })
        batchRows = (batchesRes?.batches ?? []).map(mapIntelligenceRowToBatchRecord)
      } catch {
        /* optional fallback */
      }
    }
    return batchRows
  })().finally(() => {
    listInflight.delete(key)
  })

  listInflight.set(key, promise)
  return promise
}

export function findJournalBatch(
  batches: JournalBatchRecord[],
  batchId: string,
): JournalBatchRecord | null {
  const bid = batchId.trim()
  if (!bid) return null
  return batches.find((b) => b.batchId === bid) ?? null
}

export async function fetchJournalBatchDetail(
  batchId: string,
): Promise<IntentEngineBatchesDetailResponse | null> {
  const bid = batchId.trim()
  if (!bid) return null

  const existing = detailInflight.get(bid)
  if (existing) return existing

  const promise = getProdIntentEngineBatchDetailAll(undefined, bid).finally(() => {
    detailInflight.delete(bid)
  })

  detailInflight.set(bid, promise)
  return promise
}
