import { fetchProdJsonGet } from '../fetchProdJsonGet'
import { withQuery } from './service7MlQuery'
import type { Service7KpiQuery, Service7MetricResponse, Service7MlPredictionsResponse } from './service7MlTypes'

export const S7_PROOF_FAILURE_REASONS_PATH = '/api/prod/intelligence/kpis/rca/by-reason'
export const S7_PROOF_ML_PREDICTIONS_PATH = '/api/prod/intelligence/ml/predictions'

export async function getService7ProofFailureReasons(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_PROOF_FAILURE_REASONS_PATH, query))
}

export async function getService7ProofQueueDepthAnomalyPredictions(
  scopeRef: string,
): Promise<Service7MlPredictionsResponse | null> {
  const url = `${S7_PROOF_ML_PREDICTIONS_PATH}?family=BATCH_ANOMALY&scope_type=BATCH&scope_ref=${encodeURIComponent(scopeRef)}`
  return fetchProdJsonGet<Service7MlPredictionsResponse>(url)
}

