import { apiTrimmedString } from './coerceApiField'
import { fetchProdJsonGetWithMeta } from './fetchProdJsonGet'
import type { EvidencePackTimelineResponse } from './evidenceTypes'

const EVIDENCE_BASE = '/api/prod/evidence'

export async function getEvidencePackTimeline(
  packId: string,
): Promise<{ data: EvidencePackTimelineResponse | null; error?: string }> {
  const pid = apiTrimmedString(packId)
  if (!pid) return { data: null, error: 'Missing pack id' }

  const path = `${EVIDENCE_BASE}/packs/${encodeURIComponent(pid)}/timeline`
  const res = await fetchProdJsonGetWithMeta<EvidencePackTimelineResponse>(path)
  if (!res.ok) {
    return {
      data: null,
      error: res.errorText?.trim().slice(0, 280) || `Timeline failed (${res.status || 'network'})`,
    }
  }
  return { data: res.data }
}
