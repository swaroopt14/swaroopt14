'use client'

import Link from 'next/link'
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DASHBOARD_FONT_STACK } from '@/services/payout-command/model'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'
import { ClientChart, Glyph } from '../../today/_components/shared'
import {
  computeFailureCounts,
  deriveZordPipelineTimeline,
  type ZordPipelineIntake,
  formatInr,
  formatPercent,
  parseUploadedSheet,
  progressFromSummary,
  sortRowsByLatest,
  type BatchRow,
  type BatchRowStatus,
  type BatchSummary,
  type BatchTimelineStep,
} from '@/services/payout-command/batch-model'
import { postIntentBulkIngest } from '@/services/payout-command/batch-intake/postIntentBulkIngest'
import { postSettlementFileUpload } from '@/services/payout-command/batch-intake/postSettlementFileUpload'
import { getProdIntentsPage } from '@/services/payout-command/prod-api/getProdIntentsPage'
import { getIntelligenceBatchDetail } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { ApiIntentRow } from '@/services/payout-command/prod-api/prodApiTypes'
import type { BatchDetailResponse } from '@/services/payout-command/prod-api/intelligenceTypes'
import { CreatePaymentRequestForm } from '../../../customer/intents/create/page'
import {
  postLoanSystemBatchPull,
  postMandateNachPull,
  postSettlementFeedPull,
} from '@/services/payout-command/external-batch-sync/client'
import type { ExternalBatchSyncResponse } from '@/services/payout-command/external-batch-sync/types'

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

function formatInrFromMinor(minorStr: string | null | undefined): string {
  if (minorStr == null || String(minorStr).trim() === '') return '—'
  const minor = Number(minorStr)
  if (!Number.isFinite(minor)) return '—'
  return formatInr(minor / 100)
}

type StatusFilter = 'All' | BatchRowStatus
type SortMode = 'Latest' | 'Oldest'

const PIE_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6']
const AUTO_REFRESH_MS = 8000
/** After intent bulk-ingest succeeds, poll intent-engine list so ops see live connectivity (not row-level sync). */
const INTENT_ENGINE_POLL_MS = 20_000
/** Poll Intelligence batch detail for the operational snapshot card. */
const BATCH_INTEL_POLL_MS = 15_000
/** Avoid hitting `/v1/intelligence/batches/{id}` on every keystroke while ops type a batch id. */
const BATCH_INTEL_ID_DEBOUNCE_MS = 450
const PAGE_SIZE = 10
const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'Success', label: 'Confirmed' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Failed', label: 'Requires review' },
  { value: 'Processing', label: 'Processing' },
]

function statusBadgeClass(status: BatchRowStatus) {
  if (status === 'Success') return 'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]'
  if (status === 'Failed') return 'bg-[#fff1f2] text-[#b91c1c] border-[#fecdd3]'
  if (status === 'Pending') return 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]'
  return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]'
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
  return 'bg-[#fafaf8] border-[#e5e5e2] text-[#8a8a86]'
}

function timelineDotColor(state: BatchTimelineStep['state']) {
  if (state === 'done') return '#22c55e'
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

function evolveRow(row: BatchRow): BatchRow {
  if (row.status !== 'Processing') return row
  const n = Math.random()
  if (n < 0.72) {
    return {
      ...row, status: 'Success', stage: 'Confirmed', reason: '-', actionLabel: 'Export confirmation row',
      time: row.time === '-' ? '10:03:12' : row.time,
      timeline: row.timeline.map((step, index) =>
        index >= 4 ? { ...step, state: 'done', time: index === 4 ? '10:02:44' : '10:03:12' } : step,
      ),
    }
  }
  if (n < 0.88) return { ...row, status: 'Pending', stage: 'Awaiting bank confirmation', reason: '-', actionLabel: 'Inspect queue' }
  return { ...row, status: 'Failed', stage: 'Sent to payment partner', reason: 'Bank Timeout', actionLabel: 'Retry row' }
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
  return (
    <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#9a9a96]">
      {children}
    </div>
  )
}

function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`rounded-2xl border border-[#ebebea] bg-white ${className}`}>
      {children}
    </div>
  )
}

