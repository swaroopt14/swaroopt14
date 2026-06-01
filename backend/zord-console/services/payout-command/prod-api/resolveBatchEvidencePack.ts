import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackSummaryRow } from './evidenceTypes'
import { getEvidenceBatchLineageGraph } from './getEvidenceBatchLineageGraph'

/** Batch-level pack row derived from GET /v1/evidence/batch/:batchId/lineage-graph. */
export function batchPackSummaryFromLineage(
  batchId: string,
  lineage: NonNullable<Awaited<ReturnType<typeof getEvidenceBatchLineageGraph>>['data']>,
): EvidencePackSummaryRow | null {
  const packId = apiTrimmedString(lineage.evidence_pack_id)
  if (!packId) return null

  return {
    evidence_pack_id: packId,
    tenant_id: apiTrimmedString(lineage.tenant_id) || '—',
    intent_id: apiTrimmedString(lineage.intent_id) || undefined,
    batch_id: batchId,
    mode: 'BATCH_PROOF',
    pack_status: 'READY',
    merkle_root: apiTrimmedString(lineage.merkle_root) || '',
    ruleset_version: '1',
    created_at: new Date().toISOString(),
  }
}

export async function resolveBatchPackFromLineageGraph(
  batchId: string,
): Promise<EvidencePackSummaryRow | null> {
  const bid = apiTrimmedString(batchId)
  if (!bid) return null
  const { data } = await getEvidenceBatchLineageGraph(bid)
  if (!data?.evidence_pack_id) return null
  return batchPackSummaryFromLineage(bid, data)
}

export function isBatchEvidencePack(summary: EvidencePackSummaryRow): boolean {
  const intentId = apiTrimmedString(summary.intent_id)
  const mode = apiTrimmedString(summary.mode).toUpperCase()
  return !intentId && (mode.includes('BATCH') || mode === '')
}
