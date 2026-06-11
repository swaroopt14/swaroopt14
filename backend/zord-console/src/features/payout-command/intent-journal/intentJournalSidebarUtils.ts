import type { IntentDetail } from '@/services/payout-command/intent-journal-types'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'

export type BatchType = 'Disbursement' | 'Settlement'

/** Sidebar health from batch `aggregate_confidence_score` (0–1). */
export type BatchStatus = 'Stable' | 'At Risk' | 'Critical'

/** Aggregate score bands for sidebar status pills. */
export const BATCH_AGGREGATE_STATUS_THRESHOLDS = {
  /** Below 50% aggregate → Critical */
  criticalBelowPct: 50,
  /** 50%–75% aggregate → At Risk; 75%+ → Stable */
  stableFromPct: 75,
} as const

export const BATCH_AGGREGATE_STATUS_GUIDE =
  'Critical <50% · At Risk 50–75% · Stable ≥75% aggregate confidence'

/** Customer-facing sidebar health labels (maps from BatchStatus + DLQ context). */
export type CustomerBatchHealthLabel =
  | 'Ready'
  | 'Needs Review'
  | 'Awaiting Confirmation'
  | 'Failed Validation'

export function customerHealthLabelFromStatus(status: BatchStatus, dlqCount = 0): CustomerBatchHealthLabel {
  if (dlqCount > 0 || status === 'Critical') return 'Failed Validation'
  if (status === 'At Risk') return 'Needs Review'
  return 'Ready'
}

/** Map aggregate confidence (0–1 or 0–100) to sidebar status tier. */
export function batchStatusFromAggregateScore(score: number): BatchStatus {
  if (!Number.isFinite(score)) return 'At Risk'
  const pct = score <= 1 ? score * 100 : score
  if (pct < BATCH_AGGREGATE_STATUS_THRESHOLDS.criticalBelowPct) return 'Critical'
  if (pct < BATCH_AGGREGATE_STATUS_THRESHOLDS.stableFromPct) return 'At Risk'
  return 'Stable'
}
export type BatchFilter = 'All Batches' | 'Recent' | 'Needs Attention' | 'High Value' | 'Completed'

export type BatchRecord = {
  batchId: string
  type: BatchType
  apiType?: string
  source: string
  totalValue: number
  transactions: number
  confirmedCount: number
  highConfidenceCount: number
  /** Batch-level aggregate confidence 0–1 (`aggregate_confidence_score`). */
  aggregateConfidenceScore?: number
  mismatchCount: number
  unresolvedCount: number
  intelligenceCounts?: Pick<IntelligenceBatchRow, 'success_count' | 'failed_count' | 'pending_count' | 'finality_status'>
  engineSidebar?: boolean
}

export const BATCH_FILTERS: BatchFilter[] = ['All Batches', 'Recent', 'Needs Attention', 'High Value', 'Completed']
export const SIDEBAR_PAGE_SIZE = 8
export const JOURNAL_BORDER = 'border-slate-200/90'
export const JOURNAL_PANEL_BG = 'bg-[#f1f5f9]'

function usd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function usdCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function engineDispatchConfidencePct(batch: BatchRecord): number {
  if (typeof batch.aggregateConfidenceScore === 'number' && Number.isFinite(batch.aggregateConfidenceScore)) {
    return Math.min(100, Math.max(0, batch.aggregateConfidenceScore * 100))
  }
  const total = Math.max(batch.transactions, 1)
  return (batch.confirmedCount / total) * 100
}

import { fmtInrFull } from '../command-center/commandCenterFormat'

export function formatInrRupees(rupees: number): string {
  return fmtInrFull(rupees, { decimals: 0 })
}

/**
 * Batch quality score per Service 7 KPI doc §4.5:
 *   0.25*avg_intent_quality + 0.20*avg_matchability + 0.20*avg_proof_readiness
 *   + 0.15*(1-dup_rate) + 0.10*carrier_completeness + 0.10*parse_success
 *
 * Requires per-intent canonical scores (Service 2 §12). When intents aren't
 * loaded (sidebar list before drilldown), fall back to the legacy proxy from
 * batch row counts so the sidebar still ranks reasonably.
 */
