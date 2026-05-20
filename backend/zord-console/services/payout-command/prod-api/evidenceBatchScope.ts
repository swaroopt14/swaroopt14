import { apiTrimmedString } from './coerceApiField'
import type { IntelligenceBatchRow } from './intelligenceTypes'
import { DEFAULT_EVIDENCE_BATCH_ID, evidenceMockFallbackEnabled } from './mockEvidencePacks'

/**
 * Evidence packs are keyed by batch_id in zord-evidence, but the console batch
 * dropdown is seeded from intelligence. Keep a user- or URL-pinned batch even
 * when intelligence has not projected that batch yet.
 */
export function pickEvidenceBatchId(
  intelligenceBatches: IntelligenceBatchRow[],
  preferredBatchId: string,
): string {
  const preferred = apiTrimmedString(preferredBatchId)
  if (!intelligenceBatches.length) return preferred || DEFAULT_EVIDENCE_BATCH_ID
  if (preferred) return preferred
  return apiTrimmedString(intelligenceBatches[0]?.batch_id) || DEFAULT_EVIDENCE_BATCH_ID
}

/** Ensures the active batch appears in the selector when it exists only in evidence. */
export function intelligenceBatchesForSelector(
  batches: IntelligenceBatchRow[],
  selectedBatchId: string,
  tenantId: string,
): IntelligenceBatchRow[] {
  const bid = apiTrimmedString(selectedBatchId)
  if (!batches.length && evidenceMockFallbackEnabled()) {
    const fallbackBid = bid || DEFAULT_EVIDENCE_BATCH_ID
    return [
      {
        batch_id: fallbackBid,
        tenant_id: tenantId,
        finality_status: 'PARTIALLY_SETTLED',
        total_count: 4,
        success_count: 3,
        failed_count: 0,
        pending_count: 1,
      },
    ]
  }
  if (!bid || batches.some((b) => apiTrimmedString(b.batch_id) === bid)) return batches
  return [
    {
      batch_id: bid,
      tenant_id: tenantId,
      finality_status: 'PENDING',
      total_count: 0,
      success_count: 0,
      failed_count: 0,
      pending_count: 0,
    },
    ...batches,
  ]
}
