import { fetchProdJsonGet } from '../fetchProdJsonGet'
import { withQuery } from './service7MlQuery'
import type { Service7KpiQuery, Service7MetricResponse } from './service7MlTypes'

export const S7_AL_LEAKAGE_SUMMARY_PATH = '/api/prod/intelligence/kpis/leakage/summary'
export const S7_AL_UNMATCHED_PATH = '/api/prod/intelligence/kpis/leakage/unmatched'
export const S7_AL_AMBIGUOUS_VAR_PATH = '/api/prod/intelligence/kpis/leakage/ambiguous-var'
export const S7_AL_UNDER_SETTLEMENT_PATH = '/api/prod/intelligence/kpis/leakage/under-settlement'
export const S7_AL_AMBIGUITY_RATE_PATH = '/api/prod/intelligence/kpis/ambiguity/rate'
export const S7_AL_AMOUNT_RATE_PATH = '/api/prod/intelligence/kpis/ambiguity/amount-rate'
export const S7_AL_VALUE_DATE_MISMATCH_PATH = '/api/prod/intelligence/kpis/pattern/settlement-delay'

export async function getService7LeakageSummary(query: Service7KpiQuery = {}): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_AL_LEAKAGE_SUMMARY_PATH, query))
}

export async function getService7LeakageUnmatched(query: Service7KpiQuery = {}): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_AL_UNMATCHED_PATH, query))
}

export async function getService7LeakageAmbiguousVar(query: Service7KpiQuery = {}): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_AL_AMBIGUOUS_VAR_PATH, query))
}

export async function getService7LeakageUnderSettlement(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_AL_UNDER_SETTLEMENT_PATH, query))
}

export async function getService7LeakageAmbiguityRate(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_AL_AMBIGUITY_RATE_PATH, query))
}

export async function getService7LeakageAmbiguousAmountRate(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_AL_AMOUNT_RATE_PATH, query))
}

export async function getService7LeakageValueDateMismatchRate(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_AL_VALUE_DATE_MISMATCH_PATH, query))
}