export function batchQualityScore(batch: BatchRecord, intents?: IntentDetail[]): number {
  // Live intents from /api/prod may not yet carry the Service 2 enrichment block
  // (scores / idempotency / mapping). Bail to the row-count fallback in that case
  // instead of crashing the whole surface.
  const hasScores = intents && intents.length > 0 && intents.every((x) => x?.scores && x?.idempotency && x?.mapping)
  if (hasScores) {
    const n = intents!.length
    const avgIntentQuality = intents!.reduce((s, x) => s + x.scores.intentQualityScore, 0) / n
    const avgMatchability = intents!.reduce((s, x) => s + x.scores.matchabilityScore, 0) / n
    const avgProofReadiness = intents!.reduce((s, x) => s + x.scores.proofReadinessScore, 0) / n
    const dupRate = intents!.filter((x) => x.idempotency.duplicateRiskFlag).length / n
    const carrierCompleteness = (intents!.filter((x) => x.clientPayoutRef !== null).length / n) * 100
    const parseSuccess = (intents!.filter((x) => !x.mapping.mappingUncertainFlag).length / n) * 100
    const score =
      0.25 * avgIntentQuality +
      0.20 * avgMatchability +
      0.20 * avgProofReadiness +
      0.15 * (1 - dupRate) * 100 +
      0.10 * carrierCompleteness +
      0.10 * parseSuccess
    return Math.max(0, Math.min(100, Math.round(score)))
  }
  // Intelligence list rows: use API success / failed / pending for a stable sidebar score.
  if (batch.intelligenceCounts) {
    const total = Math.max(batch.transactions, 1)
    const { success_count: s, failed_count: f, pending_count: p } = batch.intelligenceCounts
    const remainder = Math.max(0, total - s - f - p)
    const score =
      (s / total) * 100 - (f / total) * 28 - (p / total) * 12 - (remainder / total) * 18
    return Math.max(0, Math.min(100, Math.round(score)))
  }
  // Intent-engine sidebar: `highConfidenceCount` in API is avg confidence 0–1.
  const total = Math.max(batch.transactions, 1)
  if (batch.engineSidebar && typeof batch.aggregateConfidenceScore === 'number') {
    const confPct = batch.aggregateConfidenceScore * 100
    const penalty = ((batch.mismatchCount + batch.unresolvedCount) / total) * 30
    return Math.max(0, Math.min(100, Math.round(confPct - penalty)))
  }
  const base = ((batch.confirmedCount + batch.highConfidenceCount) / total) * 100
  const penalty = ((batch.mismatchCount + batch.unresolvedCount) / total) * 30
  return Math.max(0, Math.min(100, Math.round(base - penalty)))
}

export function batchStatus(score: number): BatchStatus {
  return batchStatusFromAggregateScore(score)
}

/** Sidebar batch score: intent-engine `aggregate_confidence_score` only (0–1 → percent). */
export function confidencePctFromBatch(batch: BatchRecord): number | null {
  if (typeof batch.aggregateConfidenceScore !== 'number' || !Number.isFinite(batch.aggregateConfidenceScore)) {
    return null
  }
  const pct = batch.aggregateConfidenceScore <= 1
    ? batch.aggregateConfidenceScore * 100
    : batch.aggregateConfidenceScore
  return Math.min(100, Math.max(0, Math.round(pct)))
}

function batchStatusFromConfidencePct(pct: number): BatchStatus {
  return batchStatusFromAggregateScore(pct)
}

/** Map intelligence `finality_status` to sidebar health pill (live batches). */
function batchStatusFromFinality(fs: string | undefined): BatchStatus {
  const u = (fs ?? '').toUpperCase()
  if (u === 'SETTLED') return 'Stable'
  if (u === 'PARTIALLY_SETTLED') return 'At Risk'
  if (u === 'PENDING') return 'At Risk'
  if (u === 'FAILED' || u === 'CANCELLED' || u === 'REQUIRES_REVIEW') return 'Critical'
  return 'Stable'
}

/** DLQ volume can elevate status but not downgrade aggregate-based tiers. */
function elevateStatusForDlq(status: BatchStatus, dlq: number, intents: number, pipelineTotal: number): BatchStatus {
  if (dlq > 0 && intents === 0) return 'Critical'
  if (dlq >= 10) return 'Critical'
  const dlqRatio = dlq / Math.max(pipelineTotal, 1)
  if (dlqRatio >= 0.15) return 'Critical'
  if (dlq > 0 && dlqRatio >= 0.05) return status === 'Stable' ? 'At Risk' : status
  if (dlq > 0 && status === 'Stable') return 'At Risk'
  return status
}

/** Sidebar health — primary signal is `aggregate_confidence_score`; DLQ can elevate tier. */
export function resolveBatchHealthStatus(
  batch: BatchRecord,
  opts?: { dlqCount?: number; intentCount?: number; finality?: string },
): BatchStatus {
  const dlq = Math.max(0, opts?.dlqCount ?? 0)
  const intents = Math.max(0, opts?.intentCount ?? 0)
  const attention = (batch.mismatchCount ?? 0) + (batch.unresolvedCount ?? 0)
  const ingestTotal = Math.max(batch.transactions, intents, 0)
  const pipelineTotal = Math.max(intents + dlq, ingestTotal, 1)

  if (batch.engineSidebar && ingestTotal > 0 && batch.confirmedCount === 0 && dlq > 0) {
    return 'Critical'
  }
  if (attention > 0 && attention >= ingestTotal && ingestTotal > 0) return 'Critical'
  if (attention > ingestTotal * 0.5 && ingestTotal > 0) return 'Critical'

  const confPct = confidencePctFromBatch(batch)
  if (confPct != null) {
    return elevateStatusForDlq(batchStatusFromConfidencePct(confPct), dlq, intents, pipelineTotal)
  }

  const fs = opts?.finality
  if (fs) {
    const fromFinality = batchStatusFromFinality(fs)
    return elevateStatusForDlq(fromFinality, dlq, intents, pipelineTotal)
  }

  if (dlq === 0 && attention === 0 && intents === 0 && ingestTotal === 0) {
    return 'Stable'
  }

  return elevateStatusForDlq(batchStatus(batchQualityScore(batch)), dlq, intents, pipelineTotal)
}

export function statusTone(status: BatchStatus) {
  if (status === 'Stable') {
    return { text: 'text-emerald-700', left: 'border-l-4 border-l-emerald-500', ring: '#16a34a' }
  }
  if (status === 'At Risk') {
    return { text: 'text-amber-700', left: 'border-l-4 border-l-amber-500', ring: '#d97706' }
  }
  return { text: 'text-rose-700', left: 'border-l-4 border-l-rose-600', ring: '#dc2626' }
}

