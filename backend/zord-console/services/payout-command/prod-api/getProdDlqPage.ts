import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiDlqRow, ApiListResponse } from './prodApiTypes'

export const PROD_DLQ_LIST_PATH = '/api/prod/dlq'
export const PROD_DLQ_DEFAULT_QUERY = 'page=1&page_size=100'

export async function getProdDlqPage(query: string = PROD_DLQ_DEFAULT_QUERY): Promise<ApiListResponse<ApiDlqRow> | null> {
  return fetchProdJsonGet<ApiListResponse<ApiDlqRow>>(`${PROD_DLQ_LIST_PATH}?${query}`)
}
