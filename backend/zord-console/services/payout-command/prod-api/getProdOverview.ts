import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiOverviewResponse } from './prodApiTypes'

export const PROD_OVERVIEW_PATH = '/api/prod/overview'

export async function getProdOverview(): Promise<ApiOverviewResponse | null> {
  return fetchProdJsonGet<ApiOverviewResponse>(PROD_OVERVIEW_PATH)
}
