import { fetchProdJsonGet } from '../fetchProdJsonGet'
import { withQuery } from './service7MlQuery'
import type { Service7KpiQuery, Service7MetricResponse, Service7MlPredictionsResponse } from './service7MlTypes'

export const S7_EV_DEFENSIBILITY_PATH = '/api/prod/intelligence/kpis/evidence/defensibility'
export const S7_EV_WEAK_RATE_PATH = '/api/prod/intelligence/kpis/evidence/weak-rate'
export const S7_EV_PACK_COVERAGE_PATH = '/api/prod/intelligence/kpis/evidence/coverage'
export const S7_EV_GOVERNANCE_COVERAGE_PATH = '/api/prod/intelligence/kpis/evidence/governance-coverage'
export const S7_EV_REPLAY_EQ_PATH = '/api/prod/intelligence/kpis/evidence/replay-equivalence'
export const S7_EV_ML_PREDICTIONS_PATH = '/api/prod/intelligence/ml/predictions'

export async function getService7EvidenceDefensibility(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_EV_DEFENSIBILITY_PATH, query))
}

export async function getService7EvidenceWeakRate(query: Service7KpiQuery = {}): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_EV_WEAK_RATE_PATH, query))
}

export async function getService7EvidencePackCoverage(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_EV_PACK_COVERAGE_PATH, query))
}

export async function getService7EvidenceGovernanceCoverage(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_EV_GOVERNANCE_COVERAGE_PATH, query))
}

export async function getService7EvidenceReplayEquivalence(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_EV_REPLAY_EQ_PATH, query))
}

export async function getService7DefensibilityWeaknessPredictions(
  scopeRef: string,
): Promise<Service7MlPredictionsResponse | null> {
  const url = `${S7_EV_ML_PREDICTIONS_PATH}?family=DEFENSIBILITY_WEAKNESS&scope_type=INTENT&scope_ref=${encodeURIComponent(scopeRef)}`
  return fetchProdJsonGet<Service7MlPredictionsResponse>(url)
}

