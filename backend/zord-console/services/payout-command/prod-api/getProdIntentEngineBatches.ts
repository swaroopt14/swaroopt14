import { fetchProdJsonGet } from './fetchProdJsonGet'

/** Matches zord-intent-engine `models.BatchSidebarItem` JSON. */
export type IntentEngineBatchSidebarItem = {
  batchId: string
  type: string
  totalValue: string
  transactions: number
  confirmedCount: number
  highConfidenceCount?: number
  mismatchCount: number
  unresolvedCount: number
}

export type IntentEngineBatchesResponse = {
  items: IntentEngineBatchSidebarItem[]
}

/** GET `/api/prod/intents/batches` — tenant from session; faster than Intelligence batch list. */
export async function getProdIntentEngineBatches(): Promise<IntentEngineBatchesResponse | null> {
  return fetchProdJsonGet<IntentEngineBatchesResponse>('/api/prod/intents/batches')
}
