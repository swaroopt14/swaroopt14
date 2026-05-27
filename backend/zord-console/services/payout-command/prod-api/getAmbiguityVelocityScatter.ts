import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { AmbiguityVelocityScatterResponse } from './ambiguityVelocityTypes'

export type GetAmbiguityVelocityScatterParams = {
  batchId?: string
  days?: number
}

/**
 * Separate from intelligence KPI dashboard.
 * BFF: GET /api/prod/ambiguity/velocity
 * Upstream: GET /v1/intelligence/timeseries/ambiguity-velocity
 */
export async function getAmbiguityVelocityScatter(
  params: GetAmbiguityVelocityScatterParams = {},
): Promise<AmbiguityVelocityScatterResponse | null> {
  const search = new URLSearchParams()
  const days = params.days ?? 7
  search.set('days', String(days))
  const batchId = params.batchId?.trim()
  if (batchId) search.set('batch_id', batchId)

  return fetchProdJsonGet<AmbiguityVelocityScatterResponse>(
    `/api/prod/ambiguity/velocity?${search.toString()}`,
  )
}
