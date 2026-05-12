import { fetchProdJsonGet } from '../fetchProdJsonGet'
import { withQuery } from './service7MlQuery'
import type {
  Service7KpiQuery,
  Service7MetricResponse,
  Service7MlPredictionsResponse,
  Service7RcaClustersResponse,
} from './service7MlTypes'

export const S7_CI_ROUTE_CONCENTRATION_PATH = '/api/prod/intelligence/kpis/pattern/route-concentration'
export const S7_CI_LEAKAGE_SUMMARY_PATH = '/api/prod/intelligence/kpis/leakage/summary'
export const S7_CI_AMBIGUITY_RATE_PATH = '/api/prod/intelligence/kpis/ambiguity/rate'
export const S7_CI_DEFENSIBILITY_PATH = '/api/prod/intelligence/kpis/evidence/defensibility'
export const S7_CI_SETTLEMENT_DELAY_PATH = '/api/prod/intelligence/kpis/pattern/settlement-delay'
export const S7_CI_RCA_DRIVERS_PATH = '/api/prod/intelligence/kpis/rca/drivers'
export const S7_CI_RCA_CLUSTERS_PATH = '/api/prod/intelligence/ml/rca/clusters'
export const S7_CI_ML_PREDICTIONS_PATH = '/api/prod/intelligence/ml/predictions'

export async function getService7ConnectorRouteConcentration(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_CI_ROUTE_CONCENTRATION_PATH, query))
}

export async function getService7ConnectorLeakageSummary(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_CI_LEAKAGE_SUMMARY_PATH, query))
}

export async function getService7ConnectorAmbiguityRate(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_CI_AMBIGUITY_RATE_PATH, query))
}

export async function getService7ConnectorDefensibilityScore(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_CI_DEFENSIBILITY_PATH, query))
}

export async function getService7ConnectorSettlementDelayP95(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_CI_SETTLEMENT_DELAY_PATH, query))
}

export async function getService7ConnectorRcaDrivers(query: Service7KpiQuery = {}): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_CI_RCA_DRIVERS_PATH, query))
}

export async function getService7ConnectorRcaClusters(query: Service7KpiQuery = {}): Promise<Service7RcaClustersResponse | null> {
  return fetchProdJsonGet<Service7RcaClustersResponse>(withQuery(S7_CI_RCA_CLUSTERS_PATH, query))
}

export async function getService7ConnectorBatchAnomalyPredictions(
  scopeRef: string,
): Promise<Service7MlPredictionsResponse | null> {
  const url = `${S7_CI_ML_PREDICTIONS_PATH}?family=BATCH_ANOMALY&scope_type=BATCH&scope_ref=${encodeURIComponent(scopeRef)}`
  return fetchProdJsonGet<Service7MlPredictionsResponse>(url)
}

