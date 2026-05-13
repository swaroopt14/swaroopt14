'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EntityLogo } from '../entity-logo'
import { SandboxBatchNotice } from '../intent-journal/SandboxBatchNotice'
import { SandboxSeededSection } from '../intent-journal/SandboxSeededSection'
import {
  BankingInformationTokensBlock,
} from '../intent-journal/IntentDrawerSections'
import { getIntentJournalBatches, getIntentJournalFailures, getIntentJournalIntents } from '@/services/payout-command/model'
import { getCannedIntentDetail } from '@/services/payout-command/intent-journal-mocks'
import type { IntentDetail } from '@/services/payout-command/intent-journal-types'
import { getProdDlqPage } from '@/services/payout-command/prod-api/getProdDlqPage'
import { getProdIntentDetail } from '@/services/payout-command/prod-api/getProdIntentDetail'
import { buildLiveIntentDetailFromRowAndApi } from '@/services/payout-command/liveJournalIntentDetail'
import { getProdIntentsPage } from '@/services/payout-command/prod-api/getProdIntentsPage'
import {
  getIntelligenceBatchDetail,
  getIntelligenceBatches,
} from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { BatchDetailResponse, IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import type { ApiDlqRow, ApiIntentRow, ApiProdIntentDetailPayload } from '@/services/payout-command/prod-api/prodApiTypes'
import { useSeededBatches } from '@/services/payout-command/seeded-batches-store'
import { tokenizeBeneficiaryShort } from '@/services/payout-command/tokenize'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'

type BatchType = 'Disbursement' | 'Settlement'
type BatchStatus = 'Strong' | 'Stable' | 'Risk' | 'Critical'
type BatchFilter = 'All Batches' | 'Recent' | 'Needs Attention' | 'High Value' | 'Completed'
type TabKey = 'transactions' | 'failures'
type IntentStatus = 'Confirmed' | 'Pending' | 'Needs Review' | 'In Progress'
type IntentMatch = 'Matched' | 'Likely Matched' | 'Awaiting' | 'Mismatch' | 'Not Found'
type SidebarMode = 'listed' | 'sectors'

type BatchRecord = {
  batchId: string
  type: BatchType
  source: string
  totalValue: number
  transactions: number
  confirmedCount: number
  highConfidenceCount: number
  mismatchCount: number
  unresolvedCount: number
  /** Authoritative counts from `GET /v1/intelligence/batches` when present. */
  intelligenceCounts?: Pick<IntelligenceBatchRow, 'success_count' | 'failed_count' | 'pending_count' | 'finality_status'>
}

type IntentRow = {
  batchId: string
  requestId: string
  reference: string
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH'
  status: IntentStatus
  match: IntentMatch
  lastUpdated: string
  paymentPartner: 'Razorpay' | 'Cashfree' | 'PayU'
  bank: 'HDFC Bank' | 'ICICI Bank' | 'SBI'
}

type FailureRow = {
  batchId: string
  requestId: string
  reference: string
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH'
  paymentPartner: IntentRow['paymentPartner']
  failureReason: string
  failureStage: 'Validation' | 'Dispatch' | 'Processing' | 'Settlement'
  lastUpdated: string
  action: 'Retry' | 'Fix Details' | 'Investigate' | 'Escalate' | 'Fix Mandate'
}

type DateRangePreset = 'all' | '7d' | '30d' | '90d' | 'ytd'

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
]

/** Quick presets (sandbox / layout); live table does not yet filter by these ranges. */
const OVERVIEW_QUICK_RANGES: { label: string; value: DateRangePreset }[] = [
  { label: '1W', value: '7d' },
  { label: '1M', value: '30d' },
  { label: '3W', value: '90d' },
  { label: 'YTD', value: 'ytd' },
  { label: 'Total', value: 'all' },
]

const CONNECTOR_OPTIONS: Array<'All' | IntentRow['paymentPartner']> = ['All', 'Razorpay', 'Cashfree', 'PayU']

const DISPATCH_OPTIONS: Array<'All' | IntentRow['method']> = ['All', 'Bank Transfer', 'LSM', 'NACH']

const AMOUNT_RANGE_OPTIONS = ['All', 'Under $1,500', '$1,500 – $2,000', 'Over $2,000'] as const
type AmountRangeFilter = (typeof AMOUNT_RANGE_OPTIONS)[number]

const filterSelectClass =
  'h-9 w-full min-w-[7.5rem] rounded-lg border border-black/10 bg-[#f7fbff] px-2.5 text-[13px] text-[#111827] shadow-sm outline-none transition focus:border-[#6366f1]/50 focus:bg-white focus:ring-2 focus:ring-[#6366f1]/20'

const filterInputClass =
  'h-9 w-full rounded-lg border border-black/10 bg-[#f7fbff] px-3 text-[13px] text-[#111827] shadow-sm outline-none transition placeholder:text-[#94a3b8] focus:border-[#6366f1]/50 focus:bg-white focus:ring-2 focus:ring-[#6366f1]/20'

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'transactions', label: 'Intents' },
  { key: 'failures', label: 'Failures' },
]

const BATCH_FILTERS: BatchFilter[] = ['All Batches', 'Recent', 'Needs Attention', 'High Value', 'Completed']
const ROW_SIZE_OPTIONS = [15, 30, 50] as const
const SIDEBAR_PAGE_SIZE = 8

