import type { IntentJournalPaymentIntentItem, IntentJournalDlqItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import { READINESS_REVIEW_THRESHOLD } from '../mappers/mapIntentTableRow'

export type IntentBatchMetrics = {
  instructionCount: number
  intendedValue: number
  avgReadinessPct: number | null
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
  const intendedValue = paymentIntents.reduce((sum, item) => sum + parseAmount(item.amount), 0)

  const scores = paymentIntents
    .map((item) => item.intent_quality_score)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s))

  const avgReadinessPct =
    scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length) * 100 : null

  const lowReadinessCount = paymentIntents.filter(
    (item) =>
      typeof item.intent_quality_score === 'number' &&
      item.intent_quality_score < READINESS_REVIEW_THRESHOLD,
  ).length

  const dlqCount = dlqItems.length
  const manualReviewCount = dlqItems.filter(
    (item) => String(item.dlq_status ?? '').trim() === 'NEEDS_MANUAL_REVIEW',
  ).length
  const needsReviewCount = dlqCount + lowReadinessCount

  return {
    instructionCount,
    intendedValue,
    avgReadinessPct,
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
  if (metrics.instructionCount > 0) {
    return { status: 'Awaiting Confirmation', reasons: ['Payment instructions received — awaiting bank confirmation'] }
  }
  return { status: 'Ready', reasons: [] }
}
