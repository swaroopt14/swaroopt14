import { fetchProdJsonGet } from './fetchProdJsonGet'
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

function withTenant(path: string, tenantId: string, extraQuery: Record<string, string> = {}) {
  const params = new URLSearchParams({ tenant_id: tenantId.trim() })
  for (const [k, v] of Object.entries(extraQuery)) {
    if (v) params.set(k, v)
  }
  return `${path}?${params.toString()}`
}

export async function getLeakageKpis(tenantId: string): Promise<LeakageKpiResponse | null> {
  if (!tenantId.trim()) return null
  return fetchProdJsonGet<LeakageKpiResponse>(withTenant(`${INTEL_BASE}/leakage`, tenantId))
}

export async function getAmbiguityKpis(tenantId: string): Promise<AmbiguityKpiResponse | null> {
  if (!tenantId.trim()) return null
  return fetchProdJsonGet<AmbiguityKpiResponse>(withTenant(`${INTEL_BASE}/ambiguity`, tenantId))
}

export async function getDefensibilityKpis(tenantId: string): Promise<DefensibilityKpiResponse | null> {
  if (!tenantId.trim()) return null
  return fetchProdJsonGet<DefensibilityKpiResponse>(withTenant(`${INTEL_BASE}/defensibility`, tenantId))
}

export async function getPatternsKpis(
  tenantId: string,
  batchId?: string,
): Promise<PatternsKpiResponse | null> {
  if (!tenantId.trim()) return null
  const path = batchId
    ? withTenant(`${INTEL_BASE}/patterns`, tenantId, { batch_id: batchId })
    : withTenant(`${INTEL_BASE}/patterns`, tenantId)
  return fetchProdJsonGet<PatternsKpiResponse>(path)
}

export async function getRecommendationsKpis(
  tenantId: string,
): Promise<RecommendationsKpiResponse | null> {
  if (!tenantId.trim()) return null
  return fetchProdJsonGet<RecommendationsKpiResponse>(
    withTenant(`${INTEL_BASE}/recommendations`, tenantId),
  )
}

export type BatchesListOptions = {
  status?: FinalityStatus | ''
  limit?: number
}

export async function getIntelligenceBatches(
  tenantId: string,
  opts: BatchesListOptions = {},
): Promise<BatchesListResponse | null> {
  if (!tenantId.trim()) return null
  const extra: Record<string, string> = {}
  if (opts.status) extra.status = opts.status
  if (opts.limit) extra.limit = String(opts.limit)
  return fetchProdJsonGet<BatchesListResponse>(withTenant(`${INTEL_BASE}/batches`, tenantId, extra))
}

export async function getIntelligenceBatchDetail(
  tenantId: string,
  batchId: string,
): Promise<BatchDetailResponse | null> {
  if (!tenantId.trim() || !batchId.trim()) return null
  return fetchProdJsonGet<BatchDetailResponse>(
    withTenant(`${INTEL_BASE}/batches/${encodeURIComponent(batchId.trim())}`, tenantId),
  )
}
