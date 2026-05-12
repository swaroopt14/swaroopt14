import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiEnvelopeRow, ApiListResponse } from './prodApiTypes'

export const PROD_RAW_ENVELOPES_LIST_PATH = '/api/prod/raw-envelopes'
export const PROD_RAW_ENVELOPES_DEFAULT_QUERY = 'page=1&page_size=200'

export async function getProdRawEnvelopesPage(
  query: string = PROD_RAW_ENVELOPES_DEFAULT_QUERY,
): Promise<ApiListResponse<ApiEnvelopeRow> | null> {
  return fetchProdJsonGet<ApiListResponse<ApiEnvelopeRow>>(`${PROD_RAW_ENVELOPES_LIST_PATH}?${query}`)
}
