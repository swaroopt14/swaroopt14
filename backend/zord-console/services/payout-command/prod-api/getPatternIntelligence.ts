import { fetchProdJsonGet } from './fetchProdJsonGet'
import { apiTrimmedString } from './coerceApiField'
import type { IntelligenceDateQuery } from './getIntelligenceKpis'
import type { PatternDetailResponse, PatternHistoryResponse } from './intelligencePatternTypes'

const INTEL_BASE = '/api/prod/intelligence'

function intelQueryPath(path: string, extraQuery: Record<string, string> = {}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(extraQuery)) {
    if (v) params.set(k, v)
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

function dateQueryExtra(dates?: IntelligenceDateQuery): Record<string, string> {
  if (!dates) return {}
  return { from_date: dates.from_date, to_date: dates.to_date }
}

export async function getPatternDetail(
  dates?: IntelligenceDateQuery,
  batchId?: string,
): Promise<PatternDetailResponse | null> {
  const extra = dateQueryExtra(dates)
  const bid = apiTrimmedString(batchId)
  if (bid) extra.batch_id = bid
  return fetchProdJsonGet<PatternDetailResponse>(
    intelQueryPath(`${INTEL_BASE}/pattern`, extra),
  )
}

export async function getPatternHistory(
  dates?: IntelligenceDateQuery,
  limit = 5,
  batchId?: string,
): Promise<PatternHistoryResponse | null> {
  const extra = dateQueryExtra(dates)
  extra.limit = String(limit)
  const bid = apiTrimmedString(batchId)
  if (bid) extra.batch_id = bid
  return fetchProdJsonGet<PatternHistoryResponse>(
    intelQueryPath(`${INTEL_BASE}/pattern/history`, extra),
  )
}

export function patternDataFrom(
  detail: PatternDetailResponse | null,
  history: PatternHistoryResponse | null,
) {
  if (detail?.data_available === true && detail.data) return detail.data
  return history?.snapshots?.find((snapshot) => snapshot.snapshot_json)?.snapshot_json ?? null
}
