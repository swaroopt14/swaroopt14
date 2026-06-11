import type { IntentJournalBatchIdItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { JournalBatchRecord } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

/** Minimal sidebar row from batch-ids list (counts/value enriched after batch select). */
export function mapBatchIdItemToBatchRecord(item: IntentJournalBatchIdItem): JournalBatchRecord {
  const batchId = String(item.batch_id ?? '').trim() || '—'
  return {
    batchId,
    type: 'Disbursement',
    apiType: '—',
    source: 'Intent engine',
    totalValue: 0,
    transactions: 0,
    confirmedCount: 0,
    highConfidenceCount: 0,
    mismatchCount: 0,
    unresolvedCount: 0,
    engineSidebar: true,
  }
}

/** Merge derived metrics from payment-intents + dlq into a batch sidebar record. */
export function enrichBatchRecordWithMetrics(
  base: JournalBatchRecord,
  metrics: {
    instructionCount: number
    intendedValue: number
    batchAggregateConfidenceScore: number | null
    reviewCount: number
  },
): JournalBatchRecord {
  return {
    ...base,
    transactions: metrics.instructionCount,
    totalValue: metrics.intendedValue,
    aggregateConfidenceScore: metrics.batchAggregateConfidenceScore ?? undefined,
    unresolvedCount: metrics.reviewCount,
  }
}
