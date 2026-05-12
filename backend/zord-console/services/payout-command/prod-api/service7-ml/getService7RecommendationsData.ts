import { fetchProdJsonGet } from '../fetchProdJsonGet'
import { withQuery } from './service7MlQuery'
import type { Service7KpiQuery, Service7MetricResponse } from './service7MlTypes'

export const S7_RECO_LIST_PATH = '/api/prod/intelligence/recommendations'
export const S7_RECO_METRICS_PATH = '/api/prod/intelligence/recommendations/metrics'
export const S7_RECO_DISPATCH_UPGRADE_PATH = '/api/prod/intelligence/recommendations/dispatch-upgrade'

export async function getService7Recommendations(query: Service7KpiQuery = {}): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_RECO_LIST_PATH, query))
}

export async function getService7RecommendationMetrics(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_RECO_METRICS_PATH, query))
}

export async function getService7DispatchUpgradeRecommendation(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_RECO_DISPATCH_UPGRADE_PATH, query))
}

