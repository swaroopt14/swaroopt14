import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { DisbursementTrendRange, DisbursementTrendResponse } from './disbursementTrendTypes'

/** Home trend chart — BFF injects session tenant; only `range` is required on the client. */
export async function getDisbursementTrend(
  range: DisbursementTrendRange,
): Promise<DisbursementTrendResponse | null> {
  const params = new URLSearchParams({ range })
  return fetchProdJsonGet<DisbursementTrendResponse>(`/api/prod/home/disbursement-trend?${params.toString()}`)
}