function StatCard({ label, value, sub, deltaPct, insight, actionLabel, onAction, color = 'text-[#111111]' }: {
  label: string
  value: string
  sub?: string
  deltaPct?: string
  insight?: string
  actionLabel?: string
  onAction?: () => void
  color?: string
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <div className={`text-[2.26rem] font-light tracking-[-0.04em] leading-none ${color}`}>{value}</div>
        {deltaPct ? <span className="text-[13px] font-medium text-[#6f6f6b]">{deltaPct}</span> : null}
      </div>
      {sub ? <div className="mt-2 text-[14px] text-[#8a8a86]">{sub}</div> : null}
      {insight ? (
        <p className="mt-3 border-t border-[#efefec] pt-3 text-[13px] leading-snug text-[#5a5a56]">
          <span className="font-semibold text-[#4f4f4b]">Insight: </span>
          {insight}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-auto pt-4 text-left text-[13px] font-medium text-[#111111] underline decoration-[#d0d0cc] underline-offset-2 hover:decoration-[#111111]"
        >
          {actionLabel}
        </button>
      ) : actionLabel ? (
        <p className="mt-auto pt-4 text-[13px] font-medium text-[#111111]">
          Action: {actionLabel}
        </p>
      ) : null}
    </Card>
  )
}

function DataTable({ head, rows, footer }: {
  head: string[]
  rows: Array<Array<ReactNode>>
  footer?: string
}) {
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-[#efefec]">
        <table className="min-w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-[#efefec] bg-[#fafaf8]">
              {head.map((h) => (
                <th key={h} className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9a9a96]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i < rows.length - 1 ? 'border-b border-[#f3f3f0]' : ''}>
                {row.map((cell, j) => (
                  <td key={j} className={`px-4 py-3 ${j === 0 ? 'font-medium text-[#111111]' : 'text-[#5a5a56]'}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer ? <p className="mt-3 text-[13px] leading-relaxed text-[#8a8a86]">{footer}</p> : null}
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
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
  const [sourceType, setSourceType] = useState('CSV')
  const [tenantType, setTenantType] = useState<'MERCHANT' | 'BANK' | 'NBFC' | 'VENDOR' | 'GATEWAY'>('MERCHANT')
  const [batchIdInput, setBatchIdInput] = useState('')
  /** Same resolution as Intent Journal / Home (`useSessionTenantId`) so sandbox hits `/api/prod/*` with a tenant. */
  const tenantId = useSessionTenantId()
  const [psp, setPsp] = useState(() => process.env.NEXT_PUBLIC_ZORD_SETTLEMENT_PSP ?? 'razorpay')
  const [intentIngestOk, setIntentIngestOk] = useState(false)
  /** Batch id used for settlement (response body, optional Step 1 field, or LOCAL-* fallback). */
  const [settlementBatchId, setSettlementBatchId] = useState<string | null>(null)
  const settlementFileInputRef = useRef<HTMLInputElement>(null)
  const toolbarNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toolbarNotice, setToolbarNotice] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [externalSyncBusy, setExternalSyncBusy] = useState<'loan' | 'settlement' | 'mandate' | null>(null)
  const [externalSyncLast, setExternalSyncLast] = useState<{
    operation: string
    message: string
    hint?: string
    at: Date
    requestId?: string
    httpOk: boolean
  } | null>(null)

  const showToolbarNotice = useCallback((message: string) => {
    setToolbarNotice(message)
    if (toolbarNoticeTimerRef.current) clearTimeout(toolbarNoticeTimerRef.current)
    toolbarNoticeTimerRef.current = window.setTimeout(() => {
      setToolbarNotice(null)
      toolbarNoticeTimerRef.current = null
    }, 4500)
  }, [])

  useEffect(() => {
    return () => {
      if (toolbarNoticeTimerRef.current) clearTimeout(toolbarNoticeTimerRef.current)
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
    () => tenantId.trim().length > 0 && psp.trim().length > 0 && settlementBatchIdResolved.length > 0,
    [psp, settlementBatchIdResolved, tenantId],
  )
  const settlementPickerEnabled = settlementCredentialsReady && intakeStep !== 'settlement_uploading'
  const intelligenceBatchPollEligible = useMemo(
    () =>
      tenantId.trim().length > 0 &&
      debouncedBatchIdForIntelPoll.length > 0 &&
      !debouncedBatchIdForIntelPoll.startsWith('LOCAL-'),
    [debouncedBatchIdForIntelPoll, tenantId],
  )

  const refreshSimulation = useCallback(() => {
    setRows((c) => c.map(evolveRow))
    setSummary((c) => {
      const processing = Math.max(0, c.totalRows - c.processed)
      if (processing === 0) return c
      const step = Math.min(processing, Math.max(60, Math.round(processing * 0.09)))
      const successGain = Math.round(step * 0.86)
      const failedGain = Math.round(step * 0.08)
      const pendingGain = step - successGain - failedGain
      return {
        totalRows: c.totalRows,
        processed: Math.min(c.totalRows, c.processed + step),
        success: c.success + successGain,
        failed: c.failed + failedGain,
        pending: Math.max(0, c.pending + pendingGain - Math.round(c.pending * 0.06)),
      }
    })
    setLastRefreshedAt(new Date())
  }, [])

  const loadIntelBatchDetail = useCallback(async () => {
    if (!intelligenceBatchPollEligible) {
      setIntelBatchDetail(null)
      setIntelBatchDetailError(null)
      setIntelBatchDetailAt(null)
      setIntelBatchDetailLoading(false)
      return
    }
    setIntelBatchDetailLoading(true)
    setIntelBatchDetailError(null)
    try {
      const res = await getIntelligenceBatchDetail(tenantId.trim(), debouncedBatchIdForIntelPoll)
      setIntelBatchDetail(res)
      setIntelBatchDetailAt(new Date())
      if (!res) {
        setIntelBatchDetailError('Intelligence has no record for this batch id yet (or the request was denied).')
      }
    } catch (e) {
      setIntelBatchDetail(null)
      setIntelBatchDetailError(e instanceof Error ? e.message : 'Intelligence request failed')
      setIntelBatchDetailAt(new Date())
    } finally {
      setIntelBatchDetailLoading(false)
    }
  }, [debouncedBatchIdForIntelPoll, intelligenceBatchPollEligible, tenantId])

  useEffect(() => {
    if (!intelligenceBatchPollEligible) {
      setIntelBatchDetail(null)
      setIntelBatchDetailError(null)
      setIntelBatchDetailAt(null)
      return
    }
    void loadIntelBatchDetail()
    const id = window.setInterval(() => void loadIntelBatchDetail(), BATCH_INTEL_POLL_MS)
    return () => window.clearInterval(id)
  }, [intelligenceBatchPollEligible, loadIntelBatchDetail])

  /** Header refresh — same tick as auto-refresh but surfaces confirmation for ops. */
  const manualRefreshSnapshot = useCallback(() => {
    refreshSimulation()
    if (intelligenceBatchPollEligible) void loadIntelBatchDetail()
    showToolbarNotice(
      intelligenceBatchPollEligible
        ? 'Progress simulation stepped and intelligence batch snapshot refreshed.'
        : 'Progress simulation stepped — queued disbursements moved toward bank confirmation.',
    )
  }, [intelligenceBatchPollEligible, loadIntelBatchDetail, refreshSimulation, showToolbarNotice])

  useEffect(() => {
    const id = window.setInterval(() => refreshSimulation(), AUTO_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [refreshSimulation])

  const pollIntentEngineTenant = useCallback(async () => {
    const tid = tenantId.trim()
    if (!tid || !intentIngestOk) return
    try {
      const res = await getProdIntentsPage(`page=1&page_size=1&tenant_id=${encodeURIComponent(tid)}`)
      const total = res?.pagination?.total
      const intentTotal =
        typeof total === 'number' ? total : (Array.isArray(res?.items) ? res.items.length : null)
      setIntentEnginePoll({ ok: true, intentTotal, at: new Date() })
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Request failed'
      setIntentEnginePoll({ ok: false, intentTotal: null, at: new Date(), err })
    }
  }, [tenantId, intentIngestOk])

  useEffect(() => {
    if (!intentIngestOk || !tenantId.trim()) {
      setIntentEnginePoll(null)
      return
    }
    void pollIntentEngineTenant()
    const id = window.setInterval(() => void pollIntentEngineTenant(), INTENT_ENGINE_POLL_MS)
    return () => window.clearInterval(id)
  }, [intentIngestOk, tenantId, pollIntentEngineTenant])

  // Pull a real page of intents on mount and on tenant change — replaces the
  // 180-row canned seed with live data when the tenant has any. Falls back to
  // canned rows so the empty/demo state still renders.
  useEffect(() => {
    const tid = tenantId.trim()
    if (!tid) return
    let cancelled = false
    void getProdIntentsPage(`page=1&page_size=120&tenant_id=${encodeURIComponent(tid)}`).then((res) => {
      if (cancelled) return
      const items = res?.items ?? []
      if (items.length === 0) return
      const mapped = items.map(mapIntentRowToBatchRow)
      setRows(mapped)
      setSummary(recomputeSummary(mapped, mapped.length))
      setLastRefreshedAt(new Date())
    })
    return () => {
      cancelled = true
    }
  }, [tenantId])

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
          sourceType,
          tenantType,
          optionalBatchId: bid || undefined,
        })
        if (!result.ok) {
          throw new Error(result.errorMessage ?? `HTTP ${result.httpStatus}`)
        }
        const effectiveBatch = result.batchIdFromBody || bid || null
        const journalBatchId = effectiveBatch ?? `LOCAL-${Date.now()}`
        // Always keep step 2 enabled after a successful ingest: server may omit batch id in the
        // response body while the journal still uses a stable LOCAL-* id for sandbox preview.
        setSettlementBatchId(journalBatchId)
        setIntentIngestOk(true)
        setUploadRelayState('synced')
        setUploadRelayMessage(
          effectiveBatch
            ? `Intent batch accepted. Batch-Id for settlement: ${effectiveBatch}. Table below reflects parsed file (preview). Intent Journal loads batches from intelligence and intents from the intent engine for this tenant.`
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
        setSettlementBatchId(null)
        setUploadRelayState('failed')
        setUploadRelayMessage(`Intent ingest failed (${error instanceof Error ? error.message : 'unknown error'}). Step 2 stays locked until ingest succeeds.`)
        setIntakeStep('idle')
      }
    },
    [apiKey, batchIdInput, sourceType, tenantType],
  )

  /** Step 2 — POST /api/settlement/upload (proxies settlement service). Does not replace the table with the settlement file. */
  const onSettlementUpload = useCallback(
    async (file: File | null) => {
      if (!file) return
      const tid = tenantId.trim()
      const pspVal = psp.trim()
      const bid = (settlementBatchId ?? batchIdInput.trim()).trim()
      if (!tid || !pspVal || !bid) {
        setUploadRelayState('failed')
        setUploadRelayMessage(
          'Settlement upload needs tenant_id, psp, and Batch-Id (complete Step 1 or enter Batch-Id in the field above).',
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
          tenantId: tid,
          psp: pspVal,
          batchId: bid,
        })
        if (!result.ok) {
          throw new Error(result.errorMessage ?? `HTTP ${result.httpStatus}`)
        }
        setUploadRelayState('synced')
        setUploadRelayMessage('Settlement file accepted. Matching runs against the intent batch on the server.')
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
    [apiKey, batchIdInput, psp, settlementBatchId, tenantId],
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
    setStatusFilter('All')
    setPage(1)
    setLastRefreshedAt(new Date())
    showToolbarNotice(
      'Retry failed: every “Requires review” row was re-queued as processing so you can simulate a partner replay or manual fix before settlement.',
    )
  }, [showToolbarNotice])

  const failureCounts = useMemo(() => computeFailureCounts(rows), [rows])
  const progress = useMemo(() => progressFromSummary(summary), [summary])
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

  const timeline = useMemo(() => deriveZordPipelineTimeline(summary, pipelineIntake), [pipelineIntake, summary])

  const pipelineBusy = useMemo(() => timeline.some((s) => s.state === 'active'), [timeline])

  const timelineProgressPct = useMemo(() => {
    const n = timeline.length
    const done = timeline.filter((s) => s.state === 'done').length
    const bump = timeline.some((s) => s.state === 'active') ? 0.45 : timeline.some((s) => s.state === 'warning') ? 0.25 : 0
    return Math.min(100, ((done + bump) / Math.max(n, 1)) * 100)
  }, [timeline])
  const processingCount = Math.max(0, summary.totalRows - summary.processed)
  const failureRate = summary.totalRows ? (summary.failed / summary.totalRows) * 100 : 0

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    let next = rows
    if (query) {
      next = next.filter((r) =>
        r.refId.toLowerCase().includes(query) || r.beneficiary.toLowerCase().includes(query),
      )
    }
    if (statusFilter !== 'All') next = next.filter((r) => r.status === statusFilter)
    if (selectedFailureReason) next = next.filter((r) => r.reason === selectedFailureReason)
    return sortRowsByLatest(next, sortMode)
  }, [rows, search, statusFilter, selectedFailureReason, sortMode])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => { setPage((c) => Math.min(c, totalPages)) }, [totalPages])

  const pieData = useMemo(
    () => [
      { name: 'Confirmed', value: progress.successPct },
      { name: 'Requires review', value: progress.failedPct },
      { name: 'Pending confirmation', value: progress.pendingPct },
      { name: 'Processing', value: progress.processingPct },
    ],
    [progress.failedPct, progress.pendingPct, progress.processingPct, progress.successPct],
  )

  const averageAmount = useMemo(() => {
    if (!rows.length) return 0
    return rows.reduce((sum, r) => sum + r.amount, 0) / rows.length
  }, [rows])

  const amountSummary = useMemo(() => {
    const totalAmount = averageAmount * summary.totalRows
    const settledAmount = totalAmount * (summary.success / Math.max(summary.totalRows, 1))
    const failedAmount = totalAmount * (summary.failed / Math.max(summary.totalRows, 1))
    const pendingAmount = totalAmount * ((summary.pending + processingCount) / Math.max(summary.totalRows, 1))
    return { totalAmount, settledAmount, failedAmount, pendingAmount }
  }, [averageAmount, processingCount, summary.failed, summary.success, summary.totalRows, summary.pending])

  const settlementSummary = useMemo(() => {
    const confirmed = amountSummary.settledAmount
    const processedButUnconfirmed = amountSummary.pendingAmount * 0.68
    const notFound = Math.max(0, amountSummary.pendingAmount * 0.32 + amountSummary.failedAmount * 0.55)
    return { confirmed, processedButUnconfirmed, notFound }
  }, [amountSummary.failedAmount, amountSummary.pendingAmount, amountSummary.settledAmount])

  const mandateSummary = useMemo(() => {
    const active = Math.round(summary.totalRows * 0.88)
    const pending = Math.round(summary.totalRows * 0.07)
    const failed = Math.max(0, summary.totalRows - active - pending)
    return { active, pending, failed }
  }, [summary.totalRows])

  const trendSeries = useMemo(() => {
    const n = 10
    const targetConfirmed = summary.success / Math.max(summary.totalRows, 1)
    const targetPending = (summary.pending + processingCount) / Math.max(summary.totalRows, 1)
    return Array.from({ length: n }, (_, i) => {
      const t = i / Math.max(n - 1, 1)
      const noise = 0.04 * Math.sin(i * 1.1)
      return {
        label: `${i + 1}`,
        confirmed: Math.max(0, Math.round(100 * (targetConfirmed * (0.62 + 0.38 * t) + noise))),
        pending: Math.max(0, Math.round(100 * (targetPending * (1 - 0.45 * t) - noise * 0.5))),
      }
    })
  }, [processingCount, summary.pending, summary.success, summary.totalRows])

  const trendInsight = useMemo(() => {
    if (progress.pendingPct > progress.failedPct && progress.pendingPct > 8) {
      return 'Pending confirmation share is elevated; prioritize bank reference checks before closing the batch.'
    }
    if (progress.failedPct > 6) {
      return 'Requires-review volume is elevated; filter by exception reason and clear the highest-value items first.'
    }
    return 'Confirmed share is trending stable; keep polling bank confirmation until pending confirmation clears.'
  }, [progress.failedPct, progress.pendingPct])

  const mandateAmounts = useMemo(() => {
    const total = amountSummary.totalAmount
    const frac = (n: number) => (summary.totalRows ? (n / summary.totalRows) * total : 0)
    return {
      active: frac(mandateSummary.active),
      pending: frac(mandateSummary.pending),
      failed: frac(mandateSummary.failed),
    }
  }, [amountSummary.totalAmount, mandateSummary.active, mandateSummary.failed, mandateSummary.pending, summary.totalRows])

  const settlementCounts = useMemo(() => {
    const t = Math.max(summary.totalRows, 1)
    const confirmedN = summary.success
    const processedUnconfirmedN = Math.max(0, Math.round(summary.pending + processingCount * 0.55))
    const notFoundN = Math.max(0, t - confirmedN - processedUnconfirmedN)
    return { confirmedN, processedUnconfirmedN, notFoundN }
  }, [processingCount, summary.pending, summary.success, summary.totalRows])

  const exceptionHighlights = useMemo(() => {
    const top = [...failureCounts].sort((a, b) => b.count - a.count).slice(0, 3)
    const valuePerFailure = summary.failed ? amountSummary.failedAmount / summary.failed : 0
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
  }, [amountSummary.failedAmount, failureCounts, summary.failed])

  const reviewCount = summary.failed + Math.round(summary.pending * 0.35)

  const methodBreakdown = useMemo(() => {
    const base: Record<string, { method: string; confirmed: number; pending: number; review: number }> = {
      'Bank Transfer': { method: 'Bank Transfer', confirmed: 0, pending: 0, review: 0 },
      LSM: { method: 'LSM', confirmed: 0, pending: 0, review: 0 },
      NACH: { method: 'NACH', confirmed: 0, pending: 0, review: 0 },
      Other: { method: 'Other', confirmed: 0, pending: 0, review: 0 },
    }
    rows.forEach((row) => {
      const m = disbursementMethodFromProvider(row.provider)
      const b = base[m] ?? (base[m] = { method: m, confirmed: 0, pending: 0, review: 0 })
      if (row.status === 'Success') b.confirmed += 1
      else if (row.status === 'Pending') b.pending += 1
      else b.review += 1
    })
    return Object.values(base)
  }, [rows])

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
    const stillProcessing = Math.max(0, summary.totalRows - summary.processed)
    const text = [
      'Zord — Batch Command Center snapshot',
      '',
      `Tenant: ${tid}`,
      `Batch / correlation id: ${batchLabel}`,
      `Total rows: ${summary.totalRows}`,
      `Confirmed: ${summary.success} · Pending: ${summary.pending} · Failed (needs review): ${summary.failed} · Still processing: ${stillProcessing}`,
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
  }, [batchIdInput, settlementBatchId, showToolbarNotice, summary, tenantId])

  const batchContextSnapshot = useMemo(() => {
    const b = intelBatchDetail?.batch
    const h = intelBatchDetail?.batch_health
    const batchId = settlementBatchIdResolved || '—'
    const ingestLabel = intentFileName ? `${sourceType} upload` : '—'
    const finalityRaw = h?.finality_status ?? b?.finality_status
    const finality =
      finalityRaw && String(finalityRaw).trim() ? String(finalityRaw).replace(/_/g, ' ') : '—'
    // Totals must match the batch currently shown in the grid (parsed upload / ingested sheet),
    // not Intelligence aggregates (which can be tenant-wide or a different scope).
    const totalCount = summary.totalRows
    const sheetValueTotal = rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : Number(r.amount) || 0), 0)
    const totalValue = formatInr(sheetValueTotal)
    const intelligenceMode =
      intelBatchDetail?.intelligence_mode && intelBatchDetail.intelligence_mode.trim()
        ? intelBatchDetail.intelligence_mode.replace(/_/g, ' ')
        : null
    return {
      batchId,
      ingestLabel,
      finality,
      intelligenceMode,
      totalCountLabel: totalCount.toLocaleString('en-IN'),
      totalValue,
    }
  }, [intelBatchDetail, intentFileName, rows, settlementBatchIdResolved, sourceType, summary.totalRows])

  const batchContextBadge = useMemo(() => {
    if (intelBatchDetailLoading && intelligenceBatchPollEligible && !intelBatchDetail) {
      return {
        wrap: 'border-slate-200/90 bg-slate-50/90 text-[#475569]',
        dot: 'bg-slate-400 animate-pulse',
        label: 'Loading Intelligence…',
      }
    }
    if (intelBatchDetail) {
      return {
        wrap: 'border-emerald-200/90 bg-emerald-50/90 text-[#15803d]',
        dot: 'bg-[#16a34a]',
        label: 'Intelligence linked',
      }
    }
    if (intelligenceBatchPollEligible && intelBatchDetailError) {
      return {
        wrap: 'border-amber-200/90 bg-amber-50/90 text-[#b45309]',
        dot: 'bg-amber-500',
        label: 'Intelligence unavailable',
      }
    }
    if (settlementBatchIdResolved.startsWith('LOCAL-')) {
      return {
        wrap: 'border-slate-200/90 bg-slate-50/90 text-[#64748b]',
        dot: 'bg-slate-400',
        label: 'Local preview',
      }
    }
    if (!settlementBatchIdResolved) {
      return {
        wrap: 'border-slate-200/90 bg-slate-50/90 text-[#64748b]',
        dot: 'bg-slate-400',
        label: 'Awaiting Batch-Id',
      }
    }
    return {
      wrap: 'border-slate-200/90 bg-slate-50/90 text-[#64748b]',
      dot: 'bg-slate-400',
      label: 'Grid simulation',
    }
  }, [
    intelBatchDetail,
    intelBatchDetailError,
    intelBatchDetailLoading,
    intelligenceBatchPollEligible,
    settlementBatchIdResolved,
  ])

  const refreshLoanSystemStrip = useCallback(() => {
    void (async () => {
      const tid = tenantId.trim()
      if (!tid) {
        showToolbarNotice('Enter tenant id before calling customer-system sync.')
        return
      }
      const bid = settlementBatchIdResolved || null
      setExternalSyncBusy('loan')
      try {
        const data: ExternalBatchSyncResponse = await postLoanSystemBatchPull({
          tenant_id: tid,
          batch_id: bid ?? '',
          psp: psp.trim() || undefined,
        })
        setExternalSyncLast({
          operation: data.operation ?? 'loan_system_pull',
          message: data.message ?? 'No response message',
          hint: data.hint,
          at: new Date(),
          requestId: data.request_id,
          httpOk: true,
        })
        const banner = [data.message, data.hint].filter(Boolean).join(' ')
        showToolbarNotice(banner.length > 320 ? `${banner.slice(0, 317)}…` : banner)
        refreshSimulation()
        if (intelligenceBatchPollEligible) void loadIntelBatchDetail()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Request failed'
        setExternalSyncLast({
          operation: 'loan_system_pull',
          message: msg,
          at: new Date(),
          httpOk: false,
        })
        showToolbarNotice(`Loan system sync failed: ${msg}`)
      } finally {
        setExternalSyncBusy(null)
      }
    })()
  }, [
    intelligenceBatchPollEligible,
    loadIntelBatchDetail,
    psp,
    refreshSimulation,
    settlementBatchIdResolved,
    showToolbarNotice,
    tenantId,
  ])

  const refreshSettlementIntelStrip = useCallback(() => {
    void (async () => {
      const tid = tenantId.trim()
      if (!tid) {
        showToolbarNotice('Enter tenant id before calling customer-system sync.')
        return
      }
      const bid = settlementBatchIdResolved || null
      setExternalSyncBusy('settlement')
      try {
        const data: ExternalBatchSyncResponse = await postSettlementFeedPull({
          tenant_id: tid,
          batch_id: bid ?? '',
          psp: psp.trim() || undefined,
        })
        setExternalSyncLast({
          operation: data.operation ?? 'settlement_feed_pull',
          message: data.message ?? 'No response message',
          hint: data.hint,
          at: new Date(),
          requestId: data.request_id,
          httpOk: true,
        })
        const banner = [data.message, data.hint].filter(Boolean).join(' ')
        showToolbarNotice(banner.length > 320 ? `${banner.slice(0, 317)}…` : banner)
        if (intelligenceBatchPollEligible) void loadIntelBatchDetail()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Request failed'
        setExternalSyncLast({
          operation: 'settlement_feed_pull',
          message: msg,
          at: new Date(),
          httpOk: false,
        })
        showToolbarNotice(`Settlement sync failed: ${msg}`)
      } finally {
        setExternalSyncBusy(null)
      }
    })()
  }, [intelligenceBatchPollEligible, loadIntelBatchDetail, psp, settlementBatchIdResolved, showToolbarNotice, tenantId])

  const refreshMandateStripSimOnly = useCallback(() => {
    void (async () => {
      const tid = tenantId.trim()
      if (!tid) {
        showToolbarNotice('Enter tenant id before calling customer-system sync.')
        return
      }
      const bid = settlementBatchIdResolved || null
      setExternalSyncBusy('mandate')
      try {
        const data: ExternalBatchSyncResponse = await postMandateNachPull({
          tenant_id: tid,
          batch_id: bid ?? '',
          psp: psp.trim() || undefined,
        })
        setExternalSyncLast({
          operation: data.operation ?? 'mandate_nach_pull',
          message: data.message ?? 'No response message',
          hint: data.hint,
          at: new Date(),
          requestId: data.request_id,
          httpOk: true,
        })
        const banner = [data.message, data.hint].filter(Boolean).join(' ')
        showToolbarNotice(banner.length > 320 ? `${banner.slice(0, 317)}…` : banner)
        refreshSimulation()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Request failed'
        setExternalSyncLast({
          operation: 'mandate_nach_pull',
          message: msg,
          at: new Date(),
          httpOk: false,
        })
        showToolbarNotice(`Mandate / NACH sync failed: ${msg}`)
      } finally {
        setExternalSyncBusy(null)
      }
    })()
  }, [psp, refreshSimulation, settlementBatchIdResolved, showToolbarNotice, tenantId])

  const scrollToExceptions = useCallback(() => {
    document.getElementById('exceptions-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <main
      className="payout-command-console min-h-screen bg-[#f2f1ed] text-[15px] leading-[1.55] antialiased"
      style={{ fontFamily: DASHBOARD_FONT_STACK }}
    >
      <div className="mx-auto max-w-[1440px] space-y-5 p-6">
        {/* In-page toolbar — global chrome is `BatchTopNav` only (no duplicate sticky rails). */}
        <div className="flex flex-col gap-3 rounded-2xl border border-[#e8e8e5] bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex min-h-10 w-full min-w-0 flex-1 items-center sm:max-w-xl">
            <span className="pointer-events-none absolute left-3 flex text-[#9a9a96]">
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
              className="h-10 w-full rounded-xl border border-[#e8e8e5] bg-[#fafaf8] py-2 pl-9 pr-3 text-[14px] text-[#111111] outline-none transition placeholder:text-[#9a9a96] focus:border-[#111111]/25 focus:bg-white focus:ring-2 focus:ring-black/5"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-[#e8e8e5] bg-[#fafaf8] px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-[12px] font-semibold text-white">OS</div>
            <div className="min-w-0">
              <div className="text-[14px] font-medium leading-tight text-[#111111]">Operations lead</div>
              <div className="text-[12px] leading-tight text-[#9a9a96]">Disbursement operations</div>
            </div>
          </div>
        </div>

        {toolbarNotice ? (
          <div
            role="status"
            className="rounded-xl border border-emerald-200/90 bg-emerald-50 px-4 py-2.5 text-[13px] font-medium text-emerald-950 shadow-sm"
          >
            {toolbarNotice}
          </div>
        ) : null}

        {/* ─── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[13px] text-[#9a9a96]">
              <span>Workspaces</span>
              <span className="text-[#d0d0cc]">/</span>
              <span>Overview</span>
              <span className="text-[#d0d0cc]">/</span>
              <span className="text-[#4f4f4b]">Batch operations</span>
            </div>
            <h1 className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#111111]">
              Batch Disbursement &amp; Settlement Overview
            </h1>
            <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-[#6f716d]">
              Track disbursement status, mandate readiness, and settlement confirmation for this batch.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={manualRefreshSnapshot}
              title="Advance the sandbox simulation one tick (same logic as auto-refresh)"
              aria-label="Refresh batch snapshot"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e8e8e5] bg-white text-[#6f6f6b] transition hover:bg-[#fafaf8]"
            >
              <Glyph name="refresh" className="h-[15px] w-[15px]" />
            </button>
            {(
              [
                {
                  label: 'Download report',
                  title: 'Download CSV of the current table view (search and status filters apply).',
                  action: downloadReport,
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
                className="h-9 rounded-xl border border-[#e8e8e5] bg-white px-3.5 text-[14px] font-medium text-[#111111] transition hover:bg-[#fafaf8] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {label}
              </button>
            ))}
            <Link
              href="/payout-command-view/today?dock=grid"
              title="Open payout command view on Intent Journal"
              className="flex h-9 items-center rounded-xl border border-[#e8e8e5] bg-white px-3.5 text-[14px] font-medium text-[#111111] transition hover:bg-[#fafaf8]"
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
              className="flex h-9 items-center gap-2.5 rounded-xl bg-[#111111] px-4 text-[14px] font-medium text-white transition hover:bg-[#2a2a2a] disabled:cursor-wait disabled:opacity-70"
            >
              <div className="flex -space-x-1.5">
                {(['#d8e6ff', '#dbf7dd', '#edd8f4'] as const).map((bg, i) => (
                  <span key={i} className="flex h-5 w-5 items-center justify-center rounded-full border border-white/50 text-[10px] font-semibold text-[#111111]" style={{ background: bg }}>
                    {['A', 'F', 'E'][i]}
                  </span>
                ))}
              </div>
              {shareBusy ? 'Opening…' : 'Share'}
            </button>
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
                    ? 'bg-[#0f172a] text-white shadow-[0_2px_6px_rgba(15,23,42,0.18)]'
                    : 'text-[#475569] hover:bg-[#f5f5f5] hover:text-[#0f172a]'
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
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-2">
            <SectionLabel>Batch intake</SectionLabel>
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#94a3b8]">Step 1 → Step 2</span>
          </div>
          <p className="mt-1 text-[13px] text-[#64748b]">
            Upload the intent batch file first. Once dispatched, upload the settlement file when received from the PSP / bank.
            Tenant and credentials are resolved automatically from your signed-in session.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
                Tenant type
              </span>
              <select
                value={tenantType}
                onChange={(e) => setTenantType(e.target.value as typeof tenantType)}
                className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2 text-[13px] text-[#0f172a] outline-none focus:border-[#6366f1]/50"
              >
                <option value="MERCHANT">Merchant</option>
                <option value="VENDOR">Vendor</option>
                <option value="BANK">Bank</option>
                <option value="NBFC">NBFC</option>
                <option value="GATEWAY">Gateway</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
                Source type <span className="font-normal normal-case text-[#94a3b8]">(default CSV)</span>
              </span>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2 text-[13px] text-[#0f172a] outline-none focus:border-[#6366f1]/50"
              >
                <option value="CSV">CSV</option>
                <option value="XLSX">XLSX</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">Batch-Id (optional)</span>
              <input
                value={batchIdInput}
                onChange={(e) => setBatchIdInput(e.target.value)}
                placeholder="Auto-assigned if empty"
                className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0f172a] outline-none focus:border-[#6366f1]/50"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">PSP</span>
              <input
                value={psp}
                onChange={(e) => setPsp(e.target.value)}
                placeholder="razorpay"
                className="h-9 rounded-lg border border-[#E5E5E5] bg-white px-2.5 text-[13px] text-[#0f172a] outline-none focus:border-[#6366f1]/50"
              />
            </label>
          </div>
          {settlementBatchIdResolved ? (
            <p className="mt-2 text-[12px] text-[#475569]">
              <span className="font-semibold text-[#334155]">Active Batch-Id: </span>
              <span className="font-mono text-[#0f172a]">{settlementBatchIdResolved}</span>
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {/* Step 1 — Intent batch */}
            <label
              className={`group relative flex cursor-pointer flex-col rounded-[14px] border bg-white p-4 transition ${
                intentFileName
                  ? 'border-emerald-200 bg-emerald-50/30'
                  : 'border-[#E5E5E5] hover:border-[#111111]/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#111111] text-[12px] font-bold text-white">1</span>
                <span className="text-[14px] font-semibold text-[#0f172a]">Upload intent batch</span>
                {intentFileName ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Loaded
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#64748b]">
                CSV or XLSX exported from LMS / ERP — one row per payout intent.
              </p>
              {intentFileName ? (
                <p className="mt-2 truncate font-mono text-[12px] text-[#0f172a]" title={intentFileName}>
                  {intentFileName}
                </p>
              ) : null}
              <span
                className={`mt-3 inline-flex h-8 w-fit items-center rounded-[8px] px-3 text-[12px] font-medium transition ${
                  intakeStep === 'intent_uploading'
                    ? 'bg-[#0f172a] text-white opacity-70'
                    : intentFileName
                      ? 'border border-[#E5E5E5] bg-white text-[#0f172a] group-hover:bg-[#fafafa]'
                      : 'bg-[#0f172a] text-white group-hover:bg-black'
                }`}
              >
                {intakeStep === 'intent_uploading' ? 'Uploading…' : intentFileName ? 'Replace file' : 'Choose file'}
              </span>
              <input
                type="file"
                accept=".csv,.xls,.xlsx"
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
                    : 'cursor-pointer border-[#E5E5E5] hover:border-[#111111]/30'
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
                    settlementCredentialsReady ? 'bg-[#111111]' : 'bg-[#94a3b8]'
                  }`}
                >
                  2
                </span>
                <span className="text-[14px] font-semibold text-[#0f172a]">Upload settlement file</span>
                {settlementFileName ? (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path d="M3 6.5 5.2 8.7 9.5 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Loaded
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#64748b]">
                Bank / PSP settlement CSV — Zord matches it back to the intent batch.
              </p>
              {settlementFileName ? (
                <p className="mt-2 truncate font-mono text-[12px] text-[#0f172a]" title={settlementFileName}>
                  {settlementFileName}
                </p>
              ) : (
                <p className="mt-2 text-[12px] italic text-[#94a3b8]">
                  {settlementCredentialsReady
                    ? 'Click this card or Choose file to pick a settlement CSV / XLSX — POST /api/settlement/upload.'
                    : 'Enter Tenant, PSP, and Batch-Id (or complete Step 1) to enable settlement upload.'}
                </p>
              )}
              <span
                className={`mt-3 inline-flex h-8 w-fit items-center rounded-[8px] px-3 text-[12px] font-medium transition ${
                  intakeStep === 'settlement_uploading'
                    ? 'bg-[#0f172a] text-white opacity-70'
                    : settlementFileName
                      ? 'border border-[#E5E5E5] bg-white text-[#0f172a] group-hover:bg-[#fafafa]'
                      : intentIngestOk && settlementBatchId
                        ? 'bg-[#0f172a] text-white group-hover:bg-black'
                        : 'bg-[#94a3b8] text-white'
                }`}
              >
                {intakeStep === 'settlement_uploading' ? 'Uploading…' : settlementFileName ? 'Replace file' : 'Choose file'}
              </span>
              <input
                ref={settlementFileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                disabled={!settlementPickerEnabled}
                aria-label="Settlement file upload"
                onChange={(e) => void onSettlementUpload(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </Card>
        ) : null}

        {/* ─── Batch context ────────────────────────────────────────────── */}
        <Card className="border-slate-200/90 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <SectionLabel>Operational snapshot</SectionLabel>
                <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-[#111827] md:text-[1.45rem]">Batch context</h2>
                <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-[#64748b]">
                  Intelligence batch health when a server batch id is present; the disbursement grid below stays a local
                  simulation unless rows are loaded from the intent engine.
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${batchContextBadge.wrap}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${batchContextBadge.dot}`} aria-hidden />
                {batchContextBadge.label}
              </span>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Batch ID', batchContextSnapshot.batchId],
                ['Bulk ingest', batchContextSnapshot.ingestLabel],
                ['Intelligence mode', batchContextSnapshot.intelligenceMode ?? '—'],
                ['Finality', batchContextSnapshot.finality],
                ['Total disbursements', batchContextSnapshot.totalCountLabel],
                ['Total value (upload)', batchContextSnapshot.totalValue],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-black/10 bg-[#fafaf9] px-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</dt>
                  <dd className="mt-1 break-words text-[14px] font-semibold leading-snug text-[#111827]">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="rounded-xl border border-black/10 bg-gradient-to-br from-[#f8fafc] via-white to-[#f4f4f1] px-4 py-4 md:px-5 md:py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#111827]">Data sync</span>
                    <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
                      {psp.trim() || 'PSP'}
                    </span>
                    <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
                      Intelligence + grid
                    </span>
                  </div>
                  <div className="mt-2 text-[13px] leading-relaxed text-[#64748b]">
                    <span className="text-[#475569]">Intelligence snapshot</span>{' '}
                    {intelBatchDetailAt ? (
                      <time dateTime={intelBatchDetailAt.toISOString()}>
                        {intelBatchDetailAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </time>
                    ) : (
                      <span>—</span>
                    )}
                    <span className="text-[#cbd5e1]"> · </span>
                    <span className="text-[#475569]">Grid simulation</span>{' '}
                    <time dateTime={lastRefreshedAt.toISOString()}>
                      {lastRefreshedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                    <span className="text-[#cbd5e1]"> · </span>
                    Polls every {Math.round(BATCH_INTEL_POLL_MS / 1000)}s when batch id is server-backed
                  </div>
                  {intelBatchDetail?.batch_health?.total_confirmed_amount_minor &&
                  String(intelBatchDetail.batch_health.total_confirmed_amount_minor).trim() !== '' ? (
                    <p className="mt-2 text-[12px] text-[#475569]">
                      <span className="font-semibold text-[#334155]">Confirmed (Intelligence health)</span>{' '}
                      {formatInrFromMinor(intelBatchDetail.batch_health.total_confirmed_amount_minor)}
                    </p>
                  ) : null}
                  <p className="mt-2 border-l-2 border-amber-200/90 pl-3 text-[12px] leading-relaxed text-[#78716c]">
                    Data from different sources may update at different times.
                  </p>
                  {intelBatchDetailError && intelligenceBatchPollEligible ? (
                    <p className="mt-2 text-[12px] font-medium text-[#b45309]">{intelBatchDetailError}</p>
                  ) : null}
                  {externalSyncLast ? (
                    <div
                      className={`mt-3 rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed ${
                        externalSyncLast.httpOk
                          ? 'border-sky-200/90 bg-sky-50/90 text-[#0c4a6e]'
                          : 'border-red-200/90 bg-red-50/90 text-[#991b1b]'
                      }`}
                      role="status"
                    >
                      <div className="font-semibold text-[13px]">
                        Customer systems · {externalSyncLast.operation}
                        {externalSyncLast.requestId ? (
                          <span className="ml-2 font-mono text-[11px] font-normal text-[#64748b]">
                            req {externalSyncLast.requestId.slice(0, 8)}…
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1">{externalSyncLast.message}</p>
                      {externalSyncLast.hint ? (
                        <p className="mt-1.5 text-[11px] leading-snug text-[#0369a1]">{externalSyncLast.hint}</p>
                      ) : null}
                      <p className="mt-1.5 text-[11px] text-[#64748b]">
                        <time dateTime={externalSyncLast.at.toISOString()}>
                          {externalSyncLast.at.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })}
                        </time>
                      </p>
                    </div>
                  ) : null}
                  {uploadedFileName ? (
                    <div className="mt-2 text-[13px] text-[#475569]">
                      <span className="text-[#94a3b8]">Source file</span>{' '}
                      <span className="font-medium text-[#111827]">{uploadedFileName}</span>
                    </div>
                  ) : null}
                  {uploadRelayMessage ? (
                    <div
                      className={`mt-1.5 text-[13px] font-medium ${
                        uploadRelayState === 'synced'
                          ? 'text-[#15803d]'
                          : uploadRelayState === 'failed'
                            ? 'text-[#b91c1c]'
                            : 'text-[#64748b]'
                      }`}
                    >
                      {uploadRelayMessage}
                    </div>
                  ) : null}
                  {intentEnginePoll && intentIngestOk ? (
                    <p
                      className={`mt-2 text-[12px] leading-relaxed ${
                        intentEnginePoll.ok ? 'text-[#15803d]' : 'text-[#b45309]'
                      }`}
                    >
                      <span className="font-semibold text-[#475569]">Intent engine (live)</span>
                      {' · '}
                      {intentEnginePoll.ok ? (
                        <>
                          Reachable — tenant intent total{' '}
                          {intentEnginePoll.intentTotal != null
                            ? intentEnginePoll.intentTotal.toLocaleString('en-IN')
                            : '—'}
                          . Polled every {Math.round(INTENT_ENGINE_POLL_MS / 1000)}s; last check{' '}
                          <time dateTime={intentEnginePoll.at.toISOString()}>
                            {intentEnginePoll.at.toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </time>
                          . Grid progression below remains a local simulation until a batch-status API is wired.
                        </>
                      ) : (
                        <>
                          Poll failed ({intentEnginePoll.err ?? 'unknown'}). Last attempt{' '}
                          <time dateTime={intentEnginePoll.at.toISOString()}>
                            {intentEnginePoll.at.toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </time>
                          .
                        </>
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                  <button
                    type="button"
                    disabled={externalSyncBusy !== null}
                    onClick={refreshLoanSystemStrip}
                    className="h-9 rounded-lg border border-black/10 bg-white px-3.5 text-[13px] font-medium text-[#475569] shadow-sm transition hover:border-[#6366f1]/35 hover:bg-[#f8fafc] hover:text-[#111827] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#6366f1]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {externalSyncBusy === 'loan' ? 'Calling loan system…' : 'Refresh from loan system'}
                  </button>
                  <button
                    type="button"
                    disabled={externalSyncBusy !== null}
                    onClick={refreshSettlementIntelStrip}
                    className="h-9 rounded-lg border border-black/10 bg-white px-3.5 text-[13px] font-medium text-[#475569] shadow-sm transition hover:border-[#6366f1]/35 hover:bg-[#f8fafc] hover:text-[#111827] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#6366f1]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {externalSyncBusy === 'settlement' ? 'Calling settlement feed…' : 'Fetch settlement updates'}
                  </button>
                  <button
                    type="button"
                    disabled={externalSyncBusy !== null}
                    onClick={refreshMandateStripSimOnly}
                    className="h-9 rounded-lg border border-black/10 bg-white px-3.5 text-[13px] font-medium text-[#475569] shadow-sm transition hover:border-[#6366f1]/35 hover:bg-[#f8fafc] hover:text-[#111827] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#6366f1]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {externalSyncBusy === 'mandate' ? 'Calling mandate / NACH…' : 'Check mandate status (NACH)'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Pipeline timeline (Zord intake + grid simulation) ───────── */}
        <div className="rounded-2xl border border-[#e8e8e5] bg-white/80 px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ebebea] pb-3">
            <div className="min-w-0">
              <SectionLabel>Zord pipeline</SectionLabel>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#64748b]">
                Batch received → file processed → disbursement queue → payment partner → bank confirmation → batch
                closed. Upload intent or settlement to advance stages; the grid timer continues disbursement simulation.
              </p>
            </div>
            {pipelineBusy ? (
              <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-800 motion-safe:animate-pulse">
                In progress
              </span>
            ) : null}
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#e8e8e5]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#6366f1] via-[#3b82f6] to-[#22c55e] transition-[width] duration-700 ease-out"
              style={{ width: `${timelineProgressPct}%` }}
              aria-valuenow={Math.round(timelineProgressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              role="progressbar"
            />
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {timeline.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${timelineStateClass(step.state)}`}
                >
                  {step.state === 'active' ? (
                    <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                      <span
                        className="absolute inline-flex h-full w-full rounded-full bg-[#3b82f6] opacity-40 motion-safe:animate-ping"
                        aria-hidden
                      />
                      <span className="relative h-1.5 w-1.5 rounded-full bg-[#2563eb]" aria-hidden />
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: timelineDotColor(step.state) }} />
                  )}
                  {step.label}
                </div>
                {i < timeline.length - 1 && <span className="select-none text-[#d8d8d4]">──</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ─── Alert banners ────────────────────────────────────────────── */}
        {uploadState === 'uploading' && (
          <div className="rounded-2xl border border-sky-300/70 bg-sky-50 px-5 py-3.5 text-[14px] text-[#1d4ed8] shadow-[0_0_22px_rgba(56,189,248,0.28)] ring-1 ring-sky-200/50">
            Uploading… Batch received. Processing will begin shortly.
          </div>
        )}
        {processingCount === 0 && summary.pending === 0 && summary.failed === 0 && (
          <div className="rounded-2xl border border-[#4ADE80]/45 bg-[#f0fdf4] px-5 py-3.5 text-[14px] text-[#15803d] shadow-[0_0_26px_rgba(74,222,128,0.32)] ring-1 ring-[#4ADE80]/25">
            No pending confirmations or review items in this batch view. Spot-check bank references for material amounts before sign-off.
          </div>
        )}
        {failureRate >= 15 && (
          <div className="rounded-2xl border border-red-300/70 bg-[#fef2f2] px-5 py-4 space-y-1.5 shadow-[0_0_26px_rgba(248,113,113,0.35)] ring-1 ring-red-300/40">
            <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#b91c1c]">Exception</div>
            <div className="text-[14px] font-semibold text-[#991b1b]">Requires-review rate is {failureRate.toFixed(1)}% for this batch.</div>
            <div className="text-[14px] text-[#991b1b]"><span className="font-medium text-[#7f1d1d]">Impact: </span>{summary.failed.toLocaleString('en-IN')} transactions (~{formatInr(amountSummary.failedAmount)}) need clearance before the batch is operationally clean.</div>
            <div className="text-[14px] text-[#991b1b]"><span className="font-medium text-[#7f1d1d]">Action: </span>Use the exception list below, filter by reason, and retry or escalate with the payment partner.</div>
          </div>
        )}

        {/* ─── Disbursement status ──────────────────────────────────────── */}
        <Card className="p-5">
          <SectionLabel>Disbursement status</SectionLabel>
          <div className="mt-4">
            <DataTable
              head={['Status', 'Count', 'Value']}
              rows={[
                ['Confirmed', summary.success.toLocaleString('en-IN'), formatInr(amountSummary.settledAmount)],
                ['Pending Confirmation', summary.pending.toLocaleString('en-IN'), formatInr(amountSummary.pendingAmount)],
                ['Requires Review', reviewCount.toLocaleString('en-IN'), formatInr(amountSummary.failedAmount)],
              ]}
              footer="Confirmed means bank-level confirmation is on record for this view. Pending confirmation is still with the bank or payment partner; requires review needs operator action."
            />
          </div>
        </Card>

        {/* ─── Insight cards (disbursement mix) ─────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Records processed"
            value={formatPercent(progress.processedPct)}
            sub={`${summary.processed.toLocaleString('en-IN')} / ${summary.totalRows.toLocaleString('en-IN')} transactions`}
            insight="Shows how much of the batch has left the processing queue—not bank confirmation."
          />
          <StatCard
            label="Confirmed (bank)"
            value={formatPercent(progress.successPct)}
            sub={`${summary.success.toLocaleString('en-IN')} transactions · ${formatInr(amountSummary.settledAmount)}`}
            color="text-[#16a34a]"
            insight="Bank confirmation on record for these disbursements in this workspace."
            actionLabel="Download report for audit packet"
            onAction={downloadReport}
          />
          <StatCard
            label="Pending confirmation"
            value={formatPercent(progress.pendingPct)}
            sub={`${summary.pending.toLocaleString('en-IN')} transactions · ${formatInr(amountSummary.pendingAmount)}`}
            color="text-[#d97706]"
            insight="Payment partner may show processed; bank confirmation still pending."
            actionLabel="Fetch settlement updates"
            onAction={refreshSimulation}
          />
          <StatCard
            label="Requires review"
            value={formatPercent(progress.failedPct)}
            sub={`${reviewCount.toLocaleString('en-IN')} incl. edge cases · ${formatInr(amountSummary.failedAmount)}`}
            color="text-[#dc2626]"
            insight="These items block a clean operational close until retried or corrected."
            actionLabel="Jump to exception breakdown"
            onAction={scrollToExceptions}
          />
        </div>

        {/* ─── Mandate + Settlement ─────────────────────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-5">
            <SectionLabel>Mandate readiness (NACH)</SectionLabel>
            <div className="mt-4">
              <DataTable
                head={['NACH mandate status', 'Count', 'Est. value']}
                rows={[
                  ['Active', mandateSummary.active.toLocaleString('en-IN'), formatInr(mandateAmounts.active)],
                  ['Pending Authorization', mandateSummary.pending.toLocaleString('en-IN'), formatInr(mandateAmounts.pending)],
                  ['Failed', mandateSummary.failed.toLocaleString('en-IN'), formatInr(mandateAmounts.failed)],
                ]}
                footer="Mandates affect EMI collection readiness; failed or pending mandate rows should be cleared before collection cycles."
              />
            </div>
          </Card>
          <Card className="p-5">
            <SectionLabel>Settlement confirmation</SectionLabel>
            <div className="mt-4">
              <DataTable
                head={['Settlement status', 'Count', 'Value']}
                rows={[
                  ['Confirmed', settlementCounts.confirmedN.toLocaleString('en-IN'), formatInr(settlementSummary.confirmed)],
                  ['Processed but Unconfirmed', settlementCounts.processedUnconfirmedN.toLocaleString('en-IN'), formatInr(settlementSummary.processedButUnconfirmed)],
                  ['Not Found', settlementCounts.notFoundN.toLocaleString('en-IN'), formatInr(settlementSummary.notFound)],
                ]}
                footer="Processed by a payment partner is not confirmed until bank-level confirmation exists. Not found may mean timing lag across sources."
              />
            </div>
          </Card>
        </div>

        {/* ─── Exceptions (summary) ─────────────────────────────────────── */}
        <Card id="exceptions-top" className="scroll-mt-24 p-5">
          <SectionLabel>Exceptions</SectionLabel>
          <h2 className="mt-2 text-[1.34rem] font-medium tracking-[-0.03em] text-[#111111]">Top issues</h2>
          <p className="mt-1 text-[14px] text-[#8a8a86]">Each row states problem, impact, and the recommended operator action.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {exceptionHighlights.map((ex) => (
              <div key={ex.problem} className="rounded-xl border border-[#efefec] bg-[#fafaf8] p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#b45309]">Requires attention</div>
                <div className="mt-2 text-[15px] font-semibold text-[#111111]">{ex.problem}</div>
                <div className="mt-2 text-[14px] text-[#5a5a56]"><span className="font-medium text-[#4f4f4b]">Impact: </span>{ex.impact}</div>
                <div className="mt-2 text-[14px] text-[#5a5a56]"><span className="font-medium text-[#4f4f4b]">Action: </span>{ex.action}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-[#9a9a96]">
            If the loan system updated but settlement did not: treat as disbursement recorded but confirmation pending. If settlement shows a transaction outside this batch: transaction found in settlement but not linked to batch—verify linkage.
          </p>
        </Card>

        {/* ─── Trend: confirmed vs pending ──────────────────────────────── */}
        <Card className="p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <SectionLabel>Trend</SectionLabel>
              <h2 className="mt-2 text-[1.34rem] font-medium tracking-[-0.03em] text-[#111111]">Confirmed vs pending confirmation</h2>
              <p className="mt-1 text-[14px] text-[#8a8a86]">Illustrative series for this workspace (normalized scale).</p>
            </div>
            <p className="max-w-md rounded-xl border border-[#efefec] bg-[#fafaf8] px-3 py-2 text-[13px] leading-snug text-[#5a5a56]">
              <span className="font-semibold text-[#4f4f4b]">Insight: </span>
              {trendInsight}
            </p>
          </div>
          <div className="mt-5 h-[220px]">
            <ClientChart className="h-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillConfirmed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fillPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 6" stroke="#ebebea" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9a9a96' }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, 'auto']} />
                  <Tooltip
                    formatter={(value, name) => {
                      const n = typeof value === 'number' ? value : Number(value)
                      const key = String(name)
                      return [String(Math.round(n)), key === 'confirmed' ? 'Confirmed (index)' : 'Pending confirmation (index)']
                    }}
                    labelFormatter={(label) => `Period ${label}`}
                    contentStyle={{ border: '0.5px solid #e8e8e5', borderRadius: 10, fontSize: 12, boxShadow: 'none' }}
                  />
                  <Area type="monotone" dataKey="confirmed" name="confirmed" stroke="#16a34a" strokeWidth={2} fill="url(#fillConfirmed)" />
                  <Area type="monotone" dataKey="pending" name="pending" stroke="#d97706" strokeWidth={2} fill="url(#fillPending)" />
                </AreaChart>
              </ResponsiveContainer>
            </ClientChart>
          </div>
        </Card>

        {/* ─── By payment method ─────────────────────────────────────────── */}
        <Card className="p-5">
          <SectionLabel>By payment method</SectionLabel>
          <div className="mt-4">
            <DataTable
              head={['Method', 'Confirmed', 'Pending confirmation', 'Requires review']}
              rows={methodBreakdown.map((m) => [m.method, m.confirmed, m.pending, m.review])}
              footer="Counts reflect disbursement status in this batch only. Method mix is informational for operations review."
            />
          </div>
        </Card>

        {/* ─── Status distribution + Failure reasons ───────────────────── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-5">
            <SectionLabel>Status distribution</SectionLabel>
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
                  <div key={entry.name} className="flex items-center justify-between rounded-xl border border-[#efefec] bg-[#fafaf8] px-3 py-2.5">
                    <div className="flex items-center gap-2 text-[14px] text-[#4f4f4b]">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {entry.name}
                    </div>
                    <span className="text-[14px] font-semibold text-[#111111]">{entry.value.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <SectionLabel>Exception reasons</SectionLabel>
              {selectedFailureReason && (
                <button
                  type="button"
                  onClick={() => setSelectedFailureReason(null)}
                  className="rounded-full border border-[#e8e8e5] bg-[#fafaf8] px-3 py-1 text-[12px] text-[#6f6f6b] transition hover:bg-[#f0f0ed]"
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="mt-4 space-y-2.5">
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
                      setStatusFilter('Failed')
                      setPage(1)
                    }}
                    className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${
                      active ? 'border-[#111111] bg-[#f5f5f3]' : 'border-[#efefec] bg-[#fafaf8] hover:border-[#ddddd9]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[14px]">
                      <span className="text-[#4f4f4b]">{item.reason}</span>
                      <span className="font-semibold text-[#111111]">{item.count}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ebebea]">
                      <div className="h-1.5 rounded-full bg-[#111111] transition-all" style={{ width: `${Math.max(4, pct)}%` }} />
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="mt-4 text-[13px] text-[#9a9a96]">Typical drivers: bank confirmation delay, mandate not authorized, settlement timing vs loan system.</p>
          </Card>
        </div>

        {/* ─── Row drill-down table ─────────────────────────────────────── */}
        <Card className="p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-[#e8e8e5] bg-[#fafaf8] p-1">
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setStatusFilter(opt.value); setPage(1) }}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                      statusFilter === opt.value ? 'bg-[#111111] text-white' : 'text-[#6f6f6b] hover:text-[#111111]'
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
              className="h-9 rounded-xl border border-[#e8e8e5] bg-[#fafaf8] px-3 text-[14px] outline-none"
            >
              <option value="Latest">Sort: Latest</option>
              <option value="Oldest">Sort: Oldest</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-[#ebebea]">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-[#ebebea] bg-[#fafaf8]">
                  {['Request ID', 'Borrower', 'Amount', 'Method', 'Status', 'Mandate status', 'Last updated', 'Action'].map((h) => (
                    <th key={h} className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.07em] text-[#9a9a96] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const expanded = expandedRef === row.refId
                  return (
                    <Fragment key={row.refId}>
                      <tr
                        className="cursor-pointer border-b border-[#f3f3f0] text-[14px] transition-colors hover:bg-[#fafaf8]"
                        onClick={() => setExpandedRef((c) => (c === row.refId ? null : row.refId))}
                      >
                        <td className="px-4 py-3.5 font-semibold text-[#111111] whitespace-nowrap">{row.refId}</td>
                        <td className="px-4 py-3.5 text-[#5a5a56]">{row.beneficiary}</td>
                        <td className="px-4 py-3.5 text-[#111111] whitespace-nowrap">{formatInr(row.amount)}</td>
                        <td className="px-4 py-3.5 text-[#5a5a56]">{disbursementMethodFromProvider(row.provider)}</td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex rounded-full border border-[#e8e8e5] bg-[#fafaf8] px-2.5 py-1 text-[12px] font-medium text-[#5a5a56] whitespace-nowrap">
                            {mandateStatusFromRow(row)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${statusBadgeClass(row.status)}`}>
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-[#8a8a86] whitespace-nowrap">{row.time}</td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            disabled={row.status !== 'Failed' && row.actionLabel === 'Retry row'}
                            className="whitespace-nowrap rounded-lg border border-[#e8e8e5] bg-white px-3 py-1.5 text-[13px] font-medium text-[#111111] transition hover:bg-[#fafaf8] disabled:opacity-40"
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
                        <tr className="bg-[#fafaf8]">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="rounded-xl border border-[#ebebea] bg-white p-4">
                              <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#9a9a96]">
                                {row.refId} - {formatInr(row.amount)}
                              </div>
                              <div className="mt-3 grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  {row.timeline.map((step) => (
                                    <div key={`${row.refId}-${step.label}`} className="flex items-center gap-3 text-[14px]">
                                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                                        step.state === 'done' ? 'bg-[#dcfce7] text-[#15803d]'
                                          : step.state === 'active' ? 'bg-[#dbeafe] text-[#1d4ed8]'
                                          : 'bg-[#f5f5f3] text-[#9a9a96]'
                                      }`}>
                                        {step.state === 'done' ? '✓' : step.state === 'active' ? '⚡' : '·'}
                                      </span>
                                      <span className="min-w-[160px] text-[#111111]">{step.label}</span>
                                      <span className="text-[#8a8a86]">{step.time}</span>
                                    </div>
                                  ))}
                                </div>
                                <details className="rounded-xl border border-[#ebebea] bg-[#fafaf8] p-3 text-[13px] text-[#6f6f6b]">
                                  <summary className="cursor-pointer font-medium text-[#4f4f4b]">Transaction detail</summary>
                                  <div className="mt-2 space-y-1.5">
                                    <div>Payment partner reference: {row.dispatchId}</div>
                                    <div>Bank reference: {row.bankReference}</div>
                                    <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-[#e8e8e5] bg-white px-2.5 py-1">
                                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#111111] text-[11px] text-white">{providerGlyph(row.provider)}</span>
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
            <span className="text-[14px] text-[#9a9a96]">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} rows
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((c) => Math.max(1, c - 1))}
                disabled={currentPage === 1}
                className="h-9 rounded-xl border border-[#e8e8e5] bg-white px-4 text-[14px] font-medium text-[#111111] transition hover:bg-[#fafaf8] disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-[14px] text-[#5a5a56]">Page {currentPage} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((c) => Math.min(totalPages, c + 1))}
                disabled={currentPage === totalPages}
                className="h-9 rounded-xl border border-[#e8e8e5] bg-white px-4 text-[14px] font-medium text-[#111111] transition hover:bg-[#fafaf8] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </Card>

        {/* ─── Batch summary ────────────────────────────────────────────── */}
        <Card className="p-5">
          <SectionLabel>Batch summary</SectionLabel>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total disbursement value', value: formatInr(amountSummary.totalAmount), color: 'text-[#111111]' },
              { label: 'Confirmed value (bank)', value: formatInr(amountSummary.settledAmount), color: 'text-[#16a34a]' },
              { label: 'Requires-review value', value: formatInr(amountSummary.failedAmount), color: 'text-[#dc2626]' },
              { label: 'Pending confirmation value', value: formatInr(amountSummary.pendingAmount), color: 'text-[#d97706]' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-[#efefec] bg-[#fafaf8] px-4 py-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9a9a96]">{label}</div>
                <div className={`mt-2 text-[18px] font-semibold ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  )
}
