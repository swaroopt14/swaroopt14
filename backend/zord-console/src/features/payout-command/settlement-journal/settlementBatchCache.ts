/**
 * In-flight dedupe for settlement journal widgets — each hook calls these helpers independently;
 * concurrent requests for the same key share one promise.
 */
import {
  extractClientBatchIdsFromListResponse,
  getSettlementObservationBatchesForSession,
  getSettlementObservationsForClientBatch,
  mapObservationToTableRow,
  type SettlementObservationDetailResponse,
  type SettlementObservationTableRow,
} from '@/services/payout-command/prod-api/settlementObservations'

const listInflight = new Map<string, Promise<string[]>>()
const detailInflight = new Map<string, Promise<SettlementObservationTableRow[]>>()

function mergeBatchIds(apiIds: string[], pinned?: string): string[] {
  const out = [...apiIds]
  const pin = pinned?.trim()
  if (pin && !out.includes(pin)) out.unshift(pin)
  return out
}

export async function fetchSettlementSidebarBatches(pinnedId?: string): Promise<string[]> {
  const key = `list:${pinnedId?.trim() || 'all'}`
  const existing = listInflight.get(key)
  if (existing) return existing

  const promise = (async () => {
    const fetchRes = await getSettlementObservationBatchesForSession()
    const apiIds =
      fetchRes.ok && fetchRes.data ? extractClientBatchIdsFromListResponse(fetchRes.data) : []
    return mergeBatchIds(apiIds, pinnedId)
  })().finally(() => {
    listInflight.delete(key)
  })

  listInflight.set(key, promise)
  return promise
}

export async function fetchSettlementObservations(
  clientBatchId: string,
): Promise<SettlementObservationTableRow[]> {
  const bid = clientBatchId.trim()
  if (!bid) return []

  const existing = detailInflight.get(bid)
  if (existing) return existing

  const promise = (async () => {
    const res = await getSettlementObservationsForClientBatch(bid)
    if (!res.ok || !res.data?.items?.length) return []
    return res.data.items.map((it, rowIndex) =>
      mapObservationToTableRow(it, { clientBatchId: bid, rowIndex }),
    )
  })().finally(() => {
    detailInflight.delete(bid)
  })

  detailInflight.set(bid, promise)
  return promise
}

export type { SettlementObservationDetailResponse }
