import type { IntentDetail } from '@/services/payout-command/intent-journal-types'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'

export type BatchType = 'Disbursement' | 'Settlement'
export type BatchStatus = 'Strong' | 'Stable' | 'Risk' | 'Critical'

/** Customer-facing sidebar health labels (maps from legacy BatchStatus + DLQ context). */
export type CustomerBatchHealthLabel =
  | 'Ready'
  | 'Needs Review'
  | 'Awaiting Confirmation'
  | 'Failed Validation'

export function customerHealthLabelFromStatus(status: BatchStatus, dlqCount = 0): CustomerBatchHealthLabel {
  if (dlqCount > 0 || status === 'Critical') return 'Failed Validation'
  if (status === 'Risk') return 'Needs Review'
  if (status === 'Stable') return 'Awaiting Confirmation'
  return 'Ready'
}
export type BatchFilter = 'All Batches' | 'Recent' | 'Needs Attention' | 'High Value' | 'Completed'
export type SidebarMode = 'listed' | 'sectors'

export type BatchRecord = {
  batchId: string
  type: BatchType
  apiType?: string
  source: string
  totalValue: number
  transactions: number
  confirmedCount: number
  highConfidenceCount: number
  avgConfidenceScore?: number
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
  if (typeof batch.avgConfidenceScore === 'number' && Number.isFinite(batch.avgConfidenceScore)) {
    return Math.min(100, Math.max(0, batch.avgConfidenceScore * 100))
  }
  const total = Math.max(batch.transactions, 1)
  return (batch.confirmedCount / total) * 100
}

export function formatInrRupees(rupees: number): string {
  if (!Number.isFinite(rupees)) return '—'
  const r = Math.abs(rupees)
  if (r >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`
  if (r >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`
  if (r >= 1e3) return `₹${(rupees / 1e3).toFixed(1)} K`
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`
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
  if (batch.engineSidebar && typeof batch.avgConfidenceScore === 'number') {
    const confPct = batch.avgConfidenceScore * 100
    const penalty = ((batch.mismatchCount + batch.unresolvedCount) / total) * 30
    return Math.max(0, Math.min(100, Math.round(confPct - penalty)))
  }
  const base = ((batch.confirmedCount + batch.highConfidenceCount) / total) * 100
  const penalty = ((batch.mismatchCount + batch.unresolvedCount) / total) * 30
  return Math.max(0, Math.min(100, Math.round(base - penalty)))
}

export function batchStatus(score: number): BatchStatus {
  if (score > 95) return 'Strong'
  if (score >= 80) return 'Stable'
  if (score >= 60) return 'Risk'
  return 'Critical'
}

/** Intent-engine sidebar: API `highConfidenceCount` 0.48 → 48%. < 30% = Risk; < 80% = Risk; >= 80 Stable; > 95 Strong. */
export function confidencePctFromBatch(batch: BatchRecord): number | null {
  if (!batch.engineSidebar || typeof batch.avgConfidenceScore !== 'number' || !Number.isFinite(batch.avgConfidenceScore)) {
    return null
  }
  return Math.min(100, Math.max(0, Math.round(batch.avgConfidenceScore * 100)))
}

function batchStatusFromConfidencePct(pct: number): BatchStatus {
  if (pct > 95) return 'Strong'
  if (pct >= 80) return 'Stable'
  return 'Risk'
}

/** Map intelligence `finality_status` to sidebar health pill (live batches). */
function batchStatusFromFinality(fs: string | undefined): BatchStatus {
  const u = (fs ?? '').toUpperCase()
  if (u === 'SETTLED') return 'Strong'
  if (u === 'PARTIALLY_SETTLED') return 'Risk'
  if (u === 'PENDING') return 'Risk'
  if (u === 'FAILED' || u === 'CANCELLED' || u === 'REQUIRES_REVIEW') return 'Critical'
  return 'Stable'
}

/** Sidebar / overview health — uses loaded DLQ + intent counts when available. */
export function resolveBatchHealthStatus(
  batch: BatchRecord,
  opts?: { dlqCount?: number; intentCount?: number; finality?: string },
): BatchStatus {
  const dlq = Math.max(0, opts?.dlqCount ?? 0)
  const intents = Math.max(0, opts?.intentCount ?? 0)
  const attention = (batch.mismatchCount ?? 0) + (batch.unresolvedCount ?? 0)
  const ingestTotal = Math.max(batch.transactions, 0)
  const pipelineTotal = Math.max(intents + dlq, ingestTotal, 1)

  if (dlq > 0 && intents === 0) return 'Critical'
  if (dlq >= 10) return 'Critical'
  const dlqRatio = dlq / pipelineTotal
  if (dlqRatio >= 0.15) return 'Critical'
  if (dlq > 0 && dlqRatio >= 0.05) return 'Risk'
  if (batch.engineSidebar && ingestTotal > 0 && batch.confirmedCount === 0 && dlq > 0) return 'Critical'
  if (attention > 0 && attention >= ingestTotal && ingestTotal > 0) return 'Critical'
  if (attention > ingestTotal * 0.5 && ingestTotal > 0) return 'Critical'

  const fs = opts?.finality
  if (fs) {
    const fromFinality = batchStatusFromFinality(fs)
    if (fromFinality === 'Critical' || fromFinality === 'Risk') return fromFinality
  }

  const confPct = confidencePctFromBatch(batch)
  if (confPct != null) return batchStatusFromConfidencePct(confPct)

  return batchStatus(batchQualityScore(batch))
}

export function statusTone(status: BatchStatus) {
  if (status === 'Strong' || status === 'Stable') return { text: 'text-emerald-700', left: 'border-l-4 border-l-emerald-500', ring: '#16a34a' }
  if (status === 'Risk') return { text: 'text-amber-700', left: 'border-l-4 border-l-amber-500', ring: '#d97706' }
  return { text: 'text-rose-700', left: 'border-l-4 border-l-rose-600', ring: '#dc2626' }
}

