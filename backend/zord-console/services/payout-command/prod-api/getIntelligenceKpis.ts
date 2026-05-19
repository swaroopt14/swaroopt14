import { fetchProdJsonGet } from './fetchProdJsonGet'
import { apiTrimmedString } from './coerceApiField'
import type {
  AmbiguityKpiResponse,
  BatchDetailResponse,
  BatchesListResponse,
  DefensibilityKpiResponse,
  FinalityStatus,
  LeakageKpiResponse,
  PatternsKpiResponse,
  RecommendationsKpiResponse,
} from './intelligenceTypes'

const INTEL_BASE = '/api/prod/intelligence'

/** BFF injects tenant from session; client must not send tenant_id. */
function intelQueryPath(path: string, extraQuery: Record<string, string> = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(extraQuery)) {
    if (v) params.set(k, v)
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/** Tenant-wide leakage KPI — BFF injects session tenant. */
export async function getLeakageKpis(): Promise<LeakageKpiResponse | null> {
  return fetchProdJsonGet<LeakageKpiResponse>(intelQueryPath(`${INTEL_BASE}/leakage`))
}

export async function getAmbiguityKpis(): Promise<AmbiguityKpiResponse | null> {
  return fetchProdJsonGet<AmbiguityKpiResponse>(intelQueryPath(`${INTEL_BASE}/ambiguity`))
}

export async function getDefensibilityKpis(): Promise<DefensibilityKpiResponse | null> {
  return fetchProdJsonGet<DefensibilityKpiResponse>(intelQueryPath(`${INTEL_BASE}/defensibility`))
}

/** Patterns KPI — optional `batch_id` scopes anomaly to one batch; omit for latest tenant snapshot. */
export async function getPatternsKpis(batchId?: string): Promise<PatternsKpiResponse | null> {
  const bid = apiTrimmedString(batchId)
  const path = bid
    ? intelQueryPath(`${INTEL_BASE}/patterns`, { batch_id: bid })
    : intelQueryPath(`${INTEL_BASE}/patterns`)
  return fetchProdJsonGet<PatternsKpiResponse>(path)
}

export async function getRecommendationsKpis(): Promise<RecommendationsKpiResponse | null> {
  return fetchProdJsonGet<RecommendationsKpiResponse>(intelQueryPath(`${INTEL_BASE}/recommendations`))
}

export type BatchesListOptions = {
  status?: FinalityStatus | ''
  limit?: number
}

/** Intelligence batch list — BFF injects session tenant (no client tenant_id). */
export async function getIntelligenceBatches(
  opts: BatchesListOptions = {},
): Promise<BatchesListResponse | null> {
  const extra: Record<string, string> = {}
  if (opts.status) extra.status = opts.status
  if (opts.limit) extra.limit = String(opts.limit)
  return fetchProdJsonGet<BatchesListResponse>(intelQueryPath(`${INTEL_BASE}/batches`, extra))
}

/** Per-batch intelligence snapshot — BFF injects session tenant. */
export async function getIntelligenceBatchDetail(batchId: string): Promise<BatchDetailResponse | null> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return null
  return fetchProdJsonGet<BatchDetailResponse>(
    intelQueryPath(`${INTEL_BASE}/batches/${encodeURIComponent(bid)}`),
  )
}
