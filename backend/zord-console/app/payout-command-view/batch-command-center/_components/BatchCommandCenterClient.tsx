'use client'

import Link from 'next/link'
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Manrope } from 'next/font/google'
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { markSandboxSetupStep } from '@/services/payout-command/sandbox-setup-guide'
import { ClientChart, Glyph } from '../../today/_components/shared'
import { ZordPipelineStepper } from './ZordPipelineStepper'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_MD,
  HOME_BODY_IMPERIAL_SM,
  HOME_INSIGHT_PROSE,
  HOME_INSIGHT_PROSE_STRONG,
  HOME_TITLE_BLACK,
} from '../../today/_components/command-center/homeCommandCenterTokens'
import {
  dismissNotice,
  noticeDismissed,
  HydrationSafeLocaleTime,
  RecommendedBlackCard,
  reopenNotice,
} from '../../today/_components/command-center/RecommendedBlackCard'

const BATCH_ALL_CLEAR_DISMISS_KEY = 'zord:batch-command-center-all-clear-notice'
import {
  computeFailureCounts,
  aggregateIntelligenceBatches,
  deriveZordPipelineTimeline,
  type ZordPipelineIntake,
  formatInr,
  formatPercent,
  parseUploadedSheet,
  progressFromSummary,
  summaryFromIntelligenceBatchRow,
  sortRowsByLatest,
  type BatchRow,
  type BatchRowStatus,
  type BatchSummary,
  type BatchTimelineStep,
} from '@/services/payout-command/batch-model'
import { postIntentBulkIngest } from '@/services/payout-command/batch-intake/postIntentBulkIngest'
import { parseBulkIngestAcceptedResponse, type ParsedBulkIngestAccepted } from '@/services/payout-command/batch-intake/intakeHttpShared'
import { postSettlementFileUpload } from '@/services/payout-command/batch-intake/postSettlementFileUpload'
import { getProdDlqPage } from '@/services/payout-command/prod-api/getProdDlqPage'
import { getProdIntentsPage } from '@/services/payout-command/prod-api/getProdIntentsPage'
import { getIntelligenceBatchDetail, getIntelligenceBatches, getPatternsKpis } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { ApiDlqRow, ApiIntentRow } from '@/services/payout-command/prod-api/prodApiTypes'
import { isDataAvailable, type BatchDetailResponse, type BatchesListResponse, type PatternsKpiResponse } from '@/services/payout-command/prod-api/intelligenceTypes'
import { CreatePaymentRequestForm } from '../../../customer/intents/create/page'

// Map an intent-engine row → BatchCommandCenter's row shape so the table can render
// real tenant data on initial load (before any CSV upload). Missing fields are
// filled with neutral defaults — provider/bankReference/timeline aren't on
// /api/prod/intents today; backend can extend later without breaking the UI.
function mapIntentRowToBatchRow(intent: ApiIntentRow): BatchRow {
  const upper = (intent.status ?? '').toUpperCase()
  let status: BatchRowStatus = 'Pending'
  if (upper.includes('SUCC') || upper.includes('SETTL') || upper.includes('COMPLETE')) status = 'Success'
  else if (upper.includes('FAIL') || upper.includes('REJECT') || upper.includes('ERROR')) status = 'Failed'
  else if (upper.includes('PROC') || upper.includes('DISPATCH')) status = 'Processing'
  return {
    refId: intent.intent_id,
    amount: typeof intent.amount === 'number' ? intent.amount : Number(intent.amount) || 0,
    beneficiary: intent.envelope_id ? `env_${intent.envelope_id.slice(0, 8)}` : '—',
    status,
    stage: status === 'Failed' ? 'Processing' : 'Intent received',
    reason: status === 'Failed' ? 'See DLQ for reason code' : '—',
    time: intent.created_at ?? '—',
    actionLabel: status === 'Failed' ? 'Replay' : 'View',
    provider: 'RazorpayX',
    dispatchId: intent.envelope_id ?? '',
    bankReference: '',
    timeline: [],
  }
}

function mapDlqRowToBatchRow(row: ApiDlqRow): BatchRow {
  const reason = [row.reason_code, row.error_detail].filter(Boolean).join(' — ') || 'DLQ'
  const stage = (row.stage ?? '').trim() || 'Dead letter'
  return {
    refId: row.dlq_id,
    amount: 0,
    beneficiary: row.envelope_id ? `env_${row.envelope_id.slice(0, 8)}` : '—',
    status: 'Failed',
    stage,
    reason,
    time: row.created_at ?? '—',
    actionLabel: row.replayable ? 'Replay' : 'Review',
    provider: 'RazorpayX',
    dispatchId: row.envelope_id ?? '',
    bankReference: (row.client_batch_ref ?? '').trim(),
    timeline: [],
  }
}

function formatInrFromMinor(minorStr: string | null | undefined): string {
  if (minorStr == null || String(minorStr).trim() === '') return '—'
  const minor = Number(minorStr)
  if (!Number.isFinite(minor)) return '—'
  return formatInr(minor / 100)
}

/**
 * `X-Zord-Source-Type` for bulk ingest — must match zord-edge `TransportValidation`
 * allowlist (REST | CSV | PROMPT | WEBHOOK | FILE_UPLOAD). File format is still
 * chosen from extension inside `BulkIntentHandler`; do not send `XLSX` here or edge returns 400.
 */
function bulkIngestSourceTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'FILE_UPLOAD'
  return 'CSV'
}

type StatusFilter = 'Confirmed' | 'Requires review'
type SortMode = 'Latest' | 'Oldest'

const manropeBatch = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
})

const PIE_COLORS = ['#39E07E', '#ef4444', '#f59e0b', '#3b82f6']
/** After intent bulk-ingest succeeds, poll intent-engine list so ops see live connectivity (not row-level sync). */
const INTENT_ENGINE_POLL_MS = 20_000
/** Poll Intelligence batch detail for the operational snapshot card. */
const BATCH_INTEL_POLL_MS = 15_000
/** Poll KPI 14 (pattern anomaly) for the same batch id as batch detail. */
const PATTERN_KPI_POLL_MS = 20_000
/** Avoid hitting `/v1/intelligence/batches/{id}` on every keystroke while ops type a batch id. */
const BATCH_INTEL_ID_DEBOUNCE_MS = 450
const PAGE_SIZE = 10
const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'Confirmed', label: 'Confirmed' },
  { value: 'Requires review', label: 'Requires review' },
]

function statusBadgeClass(status: BatchRowStatus) {
  if (status === 'Success') return 'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]'
  if (status === 'Failed') return 'bg-[#ecfdf5] text-[#166534] border-[#86efac]'
  if (status === 'Pending') return 'bg-[#f0fdf9] text-[#047857] border-[#a7f3d0]'
  return 'bg-[#f0fdf4] text-[#16a34a] border-[#d1fae5]'
}

function statusLabel(status: BatchRowStatus) {
  if (status === 'Success') return 'Confirmed'
  if (status === 'Failed') return 'Requires Review'
  if (status === 'Pending') return 'Pending Confirmation'
  return 'Processing'
}

function disbursementMethodFromProvider(provider: BatchRow['provider']) {
  if (provider === 'RazorpayX' || provider === 'Stripe') return 'Bank Transfer'
  if (provider === 'Cashfree') return 'LSM'
  if (provider === 'PayU') return 'NACH'
  return 'Other'
}

function mandateStatusFromRow(row: BatchRow) {
  if (row.status === 'Success') return 'Active'
  if (row.status === 'Pending') return 'Pending Authorization'
  if (row.status === 'Failed') return 'Failed'
  return 'Pending Authorization'
}

function timelineStateClass(state: BatchTimelineStep['state']) {
  if (state === 'done') return 'bg-[#f0fdf4] border-[#86efac] text-[#15803d]'
  if (state === 'active')
    return 'bg-[#eff6ff] border-[#6366f1] text-[#1d4ed8] shadow-[0_0_0_1px_rgba(99,102,241,0.18)] motion-safe:animate-pulse'
  if (state === 'warning') return 'bg-[#fffbeb] border-[#f59e0b] text-[#b45309]'
  return 'bg-slate-50 border-[#e5e5e2] text-[#888888]'
}

function timelineDotColor(state: BatchTimelineStep['state']) {
  if (state === 'done') return '#39E07E'
  if (state === 'active') return '#3b82f6'
  if (state === 'warning') return '#f59e0b'
  return '#d4d4d0'
}

function providerGlyph(provider: BatchRow['provider']) {
  if (provider === 'RazorpayX') return 'R'
  if (provider === 'Cashfree') return 'C'
  if (provider === 'PayU') return 'P'
  return 'S'
}