function usd(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function usdCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatInrRupees(rupees: number): string {
  if (!Number.isFinite(rupees)) return '—'
  const r = Math.abs(rupees)
  if (r >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`
  if (r >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`
  if (r >= 1e3) return `₹${(rupees / 1e3).toFixed(1)} K`
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`
}

function inferBatchSource(batchId: string, finality?: string): string {
  const id = batchId.toLowerCase()
  if (id.includes('bulk') || id.includes('upload') || id.includes('file')) return 'Bulk ingest'
  if (finality === 'REQUIRES_REVIEW') return 'Intelligence · review'
  return 'Intelligence'
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
function batchQualityScore(batch: BatchRecord, intents?: IntentDetail[]): number {
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
  // Fallback proxy when per-intent scores aren't available (sidebar canned rows).
  const total = Math.max(batch.transactions, 1)
  const base = ((batch.confirmedCount + batch.highConfidenceCount) / total) * 100
  const penalty = ((batch.mismatchCount + batch.unresolvedCount) / total) * 30
  return Math.max(0, Math.min(100, Math.round(base - penalty)))
}

function batchStatus(score: number): BatchStatus {
  if (score > 95) return 'Strong'
  if (score >= 80) return 'Stable'
  if (score >= 60) return 'Risk'
  return 'Critical'
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

function statusTone(status: BatchStatus) {
  if (status === 'Strong' || status === 'Stable') return { text: 'text-emerald-700', left: 'border-l-4 border-l-emerald-500', ring: '#16a34a' }
  if (status === 'Risk') return { text: 'text-amber-700', left: 'border-l-4 border-l-amber-500', ring: '#d97706' }
  return { text: 'text-rose-700', left: 'border-l-4 border-l-rose-600', ring: '#dc2626' }
}

function intentStatusClass(status: IntentStatus) {
  if (status === 'Confirmed') return 'text-emerald-700'
  if (status === 'Pending') return 'text-amber-600'
  if (status === 'Needs Review') return 'text-orange-600'
  if (status === 'In Progress') return 'text-sky-700'
  return 'text-slate-700'
}

function intentStatusLabel(status: IntentStatus) {
  return status
}

function paymentMaskFromRequestId(requestId: string) {
  const numeric = requestId.replace(/\D/g, '')
  const tail = numeric.slice(-4).padStart(4, '0')
  return `•••• ${tail}`
}

/**
 * Stripe-style beneficiary tokenization for the intent table cell.
 * Same intent ID always tokenizes the same way (deterministic from the
 * request ID seed).
 */
function tokenizeFromIntentId(requestId: string, bank: string): string {
  const FIRST = ['John', 'Priya', 'Aarav', 'Sneha', 'Rahul', 'Anika', 'Vikram', 'Meera']
  const LAST = ['Doe', 'Sharma', 'Iyer', 'Patel', 'Khan', 'Kapoor', 'Nair', 'Gupta']
  let h = 2166136261
  for (let i = 0; i < requestId.length; i++) {
    h ^= requestId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const first = FIRST[Math.abs(h) % FIRST.length]
  const last = LAST[Math.abs(h * 31) % LAST.length]
  const last4 = (Math.abs(h) % 9000 + 1000).toString()
  return tokenizeBeneficiaryShort(first, last, last4, bank)
}

/**
 * Adapter — converts the stable `IntentDetail` shape (from the seeded-batches
 * store) to the legacy `IntentRow` shape the existing table renderer expects.
 * When the IntentRow type widens, this adapter shrinks.
 */
function intentDetailToRow(detail: IntentDetail): IntentRow {
  const partner: IntentRow['paymentPartner'] =
    detail.connector === 'Razorpay' ? 'Razorpay'
      : detail.connector === 'Cashfree' ? 'Cashfree'
        : detail.connector === 'PayU' ? 'PayU'
          : 'Razorpay' // Banks fall back to a placeholder partner here.
  const method: IntentRow['method'] =
    detail.rail === 'IMPS' ? 'LSM'
      : detail.rail === 'NACH' ? 'NACH'
        : 'Bank Transfer'
  const status: IntentStatus =
    detail.status === 'confirmed' ? 'Confirmed'
      : detail.status === 'pending' ? 'Pending'
        : detail.status === 'ambiguous' ? 'Needs Review'
          : detail.status === 'failed' ? 'Needs Review'
            : 'In Progress'
  const match: IntentMatch =
    detail.status === 'confirmed' ? 'Matched'
      : detail.status === 'pending' ? 'Awaiting'
        : detail.status === 'ambiguous' ? 'Mismatch'
          : detail.status === 'failed' ? 'Not Found'
            : 'Awaiting'
  const bank: IntentRow['bank'] =
    detail.connector === 'HDFC Bank' ? 'HDFC Bank'
      : detail.connector === 'ICICI Bank' ? 'ICICI Bank'
        : detail.connector === 'SBI' ? 'SBI'
          : 'HDFC Bank'
  return {
    batchId: detail.batchId,
    requestId: detail.intentId,
    reference: `intent_${detail.intentId.slice(-6)}`,
    amount: detail.amount,
    method,
    status,
    match,
    lastUpdated: new Date(detail.dispatchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    paymentPartner: partner,
    bank,
  }
}

function intentDetailToFailureRow(detail: IntentDetail): FailureRow {
  const ir = intentDetailToRow(detail)
  return {
    batchId: detail.batchId,
    requestId: detail.intentId,
    reference: `intent_${detail.intentId.slice(-6)}`,
    amount: detail.amount,
    method: ir.method,
    paymentPartner: ir.paymentPartner,
    failureReason:
      detail.variance.kind !== 'none' && detail.variance.summary
        ? detail.variance.summary
        : 'Intent marked failed',
    failureStage: 'Processing',
    lastUpdated: ir.lastUpdated,
    action: 'Retry',
  }
}

/** Sandbox journal has no demo batches until the user uploads — safe placeholder for KPI + filters. */
const EMPTY_SANDBOX_BATCH_ID = '__sandbox_no_batch__'

const SANDBOX_EMPTY_BATCH: BatchRecord = {
  batchId: EMPTY_SANDBOX_BATCH_ID,
  type: 'Disbursement',
  source: '—',
  totalValue: 0,
  transactions: 0,
  confirmedCount: 0,
  highConfidenceCount: 0,
  mismatchCount: 0,
  unresolvedCount: 0,
}

const SANDBOX_JOURNAL_ONBOARDING_DISMISSED_KEY = 'zord:sandbox-intent-journal-onboarding-dismissed'

function HeaderIcon({ kind }: { kind: 'request' | 'reference' | 'amount' | 'payment' | 'status' | 'updated' }) {
  const cls = 'h-3.5 w-3.5 text-[#64748b]'
  if (kind === 'request')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 7V4h8v3M6 7h12l1 13H5L6 7Z" />
      </svg>
    )
  if (kind === 'reference')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 7h10v10H7z" />
        <path d="M4 4h10v10" />
      </svg>
    )
  if (kind === 'amount')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18M16 7.5c0-1.9-1.8-3.5-4-3.5s-4 1.6-4 3.5 1.8 3.5 4 3.5 4 1.6 4 3.5-1.8 3.5-4 3.5-4-1.6-4-3.5" />
      </svg>
    )
  if (kind === 'payment')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
      </svg>
    )
  if (kind === 'status')
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  )
}

function scoreDashArray(score: number) {
  const bounded = Math.max(8, Math.min(95, score))
  return `${Math.round((bounded / 100) * 53)} 53`
}

function KpiSpark({ tone }: { tone: string }) {
  const heights = [36, 58, 44, 72, 52, 88, 61, 94, 55, 78]
  return (
    <div className="flex h-7 max-w-[120px] flex-1 items-end justify-end gap-px" aria-hidden>
      {heights.map((h, i) => (
        <span key={i} className={`w-1 max-w-[3px] rounded-sm ${tone}`} style={{ height: `${h}%`, opacity: 0.35 + (i % 3) * 0.15 }} />
      ))}
    </div>
  )
}

type KpiVariant = 'total' | 'confirmed' | 'pending' | 'attention'

function KpiGlyph({ variant }: { variant: KpiVariant }) {
  const common = 'h-5 w-5'
  if (variant === 'total')
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  if (variant === 'confirmed')
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  if (variant === 'pending')
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  return (
    <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )
}

function intentHaystack(row: IntentRow) {
  return [row.batchId, row.requestId, row.reference, row.method, row.status, row.match, row.paymentPartner, row.bank, row.lastUpdated, String(row.amount)]
    .join(' ')
    .toLowerCase()
}

function failureHaystack(row: FailureRow) {
  return [
    row.batchId,
    row.requestId,
    row.reference,
    row.method,
    row.paymentPartner,
    row.failureReason,
    row.failureStage,
    row.action,
    row.lastUpdated,
    String(row.amount),
  ]
    .join(' ')
    .toLowerCase()
}

function mapApiIntentToIntentRow(intent: ApiIntentRow, batchFallback: string): IntentRow {
  const raw = intent.amount
  const amount = typeof raw === 'string' ? parseFloat(raw) : Number(raw ?? 0)
  const safe = Number.isFinite(amount) ? amount : 0
  const st = String(intent.status ?? '').toUpperCase()
  let status: IntentStatus = 'Pending'
  if (st.includes('CONFIRM') || st.includes('SUCCESS') || st === 'COMPLETED' || st === 'SETTLED') status = 'Confirmed'
  else if (st.includes('FAIL') || st.includes('REJECT') || st.includes('ERROR')) status = 'Needs Review'
  else if (st.includes('PROCESS') || st.includes('DISPAT') || st === 'IN_FLIGHT') status = 'In Progress'
  const match: IntentMatch =
    status === 'Confirmed' ? 'Matched' : status === 'Needs Review' ? 'Not Found' : 'Awaiting'
  const created = intent.created_at ? new Date(intent.created_at) : new Date()
  return {
    batchId: intent.batch_id ?? batchFallback,
    requestId: intent.intent_id,
    reference: intent.envelope_id
      ? `env_${String(intent.envelope_id).slice(-8)}`
      : `ref_${String(intent.intent_id).slice(-8)}`,
    amount: safe,
    method: 'Bank Transfer',
    status,
    match,
    lastUpdated: created.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    paymentPartner: 'Razorpay',
    bank: 'HDFC Bank',
  }
}

function mapApiDlqToFailureRow(row: ApiDlqRow): FailureRow {
  const batchId = row.tenant_id ?? 'DLQ'
  const stageRaw = (row.stage ?? '').toLowerCase()
  let failureStage: FailureRow['failureStage'] = 'Processing'
  if (stageRaw.includes('valid')) failureStage = 'Validation'
  else if (stageRaw.includes('dispatch')) failureStage = 'Dispatch'
  else if (stageRaw.includes('settle')) failureStage = 'Settlement'
  const lastUpdated = row.created_at
    ? new Date(row.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  return {
    batchId,
    requestId: row.dlq_id,
    reference: row.envelope_id ?? row.dlq_id,
    amount: 0,
    method: 'Bank Transfer',
    paymentPartner: 'Razorpay',
    failureReason: row.error_detail || row.reason_code || 'In DLQ',
    failureStage,
    lastUpdated,
    action: row.replayable ? 'Retry' : 'Investigate',
  }
}

const LIVE_JOURNAL_POLL_MS = 12_000

export function IntentJournalSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const { mode } = useEnvironment()
  const envTenant = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ZORD_TENANT_ID?.trim()) || ''
  const [liveTenantId, setLiveTenantId] = useState(envTenant || 'tenant_arealis_nbfc')

  useEffect(() => {
    if (mode !== 'live') return
    let cancelled = false
    ;(async () => {
      let resolved: string | null = envTenant || null
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { session?: { tenant_id?: string } }
          const tid = data.session?.tenant_id?.trim()
          if (tid) resolved = tid
        }
      } catch {
        /* ignore */
      }
      if (!cancelled && !resolved) {
        try {
          const ls = typeof window !== 'undefined' ? localStorage.getItem('zord_tenant_id') : null
          if (ls?.trim()) resolved = ls.trim()
        } catch {
          /* ignore */
        }
      }
      if (!cancelled && resolved) setLiveTenantId(resolved)
    })()
    return () => {
      cancelled = true
    }
  }, [mode, envTenant])

  const liveJournalBatchId = `LIVE-${liveTenantId}`

  const cannedBatches = useMemo(() => getIntentJournalBatches(), [])
  const cannedIntents = useMemo(() => getIntentJournalIntents(), [])
  const staticFailures = useMemo(() => getIntentJournalFailures(), [])

  const [liveIntentRows, setLiveIntentRows] = useState<IntentRow[]>([])
  const [liveFailureRows, setLiveFailureRows] = useState<FailureRow[]>([])
  const [liveBatchList, setLiveBatchList] = useState<BatchRecord[]>([])
  // Per-batch drilldown fetched from /v1/intelligence/batches/{id} when a batch is
  // selected. Drives the right-pane KPI cards (intended/confirmed/variance/ambiguity).
  const [liveBatchDetail, setLiveBatchDetail] = useState<BatchDetailResponse | null>(null)
  const [liveFeedLoaded, setLiveFeedLoaded] = useState(false)
  const [liveSyncAt, setLiveSyncAt] = useState<Date | null>(null)

  const fetchLiveBackendFeed = useCallback(async (): Promise<string> => {
    const dq = `tenant_id=${encodeURIComponent(liveTenantId)}`
    const [dlqRes, batchesRes] = await Promise.all([
      getProdDlqPage(dq),
      getIntelligenceBatches(liveTenantId, { limit: 100 }),
    ])
    setLiveFailureRows((dlqRes?.items ?? []).map(mapApiDlqToFailureRow))
    const batchRows: BatchRecord[] = (batchesRes?.batches ?? []).map((b: IntelligenceBatchRow) => ({
      batchId: b.batch_id,
      type: 'Disbursement',
      source: inferBatchSource(b.batch_id, b.finality_status),
      totalValue: 0,
      transactions: b.total_count ?? 0,
      confirmedCount: b.success_count ?? 0,
      highConfidenceCount: 0,
      mismatchCount: 0,
      unresolvedCount: 0,
      intelligenceCounts: {
        success_count: b.success_count ?? 0,
        failed_count: b.failed_count ?? 0,
        pending_count: b.pending_count ?? 0,
        finality_status: b.finality_status,
      },
    }))
    setLiveBatchList(batchRows)
    let nextSelected = ''
    setSelectedBatchId((prev) => {
      if (batchRows.length === 0) {
        nextSelected = ''
        return ''
      }
      if (initialBatchId && batchRows.some((b) => b.batchId === initialBatchId)) {
        nextSelected = initialBatchId
        return initialBatchId
      }
      if (prev && batchRows.some((b) => b.batchId === prev)) {
        nextSelected = prev
        return prev
      }
      nextSelected = batchRows[0]!.batchId
      return nextSelected
    })
    setLiveFeedLoaded(true)
    setLiveSyncAt(new Date())
    return nextSelected
  }, [liveTenantId, initialBatchId])

  useEffect(() => {
    if (mode === 'live') return
    setLiveIntentRows([])
    setLiveFailureRows([])
    setLiveBatchList([])
    setLiveBatchDetail(null)
    setLiveFeedLoaded(false)
    setLiveSyncAt(null)
  }, [mode])

  // Sandbox-seeded batches from localStorage. Merged into the working batch list
  // so the journal renders them just like canned batches — but the sidebar
  // surfaces them in a separate "Sandbox seeded" block at the top.
  const { seededBatches, removeSeededBatch, clearAll, hydrated } = useSeededBatches()

  // Live: intent rows + DLQ come from zord-intent-engine only (no canned sidebar/table mocks).
  // Sandbox: keep canned demo batches for empty-state UX unless seeded uploads exist.
  const cannedBatchesForMode = useMemo(() => (mode === 'sandbox' ? cannedBatches : []), [mode, cannedBatches])
  const cannedIntentsForMode = useMemo(() => (mode === 'sandbox' ? cannedIntents : []), [mode, cannedIntents])
  const staticFailuresForMode = useMemo(() => (mode === 'sandbox' ? staticFailures : []), [mode, staticFailures])

  const liveBatchRecord = useMemo((): BatchRecord | null => {
    if (mode !== 'live' || liveIntentRows.length === 0) return null
    const confirmed = liveIntentRows.filter((r) => r.status === 'Confirmed').length
    const pending = liveIntentRows.filter((r) => r.status === 'Pending').length
    const attention = liveIntentRows.filter((r) => r.status === 'Needs Review' || r.status === 'In Progress').length
    const totalValue = liveIntentRows.reduce((s, r) => s + r.amount, 0)
    return {
      batchId: liveJournalBatchId,
      type: 'Disbursement',
      source: 'Intent engine (live)',
      totalValue,
      transactions: liveIntentRows.length,
      confirmedCount: confirmed,
      highConfidenceCount: Math.min(confirmed, Math.max(0, Math.round(confirmed * 0.88))),
      mismatchCount: attention,
      unresolvedCount: pending,
    }
  }, [mode, liveIntentRows, liveJournalBatchId])

  // Merge seeded batch shapes into the working list (used for filtering, etc.).
  const batches = useMemo(() => {
    const seededBatchRows = seededBatches.map((s) => ({
      batchId: s.batch.batchId,
      type: s.batch.type,
      source: s.batch.source,
      totalValue: s.batch.totalValue,
      transactions: s.batch.transactions,
      confirmedCount: s.batch.confirmedCount,
      highConfidenceCount: s.batch.highConfidenceCount,
      mismatchCount: s.batch.mismatchCount,
      unresolvedCount: s.batch.unresolvedCount,
    }))
    if (mode === 'live') {
      return [...seededBatchRows, ...cannedBatchesForMode]
    }
    const live = liveBatchRecord ? [liveBatchRecord] : []
    return [...live, ...seededBatchRows, ...cannedBatchesForMode]
  }, [mode, seededBatches, cannedBatchesForMode, liveBatchRecord])

  // Build a unified intent list — for seeded batches we use the precomputed
  // detail rows; for canned batches we fall back to the existing static intents.
  const intents = useMemo(() => {
    const seededRows = seededBatches.flatMap((sb) =>
      sb.intents.map((d) => intentDetailToRow(d)),
    )
    return [...liveIntentRows, ...seededRows, ...cannedIntentsForMode]
  }, [seededBatches, cannedIntentsForMode, liveIntentRows])

  const failures = useMemo(() => {
    if (mode === 'sandbox') {
      return seededBatches.flatMap((sb) =>
        sb.intents.filter((d) => d.status === 'failed').map((d) => intentDetailToFailureRow(d)),
      )
    }
    if (mode === 'live') return liveFailureRows
    return staticFailuresForMode
  }, [mode, seededBatches, liveFailureRows, staticFailuresForMode])

  // Quick lookup for intent details (used by the inline drawer).
  const intentDetailIndex = useMemo(() => {
    const map = new Map<string, IntentDetail>()
    seededBatches.forEach((sb) => sb.intents.forEach((d) => map.set(d.intentId, d)))
    return map
  }, [seededBatches])

  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => initialBatchId ?? '')

  const selectedBatchIdRef = useRef(selectedBatchId)
  selectedBatchIdRef.current = selectedBatchId

  const loadLiveIntents = useCallback(async (batchOverride?: string) => {
    const bid = (batchOverride ?? selectedBatchIdRef.current ?? '').trim()
    if (!liveTenantId.trim() || !bid || bid === EMPTY_SANDBOX_BATCH_ID) {
      setLiveIntentRows([])
      return
    }
    const q = `page=1&page_size=120&tenant_id=${encodeURIComponent(liveTenantId)}&batch_id=${encodeURIComponent(bid)}`
    try {
      const res = await getProdIntentsPage(q)
      let items = res?.items ?? []
      const hasBatchIds = items.some((it) => Boolean(it.batch_id))
      if (hasBatchIds) {
        items = items.filter((it) => !it.batch_id || it.batch_id === bid)
      }
      setLiveIntentRows(items.map((it) => mapApiIntentToIntentRow(it, it.batch_id ?? bid)))
    } catch {
      setLiveIntentRows([])
    }
  }, [liveTenantId])

  const loadLiveIntentsRef = useRef(loadLiveIntents)
  loadLiveIntentsRef.current = loadLiveIntents

  useEffect(() => {
    if (mode !== 'live') return
    void loadLiveIntents()
  }, [mode, selectedBatchId, loadLiveIntents])

  useEffect(() => {
    if (mode !== 'live') return
    let cancelled = false
    setLiveFeedLoaded(false)
    const tick = async () => {
      if (cancelled) return
      try {
        const nextBatch = await fetchLiveBackendFeed()
        await loadLiveIntentsRef.current(nextBatch)
      } catch {
        if (!cancelled) setLiveFeedLoaded(true)
      }
    }
    void tick()
    const id = window.setInterval(() => {
      void tick()
    }, LIVE_JOURNAL_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [mode, fetchLiveBackendFeed])

  const [sandboxOnboardingOpen, setSandboxOnboardingOpen] = useState(false)

  useEffect(() => {
    if (mode !== 'sandbox' || !hydrated) {
      setSandboxOnboardingOpen(false)
      return
    }
    if (seededBatches.length > 0) {
      setSandboxOnboardingOpen(false)
      return
    }
    if (typeof window === 'undefined') return
    const dismissed = window.localStorage.getItem(SANDBOX_JOURNAL_ONBOARDING_DISMISSED_KEY) === '1'
    setSandboxOnboardingOpen(!dismissed)
  }, [mode, hydrated, seededBatches.length])

  useEffect(() => {
    if (mode !== 'live') return
    if (selectedBatchId) return
    if (liveBatchList[0]) setSelectedBatchId(liveBatchList[0].batchId)
  }, [mode, selectedBatchId, liveBatchList])

  useEffect(() => {
    if (mode !== 'sandbox' || !hydrated) return
    if (seededBatches.length === 0) return
    if (seededBatches.some((s) => s.batchId === selectedBatchId)) return
    setSelectedBatchId(seededBatches[0]!.batchId)
  }, [mode, hydrated, seededBatches, selectedBatchId])

  // Per-batch detail (intended/confirmed/variance) from /v1/intelligence/batches/{id}.
  // Re-fetched whenever the user selects a different batch in live mode.
  useEffect(() => {
    if (mode !== 'live' || !liveTenantId || !selectedBatchId || selectedBatchId === EMPTY_SANDBOX_BATCH_ID) {
      setLiveBatchDetail(null)
      return
    }
    let cancelled = false
    void getIntelligenceBatchDetail(liveTenantId, selectedBatchId).then((res) => {
      if (!cancelled) setLiveBatchDetail(res)
    })
    return () => {
      cancelled = true
    }
  }, [mode, liveTenantId, selectedBatchId])

  // KPI 14 — patterns / batch anomaly score for the currently-selected batch.
  // Drives the sidebar severity badge and a dedicated anomaly card on the right pane.
  const intelligenceKpis = useIntelligenceKpis(mode === 'live' ? liveTenantId : '', {
    batchId: mode === 'live' && selectedBatchId.trim() ? selectedBatchId : undefined,
  })
  const batchAnomalyRaw = isDataAvailable(intelligenceKpis.patterns) ? intelligenceKpis.patterns : null
  // Only trust KPI 14 counts when the payload is explicitly for this batch. Tenant-wide
  // patterns responses often omit `batch_id`; using them here made every batch show the
  // same donut / dispatch % (felt like mock data).
  const batchAnomaly =
    mode === 'live' &&
    selectedBatchId.trim() &&
    batchAnomalyRaw &&
    batchAnomalyRaw.batch_id === selectedBatchId
      ? batchAnomalyRaw
      : null

  // If parent passes an initialBatchId after mount (e.g. URL syncs late), pick it up.
  useEffect(() => {
    if (!initialBatchId || initialBatchId === selectedBatchId) return
    if (mode === 'sandbox' && !seededBatches.some((s) => s.batchId === initialBatchId)) return
    if (mode === 'live' && liveBatchList.length === 0) return
    if (mode === 'live' && !liveBatchList.some((b) => b.batchId === initialBatchId)) return
    setSelectedBatchId(initialBatchId)
  }, [initialBatchId, mode, seededBatches, selectedBatchId, liveBatchList])
  const [batchFilter, setBatchFilter] = useState<BatchFilter>('All Batches')
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('listed')
  const [sidebarPage, setSidebarPage] = useState(1)
  const [activeTab, setActiveTab] = useState<TabKey>('transactions')

  const [tableSearch, setTableSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRangePreset>('all')
  const [filterBatchId, setFilterBatchId] = useState('')
  const [connectorFilter, setConnectorFilter] = useState<(typeof CONNECTOR_OPTIONS)[number]>('All')
  const [dispatchModeFilter, setDispatchModeFilter] = useState<(typeof DISPATCH_OPTIONS)[number]>('All')
  const [intentStatusFilter, setIntentStatusFilter] = useState<'All' | IntentStatus>('All')
  const [failureStageFilter, setFailureStageFilter] = useState<'All' | FailureRow['failureStage']>('All')
  const [amountRangeFilter, setAmountRangeFilter] = useState<AmountRangeFilter>('All')

  const [rowsPerPage, setRowsPerPage] = useState<(typeof ROW_SIZE_OPTIONS)[number]>(15)
  const [page, setPage] = useState(1)
  const [jumpPage, setJumpPage] = useState('1')
  const [failurePage, setFailurePage] = useState(1)
  const [failureJumpPage, setFailureJumpPage] = useState('1')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null)
  const [liveIntentDrawerApi, setLiveIntentDrawerApi] = useState<ApiProdIntentDetailPayload | null>(null)

  const expandedIdRef = useRef<string | null>(null)
  expandedIdRef.current = expandedId

  useEffect(() => {
    setExpandedId(null)
    setSelectedIntentId(null)
    setLiveIntentDrawerApi(null)
  }, [selectedBatchId])

  useEffect(() => {
    if (mode !== 'live' || !expandedId) {
      setLiveIntentDrawerApi(null)
      return
    }
    if (intentDetailIndex.has(expandedId)) {
      setLiveIntentDrawerApi(null)
      return
    }
    let cancelled = false
    const targetId = expandedId
    setLiveIntentDrawerApi(null)
    void getProdIntentDetail(targetId).then((api) => {
      if (cancelled || expandedIdRef.current !== targetId) return
      setLiveIntentDrawerApi(api)
    })
    return () => {
      cancelled = true
    }
  }, [mode, expandedId, intentDetailIndex])

  // Dispatch modal — smart routing on use-case + connector history
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false)
  const [dispatchUseCase, setDispatchUseCase] = useState<UseCase>('salary')
  const [dispatchBanner, setDispatchBanner] = useState<{
    batchId: string
    target: DispatchTarget
    useCase: UseCase
    intents: number
    at: Date
  } | null>(null)

  const sidebarBatchList = useMemo(() => {
    if (mode === 'live') {
      return liveBatchList.length > 0 ? [...liveBatchList] : []
    }
    const list = [...cannedBatchesForMode]
    if (liveBatchRecord) list.unshift(liveBatchRecord)
    return list
  }, [mode, liveBatchList, cannedBatchesForMode, liveBatchRecord])

  // Sidebar canned list filters — includes live batch when connected; seeded batches live in
  // the dedicated SandboxSeededSection at the top of the sidebar.
  const filteredBatches = useMemo(() => {
    if (batchFilter === 'All Batches') return sidebarBatchList
    if (batchFilter === 'Recent') return sidebarBatchList.slice(0, 10)
    if (batchFilter === 'Needs Attention') return sidebarBatchList.filter((b) => batchQualityScore(b) < 80)
    if (batchFilter === 'High Value') return sidebarBatchList.filter((b) => b.totalValue >= 1_500_000)
    return sidebarBatchList.filter((b) => batchStatus(batchQualityScore(b)) === 'Strong' || batchStatus(batchQualityScore(b)) === 'Stable')
  }, [batchFilter, sidebarBatchList])

  const selectedBatch =
    filteredBatches.find((b) => b.batchId === selectedBatchId) ??
    batches.find((b) => b.batchId === selectedBatchId) ??
    batches[0] ??
    SANDBOX_EMPTY_BATCH

  const sandboxJournalEmpty = mode === 'sandbox' && hydrated && seededBatches.length === 0

  const dismissSandboxOnboarding = (remember: boolean) => {
    setSandboxOnboardingOpen(false)
    if (remember && typeof window !== 'undefined') {
      window.localStorage.setItem(SANDBOX_JOURNAL_ONBOARDING_DISMISSED_KEY, '1')
    }
  }

  const pickBatchIdAfterRemove = (removedId: string) => {
    const remaining = seededBatches.filter((s) => s.batchId !== removedId)
    if (remaining[0]) return remaining[0].batchId
    if (mode === 'sandbox') return ''
    return liveBatchList[0]?.batchId ?? cannedBatchesForMode[0]?.batchId ?? ''
  }
  const needsAttentionCount = batches.filter((b) => batchQualityScore(b) < 80).length
  const sourceCount = new Set(batches.map((b) => b.source)).size
  const sidebarTotalPages = Math.max(1, Math.ceil(filteredBatches.length / SIDEBAR_PAGE_SIZE))
  const safeSidebarPage = Math.min(sidebarPage, sidebarTotalPages)
  const sidebarBatches = filteredBatches.slice((safeSidebarPage - 1) * SIDEBAR_PAGE_SIZE, safeSidebarPage * SIDEBAR_PAGE_SIZE)

  const filteredIntents = useMemo(() => {
    if (selectedBatch.batchId === EMPTY_SANDBOX_BATCH_ID) return []
    return intents.filter((row) => {
      const q = tableSearch.trim().toLowerCase()
      const bySearch = !q || intentHaystack(row).includes(q)
      const byBatch =
        !filterBatchId.trim() || row.batchId.toLowerCase().includes(filterBatchId.trim().toLowerCase())
      const byConnector = connectorFilter === 'All' || row.paymentPartner === connectorFilter
      const byDispatch = dispatchModeFilter === 'All' || row.method === dispatchModeFilter
      const byStatus = intentStatusFilter === 'All' || row.status === intentStatusFilter
      const byAmount =
        amountRangeFilter === 'All' ||
        (amountRangeFilter === 'Under $1,500' && row.amount < 1500) ||
        (amountRangeFilter === '$1,500 – $2,000' && row.amount >= 1500 && row.amount <= 2000) ||
        (amountRangeFilter === 'Over $2,000' && row.amount > 2000)
      const bySelectedBatch = row.batchId === selectedBatch.batchId
      return bySelectedBatch && bySearch && byBatch && byConnector && byDispatch && byStatus && byAmount
    })
  }, [intents, selectedBatch.batchId, tableSearch, filterBatchId, connectorFilter, dispatchModeFilter, intentStatusFilter, amountRangeFilter])

  const filteredFailures = useMemo(() => {
    return failures.filter((row) => {
      const q = tableSearch.trim().toLowerCase()
      const bySearch = !q || failureHaystack(row).includes(q)
      // Scope failures to the currently-selected batch so the Failures tab
      // surfaces the unresolved rows for that batch (with their reason codes).
      // The free-text filter input still narrows further.
      // Live DLQ rows are keyed by tenant_id, not intelligence batch_id — show tenant-wide DLQ.
      const bySelectedBatch =
        mode === 'live' ||
        selectedBatch.batchId === EMPTY_SANDBOX_BATCH_ID ||
        row.batchId === selectedBatch.batchId
      const byBatch =
        !filterBatchId.trim() || row.batchId.toLowerCase().includes(filterBatchId.trim().toLowerCase())
      const byConnector = connectorFilter === 'All' || row.paymentPartner === connectorFilter
      const byDispatch = dispatchModeFilter === 'All' || row.method === dispatchModeFilter
      const byStage = failureStageFilter === 'All' || row.failureStage === failureStageFilter
      const byAmount =
        amountRangeFilter === 'All' ||
        (amountRangeFilter === 'Under $1,500' && row.amount < 1500) ||
        (amountRangeFilter === '$1,500 – $2,000' && row.amount >= 1500 && row.amount <= 2000) ||
        (amountRangeFilter === 'Over $2,000' && row.amount > 2000)
      return bySearch && bySelectedBatch && byBatch && byConnector && byDispatch && byStage && byAmount
    })
  }, [mode, failures, tableSearch, selectedBatch.batchId, filterBatchId, connectorFilter, dispatchModeFilter, failureStageFilter, amountRangeFilter])

  useEffect(() => {
    setPage(1)
    setJumpPage('1')
    setFailurePage(1)
    setFailureJumpPage('1')
  }, [tableSearch, dateRange, filterBatchId, connectorFilter, dispatchModeFilter, intentStatusFilter, failureStageFilter, amountRangeFilter, activeTab])

  const intentTotal = filteredIntents.length
  const totalPages = Math.max(1, Math.ceil(intentTotal / rowsPerPage))
  const safePage = Math.min(page, totalPages)
  const pageRows = filteredIntents.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage)

  const failureTotal = filteredFailures.length
  const failureTotalPages = Math.max(1, Math.ceil(failureTotal / rowsPerPage))
  const safeFailurePage = Math.min(failurePage, failureTotalPages)
  const failurePageRows = filteredFailures.slice((safeFailurePage - 1) * rowsPerPage, safeFailurePage * rowsPerPage)

  // Derive KPIs + intent distribution from the actually-selected batch so the
  // right side responds to sidebar selection (not hardcoded 97.3% / 847).
  // When the selected batch has loaded intents (seeded), use the KPI doc §4.5
  // weighted-six formula; otherwise fall back to the row-count proxy.
  const selectedBatchIntents = useMemo(
    () => seededBatches.find((sb) => sb.batchId === selectedBatch.batchId)?.intents,
    [seededBatches, selectedBatch.batchId],
  )

  // KPI 14 (patterns) + batch list/detail (`/v1/intelligence/batches*`) drive live overview metrics.
  const anomalyCounts = batchAnomaly
    ? {
        total: batchAnomaly.total_count ?? 0,
        success: batchAnomaly.success_count ?? 0,
        failed: batchAnomaly.failed_count ?? 0,
        pending: batchAnomaly.pending_count ?? 0,
      }
    : null
  const healthBatch = liveBatchDetail?.batch
  const healthTotals = liveBatchDetail?.batch_health
  const listCounts = selectedBatch.intelligenceCounts

  /** In live mode, batch detail (when loaded) is the canonical count row; sidebar list can lag. */
  const overviewIntentTotal =
    mode === 'live' ? (healthBatch?.total_count ?? selectedBatch.transactions) : selectedBatch.transactions

  const selectedBatchTotal = Math.max(
    anomalyCounts?.total ?? healthBatch?.total_count ?? overviewIntentTotal,
    1,
  )
  const rawConfirmed =
    anomalyCounts?.success ?? healthBatch?.success_count ?? listCounts?.success_count ?? selectedBatch.confirmedCount
  const rawFailed =
    anomalyCounts?.failed ?? healthBatch?.failed_count ?? listCounts?.failed_count ?? selectedBatch.mismatchCount
  const rawPending =
    anomalyCounts?.pending ?? healthBatch?.pending_count ?? listCounts?.pending_count ?? selectedBatch.unresolvedCount

  const selectedConfirmed = Math.min(rawConfirmed, selectedBatchTotal)
  const selectedFailed = Math.min(rawFailed, selectedBatchTotal - selectedConfirmed)
  const selectedPending = Math.min(rawPending, selectedBatchTotal - selectedConfirmed - selectedFailed)
  const selectedNeedsReview = Math.max(0, selectedBatchTotal - selectedConfirmed - selectedFailed - selectedPending)

  const intendedMinor = healthTotals?.total_intended_amount_minor
  const confirmedMinor = healthTotals?.total_confirmed_amount_minor
  const varianceMinor = healthTotals?.total_variance_minor
  const intendedRupees =
    intendedMinor && Number.isFinite(Number(intendedMinor)) ? Number(intendedMinor) / 100 : selectedBatch.totalValue
  const selectedConfirmedValue = confirmedMinor
    ? Number(confirmedMinor) / 100
    : intendedRupees * (selectedConfirmed / selectedBatchTotal)
  const varianceRupees =
    varianceMinor && Number.isFinite(Number(varianceMinor)) ? Math.max(0, Number(varianceMinor) / 100) : null
  const confirmedRupeesResolved =
    confirmedMinor && Number.isFinite(Number(confirmedMinor)) ? Number(confirmedMinor) / 100 : selectedConfirmedValue
  const selectedAttentionValue =
    varianceRupees ?? Math.max(0, intendedRupees > 0 ? intendedRupees - confirmedRupeesResolved : 0)

  const anomalyHealthPct =
    batchAnomaly != null &&
    typeof batchAnomaly.batch_anomaly_score === 'number' &&
    Number.isFinite(batchAnomaly.batch_anomaly_score)
      ? (1 - Math.min(1, Math.max(0, batchAnomaly.batch_anomaly_score))) * 100
      : null
  const operationalDispatchPct = (selectedConfirmed / selectedBatchTotal) * 100
  const dispatchConfidencePct = anomalyHealthPct ?? operationalDispatchPct

  const selectedBatchScore = Math.round(
    mode === 'live' && (healthBatch != null || batchAnomaly != null || listCounts != null)
      ? dispatchConfidencePct
      : batchQualityScore(selectedBatch, selectedBatchIntents),
  )

  const intentDistribution = [
    { label: 'Confirmed', count: selectedConfirmed.toLocaleString('en-US'), pct: (selectedConfirmed / selectedBatchTotal) * 100, color: '#10B981' },
    { label: 'Pending', count: selectedPending.toLocaleString('en-US'), pct: (selectedPending / selectedBatchTotal) * 100, color: '#F59E0B' },
    { label: 'Needs Review', count: selectedNeedsReview.toLocaleString('en-US'), pct: (selectedNeedsReview / selectedBatchTotal) * 100, color: '#06B6D4' },
    { label: 'Failed', count: selectedFailed.toLocaleString('en-US'), pct: (selectedFailed / selectedBatchTotal) * 100, color: '#EC4899' },
  ] as const
  const donutRadius = 42
  const donutCircumference = 2 * Math.PI * donutRadius
  const donutGap = 10
  let cumulativeOffset = 0
  const donutSegments = intentDistribution.map((item) => {
    const arc = (item.pct / 100) * donutCircumference
    // Keep offsets wrapped to one circumference so small segments
    // do not jump to unexpected positions.
    const offset = -(cumulativeOffset % donutCircumference)
    cumulativeOffset += arc + donutGap
    return { ...item, arc, offset }
  })

  const clearTableFilters = () => {
    setTableSearch('')
    setDateRange('all')
    setFilterBatchId('')
    setConnectorFilter('All')
    setDispatchModeFilter('All')
    setIntentStatusFilter('All')
    setFailureStageFilter('All')
    setAmountRangeFilter('All')
  }

  return (
    <>
      {sandboxOnboardingOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sandbox-journal-onboard-title"
        >
          <div className="max-w-md rounded-2xl border border-amber-200/80 bg-white p-6 shadow-2xl">
            <h2 id="sandbox-journal-onboard-title" className="text-lg font-semibold text-[#0f172a]">
              Load your first batch
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#64748b]">
              Sandbox Intent Journal starts empty — no demo rows. Open <strong className="text-[#0f172a]">Batch Command Center</strong>,
              upload your <strong>intent</strong> file (step 1), then your <strong>settlement</strong> file (step 2). Your batch id appears
              here under <strong className="text-[#0f172a]">Sandbox seeded</strong> (FILE pill).
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] text-[#475569]">
              <li>Batch Center → Step 1: intent batch + API key → ingest</li>
              <li>Step 2: settlement file (tenant + PSP) → upload</li>
              <li>Return to Intent Journal and select your batch</li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/payout-command-view/batch-command-center"
                className="inline-flex min-w-[10rem] flex-1 items-center justify-center rounded-xl bg-[#111111] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-black/90"
                onClick={() => dismissSandboxOnboarding(false)}
              >
                Go to Batch Command Center
              </Link>
              <button
                type="button"
                className="rounded-xl border border-[#E5E5E5] px-4 py-2.5 text-[14px] font-medium text-[#64748b] transition hover:bg-[#fafafa]"
                onClick={() => dismissSandboxOnboarding(false)}
              >
                Close
              </button>
            </div>
            <button
              type="button"
              className="mt-3 text-[12px] text-[#94a3b8] underline underline-offset-2 transition hover:text-[#64748b]"
              onClick={() => dismissSandboxOnboarding(true)}
            >
              Don&apos;t show again
            </button>
          </div>
        </div>
      ) : null}

      <div className="h-[calc(100vh-8rem)] overflow-hidden bg-[#f4f4f1] text-[14px] text-[#111827]">
      <div className="grid h-full grid-cols-[272px,minmax(0,1fr)]">
        <aside className="flex h-full flex-col overflow-hidden border-r border-[#E5E5E5] bg-white text-[#0f172a]">
          <div className="border-b border-[#E5E5E5] px-4 pb-3 pt-4">
            <h2 className="text-[17px] font-semibold text-[#0f172a]">Batches</h2>
            <p className="mt-1 text-[13px] text-[#64748b]">
              {batches.length} listed · {sourceCount} sources
            </p>
            <div className="mt-3 rounded-[10px] border border-[#E5E5E5] bg-[#f7f7f4] p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setSidebarMode('listed')}
                  className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${sidebarMode === 'listed' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'}`}
                >
                  Listed <span className="ml-1 text-[#94a3b8]">{batches.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarMode('sectors')}
                  className={`rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition ${sidebarMode === 'sectors' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'}`}
                >
                  Sectors <span className="ml-1 text-[#94a3b8]">{sourceCount}</span>
                </button>
              </div>
            </div>
            <div className="mt-3">
              <select
                value={batchFilter}
                onChange={(e) => {
                  setBatchFilter(e.target.value as BatchFilter)
                  setSidebarPage(1)
                }}
                className="w-full rounded-[8px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[13px] text-[#0f172a] shadow-sm"
              >
                {BATCH_FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SandboxSeededSection
            seededBatches={seededBatches}
            selectedBatchId={selectedBatchId}
            onSelectBatch={setSelectedBatchId}
            onRemoveBatch={(id) => {
              removeSeededBatch(id)
              if (id === selectedBatchId) {
                setSelectedBatchId(pickBatchIdAfterRemove(id))
              }
            }}
            onClearAll={() => {
              clearAll()
              setSelectedBatchId(
                mode === 'sandbox' ? '' : liveBatchList[0]?.batchId ?? cannedBatchesForMode[0]?.batchId ?? '',
              )
            }}
          />

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {mode === 'sandbox' && sidebarBatches.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#E5E5E5] bg-[#fafafa] px-3 py-4 text-center text-[13px] leading-relaxed text-[#94a3b8]">
                No demo batches in sandbox. After you ingest in Batch Command Center, your batch id appears under <span className="font-medium text-[#64748b]">Sandbox seeded</span> above.
              </p>
            ) : null}
            {sidebarBatches.map((batch) => {
              const selected = batch.batchId === selectedBatch.batchId
              const score = batchQualityScore(batch)
              const detailRow =
                mode === 'live' && selected && liveBatchDetail?.batch?.batch_id === batch.batchId
                  ? liveBatchDetail.batch
                  : null
              const liveSuccess =
                mode === 'live'
                  ? (detailRow?.success_count ?? batch.intelligenceCounts?.success_count ?? batch.confirmedCount ?? 0)
                  : null
              const liveTotalRaw = mode === 'live' ? (detailRow?.total_count ?? batch.transactions ?? 0) : batch.transactions
              const liveTotal = Math.max(liveTotalRaw, 1)
              const liveFinality = detailRow?.finality_status ?? batch.intelligenceCounts?.finality_status
              const status =
                mode === 'live' ? batchStatusFromFinality(liveFinality) : batchStatus(score)
              const sidebarScoreDisplay =
                mode === 'live' && liveSuccess !== null ? liveSuccess.toLocaleString('en-US') : String(score)
              const progressWidthPct =
                mode === 'live' && liveSuccess !== null
                  ? Math.min(100, Math.round((liveSuccess / liveTotal) * 100))
                  : score
              const tone = statusTone(status)
              const dotColor =
                status === 'Strong' || status === 'Stable'
                  ? 'bg-emerald-500'
                  : status === 'Risk'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'

              const liveMoneyLine =
                mode === 'live' &&
                selected &&
                liveBatchDetail?.batch_health &&
                liveBatchDetail.batch?.batch_id === batch.batchId
                  ? formatInrRupees(Number(liveBatchDetail.batch_health.total_confirmed_amount_minor) / 100)
                  : null

              return (
                <button
                  key={batch.batchId}
                  type="button"
                  onClick={() => setSelectedBatchId(batch.batchId)}
                  className={`mb-1.5 w-full rounded-[10px] border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-[#111111] bg-[#f7f7f4]'
                      : 'border-transparent hover:border-[#E5E5E5] hover:bg-[#fafafa]'
                  }`}
                >
                  {/* Line 1: status dot + batch ID + success count (live) or quality score (sandbox) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden />
                      <span className="truncate text-[14px] font-medium text-[#0f172a]">{batch.batchId}</span>
                    </div>
                    <span
                      className={`shrink-0 text-[13px] font-semibold tabular-nums ${tone.text}`}
                      title={mode === 'live' ? 'success_count from intelligence batch (detail when selected)' : 'Batch quality score'}
                    >
                      {sidebarScoreDisplay}
                    </span>
                  </div>

                  {/* Line 2: type · value · intent count (live: INR when batch_health loaded for selection) */}
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-4 text-[12px] text-[#64748b]">
                    <span>{batch.type}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {liveMoneyLine ??
                        (batch.totalValue > 0 ? usdCompact(batch.totalValue) : mode === 'live' ? '—' : usdCompact(0))}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {(mode === 'live' ? liveTotalRaw : batch.transactions).toLocaleString('en-US')} intents
                    </span>
                  </div>
                  {mode === 'live' && liveFinality ? (
                    <p className="mt-0.5 pl-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {String(liveFinality).replace(/_/g, ' ')}
                    </p>
                  ) : null}

                  {/* Selected = expanded score-bar + status pill */}
                  {selected ? (
                    <div className="mt-2 space-y-1.5 pl-4">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                        <div
                          className={`h-full rounded-full ${
                            status === 'Strong' || status === 'Stable'
                              ? 'bg-emerald-500'
                              : status === 'Risk'
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                          }`}
                          style={{ width: `${progressWidthPct}%` }}
                        />
                      </div>
                      <div className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.text} ${
                        status === 'Risk'
                          ? 'bg-amber-100'
                          : status === 'Critical'
                            ? 'bg-rose-100'
                            : 'bg-emerald-100'
                      }`}>
                        {status}
                      </div>
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="border-t border-[#E5E5E5] bg-[#fafafa] px-3 py-2 text-[13px] text-[#64748b]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSidebarPage((p) => Math.max(1, p - 1))}
                disabled={safeSidebarPage <= 1}
                className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="tabular-nums">
                {safeSidebarPage} / {sidebarTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setSidebarPage((p) => Math.min(sidebarTotalPages, p + 1))}
                disabled={safeSidebarPage >= sidebarTotalPages}
                className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
            <p className="mt-1 text-center text-[12px]">
              {batches.length} active · {needsAttentionCount} need attention
            </p>
          </div>
        </aside>

        <main className="flex h-full min-w-0 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            {/* ── Sandbox-seeded batch notice ───────────────────────────── */}
            {(() => {
              const seeded = seededBatches.find((s) => s.batchId === selectedBatchId)
              if (!seeded) return null
              return (
                <SandboxBatchNotice
                  scenarioName={seeded.scenarioName}
                  variant={seeded.scenarioId === 'bulk_upload' ? 'bulk_upload' : 'scenario'}
                  onDismissBatch={() => {
                    removeSeededBatch(seeded.batchId)
                    setSelectedBatchId(pickBatchIdAfterRemove(seeded.batchId))
                  }}
                />
              )
            })()}

            {mode === 'live' && liveFeedLoaded ? (
              <div className="mb-4 rounded-[10px] border border-slate-200 bg-slate-50 px-3.5 py-2 text-[13px] text-slate-700">
                <span className="font-semibold text-slate-900">Live backend feed</span>
                <span className="text-slate-500"> · </span>
                <span className="text-slate-600">
                  Refreshes every {Math.round(LIVE_JOURNAL_POLL_MS / 1000)}s
                  {liveSyncAt ? (
                    <>
                      <span className="text-slate-400"> · </span>
                      Last synced{' '}
                      <time dateTime={liveSyncAt.toISOString()}>
                        {liveSyncAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </time>
                    </>
                  ) : null}
                </span>
                <span className="text-slate-500"> · </span>
                {liveIntentRows.length > 0 ? (
                  <span>
                    {liveIntentRows.length} intent{liveIntentRows.length === 1 ? '' : 's'} from{' '}
                    <code className="rounded bg-white px-1 py-0.5 font-mono text-[12px] text-slate-800">{liveTenantId}</code>
                    {liveFailureRows.length > 0 ? (
                      <span className="text-slate-600">
                        {' '}
                        · {liveFailureRows.length} DLQ row{liveFailureRows.length === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-slate-600">
                    No intents returned (check intent-engine or tenant). Failures tab shows DLQ from the engine only.
                  </span>
                )}
              </div>
            ) : null}

            {mode === 'live' && liveFeedLoaded && liveBatchList.length === 0 ? (
              <div className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-[14px] text-amber-950">
                <span className="font-semibold">No batches in intelligence.</span>{' '}
                Create or ingest a batch for this tenant, then this list will populate from{' '}
                <code className="rounded bg-white px-1 font-mono text-[13px]">GET /v1/intelligence/batches</code>.
              </div>
            ) : null}

            {sandboxJournalEmpty ? (
              <div className="mb-5 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 to-white px-5 py-5 shadow-sm ring-1 ring-amber-100">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">Sandbox · no data yet</p>
                <p className="mt-2 text-[15px] font-semibold text-[#0f172a]">Upload intent + settlement in Batch Command Center</p>
                <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-[#64748b]">
                  Demo tables are hidden in sandbox. Complete both steps there; your batch id will show under <span className="font-medium text-[#475569]">Sandbox seeded</span> with a FILE tag, and intents will load here.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/payout-command-view/batch-command-center"
                    className="inline-flex items-center justify-center rounded-xl bg-[#111111] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-black/90"
                  >
                    Open Batch Command Center
                  </Link>
                  <button
                    type="button"
                    className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-[14px] font-medium text-[#64748b] transition hover:bg-[#fafafa]"
                    onClick={() => setSandboxOnboardingOpen(true)}
                  >
                    Show setup steps
                  </button>
                </div>
              </div>
            ) : null}

            {/* ── Persistent dispatch success banner ─────────────────────── */}
            {dispatchBanner ? (
              <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-[#4ADE80]/50 bg-gradient-to-r from-emerald-950/90 via-[#052e16] to-emerald-950/90 px-4 py-2.5 text-emerald-50 shadow-[0_0_28px_rgba(74,222,128,0.35)] ring-1 ring-[#4ADE80]/25">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4ADE80] text-[#031508] shadow-[0_0_14px_rgba(74,222,128,0.65)]">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <EntityLogo name={dispatchBanner.target.name} kind={dispatchBanner.target.type} size={20} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#ecfdf5] drop-shadow-[0_0_8px_rgba(74,222,128,0.25)]">
                      Batch {dispatchBanner.batchId} dispatched to {dispatchBanner.target.name}
                      <span className="ml-1 font-mono text-[12px] font-normal text-[#a7f3d0]">· {USE_CASE_RAIL[dispatchBanner.useCase]}</span>
                    </p>
                    <p className="text-[12px] text-[#86efac]/90">
                      just now · {dispatchBanner.intents.toLocaleString('en-US')} intents queued · awaiting settlement signal
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDispatchBanner(null)}
                  className="rounded-md border border-[#4ADE80]/60 bg-[#031508] px-2 py-1 text-[12px] font-semibold text-[#4ADE80] shadow-[0_0_10px_rgba(74,222,128,0.35)] transition hover:bg-[#052818]"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchBanner(null)}
                  aria-label="Dismiss"
                  className="text-[17px] leading-none text-[#86efac] hover:text-white"
                >
                  ×
                </button>
              </div>
            ) : null}
            <section className="mb-4 overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-3 border-b border-slate-200/80 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[16px] font-semibold tracking-tight text-[#0f172a]">Overview — {selectedBatch.batchId}</h2>
                  <div className="mt-2 grid gap-1 text-[13px] text-[#64748b] sm:grid-cols-2">
                    <p><span className="font-semibold text-[#0f172a]">Type:</span> {selectedBatch.type}</p>
                    <p className="sm:text-right"><span className="font-semibold text-[#0f172a]">Source:</span> {selectedBatch.source}</p>
                    <p><span className="font-semibold text-[#0f172a]">Total Intents:</span> {overviewIntentTotal.toLocaleString('en-US')}</p>
                    <p className="sm:text-right">
                      <span className="font-semibold text-emerald-700">Dispatch confidence:</span>{' '}
                      {dispatchConfidencePct.toFixed(1)}% ({batchStatus(selectedBatchScore)})
                      {batchAnomaly ? (
                        <span className="text-[12px] text-slate-500"> · KPI 14 anomaly {(batchAnomaly.batch_anomaly_score * 100).toFixed(1)}%</span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={selectedBatch.batchId === EMPTY_SANDBOX_BATCH_ID}
                  onClick={() => setDispatchModalOpen(true)}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-[#0f172a] px-3.5 text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(15,23,42,0.18)] transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#94a3b8] disabled:shadow-none"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m3 8 4 4 6-9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Dispatch batch
                </button>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[0.95fr_0.95fr_1.25fr] xl:grid-rows-2">
                {(
                  [
                    {
                      variant: 'pending' as const,
                      label: 'Dispatch confidence',
                      value: `${dispatchConfidencePct.toFixed(1)}%`,
                      trend: batchAnomaly ? `KPI 14 · ${batchAnomaly.anomaly_level}` : `${batchStatus(selectedBatchScore)}`,
                      trendTone: 'text-sky-700',
                      iconWrap: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
                      spark: 'bg-sky-500',
                    },
                    {
                      variant: 'total' as const,
                      label: 'Total intents',
                      value: overviewIntentTotal.toLocaleString('en-US'),
                      trend: 'in batch',
                      trendTone: 'text-slate-600',
                      iconWrap: 'bg-slate-50 text-slate-600 ring-1 ring-slate-100',
                      spark: 'bg-slate-500',
                    },
                    {
                      variant: 'confirmed' as const,
                      label: 'Confirmed value',
                      value: mode === 'live' ? formatInrRupees(selectedConfirmedValue) : usdCompact(selectedConfirmedValue),
                      trend: 'Settled (batch health)',
                      trendTone: 'text-emerald-700',
                      iconWrap: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
                      spark: 'bg-emerald-500',
                    },
                    {
                      variant: 'attention' as const,
                      label: 'Needs attention',
                      value: mode === 'live' ? formatInrRupees(selectedAttentionValue) : usdCompact(selectedAttentionValue),
                      trend: `${selectedNeedsReview + selectedFailed} intents`,
                      trendTone: 'text-rose-700',
                      iconWrap: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
                      spark: 'bg-rose-500',
                    },
                  ] as const
                ).map((kpi, idx) => (
                  <article
                    key={kpi.label}
                    className={`group relative flex flex-col overflow-hidden rounded-[16px] border border-slate-200 bg-white p-3 text-[#0f172a] shadow-[0_2px_8px_rgba(15,23,42,0.04)] ${
                      idx === 0 ? 'xl:col-start-1 xl:row-start-1' : ''
                    } ${idx === 1 ? 'xl:col-start-2 xl:row-start-1' : ''} ${idx === 2 ? 'xl:col-start-1 xl:row-start-2' : ''} ${
                      idx === 3 ? 'xl:col-start-2 xl:row-start-2' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${kpi.iconWrap}`}
                          aria-hidden
                        >
                          <KpiGlyph variant={kpi.variant} />
                        </div>
                        <h3 className="text-[12px] font-semibold leading-snug text-[#0f172a]">{kpi.label}</h3>
                      </div>
                      <span className="text-[#94a3b8]">↗</span>
                    </div>
                    <div className="mt-2">
                      <p className="mt-1 text-[27px] font-semibold leading-none tracking-tight text-[#0f172a] tabular-nums">{kpi.value}</p>
                    </div>
                    <p className={`mt-2 text-[13px] font-medium ${kpi.trendTone}`}>{mode === 'live' ? kpi.trend : `↑ ${kpi.trend}`}</p>
                    <div className="mt-1.5 flex items-end justify-between gap-3">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-[#cbd5e1]"> </span>
                      <KpiSpark tone={kpi.spark} />
                    </div>
                  </article>
                ))}

                <section className="rounded-[20px] border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/90 p-5 shadow-[0_8px_28px_rgba(15,23,42,0.06)] sm:col-span-2 xl:col-start-3 xl:row-start-1 xl:row-end-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-semibold text-[#111827]">Intent Activity</p>
                      <p className="text-[12px] text-[#64748b]">Distribution by state</p>
                      {mode === 'live' ? (
                        <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-slate-500">
                          From intelligence batch detail or batch list — not time-filtered. KPI 14 donut only when patterns include this{' '}
                          <code className="rounded bg-slate-100 px-0.5 font-mono text-[10px]">batch_id</code>.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 text-[12px]">
                      {mode === 'sandbox'
                        ? OVERVIEW_QUICK_RANGES.map(({ label, value }) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setDateRange(value)}
                              className={`rounded-[7px] border px-2.5 py-1 ${
                                dateRange === value ? 'border-[#111827] bg-[#111827] text-white' : 'border-[#e5e7eb] bg-white text-[#6b7280]'
                              }`}
                            >
                              {label}
                            </button>
                          ))
                        : null}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-5">
                    <div className="relative h-[210px] w-[210px] shrink-0">
                      <svg viewBox="0 0 120 120" className="-rotate-90">
                        <circle cx="60" cy="60" r="42" fill="none" stroke="#e6e8ec" strokeWidth="10" />
                        {donutSegments.map((seg) => (
                          <circle
                            key={seg.label}
                            cx="60"
                            cy="60"
                            r="42"
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="10"
                            strokeDasharray={`${seg.arc} ${donutCircumference}`}
                            strokeDashoffset={seg.offset}
                            strokeLinecap="round"
                          />
                        ))}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <div className="flex h-[130px] w-[130px] flex-col items-center justify-center rounded-full border border-[#e5e7eb] bg-white shadow-sm">
                          <p className="text-[33px] font-semibold leading-none tabular-nums text-[#0f172a]">{dispatchConfidencePct.toFixed(1)}%</p>
                          <p className="mt-1 text-[12px] font-medium text-[#64748b]">
                            {batchAnomaly ? 'Batch quality (inverse KPI 14)' : 'Dispatch confidence'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2 text-[13px]">
                      {donutSegments.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-3 border-b border-dashed border-[#e5e7eb] px-1 py-1.5">
                          <span className="flex items-center gap-2 text-[14px] font-medium text-[#334155]">
                            <span className="h-4 w-4 rounded-[4px]" style={{ backgroundColor: item.color }} />
                            {item.label}
                          </span>
                          <span className="text-[14px] font-semibold tabular-nums text-[#0f172a]">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </section>

            {/* ── Defensibility Insight — minimal: just why it's green/yellow/red ─ */}
            {(() => {
              const total = selectedBatchTotal
              const mismatchPct = (selectedNeedsReview / total) * 100
              const unresolvedPct = (selectedFailed / total) * 100
              const dragPct = mismatchPct + unresolvedPct
              const status = batchStatus(selectedBatchScore)

              const isGreen = status === 'Strong' || status === 'Stable'
              const isYellow = status === 'Risk'
              const colorWord = isGreen ? 'green' : isYellow ? 'yellow' : 'red'

              const tone = isGreen
                ? { border: 'border-emerald-200', bg: 'bg-emerald-50/50', dot: 'bg-emerald-500', text: 'text-emerald-700' }
                : isYellow
                  ? { border: 'border-amber-200', bg: 'bg-amber-50/50', dot: 'bg-amber-500', text: 'text-amber-700' }
                  : { border: 'border-rose-200', bg: 'bg-rose-50/50', dot: 'bg-rose-600', text: 'text-rose-700' }

              const topDriver =
                mismatchPct >= unresolvedPct
                  ? { label: 'mismatched', pct: mismatchPct, code: 'MATCH_LOW' }
                  : { label: 'unresolved', pct: unresolvedPct, code: 'SIGNAL_MISSING' }

              const reason = isGreen
                ? `Only ${dragPct.toFixed(1)}% drag from mismatch + unresolved. Confirmation pipeline is healthy — audit-ready.`
                : isYellow
                  ? `${topDriver.label} rate is ${topDriver.pct.toFixed(1)}% (code ${topDriver.code}). Pipeline is healthy but matching layer needs review.`
                  : `${dragPct.toFixed(1)}% of intents are mismatched or unresolved. Top driver: ${topDriver.label} at ${topDriver.pct.toFixed(1)}% (code ${topDriver.code}). Immediate intervention required.`

              return (
                <section className={`mb-4 flex flex-wrap items-start gap-3 rounded-[12px] border ${tone.border} ${tone.bg} px-4 py-3`}>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-white px-2 py-0.5 text-[12px] font-semibold ${tone.text} ${tone.border}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
                    {status} · score {selectedBatchScore}
                  </span>
                  <p className="min-w-0 flex-1 text-[13px] leading-[1.55] text-[#0f172a]">
                    <span className="text-[#64748b]">Why this is </span>
                    <span className={`font-semibold ${tone.text}`}>{colorWord}</span>
                    <span className="text-[#64748b]">: </span>
                    {reason}
                  </p>
                </section>
              )
            })()}

            <nav className="mb-4 flex items-center gap-0.5 border-b border-[#e5e7eb]">
              {TAB_ITEMS.map((tab) => (
                <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`-mb-px border-b-2 px-4 py-2 text-[14px] ${activeTab === tab.key ? 'border-[#111111] font-medium text-[#111111]' : 'border-transparent text-[#6b7280] hover:text-[#111111]'}`}>
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="mb-4 rounded-[20px] border border-slate-200/80 bg-gradient-to-br from-white via-[#f8fbff] to-slate-50 p-4 shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label htmlFor="journal-table-search" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">
                    Search
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" aria-hidden>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      id="journal-table-search"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder={
                        activeTab === 'transactions'
                          ? 'Search request ID, reference, batch, bank, connector, status, amount…'
                          : 'Search failed intents — ID, reference, reason, stage, connector, action…'
                      }
                      className={`${filterInputClass} pl-9`}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterBatchId(selectedBatch.batchId)}
                    className="h-9 shrink-0 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[13px] font-medium text-[#334155] shadow-sm transition hover:bg-[#f1f5f9]"
                  >
                    Use sidebar batch
                  </button>
                  <button
                    type="button"
                    onClick={clearTableFilters}
                    className="h-9 shrink-0 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[13px] font-medium text-[#475569] shadow-sm transition hover:bg-[#f8fafc]"
                  >
                    Clear filters
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Date range</label>
                  <select value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRangePreset)} className={filterSelectClass}>
                    {DATE_RANGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Batch ID</label>
                  <input
                    value={filterBatchId}
                    onChange={(e) => setFilterBatchId(e.target.value)}
                    placeholder="e.g. B-2026-022"
                    className={filterInputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Connector</label>
                  <select value={connectorFilter} onChange={(e) => setConnectorFilter(e.target.value as (typeof CONNECTOR_OPTIONS)[number])} className={filterSelectClass}>
                    {CONNECTOR_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Status</label>
                  {activeTab === 'transactions' ? (
                    <select value={intentStatusFilter} onChange={(e) => setIntentStatusFilter(e.target.value as 'All' | IntentStatus)} className={filterSelectClass}>
                      <option value="All">All statuses</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Pending">Pending</option>
                      <option value="Needs Review">Needs Review</option>
                      <option value="In Progress">In Progress</option>
                    </select>
                  ) : (
                    <select
                      value={failureStageFilter}
                      onChange={(e) => setFailureStageFilter(e.target.value as 'All' | FailureRow['failureStage'])}
                      className={filterSelectClass}
                    >
                      <option value="All">All stages</option>
                      <option value="Validation">Validation</option>
                      <option value="Dispatch">Dispatch</option>
                      <option value="Processing">Processing</option>
                      <option value="Settlement">Settlement</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Dispatch mode</label>
                  <select value={dispatchModeFilter} onChange={(e) => setDispatchModeFilter(e.target.value as (typeof DISPATCH_OPTIONS)[number])} className={filterSelectClass}>
                    {DISPATCH_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m === 'All' ? 'All rails' : m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Amount range</label>
                  <select value={amountRangeFilter} onChange={(e) => setAmountRangeFilter(e.target.value as AmountRangeFilter)} className={filterSelectClass}>
                    {AMOUNT_RANGE_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {activeTab === 'transactions' ? (
              <section className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-gradient-to-r from-[#f2f6fc] to-[#eef4fb] px-4 py-3">
                    <div>
                      <p className="text-[15px] font-semibold text-[#0f172a]">Intent Table — Selected Batch</p>
                      <p className="text-[13px] text-[#64748b]"><span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">{intentTotal.toLocaleString('en-US')} rows</span> match filters</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[14px]">
                      <thead className="bg-[#eef4fb] text-[#64748b]">
                        <tr>
                          {[
                            { key: 'request', label: 'Request ID', icon: 'request' as const },
                            { key: 'reference', label: 'Reference', icon: 'reference' as const },
                            { key: 'amount', label: 'Amount', icon: 'amount' as const },
                            { key: 'connector', label: 'Payment Method', icon: 'payment' as const },
                            { key: 'status', label: 'Status', icon: 'status' as const },
                            { key: 'updated', label: 'Last Updated', icon: 'updated' as const },
                          ].map((h) => (
                            <th key={h.key} className="px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide">
                              <span className="inline-flex items-center gap-1.5">
                                <HeaderIcon kind={h.icon} />
                                {h.label}
                              </span>
                            </th>
                          ))}
                          
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row) => (
                          <Fragment key={row.requestId}>
                            <tr
                              onClick={() => {
                                setSelectedIntentId(row.requestId)
                                setExpandedId((current) => (current === row.requestId ? null : row.requestId))
                              }}
                              className={`cursor-pointer border-t border-[#f3f4f6] ${selectedIntentId === row.requestId ? 'bg-[#f8fafc]' : 'hover:bg-[#f9fafb]'}`}
                            >
                              <td className="px-3 py-2.5">{row.requestId}</td>
                              <td className="px-3 py-2.5">
                                <span className="font-mono text-[12px] text-[#475569]">{row.reference}</span>
                              </td>
                              <td className="px-3 py-2.5">{usd(row.amount)}</td>
                              <td className="px-3 py-2.5">
                                <div className="inline-flex items-center gap-2 rounded-lg border border-[#e6ebf2] bg-white px-2 py-1">
                                  <EntityLogo name={row.paymentPartner} kind="psp" size={18} />
                                  <span className="text-[13px] font-medium text-[#334155]">{tokenizeFromIntentId(row.requestId, row.bank)}</span>
                                </div>
                              </td>
                              <td className={`px-3 py-2.5 font-medium ${intentStatusClass(row.status)}`}>{intentStatusLabel(row.status)}</td>
                              <td className="px-3 py-2.5">{row.lastUpdated}</td>
                            </tr>
                            {expandedId === row.requestId ? (
                              <tr className="bg-[#fafafa]">
                                <td colSpan={6} className="px-3 pb-4 pt-3">
                                  {(() => {
                                    const seededDetail = intentDetailIndex.get(row.requestId)
                                    const detail: IntentDetail = seededDetail
                                      ? seededDetail
                                      : mode === 'live'
                                        ? buildLiveIntentDetailFromRowAndApi(
                                            {
                                              requestId: row.requestId,
                                              batchId: row.batchId,
                                              amount: row.amount,
                                              method: row.method,
                                              paymentPartner: row.paymentPartner,
                                              bank: row.bank,
                                              uiStatus: row.status,
                                            },
                                            expandedId === row.requestId ? liveIntentDrawerApi : null,
                                          )
                                        : getCannedIntentDetail(row.requestId, row.batchId, {
                                            amount: row.amount,
                                            method: row.method,
                                            partner: row.paymentPartner,
                                          })
                                    return (
                                      <div className="space-y-3">
                                        {/* Drawer header */}
                                        <div className="border-b border-[#E5E5E5] pb-2">
                                          <div className="min-w-0">
                                            <p className="text-[14px] font-semibold text-[#0f172a]">{detail.beneficiaryFull}</p>
                                            <p className="mt-0.5 font-mono text-[11px] text-[#64748b]">
                                              {detail.intentId} · {detail.beneficiaryToken}
                                            </p>
                                          </div>
                                        </div>

                                        <BankingInformationTokensBlock detail={detail} />
                                      </div>
                                    )
                                  })()}
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-slate-200/80 bg-[#f8fbff] px-3 py-2 text-[13px] text-[#64748b]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Showing range {intentTotal === 0 ? 0 : (safePage - 1) * rowsPerPage + 1}-{Math.min(safePage * rowsPerPage, intentTotal)} of {intentTotal.toLocaleString('en-US')} intents
                      </span>
                      <div className="flex items-center gap-2">
                        <span>Rows per page:</span>
                        <select
                          value={rowsPerPage}
                          onChange={(e) => {
                            setRowsPerPage(Number(e.target.value) as (typeof ROW_SIZE_OPTIONS)[number])
                            setPage(1)
                            setJumpPage('1')
                            setFailurePage(1)
                            setFailureJumpPage('1')
                          }}
                          className="rounded border border-[#e5e7eb] bg-white px-2 py-1 text-[13px]"
                        >
                          {ROW_SIZE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                      <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-[#e5e7eb] bg-white px-2 py-1">
                        Prev
                      </button>
                      <span>
                        Page {safePage} / {totalPages}
                      </span>
                      <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded border border-[#e5e7eb] bg-white px-2 py-1">
                        Next
                      </button>
                      <span className="ml-2">Go to page</span>
                      <input value={jumpPage} onChange={(e) => setJumpPage(e.target.value.replace(/[^0-9]/g, ''))} className="w-16 rounded border border-[#e5e7eb] px-2 py-1" />
                      <button
                        type="button"
                        className="rounded border border-[#e5e7eb] bg-white px-2 py-1"
                        onClick={() => {
                          const target = Number(jumpPage)
                          if (Number.isFinite(target) && target >= 1) setPage(Math.min(totalPages, target))
                        }}
                      >
                        Go
                      </button>
                    </div>
                  </div>
                </section>
            ) : null}

            {activeTab === 'failures' ? (
              <section className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-gradient-to-r from-[#f2f6fc] to-[#eef4fb] px-4 py-3">
                  <div>
                    <p className="text-[15px] font-semibold text-[#0f172a]">Failed intents (DLQ)</p>
                    <p className="text-[13px] text-[#64748b]"><span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">{failureTotal.toLocaleString('en-US')} rows</span> match filters</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="h-8 rounded-lg border border-[#e2e8f0] bg-white px-2.5 text-[13px] font-medium text-[#475569] shadow-sm"
                    >
                      Columns
                    </button>
                    <button
                      type="button"
                      className="h-8 rounded-lg border border-[#e2e8f0] bg-white px-2.5 text-[13px] font-medium text-[#475569] shadow-sm"
                    >
                      Export
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[14px]">
                    <thead className="bg-[#eef4fb] text-[#64748b]">
                      <tr>
                        {[
                          { key: 'request', label: 'Request ID', icon: 'request' as const },
                          { key: 'reference', label: 'Reference', icon: 'reference' as const },
                          { key: 'batch', label: 'Batch', icon: 'reference' as const },
                          { key: 'amount', label: 'Amount', icon: 'amount' as const },
                          { key: 'method', label: 'Method', icon: 'payment' as const },
                          { key: 'connector', label: 'Connector', icon: 'payment' as const },
                          { key: 'reason', label: 'Failure Reason', icon: 'status' as const },
                          { key: 'stage', label: 'Stage', icon: 'status' as const },
                          { key: 'updated', label: 'Updated', icon: 'updated' as const },
                          { key: 'action', label: 'Action', icon: 'status' as const },
                        ].map((h) => (
                          <th key={h.key} className="px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide">
                            <span className="inline-flex items-center gap-1.5">
                              <HeaderIcon kind={h.icon} />
                              {h.label}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {failurePageRows.map((row) => (
                        <tr key={row.requestId} className="border-t border-[#f3f4f6] hover:bg-[#f9fafb]">
                          <td className="px-3 py-2.5 font-medium text-[#0f172a]">{row.requestId}</td>
                          <td className="px-3 py-2.5">{row.reference}</td>
                          <td className="px-3 py-2.5 text-[13px] text-[#475569]">{row.batchId}</td>
                          <td className="px-3 py-2.5 tabular-nums">{usd(row.amount)}</td>
                          <td className="px-3 py-2.5">{row.method}</td>
                          <td className="px-3 py-2.5">
                            <div className="inline-flex items-center gap-2 rounded-lg border border-[#e6ebf2] bg-white px-2 py-1">
                              <EntityLogo name={row.paymentPartner} kind="psp" size={18} />
                              <span className="text-[13px] font-medium text-[#334155]">{tokenizeFromIntentId(row.requestId, 'HDFC Bank')}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-rose-700">{row.failureReason}</td>
                          <td className="px-3 py-2.5">{row.failureStage}</td>
                          <td className="px-3 py-2.5 text-[#64748b]">{row.lastUpdated}</td>
                          <td className="px-3 py-2.5 font-medium">{row.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-200/80 bg-[#f8fbff] px-3 py-2 text-[13px] text-[#64748b]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Showing {failureTotal === 0 ? 0 : (safeFailurePage - 1) * rowsPerPage + 1}-
                      {Math.min(safeFailurePage * rowsPerPage, failureTotal)} of {failureTotal.toLocaleString('en-US')} failures
                    </span>
                    <div className="flex items-center gap-2">
                      <span>Rows per page:</span>
                      <select
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(Number(e.target.value) as (typeof ROW_SIZE_OPTIONS)[number])
                          setPage(1)
                          setJumpPage('1')
                          setFailurePage(1)
                          setFailureJumpPage('1')
                        }}
                        className="rounded border border-[#e5e7eb] bg-white px-2 py-1 text-[13px]"
                      >
                        {ROW_SIZE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <button type="button" onClick={() => setFailurePage((p) => Math.max(1, p - 1))} className="rounded border border-[#e5e7eb] bg-white px-2 py-1">
                      Prev
                    </button>
                    <span>
                      Page {safeFailurePage} / {failureTotalPages}
                    </span>
                    <button type="button" onClick={() => setFailurePage((p) => Math.min(failureTotalPages, p + 1))} className="rounded border border-[#e5e7eb] bg-white px-2 py-1">
                      Next
                    </button>
                    <span className="ml-2">Go to page</span>
                    <input
                      value={failureJumpPage}
                      onChange={(e) => setFailureJumpPage(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-16 rounded border border-[#e5e7eb] px-2 py-1"
                    />
                    <button
                      type="button"
                      className="rounded border border-[#e5e7eb] bg-white px-2 py-1"
                      onClick={() => {
                        const target = Number(failureJumpPage)
                        if (Number.isFinite(target) && target >= 1) setFailurePage(Math.min(failureTotalPages, target))
                      }}
                    >
                      Go
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            
          </div>
        </main>
      </div>

      {/* ── Dispatch modal — smart routing recommendation ─────────────── */}
      {dispatchModalOpen ? (
        <DispatchRoutingModal
          batch={selectedBatch}
          useCase={dispatchUseCase}
          onUseCaseChange={setDispatchUseCase}
          onClose={() => setDispatchModalOpen(false)}
          onDispatchComplete={(target, useCase) => {
            // Demo: real impl would POST /api/dispatch with { batchId, useCase, target }
            setDispatchBanner({
              batchId: selectedBatch.batchId,
              target,
              useCase,
              intents: selectedBatch.transactions,
              at: new Date(),
            })
            setDispatchModalOpen(false)
          }}
        />
      ) : null}
    </div>
    </>
  )
}

// ─── Dispatch routing modal ─────────────────────────────────────────────
type UseCase = 'salary' | 'vendor' | 'payroll' | 'mandate'
type RailType = 'psp' | 'bank'

type DispatchTarget = {
  name: string
  type: RailType
  rails: string[]
  primaryRail: string
  /** p95 dispatch + acknowledgment time per use-case, in seconds. */
  delayBySec: Record<UseCase, number>
  ambiguityPct: number
  defensibility: number
  costTier: 'low' | 'mid' | 'high'
}

const USE_CASES: { id: UseCase; label: string; hint: string }[] = [
  { id: 'salary', label: 'Salary run', hint: 'Monthly employee disbursements · IMPS/NEFT' },
  { id: 'payroll', label: 'Payroll', hint: 'Contractor / gig payouts · IMPS' },
  { id: 'vendor', label: 'Vendor payout', hint: 'B2B settlement · NEFT/RTGS' },
  { id: 'mandate', label: 'Mandate (NACH)', hint: 'Recurring debit presentation' },
]

/** Use-case → preferred primary rail. Targets that support it get a fit bonus. */
const USE_CASE_RAIL: Record<UseCase, string> = {
  salary: 'IMPS',
  payroll: 'IMPS',
  vendor: 'NEFT',
  mandate: 'NACH',
}

const DISPATCH_TARGETS: DispatchTarget[] = [
  // PSP rail
  { name: 'Cashfree', type: 'psp', rails: ['IMPS', 'UPI', 'NEFT'], primaryRail: 'IMPS', delayBySec: { salary: 6, payroll: 7, vendor: 9, mandate: 22 }, ambiguityPct: 1.8, defensibility: 84, costTier: 'low' },
  { name: 'Razorpay', type: 'psp', rails: ['IMPS', 'NEFT', 'NACH'], primaryRail: 'IMPS', delayBySec: { salary: 11, payroll: 9, vendor: 14, mandate: 18 }, ambiguityPct: 3.2, defensibility: 72, costTier: 'mid' },
  { name: 'PayU', type: 'psp', rails: ['IMPS', 'NACH'], primaryRail: 'NACH', delayBySec: { salary: 14, payroll: 15, vendor: 18, mandate: 12 }, ambiguityPct: 6.0, defensibility: 58, costTier: 'high' },
  // Bank-direct rail
  { name: 'HDFC Bank', type: 'bank', rails: ['NEFT', 'RTGS', 'IMPS', 'NACH'], primaryRail: 'NEFT', delayBySec: { salary: 8, payroll: 10, vendor: 6, mandate: 14 }, ambiguityPct: 0.8, defensibility: 91, costTier: 'low' },
  { name: 'ICICI Bank', type: 'bank', rails: ['NEFT', 'RTGS', 'IMPS'], primaryRail: 'NEFT', delayBySec: { salary: 9, payroll: 11, vendor: 7, mandate: 16 }, ambiguityPct: 1.4, defensibility: 88, costTier: 'low' },
  { name: 'SBI', type: 'bank', rails: ['NEFT', 'RTGS', 'NACH'], primaryRail: 'NEFT', delayBySec: { salary: 12, payroll: 14, vendor: 9, mandate: 20 }, ambiguityPct: 2.1, defensibility: 82, costTier: 'mid' },
]

const REASON_CODE_DESCRIPTIONS: Record<string, string> = {
  LOW_P95_DELAY: 'p95 dispatch latency ≤ 7s in the last 14 days',
  HIGH_DEFENSIBILITY: 'Defensibility score ≥ 85 — strongest evidence chain',
  LOW_AMBIGUITY: 'Ambiguous-signal rate ≤ 2% — clean acknowledgments',
  USE_CASE_FIT: `Supports the preferred rail for this use-case`,
  COST_OPTIMAL: 'Lowest fee tier among comparable targets',
  SPONSOR_BANK_HEALTHY: 'Bank-direct rail with healthy sponsor-bank queue',
  WEBHOOK_RELIABLE: 'PSP webhook reliability ≥ 98% over 14d',
}

function reasonCodes(t: DispatchTarget, useCase: UseCase): string[] {
  const codes: string[] = []
  if (t.delayBySec[useCase] <= 7) codes.push('LOW_P95_DELAY')
  if (t.defensibility >= 85) codes.push('HIGH_DEFENSIBILITY')
  if (t.ambiguityPct <= 2.0) codes.push('LOW_AMBIGUITY')
  if (t.rails.includes(USE_CASE_RAIL[useCase])) codes.push('USE_CASE_FIT')
  if (t.costTier === 'low') codes.push('COST_OPTIMAL')
  if (t.type === 'bank' && t.defensibility >= 85) codes.push('SPONSOR_BANK_HEALTHY')
  if (t.type === 'psp' && t.ambiguityPct <= 2.0) codes.push('WEBHOOK_RELIABLE')
  return codes
}

function scoreTarget(t: DispatchTarget, useCase: UseCase): number {
  let base = t.defensibility - t.delayBySec[useCase] * 3 - t.ambiguityPct * 10
  if (t.rails.includes(USE_CASE_RAIL[useCase])) base += 8
  return Math.max(0, Math.round(base))
}

type DispatchPhase = 'select' | 'dispatching' | 'success'

function DispatchRoutingModal({
  batch,
  useCase,
  onUseCaseChange,
  onClose,
  onDispatchComplete,
}: {
  batch: BatchRecord
  useCase: UseCase
  onUseCaseChange: (uc: UseCase) => void
  onClose: () => void
  onDispatchComplete: (target: DispatchTarget, useCase: UseCase) => void
}) {
  const scored = useMemo(() =>
    DISPATCH_TARGETS
      .map((t) => ({ target: t, score: scoreTarget(t, useCase), codes: reasonCodes(t, useCase) }))
      .sort((a, b) => b.score - a.score),
    [useCase],
  )
  const winnerName = scored[0].target.name

  const psps = scored.filter((s) => s.target.type === 'psp')
  const banks = scored.filter((s) => s.target.type === 'bank')

  const [selected, setSelected] = useState<DispatchTarget>(scored[0].target)
  // When use-case changes, reset selection to the new winner.
  useEffect(() => { setSelected(scored[0].target) }, [scored])

  const [phase, setPhase] = useState<DispatchPhase>('select')
  const [stepIdx, setStepIdx] = useState(0)

  const dispatchSteps = useMemo(
    () => [
      `Validating ${batch.transactions.toLocaleString('en-US')} intents`,
      'Reserving funds with sponsor bank',
      `Sending to ${selected.name}`,
      'Awaiting acknowledgment',
      'Confirming dispatch',
    ],
    [batch.transactions, selected.name],
  )

  // Phase machine: dispatching → 5 steps × 1s → success → 2s → onDispatchComplete.
  useEffect(() => {
    if (phase !== 'dispatching') return
    setStepIdx(0)
    const stepTimers: number[] = []
    for (let i = 1; i <= dispatchSteps.length; i++) {
      stepTimers.push(window.setTimeout(() => setStepIdx(i), i * 1000))
    }
    const successTimer = window.setTimeout(() => setPhase('success'), dispatchSteps.length * 1000)
    return () => {
      stepTimers.forEach((id) => window.clearTimeout(id))
      window.clearTimeout(successTimer)
    }
  }, [phase, dispatchSteps.length])

  useEffect(() => {
    if (phase !== 'success') return
    const id = window.setTimeout(() => onDispatchComplete(selected, useCase), 2000)
    return () => window.clearTimeout(id)
  }, [phase, selected, useCase, onDispatchComplete])

  const isWorking = phase !== 'select'

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] cursor-default bg-black/30 backdrop-blur-[2px]"
        aria-label="Close dispatch modal"
        onClick={() => { if (!isWorking) onClose() }}
      />
      <div
        className="fixed left-1/2 top-1/2 z-[90] w-[min(calc(100vw-2rem),46rem)] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
      >
        {/* ─── Phase: SELECT ─── */}
        {phase === 'select' ? (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-[#E5E5E5] px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">Dispatch · {batch.batchId}</p>
                <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-[#0f172a]">Choose target → Zord recommends best fit</h2>
                <p className="mt-1 text-[13px] text-[#64748b]">Ranked by 14-day p95 delay, ambiguity, defensibility, and use-case fit.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[13px] text-[#475569] transition hover:bg-[#fafafa]"
              >
                Close
              </button>
            </header>

            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto px-5 py-4">
              {/* Use-case picker */}
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">1. Use-case</p>
              <div className="grid grid-cols-2 gap-2">
                {USE_CASES.map((uc) => (
                  <button
                    key={uc.id}
                    type="button"
                    onClick={() => onUseCaseChange(uc.id)}
                    className={`rounded-[10px] border px-3 py-2 text-left transition ${
                      useCase === uc.id ? 'border-[#0f172a] bg-[#f7f7f4]' : 'border-[#E5E5E5] bg-white hover:border-[#0f172a]/30'
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-[#0f172a]">{uc.label}</p>
                    <p className="mt-0.5 text-[12px] text-[#64748b]">{uc.hint}</p>
                  </button>
                ))}
              </div>

              {/* PSP rail */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">PSP rail</p>
                <p className="text-[11px] text-[#94a3b8]">Goes via payment processor</p>
              </div>
              <ul className="mt-2 space-y-2">
                {psps.map(({ target, score, codes }) => (
                  <DispatchOption
                    key={target.name}
                    target={target}
                    score={score}
                    codes={codes}
                    isRecommended={target.name === winnerName}
                    isSelected={selected.name === target.name}
                    useCase={useCase}
                    onPick={() => setSelected(target)}
                  />
                ))}
              </ul>

              {/* Bank-direct rail */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">Bank-direct rail</p>
                <p className="text-[11px] text-[#94a3b8]">Goes straight to sponsor bank</p>
              </div>
              <ul className="mt-2 space-y-2">
                {banks.map(({ target, score, codes }) => (
                  <DispatchOption
                    key={target.name}
                    target={target}
                    score={score}
                    codes={codes}
                    isRecommended={target.name === winnerName}
                    isSelected={selected.name === target.name}
                    useCase={useCase}
                    onPick={() => setSelected(target)}
                  />
                ))}
              </ul>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-[#E5E5E5] bg-[#fafafa] px-5 py-3">
              <div className="flex min-w-0 items-center gap-2 text-[12px] text-[#64748b]">
                <EntityLogo name={selected.name} kind={selected.type} size={20} />
                <span>
                  Selected: <span className="font-semibold text-[#0f172a]">{selected.name}</span>{' '}
                  <span className="text-[#94a3b8]">· {USE_CASE_RAIL[useCase]} rail</span>
                </span>
                {selected.name !== winnerName ? (
                  <span className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    Override · not recommended
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-[8px] border border-[#E5E5E5] bg-white px-3 py-1.5 text-[13px] font-medium text-[#475569] transition hover:bg-[#f3f3ee]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('dispatching')}
                  className="inline-flex items-center gap-2 rounded-[8px] bg-[#0f172a] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-black"
                >
                  Confirm dispatch
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="m3 6 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </footer>
          </>
        ) : null}

        {/* ─── Phase: DISPATCHING ─── */}
        {phase === 'dispatching' ? (
          <div className="px-6 py-8">
            <div className="mx-auto max-w-md">
              <div className="flex items-center justify-center gap-3">
                <span className="relative flex h-10 w-10 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-[#0f172a]/10" />
                  <span className="absolute inset-1 rounded-full border-2 border-[#0f172a]/20 border-t-[#0f172a] animate-spin" />
                  <EntityLogo name={selected.name} kind={selected.type} size={20} />
                </span>
              </div>
              <p className="mt-4 text-center text-[15px] font-semibold text-[#0f172a]">
                Dispatching {batch.batchId} → {selected.name}
              </p>
              <p className="mt-1 text-center text-[13px] text-[#64748b]">
                {USE_CASE_RAIL[useCase]} rail · {batch.transactions.toLocaleString('en-US')} intents
              </p>

              {/* Progress bar */}
              <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                <div
                  className="h-full rounded-full bg-[#0f172a] transition-all duration-700 ease-out"
                  style={{ width: `${(stepIdx / dispatchSteps.length) * 100}%` }}
                />
              </div>

              {/* Step list */}
              <ul className="mt-5 space-y-2.5">
                {dispatchSteps.map((label, i) => {
                  const done = i < stepIdx
                  const active = i === stepIdx
                  return (
                    <li key={label} className="flex items-center gap-2.5 text-[13px]">
                      {done ? (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                            <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      ) : active ? (
                        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-[#0f172a]/20 border-t-[#0f172a] animate-spin" />
                      ) : (
                        <span className="h-4 w-4 shrink-0 rounded-full border border-[#E5E5E5] bg-white" />
                      )}
                      <span className={done ? 'text-[#0f172a]' : active ? 'text-[#0f172a] font-medium' : 'text-[#94a3b8]'}>
                        {label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        ) : null}

        {/* ─── Phase: SUCCESS (2s) ─── */}
        {phase === 'success' ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)]">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                <path d="M5 13l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.01em] text-[#0f172a]">Batch dispatched</h3>
            <div className="mt-2 inline-flex items-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-1.5">
              <EntityLogo name={selected.name} kind={selected.type} size={20} />
              <span className="text-[13px] font-medium text-emerald-900">
                {selected.name}
                <span className="ml-1 font-mono text-[12px] font-normal text-emerald-700">· {USE_CASE_RAIL[useCase]}</span>
              </span>
            </div>
            <p className="mt-3 text-[13px] text-[#64748b]">
              {batch.transactions.toLocaleString('en-US')} intents queued · awaiting settlement signal
            </p>
          </div>
        ) : null}
      </div>
    </>
  )
}

function DispatchOption({
  target,
  score,
  codes,
  isRecommended,
  isSelected,
  useCase,
  onPick,
}: {
  target: DispatchTarget
  score: number
  codes: string[]
  isRecommended: boolean
  isSelected: boolean
  useCase: UseCase
  onPick: () => void
}) {
  const scoreTone =
    score >= 75 ? 'text-emerald-700' : score >= 55 ? 'text-amber-700' : 'text-rose-700'
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`flex w-full items-start gap-3 rounded-[10px] border p-3 text-left transition ${
          isSelected ? 'border-[#0f172a] bg-[#f7f7f4]' : 'border-[#E5E5E5] bg-white hover:border-[#0f172a]/30'
        }`}
      >
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <span className={`text-[19px] font-bold leading-none tabular-nums ${scoreTone}`}>{score}</span>
          <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">score</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <EntityLogo name={target.name} kind={target.type} size={22} />
            <p className="text-[14px] font-semibold text-[#0f172a]">{target.name}</p>
            {isRecommended ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden />
                Recommended
              </span>
            ) : null}
            <span className="ml-auto text-[11px] text-[#94a3b8]">{target.rails.join(' · ')}</span>
          </div>

          {/* Reason code chips */}
          {codes.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {codes.map((c) => (
                <span
                  key={c}
                  title={REASON_CODE_DESCRIPTIONS[c] ?? c}
                  className="inline-flex items-center rounded-full border border-[#E5E5E5] bg-[#fafafa] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#475569]"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}

          {/* Metrics */}
          <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#94a3b8]">p95 delay</p>
              <p className="font-medium tabular-nums text-[#0f172a]">{target.delayBySec[useCase]}s</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#94a3b8]">Ambiguity</p>
              <p className="font-medium tabular-nums text-[#0f172a]">{target.ambiguityPct.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#94a3b8]">Defensibility</p>
              <p className="font-medium tabular-nums text-[#0f172a]">{target.defensibility}</p>
            </div>
          </div>
        </div>
      </button>
    </li>
  )
}
