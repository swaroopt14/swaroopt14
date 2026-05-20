'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Manrope } from 'next/font/google'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { ClientChart, Glyph, LiveDataHint } from '../../today/_components/shared'
import { SessionTenantScopeBar } from '../../today/_components/layout/SessionTenantScopeBar'
import { ZordPipelineStepper } from './ZordPipelineStepper'
import { BatchIntakePanel, type BatchIntakeSnapshot, type IntentIngestSuccessPayload } from './BatchIntakePanel'
import { AttentionPreviewTable } from './AttentionPreviewTable'
import { SettlementStatusCard } from './SettlementStatusCard'
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
import {
  deriveZordPipelineTimeline,
  formatInrPrecise,
  formatPercent,
  progressFromSummary,
  type BatchSummary,
} from '@/services/payout-command/batch-model'
import {
  patternsInsight,
  useBatchOperationsFeed,
} from '@/services/payout-command/batch-operations/useBatchOperationsFeed'
import type { JournalFailureRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'

const BATCH_ALL_CLEAR_DISMISS_KEY = 'zord:batch-command-center-all-clear-notice'
const PIE_COLORS = ['#39E07E', '#ef4444', '#f59e0b', '#3b82f6']

const manropeBatch = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
})

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

function StatCard({
  label,
  value,
  sub,
  insight,
  actionLabel,
  onAction,
}: {
  label: string
  value: string
  sub?: string
  insight?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <article className={`${COMMAND_CENTER_KPI_CARD} h-full`}>
      <CommandCenterCardGlow />
      <SectionLabel>{label}</SectionLabel>
      <div className={`relative mt-3 text-[42px] font-extrabold tabular-nums tracking-[-0.03em] leading-none ${HOME_TITLE_BLACK}`}>
        {value}
      </div>
      {sub ? <div className={`relative mt-2 tracking-[0] ${HOME_BODY_IMPERIAL_MD}`}>{sub}</div> : null}
      {insight ? (
        <p className={`relative mt-3 border-t border-slate-200/90 pt-3 ${HOME_INSIGHT_PROSE}`}>
          <span className={HOME_INSIGHT_PROSE_STRONG}>Insight: </span>
          {insight}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className={`relative mt-auto pt-4 text-left text-[13px] font-medium underline decoration-[#d0d0cc] underline-offset-2 hover:decoration-[#000000] ${HOME_TITLE_BLACK}`}
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  )
}

function ExceptionIssueCard({ problem, impact, action }: { problem: string; impact: string; action: string }) {
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

function summaryFromEngineRows(
  intentCount: number,
  successCount: number,
  failureCount: number,
  pendingCount: number,
  processingCount: number,
): BatchSummary {
  const totalRows = intentCount + failureCount
  if (totalRows <= 0) {
    return { totalRows: 0, processed: 0, success: 0, failed: 0, pending: 0 }
  }
  const success = successCount
  const failed = failureCount
  const pending = pendingCount
  const processed = success + failed + pending
  return { totalRows, processed, success, failed, pending }
}

function topFailureHighlights(failures: JournalFailureRow[], limit = 3) {
  const map = new Map<string, number>()
  for (const f of failures) {
    const key = f.failureReason || f.failureStage || 'Unknown'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([reason, count]) => ({
      reason,
      count,
      action:
        reason.toLowerCase().includes('timeout')
          ? 'Follow up with the payment partner and bank for confirmation timestamps.'
          : reason.toLowerCase().includes('balance')
            ? 'Fund the disbursement account or split the batch before retrying.'
            : 'Open Intent Journal failures tab, verify source records, and retry or escalate.',
    }))
}

export default function BatchCommandCenterClient() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSandboxRoute = pathname?.startsWith('/sandbox') ?? false
  const { tenantId, tenantReady } = useSessionTenant()

  const initialBatchFromUrl = searchParams.get('batch_id')?.trim() ?? ''
  const [batchIdInput, setBatchIdInput] = useState(initialBatchFromUrl)
  const [intakeSnapshot, setIntakeSnapshot] = useState<BatchIntakeSnapshot>({
    intakeStep: 'idle',
    intentFileName: null,
    intentIngestOk: false,
    settlementFileName: null,
    settlementIngestOk: false,
    uploadedFileName: null,
    uploadState: 'idle',
    settlementBatchId: null,
  })
  const [toolbarNotice, setToolbarNotice] = useState<string | null>(null)
  const [allClearNoticeDismissed, setAllClearNoticeDismissed] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const toolbarNoticeTimerRef = useRef<number | null>(null)

  const activeBatchId = useMemo(() => {
    const fromInput = batchIdInput.trim()
    const fromIntake = intakeSnapshot.settlementBatchId?.trim() ?? ''
    return fromInput || fromIntake
  }, [batchIdInput, intakeSnapshot.settlementBatchId])

  const feed = useBatchOperationsFeed({
    enabled: tenantReady,
    batchId: activeBatchId,
  })

  useEffect(() => {
    setAllClearNoticeDismissed(noticeDismissed(BATCH_ALL_CLEAR_DISMISS_KEY))
  }, [])

  useEffect(() => {
    const urlBatch = searchParams.get('batch_id')?.trim()
    if (urlBatch && urlBatch !== batchIdInput) setBatchIdInput(urlBatch)
  }, [searchParams, batchIdInput])

  const syncBatchIdToUrl = useCallback(
    (id: string) => {
      const trimmed = id.trim()
      const params = new URLSearchParams(searchParams.toString())
      if (trimmed) params.set('batch_id', trimmed)
      else params.delete('batch_id')
      const qs = params.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const handleBatchIdChange = useCallback(
    (value: string) => {
      setBatchIdInput(value)
      syncBatchIdToUrl(value)
    },
    [syncBatchIdToUrl],
  )

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

  const onIntentIngestSuccess = useCallback(
    (_payload: IntentIngestSuccessPayload) => {
      void feed.refreshBatchFeed()
      showToolbarNotice('Intent batch accepted — refreshing live batch data.')
    },
    [feed, showToolbarNotice],
  )

  const onSettlementIngestSuccess = useCallback(() => {
    void feed.refreshBatchFeed()
    showToolbarNotice('Settlement batch accepted — observations will appear in Settlement Journal.')
  }, [feed, showToolbarNotice])

  const operatorIntelBatchId =
    activeBatchId && !activeBatchId.startsWith('LOCAL-') ? activeBatchId : ''

  const engineSummary = useMemo(() => {
    const success = feed.intentRows.filter((r) => r.status === 'Confirmed').length
    const pending = feed.intentRows.filter((r) => r.status === 'Pending').length
    const processing = feed.intentRows.filter((r) => r.status === 'In Progress').length
    const failed = feed.failureRows.length
    return summaryFromEngineRows(feed.intentRows.length + failed, success, failed, pending, processing)
  }, [feed.intentRows, feed.failureRows])

  const statCardsSummary = feed.intelligenceSummary ?? engineSummary

  const intelRupeeSummary = useMemo(() => {
    if (!feed.intelligenceSummary || !feed.intelBatchDetail?.batch_health || !feed.intelBatchDetail?.batch) return null
    const h = feed.intelBatchDetail.batch_health
    const b = feed.intelBatchDetail.batch
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
    return {
      totalAmount,
      settledAmount,
      failedAmount: unresolvedInr * (1 - w),
      pendingAmount: unresolvedInr * w,
    }
  }, [feed.intelBatchDetail, feed.intelligenceSummary])

  const averageAmount = useMemo(() => {
    const amounts = [...feed.intentRows.map((r) => r.amount), ...feed.failureRows.map((r) => r.amount)]
    if (!amounts.length) return 0
    return amounts.reduce((s, a) => s + a, 0) / amounts.length
  }, [feed.intentRows, feed.failureRows])

  const rowModelAmountSummary = useMemo(() => {
    const totalRows = Math.max(statCardsSummary.totalRows, 1)
    const totalAmount = averageAmount * statCardsSummary.totalRows
    const processingCount = Math.max(0, statCardsSummary.totalRows - statCardsSummary.processed)
    return {
      totalAmount,
      settledAmount: totalAmount * (statCardsSummary.success / totalRows),
      failedAmount: totalAmount * (statCardsSummary.failed / totalRows),
      pendingAmount: totalAmount * ((statCardsSummary.pending + processingCount) / totalRows),
    }
  }, [averageAmount, statCardsSummary])

  const amountSummary = intelRupeeSummary ?? rowModelAmountSummary
  const progress = useMemo(() => progressFromSummary(statCardsSummary), [statCardsSummary])
  const processingCount = Math.max(0, statCardsSummary.totalRows - statCardsSummary.processed)
  const failureRate = statCardsSummary.totalRows ? (statCardsSummary.failed / statCardsSummary.totalRows) * 100 : 0

  const pipelineIntake = useMemo(
    () => ({
      intakeStep: intakeSnapshot.intakeStep,
      intentFileName: intakeSnapshot.intentFileName,
      intentIngestOk: intakeSnapshot.intentIngestOk,
      settlementFileName: intakeSnapshot.settlementFileName,
      settlementIngestOk: intakeSnapshot.settlementIngestOk,
      uploadedFileName: intakeSnapshot.uploadedFileName,
      uploadState: intakeSnapshot.uploadState,
    }),
    [intakeSnapshot],
  )

  const timeline = useMemo(
    () => deriveZordPipelineTimeline(statCardsSummary, pipelineIntake),
    [pipelineIntake, statCardsSummary],
  )
  const pipelineBusy = timeline.some((s) => s.state === 'active')
  const timelineProgressPct = useMemo(() => {
    const n = timeline.length
    const done = timeline.filter((s) => s.state === 'done').length
    const bump = timeline.some((s) => s.state === 'active') ? 0.45 : timeline.some((s) => s.state === 'warning') ? 0.25 : 0
    return Math.min(100, ((done + bump) / Math.max(n, 1)) * 100)
  }, [timeline])

  const pieData = useMemo(
    () => [
      { name: 'Confirmed', value: progress.successPct },
      { name: 'Requires review', value: progress.failedPct },
      { name: 'Pending confirmation', value: progress.pendingPct },
      { name: 'Processing', value: progress.processingPct },
    ],
    [progress],
  )

  const exceptionHighlights = useMemo(() => {
    return topFailureHighlights(feed.failureRows).map((item) => ({
      ...item,
      impact: `${item.count.toLocaleString('en-IN')} transactions`,
      problem: item.reason,
    }))
  }, [feed.failureRows])

  const requiresReviewInsight = useMemo(() => {
    const base = 'These items block a clean operational close until retried or corrected in Intent Journal.'
    const pi = patternsInsight(feed.patternsKpi)
    return pi ? `${base} ${pi}` : base
  }, [feed.patternsKpi])

  const intentJournalHref = useMemo(() => {
    const base = isSandboxRoute ? '/sandbox?dock=grid' : '/payout-command-view/today?dock=grid'
    if (!activeBatchId) return base
    return `${base}&batch_id=${encodeURIComponent(activeBatchId)}`
  }, [activeBatchId, isSandboxRoute])

  const settlementJournalHref = useMemo(() => {
    if (!activeBatchId || activeBatchId.startsWith('LOCAL-')) return null
    const base = isSandboxRoute ? '/sandbox?dock=settlement' : '/sandbox?dock=settlement'
    return `${base}&client_batch_id=${encodeURIComponent(activeBatchId)}`
  }, [activeBatchId, isSandboxRoute])

  const shareBatchSummary = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const batchLabel = activeBatchId || '—'
    const tid = tenantId.trim() || '—'
    const text = [
      'Zord — Batch Command Center snapshot',
      '',
      `Tenant: ${tid}`,
      `Batch id: ${batchLabel}`,
      `Total rows: ${statCardsSummary.totalRows}`,
      `Confirmed: ${statCardsSummary.success} · Pending: ${statCardsSummary.pending} · Failed: ${statCardsSummary.failed}`,
      '',
      `Open: ${url}`,
    ].join('\n')
    const subject = `Batch status · ${batchLabel}`
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: subject, text, url })
        showToolbarNotice('Shared via your device.')
        return
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return
      }
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    showToolbarNotice('Opened email draft with batch summary.')
  }, [activeBatchId, showToolbarNotice, statCardsSummary, tenantId])

  const scrollToExceptions = useCallback(() => {
    document.getElementById('exceptions-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const recentBatchChips = feed.recentBatches.slice(0, 5)

  return (
    <div
      className={`${manropeBatch.className} payout-command-console text-[13px] font-normal leading-relaxed tracking-[0] text-[#1A1A1A] antialiased`}
    >
      <div className="mx-auto max-w-[1440px] space-y-5">
        <div className="flex flex-col gap-3 rounded-[12px] border border-slate-200/90 bg-white/95 px-4 py-3 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <LiveDataHint isLive={Boolean(tenantReady && feed.feedLoaded)} source="intent-engine + intelligence" />
            {feed.syncAt ? (
              <span className="text-[12px] text-[#888888]">
                Synced <HydrationSafeLocaleTime date={feed.syncAt} />
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={intentJournalHref}
              className="h-9 rounded-xl border border-[#E5E5E5] bg-white px-3.5 text-[14px] font-medium text-[#000000] transition hover:bg-slate-50"
            >
              Intent Journal
            </Link>
            {settlementJournalHref && isSandboxRoute ? (
              <Link
                href={settlementJournalHref}
                className="h-9 rounded-xl border border-[#E5E5E5] bg-white px-3.5 text-[14px] font-medium text-[#000000] transition hover:bg-slate-50"
              >
                Settlement Journal
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void feed.refreshBatchFeed()}
              disabled={feed.detailLoading}
              title="Refresh batch snapshot"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e8e8e5] bg-white text-[#888888] transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Glyph name="refresh" className={`h-[15px] w-[15px] ${feed.detailLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
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
              className="flex h-9 items-center gap-2 rounded-xl bg-[#000000] px-4 text-[14px] font-medium text-white transition hover:bg-[#2a2a2a] disabled:opacity-70"
            >
              {shareBusy ? 'Opening…' : 'Share'}
            </button>
          </div>
        </div>

        {toolbarNotice ? (
          <div role="status" className="rounded-xl border border-slate-200/90 bg-slate-100 px-4 py-2.5 text-[13px] font-medium text-slate-800">
            {toolbarNotice}
          </div>
        ) : null}

        {feed.feedError ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
            {feed.feedError}
          </div>
        ) : null}

        <SessionTenantScopeBar
          batchId={batchIdInput}
          onBatchIdChange={handleBatchIdChange}
          onAfterFetch={() => void feed.refreshBatchFeed()}
        />

        <div className="rounded-[12px] border border-slate-200/90 bg-white/95 px-3.5 py-3 shadow-[0_2px_12px_rgba(15,23,42,0.04)]">
          <h2 className="inline-flex rounded-full bg-[#39E07E] px-3.5 py-1.5 text-[14px] font-medium text-[#000000] ring-1 ring-[#39E07E]/30">
            Batch · command center
          </h2>
          <h1 className={`mt-2 text-[20px] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
            Batch Disbursement &amp; Settlement Overview
          </h1>
          <p className={`mt-0.5 max-w-2xl ${HOME_BODY_IMPERIAL}`}>
            Ingest batches, monitor close readiness, and drill into Intent or Settlement Journal for row-level work.
          </p>
          {activeBatchId ? (
            <p className={`mt-2 font-mono text-[13px] ${HOME_BODY_IMPERIAL_SM}`}>
              Active batch: <span className="text-[#0A0A0A]">{activeBatchId}</span>
              {activeBatchId.startsWith('LOCAL-') ? (
                <span className="ml-2 text-amber-800">(preview id — intelligence KPIs unavailable until server assigns a batch id)</span>
              ) : null}
            </p>
          ) : null}
        </div>

        <BatchIntakePanel
          batchIdInput={batchIdInput}
          onBatchIdChange={handleBatchIdChange}
          isSandboxRoute={isSandboxRoute}
          onIntentIngestSuccess={onIntentIngestSuccess}
          onSettlementIngestSuccess={onSettlementIngestSuccess}
          onSnapshotChange={setIntakeSnapshot}
        />

        {!activeBatchId && recentBatchChips.length > 0 ? (
          <Card className="p-4">
            <SectionLabel>Recent batches</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {recentBatchChips.map((b) => (
                <button
                  key={b.batchId}
                  type="button"
                  onClick={() => handleBatchIdChange(b.batchId)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[12px] text-[#0A0A0A] transition hover:border-[#0A0A0A] hover:bg-white"
                >
                  {b.batchId.length > 36 ? `${b.batchId.slice(0, 34)}…` : b.batchId}
                </button>
              ))}
            </div>
          </Card>
        ) : null}

        <ZordPipelineStepper steps={timeline} progressPct={timelineProgressPct} busy={pipelineBusy} />

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
                Last updated · <HydrationSafeLocaleTime date={feed.syncAt ?? new Date()} />
              </>
            }
            onDismiss={() => {
              dismissNotice(BATCH_ALL_CLEAR_DISMISS_KEY)
              setAllClearNoticeDismissed(true)
            }}
          />
        ) : null}

        {failureRate >= 15 && statCardsSummary.failed > 0 ? (
          <div className={`${COMMAND_CENTER_KPI_CARD} space-y-2`}>
            <CommandCenterCardGlow />
            <div className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Exception</div>
            <p className={`relative text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>
              Requires-review rate is {failureRate.toFixed(1)}% for this batch.
            </p>
            <p className={`relative ${HOME_BODY_IMPERIAL_SM}`}>
              <span className={HOME_INSIGHT_PROSE_STRONG}>Action: </span>
              <Link href={`${intentJournalHref}&tab=failures`} className="font-semibold underline">
                Open failures in Intent Journal
              </Link>
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Records processed"
            value={formatPercent(progress.processedPct)}
            sub={`${statCardsSummary.processed.toLocaleString('en-IN')} / ${statCardsSummary.totalRows.toLocaleString('en-IN')} transactions`}
            insight={operatorIntelBatchId ? 'From intelligence batch snapshot.' : 'From intent-engine batch detail.'}
          />
          <StatCard
            label="Confirmed (bank)"
            value={formatPercent(progress.successPct)}
            sub={`${statCardsSummary.success.toLocaleString('en-IN')} · ${formatInrPrecise(amountSummary.settledAmount)}`}
          />
          <StatCard
            label="Pending confirmation"
            value={formatPercent(progress.pendingPct)}
            sub={`${statCardsSummary.pending.toLocaleString('en-IN')} · ${formatInrPrecise(amountSummary.pendingAmount)}`}
            actionLabel="Fetch settlement updates"
            onAction={() => void feed.refreshBatchFeed()}
          />
          <StatCard
            label="Requires review"
            value={formatPercent(progress.failedPct)}
            sub={`${statCardsSummary.failed.toLocaleString('en-IN')} · ${formatInrPrecise(amountSummary.failedAmount)}`}
            insight={requiresReviewInsight}
            actionLabel="Jump to exceptions"
            onAction={scrollToExceptions}
          />
        </div>

        {feed.intelligenceSummary && operatorIntelBatchId ? (
          <p className={`text-center text-[12px] ${HOME_BODY_IMPERIAL_SM}`}>
            KPIs from intelligence batch <code className="rounded bg-slate-200/70 px-1 font-mono text-[11px]">{operatorIntelBatchId}</code>
            {feed.patternsKpi && isDataAvailable(feed.patternsKpi) ? ' · pattern KPI loaded' : ''}
          </p>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="p-5">
            <SectionLabel>Status distribution</SectionLabel>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
              {operatorIntelBatchId ? 'Scoped to active Batch-Id.' : 'Select a batch to scope this chart.'}
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
                    <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, '']} />
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

          <SettlementStatusCard
            batchId={activeBatchId}
            summary={feed.settlementSummary}
            settlementJournalHref={settlementJournalHref}
            syncAt={feed.syncAt}
            showSandboxLink={isSandboxRoute}
          />
        </div>

        <Card id="exceptions-top" className="scroll-mt-24 p-5">
          <SectionLabel>Exceptions</SectionLabel>
          <BatchSectionTitle>Top issues</BatchSectionTitle>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {exceptionHighlights.length === 0 ? (
              <p className={`col-span-full ${HOME_BODY_IMPERIAL_SM}`}>No DLQ failures loaded for this batch.</p>
            ) : (
              exceptionHighlights.map((ex) => (
                <ExceptionIssueCard key={ex.problem} problem={ex.problem} impact={ex.impact} action={ex.action} />
              ))
            )}
          </div>
        </Card>

        <AttentionPreviewTable
          rows={feed.attentionPreview}
          totalCount={feed.attentionTotal}
          intentJournalHref={intentJournalHref}
          loading={feed.detailLoading && Boolean(activeBatchId)}
        />
      </div>
    </div>
  )
}