function toCsv(rows: BatchRow[]) {
  const header = ['Request ID', 'Amount', 'Borrower', 'Disbursement status', 'Stage', 'Reason', 'Last updated', 'Payment partner', 'Partner reference', 'Bank reference']
  const lines = rows.map((row) =>
    [row.refId, row.amount, row.beneficiary, row.status, row.stage, row.reason, row.time, row.provider, row.dispatchId, row.bankReference]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

function recomputeSummary(rows: BatchRow[], fallbackTotalRows: number): BatchSummary {
  const statusCounts = rows.reduce(
    (acc, row) => { acc[row.status] += 1; return acc },
    { Success: 0, Failed: 0, Pending: 0, Processing: 0 } as Record<BatchRowStatus, number>,
  )
  const totalRows = Math.max(rows.length, fallbackTotalRows)
  const processed = totalRows - statusCounts.Processing
  return { totalRows, processed, success: statusCounts.Success, failed: statusCounts.Failed, pending: statusCounts.Pending }
}

/* ── Primitives ── */

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className={COMMAND_CENTER_LABEL_GREEN}>{children}</div>
}

function CommandCenterCardGlow() {
  return (
    <div
      className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full blur-3xl"
      style={{ background: 'radial-gradient(circle, rgba(61,255,130,0.2) 0%, transparent 72%)' }}
      aria-hidden
    />
  )
}

function BatchSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className={`mt-2 text-[1.34rem] font-semibold tracking-[-0.03em] ${HOME_TITLE_BLACK}`}>{children}</h2>
  )
}

