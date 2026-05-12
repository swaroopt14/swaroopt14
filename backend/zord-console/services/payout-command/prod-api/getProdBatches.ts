import { fetchProdJsonGet } from './fetchProdJsonGet'

export type ApiBatchRow = {
  batchId: string
  type: string
  totalValue: string | number
  transactions: number
  confirmedCount: number
  highConfidenceCount: number
  mismatchCount: number
  unresolvedCount: number
}

export type ApiBatchListResponse = {
  items: ApiBatchRow[]
}

export async function getProdBatches(tenantId: string): Promise<ApiBatchListResponse | null> {
  if (!tenantId.trim()) return null
  return fetchProdJsonGet<ApiBatchListResponse>(`/api/prod/intents/batches?tenant_id=${encodeURIComponent(tenantId.trim())}`)
}
