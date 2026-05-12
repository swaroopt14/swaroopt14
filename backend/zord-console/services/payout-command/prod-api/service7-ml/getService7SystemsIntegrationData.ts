import { fetchProdJsonGet } from '../fetchProdJsonGet'
import { withQuery } from './service7MlQuery'
import type { Service7KpiQuery, Service7MetricResponse } from './service7MlTypes'

export const S7_SYS_SOURCE_DEFECT_PATH = '/api/prod/intelligence/kpis/rca/source-defect'
export const S7_SYS_PARSER_WEAKNESS_PATH = '/api/prod/intelligence/kpis/rca/parser-weakness'
export const S7_SYS_MAPPING_WEAKNESS_PATH = '/api/prod/intelligence/kpis/rca/parser-weakness'
export const S7_SYS_DISPATCH_UPGRADE_PATH = '/api/prod/intelligence/recommendations/dispatch-upgrade'

export async function getService7SystemsSourceDefectRate(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_SYS_SOURCE_DEFECT_PATH, query))
}

export async function getService7SystemsParserWeaknessRate(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_SYS_PARSER_WEAKNESS_PATH, query))
}

/**
 * Mapping weakness currently uses the same endpoint family and is expected as a secondary field.
 */
export async function getService7SystemsMappingWeaknessRate(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_SYS_MAPPING_WEAKNESS_PATH, query))
}

export async function getService7SystemsDispatchUpgradeScore(
  query: Service7KpiQuery = {},
): Promise<Service7MetricResponse | null> {
  return fetchProdJsonGet<Service7MetricResponse>(withQuery(S7_SYS_DISPATCH_UPGRADE_PATH, query))
}