function ExceptionIssueCard({
  problem,
  impact,
  action,
}: {
  problem: string
  impact: string
  action: string
}) {
  return (
    <article className={`${COMMAND_CENTER_KPI_CARD} min-h-[200px]`}>
      <CommandCenterCardGlow />
      <span className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Requires attention</span>
      <h3 className={`relative mt-2 text-[18px] font-semibold leading-snug tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
        {problem}
      </h3>
      <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
        <span className={HOME_INSIGHT_PROSE_STRONG}>Impact: </span>
        {impact}
      </p>
      <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
        <span className={HOME_INSIGHT_PROSE_STRONG}>Action: </span>
        {action}
      </p>
    </article>
  )
}

function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-[#E5E5E5] bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  )
}

function StatCard({ label, value, sub, deltaPct, insight, actionLabel, onAction }: {
  label: string
  value: string
  sub?: string
  deltaPct?: string
  insight?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <article className={`${COMMAND_CENTER_KPI_CARD} h-full`}>
      <CommandCenterCardGlow />
      <SectionLabel>{label}</SectionLabel>
      <div className="relative mt-3 flex flex-wrap items-baseline gap-2">
        <div className={`text-[42px] font-extrabold tabular-nums tracking-[-0.03em] leading-none ${HOME_TITLE_BLACK}`}>{value}</div>
        {deltaPct ? <span className={`text-[13px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{deltaPct}</span> : null}
      </div>
      {sub ? <div className={`mt-2 tracking-[0] ${HOME_BODY_IMPERIAL_MD}`}>{sub}</div> : null}
      {insight ? (
        <p className={`mt-3 border-t border-slate-200/90 pt-3 ${HOME_INSIGHT_PROSE}`}>
          <span className={HOME_INSIGHT_PROSE_STRONG}>Insight: </span>
          {insight}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={`mt-auto pt-4 text-left text-[13px] font-medium underline decoration-[#d0d0cc] underline-offset-2 hover:decoration-[#000000] ${HOME_TITLE_BLACK}`}
        >
          {actionLabel}
        </button>
      ) : actionLabel ? (
        <p className={`mt-auto pt-4 text-[13px] font-medium ${HOME_TITLE_BLACK}`}>
          Action: {actionLabel}
        </p>
      ) : null}
    </article>
  )
}

function DataTable({ head, rows, footer }: {
  head: string[]
  rows: Array<Array<ReactNode>>
  footer?: string
}) {
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-[#E5E5E5]">
        <table className="min-w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-[#E5E5E5] bg-slate-50">
              {head.map((h) => (
                <th key={h} className={`px-4 py-2.5 ${COMMAND_CENTER_LABEL_GREEN}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i < rows.length - 1 ? 'border-b border-slate-100' : ''}>
                {row.map((cell, j) => (
                  <td key={j} className={`px-4 py-3 ${j === 0 ? `font-medium ${HOME_TITLE_BLACK}` : HOME_BODY_IMPERIAL_SM}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer ? <p className={`mt-3 ${HOME_INSIGHT_PROSE}`}>{footer}</p> : null}
    </div>
  )
}

/* ── Main ── */

export default function BatchCommandCenterClient() {
  const [rows, setRows] = useState<BatchRow[]>([])
  const [summary, setSummary] = useState<BatchSummary>(() => ({
    totalRows: 0,
    processed: 0,
    success: 0,
    failed: 0,
    pending: 0,
  }))
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Confirmed')
  const [sortMode, setSortMode] = useState<SortMode>('Latest')
  const [selectedFailureReason, setSelectedFailureReason] = useState<string | null>(null)
  const [expandedRef, setExpandedRef] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date())
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'ready'>('idle')
  const [uploadRelayState, setUploadRelayState] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle')
  const [uploadRelayMessage, setUploadRelayMessage] = useState<string | null>(null)
  /** 2-step intake: intent batch → settlement file. */
  const [intentFileName, setIntentFileName] = useState<string | null>(null)
  const [settlementFileName, setSettlementFileName] = useState<string | null>(null)
  const [intakeStep, setIntakeStep] = useState<'idle' | 'intent_uploading' | 'intent_ready' | 'settlement_uploading' | 'closed'>('idle')
  // Top tab toggle — Bulk batch upload (default) vs single intent creation form
  // reused from /customer/intents/create. Same component, same backend path.
  const [intakeTab, setIntakeTab] = useState<'batch' | 'single'>('batch')
  const [apiKey, setApiKey] = useState('')
  const [tenantType, setTenantType] = useState<'MERCHANT' | 'BANK' | 'NBFC' | 'VENDOR' | 'GATEWAY'>('MERCHANT')
  const [batchIdInput, setBatchIdInput] = useState('')
  const { tenantId, tenantReady } = useSessionTenant()
  const [psp, setPsp] = useState(() => process.env.NEXT_PUBLIC_ZORD_SETTLEMENT_PSP ?? 'razorpay')
  const [intentIngestOk, setIntentIngestOk] = useState(false)
  /** Last successful Step-1 bulk ingest HTTP body (shown in its own card). */
  const [intentBulkIngestAck, setIntentBulkIngestAck] = useState<{
    httpStatus: number
    parsed: ParsedBulkIngestAccepted | null
    rawFallback: string
    at: Date
  } | null>(null)
  /** Batch id used for settlement (response body, optional Step 1 field, or LOCAL-* fallback). */
  const [settlementBatchId, setSettlementBatchId] = useState<string | null>(null)
  const settlementFileInputRef = useRef<HTMLInputElement>(null)
  const toolbarNoticeTimerRef = useRef<number | null>(null)
  const [toolbarNotice, setToolbarNotice] = useState<string | null>(null)
  const [allClearNoticeDismissed, setAllClearNoticeDismissed] = useState(false)

  useEffect(() => {
    setAllClearNoticeDismissed(noticeDismissed(BATCH_ALL_CLEAR_DISMISS_KEY))
  }, [])
  const [shareBusy, setShareBusy] = useState(false)
  const showToolbarNotice = useCallback((message: string) => {
    setToolbarNotice(message)
    if (toolbarNoticeTimerRef.current) window.clearTimeout(toolbarNoticeTimerRef.current)
    toolbarNoticeTimerRef.current = window.setTimeout(() => {
      setToolbarNotice(null)
      toolbarNoticeTimerRef.current = null
    }, 4500)
  }, [])

  useEffect(() => {
    return () => {
      if (toolbarNoticeTimerRef.current) window.clearTimeout(toolbarNoticeTimerRef.current)
    }
  }, [])

  const [intentEnginePoll, setIntentEnginePoll] = useState<{
    ok: boolean
    intentTotal: number | null
    at: Date
    err?: string
  } | null>(null)

  const [intelBatchDetail, setIntelBatchDetail] = useState<BatchDetailResponse | null>(null)
  const [intelBatchDetailLoading, setIntelBatchDetailLoading] = useState(false)
  const [intelBatchDetailError, setIntelBatchDetailError] = useState<string | null>(null)
  const [intelBatchDetailAt, setIntelBatchDetailAt] = useState<Date | null>(null)
  const [intelBatchesList, setIntelBatchesList] = useState<BatchesListResponse | null>(null)
  const [patternsKpi, setPatternsKpi] = useState<PatternsKpiResponse | null>(null)

  const settlementBatchIdResolved = useMemo(
    () => (settlementBatchId ?? batchIdInput.trim()).trim(),
    [batchIdInput, settlementBatchId],
  )
  const [debouncedBatchIdForIntelPoll, setDebouncedBatchIdForIntelPoll] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedBatchIdForIntelPoll(settlementBatchIdResolved)
    }, BATCH_INTEL_ID_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [settlementBatchIdResolved])

  const settlementCredentialsReady = useMemo(
    () => tenantReady && psp.trim().length > 0 && settlementBatchIdResolved.length > 0,
    [psp, settlementBatchIdResolved, tenantReady],
  )
  const settlementPickerEnabled = settlementCredentialsReady && intakeStep !== 'settlement_uploading'

  const loadIntelBatchDetail = useCallback(async () => {
    if (!tenantReady) {
      setIntelBatchDetail(null)
      setIntelBatchDetailError(null)
      setIntelBatchDetailAt(null)
      setIntelBatchDetailLoading(false)
      setIntelBatchesList(null)
      return
    }
    setIntelBatchDetailLoading(true)
    setIntelBatchDetailError(null)
    try {
      const list = await getIntelligenceBatches({ limit: 50 })
      setIntelBatchesList(list)
      let opBatch = debouncedBatchIdForIntelPoll.trim()
      if (opBatch.startsWith('LOCAL-')) opBatch = ''
      let batchId = opBatch
      if (!batchId) {
        batchId = list?.batches?.[0]?.batch_id?.trim() ?? ''
      } else {
        }
      if (!batchId) {
        setIntelBatchDetail(null)
        setIntelBatchDetailError(
          opBatch ? 'Intelligence has no record for this batch id yet (or the request was denied).' : null,
        )
        setIntelBatchDetailAt(new Date())
        return
      }
      const res = await getIntelligenceBatchDetail(batchId)
      setIntelBatchDetail(res)
      setIntelBatchDetailAt(new Date())
      if (!res) {
        setIntelBatchDetailError(
          opBatch ? 'Intelligence has no record for this batch id yet (or the request was denied).' : null,
        )
      }
    } catch (e) {
      setIntelBatchDetail(null)
      setIntelBatchDetailError(e instanceof Error ? e.message : 'Intelligence request failed')
      setIntelBatchDetailAt(new Date())
    } finally {
      setIntelBatchDetailLoading(false)
    }
  }, [debouncedBatchIdForIntelPoll, tenantReady])

  useEffect(() => {
    if (!tenantReady) {
      setIntelBatchDetail(null)
      setIntelBatchDetailError(null)
      setIntelBatchDetailAt(null)
      setIntelBatchesList(null)
      return
    }
    void loadIntelBatchDetail()
    const id = window.setInterval(() => void loadIntelBatchDetail(), BATCH_INTEL_POLL_MS)
    return () => window.clearInterval(id)
  }, [tenantReady, loadIntelBatchDetail])

  const loadPatternsKpi = useCallback(async () => {
    if (!tenantReady) {
      setPatternsKpi(null)
      return
    }
    let batchForQuery = debouncedBatchIdForIntelPoll.trim()
    if (!batchForQuery || batchForQuery.startsWith('LOCAL-')) batchForQuery = ''
    const p = await getPatternsKpis(batchForQuery || undefined)
    setPatternsKpi(p)
  }, [debouncedBatchIdForIntelPoll, tenantReady])

  useEffect(() => {
    if (!tenantReady) {
      setPatternsKpi(null)
      return
    }
    void loadPatternsKpi()
    const id = window.setInterval(() => void loadPatternsKpi(), PATTERN_KPI_POLL_MS)
    return () => clearInterval(id)
  }, [tenantReady, loadPatternsKpi])

  /** Confirmed tab → GET /api/prod/intents (Success rows). Requires review → GET /api/prod/dlq. */
  const loadProdCommandTable = useCallback(async () => {
    if (!tenantReady) return
    try {
      if (statusFilter === 'Confirmed') {
        const res = await getProdIntentsPage('page=1&page_size=120')
        const items = res?.items ?? []
        const mapped = items.map(mapIntentRowToBatchRow).filter((r) => r.status === 'Success')
        setRows(mapped)
        setSummary(recomputeSummary(mapped, mapped.length))
      } else {
        const res = await getProdDlqPage()
        const items = res?.items ?? []
        const mapped = items.map(mapDlqRowToBatchRow)
        setRows(mapped)
        setSummary(recomputeSummary(mapped, mapped.length))
      }
      setLastRefreshedAt(new Date())
    } catch {
      setRows([])
      setSummary(recomputeSummary([], 0))
      setLastRefreshedAt(new Date())
    }
  }, [tenantReady, statusFilter])

  const refreshSnapshot = useCallback(() => {
    if (!tenantReady) {
      showToolbarNotice('Sign in so the console can load tenant-scoped batch data.')
      return
    }
    void loadProdCommandTable()
    void loadIntelBatchDetail()
    void loadPatternsKpi()
    setLastRefreshedAt(new Date())
    showToolbarNotice('Confirmed/DLQ table, Intelligence batch, and pattern KPI refreshed from API.')
  }, [loadIntelBatchDetail, loadPatternsKpi, loadProdCommandTable, showToolbarNotice, tenantReady])

  /** Header refresh — reloads prod APIs (no local row simulation). */
  const manualRefreshSnapshot = refreshSnapshot

  const pollIntentEngineTenant = useCallback(async () => {
    if (!tenantReady || !intentIngestOk) return
    try {
      const res = await getProdIntentsPage('page=1&page_size=1')
      const total = res?.pagination?.total
      const items = res?.items
      const intentTotal = typeof total === 'number' ? total : Array.isArray(items) ? items.length : null
      setIntentEnginePoll({ ok: true, intentTotal, at: new Date() })
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Request failed'
      setIntentEnginePoll({ ok: false, intentTotal: null, at: new Date(), err })
    }
  }, [tenantReady, intentIngestOk])

  useEffect(() => {
    if (!intentIngestOk || !tenantReady) {
      setIntentEnginePoll(null)
      return
    }
    void pollIntentEngineTenant()
    const id = window.setInterval(() => void pollIntentEngineTenant(), INTENT_ENGINE_POLL_MS)
    return () => window.clearInterval(id)
  }, [intentIngestOk, tenantReady, pollIntentEngineTenant])

  useEffect(() => {
    if (!tenantReady) return
    void loadProdCommandTable()
  }, [tenantReady, statusFilter, loadProdCommandTable])

  const applyLocalSheetFromFile = useCallback(async (file: File) => {
    setUploadState('uploading')
    setUploadedFileName(file.name)
    const parsed = await parseUploadedSheet(file)
    setRows(parsed)
    setSummary(recomputeSummary(parsed, parsed.length))
    setPage(1)
    setExpandedRef(null)
    setSelectedFailureReason(null)
    setUploadState('ready')
    setLastRefreshedAt(new Date())
  }, [])

  /**
   * Step 1 — POST /api/bulk-ingest (proxies zord-edge bulk ingest), then local parse for the table.
   * Target model: failed rows → intents (or batch line items) with FAILED + structured errors;
   * DLQ only for true dead letters that never become normal intents.
   */
  const onIntentBatchUpload = useCallback(
    async (file: File | null) => {
      if (!file) return
      setIntentFileName(file.name)
      setIntentIngestOk(false)
      setIntentBulkIngestAck(null)
      setSettlementBatchId(null)
      setSettlementFileName(null)
      setIntakeStep('intent_uploading')
      setUploadRelayState('syncing')
      setUploadRelayMessage('Uploading intent batch to bulk ingest…')
      try {
        const parsed = await parseUploadedSheet(file)
        const bid = batchIdInput.trim()
        const result = await postIntentBulkIngest({
          file,
          apiKeyRaw: apiKey.trim() || undefined,
          sourceType: bulkIngestSourceTypeFromFilename(file.name),
          tenantType,
          optionalBatchId: bid || undefined,
        })
        if (!result.ok) {
          throw new Error(result.errorMessage ?? `HTTP ${result.httpStatus}`)
        }
        const ingestAckParsed = parseBulkIngestAcceptedResponse(result.responseText)
        setIntentBulkIngestAck({
          httpStatus: result.httpStatus,
          parsed: ingestAckParsed,
          rawFallback: ingestAckParsed ? '' : result.responseText.trim().slice(0, 16_000),
          at: new Date(),
        })
        const effectiveBatch = result.batchIdFromBody || bid || null
        const journalBatchId = effectiveBatch ?? `LOCAL-${Date.now()}`
        // Always keep step 2 enabled after a successful ingest: server may omit batch id in the
        // response body while the journal still uses a stable LOCAL-* id for sandbox preview.
        setSettlementBatchId(journalBatchId)
        setIntentIngestOk(true)
        markSandboxSetupStep('intent-ingest')
        setUploadRelayState('synced')
        setUploadRelayMessage(
          effectiveBatch
            ? `Intent batch accepted. Batch-Id for settlement: ${effectiveBatch}. Table below reflects parsed file (preview). Intent Journal loads batches from intelligence and intents from the intent engine for your session tenant.`
            : `Intent batch accepted. Settlement step uses id ${journalBatchId} (enter Batch-Id above and re-run Step 1 if the settlement service requires a server-issued id).`,
        )
        setRows(parsed)
        setSummary(recomputeSummary(parsed, parsed.length))
        setPage(1)
        setExpandedRef(null)
        setSelectedFailureReason(null)
        setUploadState('ready')
        setLastRefreshedAt(new Date())
        setIntakeStep('intent_ready')
      } catch (error) {
        setIntentIngestOk(false)
        setIntentBulkIngestAck(null)
        setSettlementBatchId(null)
        setUploadRelayState('failed')
        setUploadRelayMessage(`Intent ingest failed (${error instanceof Error ? error.message : 'unknown error'}). Step 2 stays locked until ingest succeeds.`)
        setIntakeStep('idle')
      }
    },
    [apiKey, batchIdInput, tenantType],
  )

  /** Step 2 — POST /api/settlement/upload (proxies settlement service). Does not replace the table with the settlement file. */
  const onSettlementUpload = useCallback(
    async (file: File | null) => {
      if (!file) return
      const pspVal = psp.trim()
      const bid = (settlementBatchId ?? batchIdInput.trim()).trim()
      if (!tenantReady || !pspVal || !bid) {
        setUploadRelayState('failed')
        setUploadRelayMessage(
          'Settlement upload needs an active session, psp, and Batch-Id (complete Step 1 or enter Batch-Id in the field above).',
        )
        return
      }
      setSettlementFileName(file.name)
      setIntakeStep('settlement_uploading')
      setUploadRelayState('syncing')
      setUploadRelayMessage('Uploading settlement file…')
      try {
        const result = await postSettlementFileUpload({
          file,
          apiKeyRaw: apiKey.trim() || undefined,
          psp: pspVal,
          batchId: bid,
        })
        if (!result.ok) {
          throw new Error(result.errorMessage ?? `HTTP ${result.httpStatus}`)
        }
        setUploadRelayState('synced')
        setUploadRelayMessage('Settlement file accepted. Matching runs against the intent batch on the server.')
        markSandboxSetupStep('settlement')
        setIntakeStep('closed')
      } catch (error) {
        setUploadRelayState('failed')
        setUploadRelayMessage(`Settlement upload failed (${error instanceof Error ? error.message : 'unknown error'}).`)
        setIntakeStep('intent_ready')
      } finally {
        const el = settlementFileInputRef.current
        if (el) el.value = ''
      }
    },
    [apiKey, batchIdInput, psp, settlementBatchId, tenantReady],
  )

  const retryFailedRows = useCallback(() => {
    setRows((prev) => {
      const next = prev.map((row) =>
        row.status === 'Failed'
          ? {
              ...row,
              status: 'Processing' as const,
              stage: 'Queued for retry',
              reason: '—',
              actionLabel: 'Track progress',
            }
          : row,
      )
      setSummary(recomputeSummary(next, next.length))
      return next
    })
    setSelectedFailureReason(null)
    setStatusFilter('Requires review')
    setPage(1)
    setLastRefreshedAt(new Date())
    showToolbarNotice(
      'Retry failed: every “Requires review” row was re-queued as processing so you can simulate a partner replay or manual fix before settlement.',
    )
  }, [showToolbarNotice])

  const failureCounts = useMemo(() => computeFailureCounts(rows), [rows])

  /** Non-empty only when ops entered a real server batch id (not LOCAL-* preview). */
  const operatorIntelBatchId = useMemo(() => {
    const b = debouncedBatchIdForIntelPoll.trim()
    if (!b || b.startsWith('LOCAL-')) return ''
    return b
  }, [debouncedBatchIdForIntelPoll])

  const intelligenceCardSummary = useMemo((): BatchSummary | null => {
    if (!intelBatchDetail?.batch || !tenantReady) return null
    const loadedId = intelBatchDetail.batch.batch_id?.trim()
    if (!loadedId) return null
    if (operatorIntelBatchId && loadedId !== operatorIntelBatchId) return null
    return summaryFromIntelligenceBatchRow(intelBatchDetail.batch)
  }, [intelBatchDetail, operatorIntelBatchId, tenantReady])

  const statCardsSummary = useMemo(
    () => intelligenceCardSummary ?? summary,
    [intelligenceCardSummary, summary],
  )

  /** Pie + tenant rollups: scoped batch when Batch-Id set; else summed batches or pattern KPI counts. */
  const pieDistributionSummary = useMemo(() => {
    if (operatorIntelBatchId) return statCardsSummary
    const batches = intelBatchesList?.batches ?? []
    if (batches.length > 0) {
      const agg = aggregateIntelligenceBatches(batches)
      if (agg.totalRows > 0) return agg
    }
    if (isDataAvailable(patternsKpi) && patternsKpi.total_count > 0) {
      return summaryFromIntelligenceBatchRow({
        total_count: patternsKpi.total_count,
        success_count: patternsKpi.success_count,
        failed_count: patternsKpi.failed_count,
        pending_count: patternsKpi.pending_count,
      })
    }
    return statCardsSummary
  }, [intelBatchesList, operatorIntelBatchId, patternsKpi, statCardsSummary])

  const pieProgress = useMemo(() => progressFromSummary(pieDistributionSummary), [pieDistributionSummary])

  const progress = useMemo(() => progressFromSummary(statCardsSummary), [statCardsSummary])

  const pipelineIntake = useMemo<ZordPipelineIntake>(
    () => ({
      intakeStep,
      intentFileName,
      intentIngestOk,
      settlementFileName,
      uploadedFileName,
      uploadState,
    }),
    [intakeStep, intentFileName, intentIngestOk, settlementFileName, uploadedFileName, uploadState],
  )

  const timeline = useMemo(
    () => deriveZordPipelineTimeline(statCardsSummary, pipelineIntake),
    [pipelineIntake, statCardsSummary],
  )

  const pipelineBusy = useMemo(() => timeline.some((s) => s.state === 'active'), [timeline])

  const timelineProgressPct = useMemo(() => {
    const n = timeline.length
    const done = timeline.filter((s) => s.state === 'done').length
    const bump = timeline.some((s) => s.state === 'active') ? 0.45 : timeline.some((s) => s.state === 'warning') ? 0.25 : 0
    return Math.min(100, ((done + bump) / Math.max(n, 1)) * 100)
  }, [timeline])
  const processingCount = Math.max(0, statCardsSummary.totalRows - statCardsSummary.processed)
  const failureRate = statCardsSummary.totalRows ? (statCardsSummary.failed / statCardsSummary.totalRows) * 100 : 0

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    let next = rows
    if (query) {
      next = next.filter((r) =>
        r.refId.toLowerCase().includes(query) || r.beneficiary.toLowerCase().includes(query),
      )
    }
    if (selectedFailureReason) next = next.filter((r) => r.reason === selectedFailureReason)
    return sortRowsByLatest(next, sortMode)
  }, [rows, search, selectedFailureReason, sortMode])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => { setPage((c) => Math.min(c, totalPages)) }, [totalPages])

  const pieData = useMemo(
    () => [
      { name: 'Confirmed', value: pieProgress.successPct },
      { name: 'Requires review', value: pieProgress.failedPct },
      { name: 'Pending confirmation', value: pieProgress.pendingPct },
      { name: 'Processing', value: pieProgress.processingPct },
    ],
    [pieProgress.failedPct, pieProgress.pendingPct, pieProgress.processingPct, pieProgress.successPct],
  )

  const showIntelBatchesTable = useMemo(
    () => Boolean(tenantReady && (intelBatchesList?.batches?.length ?? 0) > 0),
    [intelBatchesList, tenantReady],
  )

  const intelligenceBatchesTableRows = useMemo(() => {
    const list = intelBatchesList?.batches ?? []
    return list.map((row) => {
      const id = row.batch_id ?? ''
      const idShort = id.length > 38 ? `${id.slice(0, 36)}…` : id
      return [
        <span key={`bid-${id}`} title={id} className="font-mono text-[12px] text-[#0A0A0A]">
          {idShort}
        </span>,
        String(row.finality_status ?? '').replace(/_/g, ' ') || '—',
        row.total_count.toLocaleString('en-IN'),
        row.success_count.toLocaleString('en-IN'),
        row.failed_count.toLocaleString('en-IN'),
        row.pending_count.toLocaleString('en-IN'),
      ]
    })
  }, [intelBatchesList])

  const averageAmount = useMemo(() => {
    if (!rows.length) return 0
    return rows.reduce((sum, r) => sum + r.amount, 0) / rows.length
  }, [rows])

  const rowModelAmountSummary = useMemo(() => {
    const totalRows = Math.max(statCardsSummary.totalRows, 1)
    const totalAmount = averageAmount * statCardsSummary.totalRows
    const settledAmount = totalAmount * (statCardsSummary.success / totalRows)
    const failedAmount = totalAmount * (statCardsSummary.failed / totalRows)
    const pendingAmount = totalAmount * ((statCardsSummary.pending + processingCount) / totalRows)
    return { totalAmount, settledAmount, failedAmount, pendingAmount }
  }, [averageAmount, processingCount, statCardsSummary])

  const intelRupeeSummary = useMemo(() => {
    if (!intelligenceCardSummary || !intelBatchDetail?.batch_health || !intelBatchDetail?.batch) return null
    const h = intelBatchDetail.batch_health
    const b = intelBatchDetail.batch
    const intendedMinor = Number(h.total_intended_amount_minor)
    const confirmedMinor = Number(h.total_confirmed_amount_minor)
    if (!Number.isFinite(intendedMinor) || !Number.isFinite(confirmedMinor)) return null
    const totalAmount = intendedMinor / 100
    const settledAmount = confirmedMinor / 100
    const unresolvedInr = Math.max(0, totalAmount - settledAmount)
    const p = Math.max(0, b.pending_count)
    const f = Math.max(0, b.failed_count)
    const denom = p + f
    const w = denom > 0 ? p / denom : 0.5
    const pendingAmount = unresolvedInr * w
    const failedAmount = unresolvedInr * (1 - w)
    return { totalAmount, settledAmount, failedAmount, pendingAmount }
  }, [intelBatchDetail, intelligenceCardSummary])

  const amountSummary = intelRupeeSummary ?? rowModelAmountSummary

  const trendSeries = useMemo(() => {
    const n = 12
    const targetConfirmed = statCardsSummary.success / Math.max(statCardsSummary.totalRows, 1)
    const targetPending = (statCardsSummary.pending + processingCount) / Math.max(statCardsSummary.totalRows, 1)
    const periodLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return Array.from({ length: n }, (_, i) => {
      const t = i / Math.max(n - 1, 1)
      const noise = 0.035 * Math.sin(i * 1.15)
      const confirmed = Math.max(0, Math.min(100, Math.round(100 * (targetConfirmed * (0.58 + 0.42 * t) + noise))))
      const pending = Math.max(0, Math.min(100, Math.round(100 * (targetPending * (1 - 0.4 * t) - noise * 0.45))))
      const confirmedPrior = Math.max(
        0,
        Math.min(100, Math.round(100 * (targetConfirmed * (0.52 + 0.28 * t) - noise * 0.3))),
      )
      return {
        label: periodLabels[i] ?? `${i + 1}`,
        confirmed,
        pending,
        confirmedPrior,
      }
    })
  }, [processingCount, statCardsSummary.pending, statCardsSummary.success, statCardsSummary.totalRows])

  const trendInsight = useMemo(() => {
    if (progress.pendingPct > progress.failedPct && progress.pendingPct > 8) {
      return 'Pending confirmation share is elevated; prioritize bank reference checks before closing the batch.'
    }
    if (progress.failedPct > 6) {
      return 'Requires-review volume is elevated; filter by exception reason and clear the highest-value items first.'
    }
    return 'Confirmed share is trending stable; keep polling bank confirmation until pending confirmation clears.'
  }, [progress.failedPct, progress.pendingPct])

  const exceptionHighlights = useMemo(() => {
    const top = [...failureCounts].sort((a, b) => b.count - a.count).slice(0, 3)
    const valuePerFailure = statCardsSummary.failed ? amountSummary.failedAmount / statCardsSummary.failed : 0
    return top.map((item) => ({
      ...item,
      value: item.count * valuePerFailure,
      problem: item.reason,
      impact: `${item.count.toLocaleString('en-IN')} transactions (~${formatInr(item.count * valuePerFailure)})`,
      action:
        item.reason === 'Bank Timeout'
          ? 'Follow up with the payment partner and bank for confirmation timestamps.'
          : item.reason === 'Insufficient Balance'
            ? 'Fund the disbursement account or split the batch before retrying.'
            : item.reason === 'Invalid Account'
              ? 'Validate beneficiary details in the loan system, then resubmit.'
              : 'Open the filtered table, verify source records, and retry or escalate.',
    }))
  }, [amountSummary.failedAmount, failureCounts, statCardsSummary.failed])

  const reviewCount = useMemo(() => {
    if (intelligenceCardSummary) return statCardsSummary.failed
    return summary.failed + Math.round(summary.pending * 0.35)
  }, [intelligenceCardSummary, statCardsSummary.failed, summary.failed, summary.pending])

  const requiresReviewStatInsight = useMemo(() => {
    const base = 'These items block a clean operational close until retried or corrected.'
    if (!isDataAvailable(patternsKpi)) return base
    const sc = patternsKpi.batch_anomaly_score
    const level = patternsKpi.anomaly_level.replace(/_/g, ' ')
    const shown =
      Number.isFinite(sc) && sc >= 0 && sc <= 1 ? `${(sc * 100).toFixed(1)}%` : `${Number(sc).toFixed(3)}`
    return `${base} Pattern KPI (Isolation Forest): anomaly ${shown} · ${level}.`
  }, [patternsKpi])

  const intelligenceFootnoteBatchId = useMemo(
    () => intelBatchDetail?.batch?.batch_id?.trim() ?? '',
    [intelBatchDetail],
  )

  const downloadReport = useCallback(() => {
    const exportRows = filteredRows.length ? filteredRows : rows
    const csv = toCsv(exportRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `batch-report-${new Date().toISOString().slice(0, 19)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    showToolbarNotice(`Downloaded CSV with ${exportRows.length} row${exportRows.length === 1 ? '' : 's'} (current table filters applied).`)
  }, [filteredRows, rows, showToolbarNotice])

  const shareBatchSummary = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const batchLabel = (settlementBatchId ?? batchIdInput.trim()) || '—'
    const tid = tenantId.trim() || '—'
    const stillProcessing = Math.max(0, statCardsSummary.totalRows - statCardsSummary.processed)
    const text = [
      'Zord — Batch Command Center snapshot',
      '',
      `Tenant: ${tid}`,
      `Batch / correlation id: ${batchLabel}`,
      `Total rows: ${statCardsSummary.totalRows}`,
      `Confirmed: ${statCardsSummary.success} · Pending: ${statCardsSummary.pending} · Failed (needs review): ${statCardsSummary.failed} · Still processing: ${stillProcessing}`,
      '',
      `Open in console: ${url}`,
    ].join('\n')
    const subject = `Batch status · ${batchLabel}`
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: subject, text, url })
        showToolbarNotice('Shared via your device (native share).')
        return
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return
      }
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    showToolbarNotice('Opened your email client with a pre-filled batch summary — add recipients and send.')
  }, [batchIdInput, settlementBatchId, showToolbarNotice, statCardsSummary, tenantId])

  const scrollToExceptions = useCallback(() => {
    document.getElementById('exceptions-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div
      className={`${manropeBatch.className} payout-command-console text-[13px] font-normal leading-relaxed tracking-[0] text-[#1A1A1A] antialiased`}
    >
      <div className="mx-auto max-w-[1440px] space-y-5">
        {/* In-page toolbar — aligned with home command shell (slate border + soft lift). */}
        <div className="flex flex-col gap-3 rounded-[12px] border border-slate-200/90 bg-white/95 px-4 py-3 shadow-[0_2px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex min-h-10 w-full min-w-0 flex-1 items-center sm:max-w-xl">
            <span className="pointer-events-none absolute left-3 flex text-[#888888]">
              <Glyph name="search" className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search Request ID or borrower…"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-slate-200/90 bg-slate-50 py-2 pl-9 pr-3 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400/55 focus:bg-white focus:ring-2 focus:ring-sky-400/15"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-[#E5E5E5] bg-slate-50 px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#000000] text-[12px] font-semibold text-white">OS</div>
            <div className="min-w-0">
              <div className={`text-[14px] font-medium leading-tight ${HOME_TITLE_BLACK}`}>Operations lead</div>
              <div className="text-[12px] leading-tight text-[#888888]">Disbursement operations</div>
            </div>
          </div>
        </div>

        {toolbarNotice ? (
          <div
            role="status"
            className="rounded-xl border border-slate-200/90 bg-slate-100 px-4 py-2.5 text-[13px] font-medium text-slate-800 shadow-sm"
          >
            {toolbarNotice}
          </div>
        ) : null}

        {/* ─── Page header (home command center typography) ───────────── */}
        <div className="rounded-[12px] border border-slate-200/90 bg-white/95 px-3 py-3 shadow-[0_2px_12px_rgba(15,23,42,0.04)] backdrop-blur-sm sm:px-3.5 sm:py-3">
          <h2 className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full bg-[#39E07E] px-3.5 py-1.5 text-[14px] font-medium tracking-[0] text-[#000000] shadow-sm ring-1 ring-[#39E07E]/30">
            Batch · command center
          </h2>
          <div className="mt-2 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[13px] text-[#888888]">
              <span>Workspaces</span>
              <span className="text-[#d0d0cc]">/</span>
              <span>Overview</span>
              <span className="text-[#d0d0cc]">/</span>
              <span className={HOME_TITLE_BLACK}>Batch operations</span>
            </div>
            <h1 className={`mt-1 text-[20px] font-semibold leading-snug tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
              Batch Disbursement &amp; Settlement Overview
            </h1>
            <p className={`mt-0.5 max-w-2xl ${HOME_BODY_IMPERIAL}`}>
              Track disbursement status, mandate readiness, and settlement confirmation for this batch.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={manualRefreshSnapshot}
              title="Refresh Confirmed/DLQ table, Intelligence batch detail, and pattern KPI from API"
              aria-label="Refresh batch snapshot"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e8e8e5] bg-white text-[#888888] transition hover:bg-slate-50"
            >
              <Glyph name="refresh" className="h-[15px] w-[15px]" />
            </button>
            {(
              [
                {
                  label: 'Download report',
                  title: 'Download CSV of the current table view (search and status filters apply).',
                  action: downloadReport,
                  disabled: false,
                },
                {
                  label: 'Retry failed',
                  title:
                    'Sandbox only: moves every “Requires review” row back to “processing” so you can simulate a replay after fixing data or partner issues.',
                  action: retryFailedRows,
                  disabled: summary.failed === 0,
                },
              ] as const
            ).map(({ label, title, action, disabled }) => (
              <button
                key={label}
                type="button"
                title={title}
                onClick={action}
                disabled={disabled}
                className="h-9 rounded-xl border border-[#E5E5E5] bg-white px-3.5 text-[14px] font-medium text-[#000000] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {label}
              </button>
            ))}
            <Link
              href="/payout-command-view/today?dock=grid"
              title="Open payout command view on Intent Journal"
              className="flex h-9 items-center rounded-xl border border-[#E5E5E5] bg-white px-3.5 text-[14px] font-medium text-[#000000] transition hover:bg-slate-50"
            >
              Command view
            </Link>
            <button
              type="button"
              title="Share this snapshot via your device, or open an email draft with batch counts (mailto)"
              disabled={shareBusy}
              onClick={() => {
                void (async () => {
                  setShareBusy(true)
                  try {
                    await shareBatchSummary()
                  } finally {
                    setShareBusy(false)
                  }
                })()
              }}
              className="flex h-9 items-center gap-2.5 rounded-xl bg-[#000000] px-4 text-[14px] font-medium text-white transition hover:bg-[#2a2a2a] disabled:cursor-wait disabled:opacity-70"
            >
              <div className="flex -space-x-1.5">
                {(['#d8e6ff', '#dbf7dd', '#edd8f4'] as const).map((bg, i) => (
                  <span key={i} className="flex h-5 w-5 items-center justify-center rounded-full border border-white/50 text-[10px] font-semibold text-[#0A0A0A]" style={{ background: bg }}>
                    {['A', 'F', 'E'][i]}
                  </span>
                ))}
              </div>
              {shareBusy ? 'Opening…' : 'Share'}
            </button>
          </div>
          </div>
        </div>

        {/* ─── Intake tabs: bulk batch vs single payment request ─────────── */}
        <div className="inline-flex items-center gap-1 rounded-[10px] border border-[#E5E5E5] bg-white p-1">
          {(
            [
              { id: 'batch', label: 'Batch upload' },
              { id: 'single', label: 'Create payment request' },
            ] as const
          ).map((tab) => {
            const active = intakeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setIntakeTab(tab.id)}
                className={`rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  active
                    ? 'bg-[#000000] text-white shadow-[0_2px_6px_rgba(15,23,42,0.18)]'
                    : 'text-[#00239C] hover:bg-[#f5f5f5] hover:text-[#000000]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {intakeTab === 'single' ? (
          // Single intent flow — reuses the customer-side form. Same backend
          // path (/v1/ingest); just a different way to create one intent.
          <div className="-mx-6 -mb-6 mt-2 sm:-mx-8">
            <CreatePaymentRequestForm />
          </div>
        ) : null}

        {/* ─── Batch intake — 2-step upload flow ────────────────────────── */}
        {intakeTab === 'batch' ? (
        <>
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-2">
            <SectionLabel>Batch intake</SectionLabel>
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#888888]">Step 1 → Step 2</span>
          </div>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
            Upload the intent batch file first. Once dispatched, upload the settlement file when received from the PSP / bank.
            Tenant and credentials are resolved automatically from your signed-in session.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
                Tenant type
              </span>
              <select
                value={tenantType}
                onChange={(e) => setTenantType(e.target.value as typeof tenantType)}
                className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2 text-[13px] text-[#0A0A0A] outline-none focus:border-[#6366f1]/50"
              >
                <option value="MERCHANT">Merchant</option>
                <option value="VENDOR">Vendor</option>
                <option value="BANK">Bank</option>
                <option value="NBFC">NBFC</option>
                <option value="GATEWAY">Gateway</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Batch-Id (optional)</span>
              <input
                value={batchIdInput}
                onChange={(e) => setBatchIdInput(e.target.value)}
                placeholder="Auto-assigned if empty"
                className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#6366f1]/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">PSP</span>
              <input
                value={psp}
                onChange={(e) => setPsp(e.target.value)}
                placeholder="razorpay"
                className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0A0A0A] outline-none focus:border-[#6366f1]/50"
              />
            </label>
          </div>
          {settlementBatchIdResolved ? (
            <p className="mt-2 text-[12px] text-[#1A1A1A]">
              <span className="font-semibold text-[#334155]">Active Batch-Id: </span>
              <span className="font-mono text-[#0A0A0A]">{settlementBatchIdResolved}</span>
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {/* Step 1 — Intent batch */}
            <label
              className={`group relative flex cursor-pointer flex-col rounded-[14px] border bg-white p-4 transition ${
                intentFileName
                  ? 'border-emerald-200 bg-emerald-50/30'
                  : 'border-[#E5E5E5] hover:border-[#0A0A0A]/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0A0A0A] text-[12px] font-bold text-white">1</span>
                <span className="text-[14px] font-semibold text-[#0A0A0A]">Upload intent batch</span>
                {intentFileName ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Loaded
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#888888]">
                CSV or spreadsheet (XLS / XLSX) from LMS / ERP — one row per payout intent.
              </p>
              {intentFileName ? (
                <p className="mt-2 truncate font-mono text-[12px] text-[#0A0A0A]" title={intentFileName}>
                  {intentFileName}
                </p>
              ) : null}
              <span
                className={`mt-3 inline-flex h-8 w-fit items-center rounded-[8px] px-3 text-[12px] font-medium transition ${
                  intakeStep === 'intent_uploading'
                    ? 'bg-[#0A0A0A] text-white opacity-70'
                    : intentFileName
                      ? 'border border-[#E5E5E5] bg-white text-[#0A0A0A] group-hover:bg-slate-100'
                      : 'bg-[#0A0A0A] text-white group-hover:bg-[#0A0A0A]'
                }`}
              >
                {intakeStep === 'intent_uploading' ? 'Uploading…' : intentFileName ? 'Replace file' : 'Choose file'}
              </span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => void onIntentBatchUpload(e.target.files?.[0] ?? null)}
              />
            </label>

            {/* Step 2 — Settlement (programmatic file click: reliable when input is disabled/enabled and avoids label+hidden quirks). */}
            <div
              role="button"
              tabIndex={settlementPickerEnabled ? 0 : -1}
              aria-disabled={!settlementPickerEnabled}
              className={`group relative flex flex-col rounded-[14px] border bg-white p-4 transition outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]/40 ${
                !settlementCredentialsReady
                  ? 'cursor-not-allowed border-dashed border-[#E5E5E5] opacity-50'
                  : settlementFileName
                    ? 'cursor-pointer border-emerald-200 bg-emerald-50/30'
                    : 'cursor-pointer border-[#E5E5E5] hover:border-[#0A0A0A]/30'
              }`}
              onKeyDown={(e) => {
                if (!settlementPickerEnabled) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  settlementFileInputRef.current?.click()
                }
              }}
              onClick={() => {
                if (!settlementPickerEnabled) return
                settlementFileInputRef.current?.click()
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white ${
                    settlementCredentialsReady ? 'bg-[#0A0A0A]' : 'bg-[#94a3b8]'
                  }`}
                >
                  2
                </span>
                <span className="text-[14px] font-semibold text-[#0A0A0A]">Upload settlement file</span>
                {settlementFileName ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Loaded
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#888888]">
                Bank / PSP settlement file (CSV or spreadsheet) — Zord matches it back to the intent batch.
              </p>
              {settlementFileName ? (
                <p className="mt-2 truncate font-mono text-[12px] text-[#0A0A0A]" title={settlementFileName}>
                  {settlementFileName}
                </p>
              ) : (
                <p className="mt-2 text-[12px] italic text-[#888888]">
                  {settlementCredentialsReady
                    ? 'Click this card or Choose file to pick a settlement file — POST /api/settlement/upload.'
                    : 'Enter Tenant, PSP, and Batch-Id (or complete Step 1) to enable settlement upload.'}
                </p>
              )}
              <span
                className={`mt-3 inline-flex h-8 w-fit items-center rounded-[8px] px-3 text-[12px] font-medium transition ${
                  intakeStep === 'settlement_uploading'
                    ? 'bg-[#0A0A0A] text-white opacity-70'
                    : settlementFileName
                      ? 'border border-[#E5E5E5] bg-white text-[#0A0A0A] group-hover:bg-slate-100'
                      : intentIngestOk && settlementBatchId
                        ? 'bg-[#0A0A0A] text-white group-hover:bg-[#0A0A0A]'
                        : 'bg-[#94a3b8] text-white'
                }`}
              >
                {intakeStep === 'settlement_uploading' ? 'Uploading…' : settlementFileName ? 'Replace file' : 'Choose file'}
              </span>
              <input
                ref={settlementFileInputRef}
                type="file"
                className="hidden"
                disabled={!settlementPickerEnabled}
                aria-label="Settlement file upload"
                onChange={(e) => void onSettlementUpload(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </Card>

        {intentBulkIngestAck ? (
          <Card className="border-emerald-100/80 bg-gradient-to-b from-emerald-50/40 to-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <SectionLabel>Bulk ingest response</SectionLabel>
                <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-[#0A0A0A]">
                  Edge acknowledgment
                </h3>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#888888]">
                  Per-row ack from the last successful intent file upload (same payload as{' '}
                  <code className="rounded bg-black/[0.04] px-1 py-0.5 font-mono text-[12px]">POST /v1/bulk-ingest</code>
                  ). Rows show envelope and trace ids for support and audit.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                    intentBulkIngestAck.httpStatus === 202
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  HTTP {intentBulkIngestAck.httpStatus}
                  {intentBulkIngestAck.httpStatus === 202 ? ' Accepted' : ''}
                </span>
                <time
                  className="text-[11px] text-[#888888]"
                  dateTime={intentBulkIngestAck.at.toISOString()}
                  title={intentBulkIngestAck.at.toISOString()}
                >
                  {intentBulkIngestAck.at.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })}
                </time>
              </div>
            </div>

            {intentBulkIngestAck.parsed ? (
              <>
                <p className="mt-3 text-[13px] text-[#1A1A1A]">
                  <span className="font-semibold text-[#334155]">{intentBulkIngestAck.parsed.total}</span> row
                  {intentBulkIngestAck.parsed.total === 1 ? '' : 's'} in response
                </p>
                <div className="mt-2 max-h-[min(420px,55vh)] overflow-auto rounded-xl border border-[#e2e8f0] bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <table className="min-w-full border-collapse text-left text-[12px]">
                    <thead className="sticky top-0 z-[1] border-b border-[#e2e8f0] bg-[#f8fafc]">
                      <tr className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#888888]">
                        <th className="whitespace-nowrap px-3 py-2.5">Row</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Status</th>
                        <th className="min-w-[200px] px-3 py-2.5">Envelope ID</th>
                        <th className="min-w-[200px] px-3 py-2.5">Trace ID</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9] text-[#0A0A0A]">
                      {intentBulkIngestAck.parsed.rows.map((r) => (
                        <tr key={`${r.row}-${r.envelopeId || r.traceId}`} className="font-mono text-[11px]">
                          <td className="whitespace-nowrap px-3 py-2 text-[#1A1A1A]">{r.row}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span
                              className={
                                r.status.toUpperCase() === 'ACCEPTED'
                                  ? 'rounded-md bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-800'
                                  : r.status.toUpperCase() === 'FAILED' || r.error
                                    ? 'rounded-md bg-red-50 px-1.5 py-0.5 font-semibold text-red-800'
                                    : 'rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700'
                              }
                            >
                              {r.error ? `${r.status} · ${r.error}` : r.status}
                            </span>
                          </td>
                          <td className="max-w-[280px] break-all px-3 py-2 text-[#0A0A0A]">{r.envelopeId || '—'}</td>
                          <td className="max-w-[280px] break-all px-3 py-2 text-[#0A0A0A]">{r.traceId || '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-[#888888]">{r.receivedAt || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : intentBulkIngestAck.rawFallback ? (
              <pre className="mt-3 max-h-[min(360px,50vh)] overflow-auto rounded-xl border border-amber-200/80 bg-amber-50/40 p-3 font-mono text-[11px] leading-relaxed text-[#78350f]">
                {intentBulkIngestAck.rawFallback}
              </pre>
            ) : (
              <p className="mt-3 text-[13px] text-[#888888]">Empty response body.</p>
            )}
          </Card>
        ) : null}
        </>
        ) : null}

        <ZordPipelineStepper steps={timeline} progressPct={timelineProgressPct} busy={pipelineBusy} />

        {/* ─── Alert banners ────────────────────────────────────────────── */}
        {uploadState === 'uploading' && (
          <div className="rounded-xl border border-slate-300/80 bg-slate-100 px-5 py-3.5 text-[14px] font-medium text-slate-800 shadow-sm ring-1 ring-slate-200/60">
            Uploading… Batch received. Processing will begin shortly.
          </div>
        )}
        {processingCount === 0 &&
        statCardsSummary.pending === 0 &&
        statCardsSummary.failed === 0 &&
        allClearNoticeDismissed ? (
          <button
            type="button"
            onClick={() => {
              reopenNotice(BATCH_ALL_CLEAR_DISMISS_KEY)
              setAllClearNoticeDismissed(false)
            }}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-[13px] font-medium text-slate-900 shadow-sm transition hover:bg-slate-50"
          >
            Show all-clear notice
          </button>
        ) : null}
        {processingCount === 0 &&
        statCardsSummary.pending === 0 &&
        statCardsSummary.failed === 0 &&
        !allClearNoticeDismissed ? (
          <RecommendedBlackCard
            eyebrow="Batch health"
            title="No pending confirmations or review items in this batch view."
            bodyBold
            body="Spot-check bank references for material amounts before sign-off."
            footer={
              <>
                Last updated ·{' '}
                <HydrationSafeLocaleTime date={intelBatchDetailAt ?? lastRefreshedAt} />
              </>
            }
            onDismiss={() => {
              dismissNotice(BATCH_ALL_CLEAR_DISMISS_KEY)
              setAllClearNoticeDismissed(true)
            }}
          />
        ) : null}
        {failureRate >= 15 && (
          <div className={`${COMMAND_CENTER_KPI_CARD} space-y-2`}>
            <CommandCenterCardGlow />
            <div className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Exception</div>
            <p className={`relative text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>
              Requires-review rate is {failureRate.toFixed(1)}% for this batch.
            </p>
            <p className={`relative ${HOME_BODY_IMPERIAL_SM}`}>
              <span className={HOME_INSIGHT_PROSE_STRONG}>Impact: </span>
              {statCardsSummary.failed.toLocaleString('en-IN')} transactions (~{formatInr(amountSummary.failedAmount)}) need clearance before the batch is operationally clean.
            </p>
            <p className={`relative ${HOME_BODY_IMPERIAL_SM}`}>
              <span className={HOME_INSIGHT_PROSE_STRONG}>Action: </span>
              Use the exception list below, filter by reason, and retry or escalate with the payment partner.
            </p>
          </div>
        )}

        {/* ─── Insight cards (disbursement mix) ─────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Records processed"
            value={formatPercent(progress.processedPct)}
            sub={`${statCardsSummary.processed.toLocaleString('en-IN')} / ${statCardsSummary.totalRows.toLocaleString('en-IN')} transactions`}
            insight="Shows how much of the batch has left the processing queue—not bank confirmation."
          />
          <StatCard
            label="Confirmed (bank)"
            value={formatPercent(progress.successPct)}
            sub={`${statCardsSummary.success.toLocaleString('en-IN')} transactions · ${formatInr(amountSummary.settledAmount)}`}
            insight="Bank confirmation on record for these disbursements in this workspace."
            actionLabel="Download report for audit packet"
            onAction={downloadReport}
          />
          <StatCard
            label="Pending confirmation"
            value={formatPercent(progress.pendingPct)}
            sub={`${statCardsSummary.pending.toLocaleString('en-IN')} transactions · ${formatInr(amountSummary.pendingAmount)}`}
            insight="Payment partner may show processed; bank confirmation still pending."
            actionLabel="Fetch settlement updates"
            onAction={refreshSnapshot}
          />
          <StatCard
            label="Requires review"
            value={formatPercent(progress.failedPct)}
            sub={
              intelligenceCardSummary
                ? `${statCardsSummary.failed.toLocaleString('en-IN')} transactions · ${formatInr(amountSummary.failedAmount)}`
                : `${reviewCount.toLocaleString('en-IN')} incl. edge cases · ${formatInr(amountSummary.failedAmount)}`
            }
            insight={requiresReviewStatInsight}
            actionLabel="Jump to exception breakdown"
            onAction={scrollToExceptions}
          />
        </div>
        {intelligenceCardSummary ? (
          <p className={`mt-2 text-center text-[12px] font-medium leading-relaxed ${HOME_BODY_IMPERIAL_SM}`}>
            Counts and percentages follow batch{' '}
            <code className="rounded bg-slate-200/70 px-1 font-mono text-[11px]">{intelligenceFootnoteBatchId}</code> via{' '}
            <code className="rounded bg-slate-200/70 px-1 font-mono text-[11px]">
              GET /api/prod/intelligence/batches/{intelligenceFootnoteBatchId}
            </code>
            {operatorIntelBatchId ? ' (scoped to Batch-Id above).' : ' (tenant default: latest row from GET /api/prod/intelligence/batches?limit=1 when Batch-Id is empty).'}
            Rupee split uses <code className="rounded bg-slate-200/70 px-1 font-mono text-[11px]">batch_health</code> when
            <code className="mx-0.5 rounded bg-slate-200/70 px-1 font-mono text-[11px]">batch.summary.updated</code> has
            populated it; otherwise amounts are estimated from the grid. KPI 14:{' '}
            <code className="rounded bg-slate-200/70 px-1 font-mono text-[11px]">
              {operatorIntelBatchId
                ? `GET /api/prod/intelligence/patterns?batch_id=${operatorIntelBatchId}`
                : 'GET /api/prod/intelligence/patterns (no batch_id — latest scored batch for tenant)'}
            </code>
            .
          </p>
        ) : null}

        {/* ─── Exceptions (summary) ─────────────────────────────────────── */}
        <Card id="exceptions-top" className="scroll-mt-24 p-5">
          <SectionLabel>Exceptions</SectionLabel>
          <BatchSectionTitle>Top issues</BatchSectionTitle>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
            Each row states problem, impact, and the recommended operator action.
          </p>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {exceptionHighlights.map((ex) => (
              <ExceptionIssueCard key={ex.problem} problem={ex.problem} impact={ex.impact} action={ex.action} />
            ))}
          </div>
          <p className={`mt-4 ${HOME_INSIGHT_PROSE}`}>
            If the loan system updated but settlement did not: treat as disbursement recorded but confirmation pending. If settlement shows a transaction outside this batch: transaction found in settlement but not linked to batch—verify linkage.
          </p>
        </Card>

        {/* ─── Trend: confirmed vs pending (Stripe-style line chart) ───── */}
        <Card className="p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <SectionLabel>Trend</SectionLabel>
              <BatchSectionTitle>Confirmed vs pending confirmation</BatchSectionTitle>
              <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>Illustrative series for this workspace (normalized scale).</p>
            </div>
            <p className="max-w-md rounded-xl border border-slate-100 bg-white px-3 py-2 text-[13px] leading-snug text-[#16a34a]">
              <span className="font-semibold text-[#16a34a]">Insight: </span>
              {trendInsight}
            </p>
          </div>

          <div className="mt-5 h-[220px]">
            <ClientChart className="h-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                <LineChart data={trendSeries} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                    width={36}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      const n = typeof value === 'number' ? value : Number(value)
                      const key = String(name)
                      const label =
                        key === 'confirmed'
                          ? 'Confirmed (current)'
                          : key === 'pending'
                            ? 'Pending confirmation'
                            : 'Confirmed (prior period)'
                      return [`${Math.round(n)}%`, label]
                    }}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="confirmed"
                    name="confirmed"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pending"
                    name="pending"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    activeDot={{ r: 4, fill: '#38bdf8', stroke: '#fff', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="confirmedPrior"
                    name="confirmedPrior"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ClientChart>
          </div>
        </Card>

        {/* ─── Status distribution + Failure reasons ───────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-5">
            <SectionLabel>Status distribution</SectionLabel>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
              {operatorIntelBatchId
                ? 'Percentages follow the scoped Batch-Id snapshot in Intelligence.'
                : 'Without Batch-Id: shares are summed across recent batches (GET /api/prod/intelligence/batches?limit=50), or from pattern KPI totals when the list has no volume yet.'}
            </p>
            <div className="mt-4 grid gap-5 md:grid-cols-[1fr_0.9fr]">
              <ClientChart className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={86} paddingAngle={2} strokeWidth={0}>
                      {pieData.map((entry, i) => (
                        <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => {
                        const n = typeof value === 'number' ? value : Number(value)
                        return [`${n.toFixed(1)}%`, String(name)]
                      }}
                      contentStyle={{ border: '0.5px solid #e8e8e5', borderRadius: 10, fontSize: 12, boxShadow: 'none' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ClientChart>
              <div className="space-y-2">
                {pieData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center justify-between rounded-xl border border-slate-200/90 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className={COMMAND_CENTER_LABEL_GREEN}>{entry.name}</span>
                    </div>
                    <span className="text-[14px] font-semibold text-[#0A0A0A]">{entry.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>{showIntelBatchesTable ? 'Intelligence batches' : 'Exception reasons'}</SectionLabel>
              {!showIntelBatchesTable && selectedFailureReason ? (
                <button
                  type="button"
                  onClick={() => setSelectedFailureReason(null)}
                  className="rounded-full border border-[#e8e8e5] bg-slate-50 px-3 py-1 text-[12px] text-[#888888] transition hover:bg-slate-100"
                >
                  Clear filter
                </button>
              ) : null}
            </div>
            <div className="mt-4">
              {showIntelBatchesTable ? (
                <DataTable
                  head={['Batch ID', 'Finality', 'Total', 'Success', 'Failed', 'Pending']}
                  rows={intelligenceBatchesTableRows}
                  footer="Session tenant — GET /api/prod/intelligence/batches?limit=50 (newest first). Use Batch-Id above to scope detail cards to one batch."
                />
              ) : (
                <div className="space-y-2.5">
                  {failureCounts.map((item) => {
                    const max = Math.max(1, ...failureCounts.map((r) => r.count))
                    const pct = (item.count / max) * 100
                    const active = selectedFailureReason === item.reason
                    return (
                      <button
                        key={item.reason}
                        type="button"
                        onClick={() => {
                          setSelectedFailureReason(active ? null : item.reason)
                          setStatusFilter('Requires review')
                          setPage(1)
                        }}
                        className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${
                          active ? 'border-[#0A0A0A] bg-slate-100' : 'border-slate-200/90 bg-slate-50 hover:border-[#ddddd9]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[14px]">
                          <span className="text-[#1A1A1A]">{item.reason}</span>
                          <span className="font-semibold text-[#0A0A0A]">{item.count}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                          <div className="h-1.5 rounded-full bg-[#0A0A0A] transition-all" style={{ width: `${Math.max(4, pct)}%` }} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {!showIntelBatchesTable ? (
              <p className={`mt-4 ${HOME_INSIGHT_PROSE}`}>
                Typical drivers: bank confirmation delay, mandate not authorized, settlement timing vs loan system.
              </p>
            ) : null}
          </Card>
        </div>

        {/* ─── Row drill-down table ─────────────────────────────────────── */}
        <Card className="p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-[#e8e8e5] bg-slate-50 p-1">
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setStatusFilter(opt.value); setPage(1) }}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                      statusFilter === opt.value ? 'bg-[#000000] text-white' : 'text-[#00239C] hover:text-[#000000]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-9 rounded-xl border border-[#e8e8e5] bg-slate-50 px-3 text-[14px] outline-none"
            >
              <option value="Latest">Sort: Latest</option>
              <option value="Oldest">Sort: Oldest</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/90">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200/90 bg-slate-50">
                  {['Request ID', 'Borrower', 'Amount', 'Method', 'Status', 'Mandate status', 'Last updated', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-[#888888] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const expanded = expandedRef === row.refId
                  return (
                    <Fragment key={row.refId}>
                      <tr
                        className="cursor-pointer border-b border-slate-100 text-[14px] transition-colors hover:bg-slate-50"
                        onClick={() => setExpandedRef((c) => (c === row.refId ? null : row.refId))}
                      >
                        <td className="px-4 py-3.5 font-semibold text-[#0A0A0A] whitespace-nowrap">{row.refId}</td>
                        <td className="px-4 py-3.5 text-[#1A1A1A]">{row.beneficiary}</td>
                        <td className="px-4 py-3.5 text-[#0A0A0A] whitespace-nowrap">{formatInr(row.amount)}</td>
                        <td className="px-4 py-3.5 text-[#1A1A1A]">{disbursementMethodFromProvider(row.provider)}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex rounded-full border border-[#e8e8e5] bg-slate-50 px-2.5 py-1 text-[12px] font-medium text-[#1A1A1A] whitespace-nowrap">
                            {mandateStatusFromRow(row)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${statusBadgeClass(row.status)}`}>
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-[#888888] whitespace-nowrap">{row.time}</td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            disabled={row.status !== 'Failed' && row.actionLabel === 'Retry row'}
                            className="whitespace-nowrap rounded-lg border border-[#e8e8e5] bg-white px-3 py-1.5 text-[13px] font-medium text-[#0A0A0A] transition hover:bg-slate-50 disabled:opacity-40"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (row.status === 'Failed') {
                                setRows((c) => c.map((item) =>
                                  item.refId === row.refId
                                    ? { ...item, status: 'Processing', stage: 'Disbursement processing', reason: '-', actionLabel: 'Track progress' }
                                    : item,
                                ))
                              }
                            }}
                          >
                            {row.actionLabel}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="rounded-xl border border-slate-200/90 bg-white p-4">
                              <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#888888]">
                                {row.refId} - {formatInr(row.amount)}
                              </div>
                              <div className="mt-3 grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  {row.timeline.map((step) => (
                                    <div key={`${row.refId}-${step.label}`} className="flex items-center gap-3 text-[14px]">
                                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                                        step.state === 'done' ? 'bg-[#dcfce7] text-[#15803d]'
                                          : step.state === 'active' ? 'bg-[#dbeafe] text-[#1d4ed8]'
                                          : 'bg-slate-100 text-[#888888]'
                                      }`}>
                                        {step.state === 'done' ? '✓' : step.state === 'active' ? '⚡' : '·'}
                                      </span>
                                      <span className="min-w-[160px] text-[#0A0A0A]">{step.label}</span>
                                      <span className="text-[#888888]">{step.time}</span>
                                    </div>
                                  ))}
                                </div>
                                <details className="rounded-xl border border-slate-200/90 bg-slate-50 p-3 text-[13px] font-normal leading-relaxed text-[#1A1A1A]">
                                  <summary className="cursor-pointer font-medium text-[#1A1A1A]">Transaction detail</summary>
                                  <div className="mt-2 space-y-1.5">
                                    <div>Payment partner reference: {row.dispatchId}</div>
                                    <div>Bank reference: {row.bankReference}</div>
                                    <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-[#e8e8e5] bg-white px-2.5 py-1">
                                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0A0A0A] text-[11px] text-white">{providerGlyph(row.provider)}</span>
                                      <span>Payment partner: {row.provider}</span>
                                    </div>
                                  </div>
                                </details>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[14px] text-[#888888]">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} rows
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((c) => Math.max(1, c - 1))}
                disabled={currentPage === 1}
                className="h-9 rounded-xl border border-[#e8e8e5] bg-white px-4 text-[14px] font-medium text-[#0A0A0A] transition hover:bg-slate-50 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-[14px] text-[#1A1A1A]">Page {currentPage} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((c) => Math.min(totalPages, c + 1))}
                disabled={currentPage === totalPages}
                className="h-9 rounded-xl border border-[#e8e8e5] bg-white px-4 text-[14px] font-medium text-[#0A0A0A] transition hover:bg-slate-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
