import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { DisbursementTrendRange, DisbursementTrendResponse } from './disbursementTrendTypes'

export async function getDisbursementTrend(
  tenantId: string,
  range: DisbursementTrendRange,
): Promise<DisbursementTrendResponse | null> {
  const tid = tenantId.trim()
  if (!tid) return null
  const params = new URLSearchParams({ tenant_id: tid, range })
  return fetchProdJsonGet<DisbursementTrendResponse>(`/api/prod/home/disbursement-trend?${params.toString()}`)
}
