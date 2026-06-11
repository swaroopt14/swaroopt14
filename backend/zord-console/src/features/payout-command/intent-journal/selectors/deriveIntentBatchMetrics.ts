import type { IntentJournalPaymentIntentItem, IntentJournalDlqItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import { READINESS_REVIEW_THRESHOLD } from '../mappers/mapIntentTableRow'

export type IntentBatchMetrics = {
  instructionCount: number
  intendedValue: number
  avgReadinessPct: number | null
  /** Batch aggregate from intent-engine `aggregate_confidence_score` (0–1). */
  batchAggregateConfidenceScore: number | null
  lowReadinessCount: number
  dlqCount: number
  manualReviewCount: number
  needsReviewCount: number
}

function parseAmount(raw: string | number | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const n = Number.parseFloat(String(raw ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function deriveIntentBatchMetrics(
  paymentIntents: IntentJournalPaymentIntentItem[],
  dlqItems: IntentJournalDlqItem[],
): IntentBatchMetrics {
  const instructionCount = paymentIntents.length
  // Sum via integer milli-rupees (3 dp) to eliminate float-drift over large batches.
  // JS floating-point accumulation across 1000s of additions can drift by ~₹1+;
  // rounding each amount to the nearest 0.001 before summing keeps the result
  // consistent with a spreadsheet sum of the same values.
  const intendedValueMillis = paymentIntents.reduce(
    (sum, item) => sum + Math.round(parseAmount(item.amount) * 1000),
    0,
  )
  const intendedValue = intendedValueMillis / 1000

  const readScore = (raw: unknown): number | null => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string' && raw.trim()) {
      const n = Number.parseFloat(raw)
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  const scores = paymentIntents
    .map((item) => readScore(item.intent_quality_score))
    .filter((s): s is number => s != null)

  const avgReadinessPct =
    scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 100 : null

  const batchAggregateConfidenceScore =
    paymentIntents.map((item) => readScore(item.aggregate_confidence_score)).find((s) => s != null) ?? null

  const lowReadinessCount = paymentIntents.filter((item) => {
    const score = readScore(item.intent_quality_score)
    return score != null && score < READINESS_REVIEW_THRESHOLD
  }).length

  const dlqCount = dlqItems.length
  const manualReviewCount = dlqItems.filter(
    (item) => String(item.dlq_status ?? '').trim() === 'NEEDS_MANUAL_REVIEW',
  ).length
  const needsReviewCount = dlqCount + lowReadinessCount

  return {
    instructionCount,
    intendedValue,
    avgReadinessPct,
    batchAggregateConfidenceScore,
    lowReadinessCount,
    dlqCount,
    manualReviewCount,
    needsReviewCount,
  }
}

export type IntentBatchHealthStatus = 'Ready' | 'Needs Review' | 'Awaiting Confirmation' | 'Failed Validation'

export function deriveIntentBatchHealth(metrics: IntentBatchMetrics): {
  status: IntentBatchHealthStatus
  reasons: string[]
} {
  const reasons: string[] = []
  if (metrics.dlqCount > 0) {
    reasons.push(`${metrics.dlqCount} review item${metrics.dlqCount === 1 ? '' : 's'} in DLQ`)
  }
  if (metrics.lowReadinessCount > 0) {
    reasons.push(`${metrics.lowReadinessCount} instruction${metrics.lowReadinessCount === 1 ? '' : 's'} below readiness threshold`)
  }

  if (metrics.dlqCount > 0) {
    return { status: 'Failed Validation', reasons }
  }
  if (metrics.needsReviewCount > 0) {
    return { status: 'Needs Review', reasons }
  }
  if (metrics.instructionCount > 0 && metrics.dlqCount === 0 && metrics.lowReadinessCount === 0) {
    return { status: 'Ready', reasons: ['All instructions passed validation'] }
  }
  if (metrics.instructionCount > 0) {
    return { status: 'Awaiting Confirmation', reasons: ['Payment instructions received — awaiting bank confirmation'] }
  }
  return { status: 'Ready', reasons: [] }
}
