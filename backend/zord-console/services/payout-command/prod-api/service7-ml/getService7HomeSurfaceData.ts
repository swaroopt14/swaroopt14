import { fetchProdJsonGet } from '../fetchProdJsonGet'
import { withQuery } from './service7MlQuery'
import type { Service7KpiQuery, Service7MetricResponse } from './service7MlTypes'

export const S7_HOME_INTENDED_VOLUME_PATH = '/api/prod/intelligence/kpis/leakage/intended-volume'
export const S7_HOME_OBSERVED_VOLUME_PATH = '/api/prod/intelligence/kpis/leakage/observed-volume'
export const S7_HOME_UNMATCHED_PATH = '/api/prod/intelligence/kpis/leakage/unmatched'
export const S7_HOME_AMBIGUOUS_VAR_PATH = '/api/prod/intelligence/kpis/leakage/ambiguous-var'
export const S7_HOME_SETTLEMENT_DELAY_PATH = '/api/prod/intelligence/kpis/pattern/settlement-delay'

export async function getService7HomeIntendedVolume(query: Service7KpiQuery = {}): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_HOME_INTENDED_VOLUME_PATH, query))
}

export async function getService7HomeObservedSettledVolume(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_HOME_OBSERVED_VOLUME_PATH, query))
}

export async function getService7HomeUnmatchedIntentAmount(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_HOME_UNMATCHED_PATH, query))
}

export async function getService7HomeAmbiguousVar(query: Service7KpiQuery = {}): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_HOME_AMBIGUOUS_VAR_PATH, query))
}

export async function getService7HomeSettlementDelayP95(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_HOME_SETTLEMENT_DELAY_PATH, query))
}

