/**
 * In-flight dedupe for journal widgets — each hook calls these helpers independently;
 * concurrent requests for the same key share one promise.
 */
import {
  getIntentJournalBatchIdsForSession,
  getIntentJournalDlqItemsForSession,
  getIntentJournalPaymentIntentsForSession,
} from '@/services/payout-command/prod-api/intentJournalApi'
import type {
  IntentJournalDlqItemsResponse,
  IntentJournalPaymentIntentsResponse,
} from '@/services/payout-command/prod-api/intentJournalTypes'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import {
  mapIntelligenceRowToBatchRecord,
  type JournalBatchRecord,
} from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { mapBatchIdItemToBatchRecord } from './mappers/mapIntentBatchSidebar'

const listInflight = new Map<string, Promise<JournalBatchRecord[]>>()
const intentsInflight = new Map<string, Promise<IntentJournalPaymentIntentsResponse | null>>()
const dlqInflight = new Map<string, Promise<IntentJournalDlqItemsResponse | null>>()
const bundleInflight = new Map<
  string,
  Promise<{ paymentIntents: IntentJournalPaymentIntentsResponse | null; dlqItems: IntentJournalDlqItemsResponse | null }>
>()

export async function fetchJournalSidebarBatches(tenantId: string): Promise<JournalBatchRecord[]> {
  const key = `batch-ids:${tenantId || 'anon'}`
  const existing = listInflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const fetchRes = await getIntentJournalBatchIdsForSession()
    if (fetchRes.ok && fetchRes.data) {
      let batchRows = (fetchRes.data.items ?? []).map(mapBatchIdItemToBatchRecord)
      if (batchRows.length === 0 && tenantId.trim()) {
        try {
          const batchesRes = await getIntelligenceBatches({ limit: 100 })
          batchRows = (batchesRes?.batches ?? []).map(mapIntelligenceRowToBatchRecord)
        } catch {
          /* optional fallback */
        }
      }
      return batchRows
    }
    return []
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

export async function fetchJournalPaymentIntents(batchId: string): Promise<IntentJournalPaymentIntentsResponse | null> {
  const bid = batchId.trim()
  if (!bid) return null

  const existing = intentsInflight.get(bid)
  if (existing) return existing

  const promise = (async () => {
    const res = await getIntentJournalPaymentIntentsForSession(bid)
    return res.ok && res.data ? res.data : null
  })().finally(() => {
    intentsInflight.delete(bid)
  })

  intentsInflight.set(bid, promise)
  return promise
}

export async function fetchJournalDlqItems(batchId: string): Promise<IntentJournalDlqItemsResponse | null> {
  const bid = batchId.trim()
  if (!bid) return null

  const existing = dlqInflight.get(bid)
  if (existing) return existing

  const promise = (async () => {
    const res = await getIntentJournalDlqItemsForSession(bid)
    return res.ok && res.data ? res.data : null
  })().finally(() => {
    dlqInflight.delete(bid)
  })

  dlqInflight.set(bid, promise)
  return promise
}

export async function fetchJournalBatchBundle(batchId: string): Promise<{
  paymentIntents: IntentJournalPaymentIntentsResponse | null
  dlqItems: IntentJournalDlqItemsResponse | null
}> {
  const bid = batchId.trim()
  if (!bid) return { paymentIntents: null, dlqItems: null }

  const existing = bundleInflight.get(bid)
  if (existing) return existing

  const promise = Promise.all([fetchJournalPaymentIntents(bid), fetchJournalDlqItems(bid)]).then(
    ([paymentIntents, dlqItems]) => ({ paymentIntents, dlqItems }),
  ).finally(() => {
    bundleInflight.delete(bid)
  })

  bundleInflight.set(bid, promise)
  return promise
}
