/** Shown when a batch is selected but Intelligence returns tenant-wide KPIs (batch_id ignored server-side). */
export const BATCH_KPI_UNAVAILABLE = 'Not available for this batch'

/**
 * Leakage, ambiguity, and defensibility dashboards ignore `batch_id` today.
 * When a surface is batch-selected, hide tenant snapshots unless a batch-scoped override exists.
 */
export function isTenantIntelligenceKpiUnavailableForBatch(
  batchId: string | undefined,
  hasBatchScopedOverride = false,
): boolean {
  if (!batchId?.trim()) return false
  return !hasBatchScopedOverride
}
