'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { DASHBOARD_FONT_STACK, type GlyphName } from '../../today/_components/model'
import { ClientChart, Glyph } from '../../today/_components/shared'
import {
  buildDefaultBatchRows,
  buildSeedSummary,
  computeFailureCounts,
  deriveTimeline,
  formatInr,
  formatPercent,
  parseUploadedSheet,
  progressFromSummary,
  sortRowsByLatest,
  type BatchRow,
  type BatchRowStatus,
  type BatchSummary,
  type BatchTimelineStep,
} from './model'

type StatusFilter = 'All' | BatchRowStatus
type SortMode = 'Latest' | 'Oldest'

const PIE_COLORS = ['#34C759', '#EF4444', '#F59E0B', '#3B82F6']
const AUTO_REFRESH_MS = 8000
const PAGE_SIZE = 10
const SHELL_NAV: Array<{ icon: GlyphName; label: string; href: string }> = [
  { icon: 'home', label: 'Home overview', href: '/payout-command-view/today' },
  { icon: 'folder', label: 'Payout command view', href: '/payout-command-view/today' },
  { icon: 'zap', label: 'Reconciliation & finality', href: '/payout-command-view/today' },
  { icon: 'grid', label: 'Trace & evidence', href: '/payout-command-view/today' },
  { icon: 'refresh', label: 'Payout intelligence', href: '/payout-command-view/today' },
  { icon: 'document', label: 'Failure intelligence', href: '/payout-command-view/today' },
]

function statusBadgeClass(status: BatchRowStatus) {
  if (status === 'Success') return 'bg-[#ecfdf3] text-[#15803d] border-[#bbf7d0]'
  if (status === 'Failed') return 'bg-[#fff1f2] text-[#b91c1c] border-[#fecdd3]'
  if (status === 'Pending') return 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]'
  return 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]'
}

function timelineStateClass(state: BatchTimelineStep['state']) {
  if (state === 'done') return 'bg-[#22c55e] border-[#22c55e] text-white'
  if (state === 'active') return 'bg-[#3b82f6] border-[#3b82f6] text-white'
  if (state === 'warning') return 'bg-[#f59e0b] border-[#f59e0b] text-white'
  return 'bg-[#f5f5f5] border-[#d4d4d4] text-[#8a8a86]'
}

function providerGlyph(provider: BatchRow['provider']) {
  if (provider === 'RazorpayX') return 'R'
  if (provider === 'Cashfree') return 'C'
  if (provider === 'PayU') return 'P'
  return 'S'
}

function toCsv(rows: BatchRow[]) {
  const header = ['Ref ID', 'Amount', 'Beneficiary', 'Status', 'Stage', 'Reason', 'Time', 'Provider', 'Dispatch ID', 'Bank Ref']
  const lines = rows.map((row) =>
    [
      row.refId,
      row.amount,
      row.beneficiary,
      row.status,
      row.stage,
      row.reason,
      row.time,
      row.provider,
      row.dispatchId,
      row.bankReference,
    ]
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
      ...row,
      status: 'Success',
      stage: 'Confirmed',
      reason: '-',
      actionLabel: 'Export evidence',
      time: row.time === '-' ? '10:03:12' : row.time,
      timeline: row.timeline.map((step, index) =>
        index >= 4
          ? {
              ...step,
              state: 'done',
              time: index === 4 ? '10:02:44' : '10:03:12',
            }
          : step,
      ),
    }
  }
  if (n < 0.88) {
    return { ...row, status: 'Pending', stage: 'Awaiting Bank', reason: '-', actionLabel: 'Inspect queue' }
  }
  return {
    ...row,
    status: 'Failed',
    stage: 'Dispatched',
    reason: 'Bank Timeout',
    actionLabel: 'Retry row',
  }
}

function recomputeSummary(rows: BatchRow[], fallbackTotalRows: number): BatchSummary {
  const statusCounts = rows.reduce(
    (acc, row) => {
      acc[row.status] += 1
      return acc
    },
    { Success: 0, Failed: 0, Pending: 0, Processing: 0 } as Record<BatchRowStatus, number>,
  )

  const totalRows = Math.max(rows.length, fallbackTotalRows)
  const processed = totalRows - statusCounts.Processing
  return {
    totalRows,
    processed,
    success: statusCounts.Success,
    failed: statusCounts.Failed,
    pending: statusCounts.Pending,
  }
}

export default function BatchCommandCenterClient() {
  const [rows, setRows] = useState<BatchRow[]>(() => buildDefaultBatchRows())
  const [summary, setSummary] = useState<BatchSummary>(() => buildSeedSummary())
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

  const refreshSimulation = useCallback(() => {
    setRows((current) => current.map(evolveRow))
    setSummary((current) => {
      const processing = Math.max(0, current.totalRows - current.processed)
      if (processing === 0) return current

      const step = Math.min(processing, Math.max(60, Math.round(processing * 0.09)))
      const successGain = Math.round(step * 0.86)
      const failedGain = Math.round(step * 0.08)
      const pendingGain = step - successGain - failedGain
      return {
        totalRows: current.totalRows,
        processed: Math.min(current.totalRows, current.processed + step),
        success: current.success + successGain,
        failed: current.failed + failedGain,
        pending: Math.max(0, current.pending + pendingGain - Math.round(current.pending * 0.06)),
      }
    })
    setLastRefreshedAt(new Date())
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => refreshSimulation(), AUTO_REFRESH_MS)
    return () => window.clearInterval(intervalId)
  }, [refreshSimulation])

  const syncUploadToBackend = useCallback(async (file: File) => {
    setUploadRelayState('syncing')
    setUploadRelayMessage('Syncing uploaded sheet to service-seven ingest…')

    try {
      const formData = new FormData()
      formData.append('file', file, file.name)

      const response = await fetch('/api/bulk-ingest', {
        method: 'POST',
        headers: {
          'x-zord-source-type': 'batch_upload',
          'x-zord-source-class': 'operator_console',
        },
        body: formData,
      })

      const text = await response.text()
      let parsed: unknown = null
      try {
        parsed = text ? JSON.parse(text) : null
      } catch {
        parsed = null
      }

      if (!response.ok) {
        const errorDetail =
          parsed && typeof parsed === 'object' && 'details' in parsed && typeof (parsed as { details?: unknown }).details === 'string'
            ? (parsed as { details: string }).details
            : `HTTP ${response.status}`
        throw new Error(errorDetail)
      }

      setUploadRelayState('synced')
      setUploadRelayMessage('Batch uploaded and relayed to /v1/bulk-ingest.')
    } catch (error) {
      setUploadRelayState('failed')
      setUploadRelayMessage(`Backend relay unavailable (${error instanceof Error ? error.message : 'unknown error'}). Running local simulation mode.`)
    }
  }, [])

  const onUploadFile = useCallback(async (file: File | null) => {
    if (!file) return
    setUploadState('uploading')
    setUploadedFileName(file.name)
    setUploadRelayState('idle')
    setUploadRelayMessage(null)

    void syncUploadToBackend(file)

    const parsed = await parseUploadedSheet(file)
    setRows(parsed)
    setSummary(recomputeSummary(parsed, parsed.length))
    setPage(1)
    setExpandedRef(null)
    setSelectedFailureReason(null)
    setUploadState('ready')
    setLastRefreshedAt(new Date())
  }, [syncUploadToBackend])

  const retryFailedRows = useCallback(() => {
    setRows((current) =>
      current.map((row) =>
        row.status === 'Failed'
          ? {
              ...row,
              status: 'Processing',
              stage: 'Rows Processing',
              reason: '-',
              actionLabel: 'Track progress',
            }
          : row,
      ),
    )
    setSummary((current) => ({
      ...current,
      failed: 0,
      processed: Math.max(0, current.processed - current.failed),
    }))
    setLastRefreshedAt(new Date())
  }, [])

  const failureCounts = useMemo(() => computeFailureCounts(rows), [rows])
  const progress = useMemo(() => progressFromSummary(summary), [summary])
  const timeline = useMemo(() => deriveTimeline(summary, uploadState !== 'idle'), [summary, uploadState])
  const processingCount = Math.max(0, summary.totalRows - summary.processed)
  const failureRate = summary.totalRows ? (summary.failed / summary.totalRows) * 100 : 0

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    let next = rows
    if (query) {
      next = next.filter((row) => row.refId.toLowerCase().includes(query))
    }
    if (statusFilter !== 'All') {
      next = next.filter((row) => row.status === statusFilter)
    }
    if (selectedFailureReason) {
      next = next.filter((row) => row.reason === selectedFailureReason)
    }
    return sortRowsByLatest(next, sortMode)
  }, [rows, search, statusFilter, selectedFailureReason, sortMode])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  const pieData = useMemo(
    () => [
      { name: 'Success', value: progress.successPct },
      { name: 'Failed', value: progress.failedPct },
      { name: 'Pending', value: progress.pendingPct },
      { name: 'Processing', value: progress.processingPct },
    ],
    [progress.failedPct, progress.pendingPct, progress.processingPct, progress.successPct],
  )

  const averageAmount = useMemo(() => {
    if (!rows.length) return 0
    return rows.reduce((sum, row) => sum + row.amount, 0) / rows.length
  }, [rows])

  const amountSummary = useMemo(() => {
    const totalAmount = averageAmount * summary.totalRows
    const settledAmount = totalAmount * (summary.success / Math.max(summary.totalRows, 1))
    const failedAmount = totalAmount * (summary.failed / Math.max(summary.totalRows, 1))
    const pendingAmount = totalAmount * ((summary.pending + processingCount) / Math.max(summary.totalRows, 1))
    return { totalAmount, settledAmount, failedAmount, pendingAmount }
  }, [averageAmount, processingCount, summary.failed, summary.success, summary.totalRows, summary.pending])

  const downloadReport = useCallback(() => {
    const csv = toCsv(filteredRows.length ? filteredRows : rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `batch-report-${new Date().toISOString().slice(0, 19)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [filteredRows, rows])

  return (
    <main className="min-h-screen bg-[#ebebeb]" style={{ fontFamily: DASHBOARD_FONT_STACK }}>
      <div className="w-full overflow-hidden border border-black/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]">
        <div className="flex min-h-[56px] flex-col gap-4 border-b border-[#E5E5E5] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-white">Z</span>
              <div>
                <div className="text-[12px] uppercase tracking-[0.18em] text-[#8a8a86]">Workspace</div>
                <div className="text-[15px] font-medium text-[#111111]">Batch command center</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {SHELL_NAV.map((item, index) => {
                const active = index === 1
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex h-9 w-9 items-center justify-center rounded-[8px] border transition ${
                      active ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#E5E5E5] bg-white text-[#111111]'
                    }`}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <Glyph name={item.icon} className="h-[18px] w-[18px]" />
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-11 min-w-[18rem] items-center gap-3 rounded-[10px] border border-[#E5E5E5] bg-[#F5F5F5] px-3.5 text-[#7a7a76] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <Glyph name="search" className="h-4 w-4 text-[#111111]" />
              <span className="text-sm">Type client name or payout ID...</span>
            </div>
            <div className="flex items-center gap-3 rounded-[10px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-sm font-medium text-white">OS</div>
              <div className="pr-1">
                <div className="text-sm font-medium text-[#111111]">Ops supervisor</div>
                <div className="text-xs text-[#7a7a76]">Payout desk</div>
              </div>
            </div>
          </div>
        </div>

        <section className="relative p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#8a8a86]">
                <span>Workspaces</span>
                <span>/</span>
                <span>Overview</span>
                <span>/</span>
                <span className="text-[#111111]">Batch command center</span>
              </div>
              <h1 className="mt-3 text-[2.25rem] font-medium tracking-[-0.05em] text-[#111111] md:text-[2.85rem]">Batch command center</h1>
              <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#6f716d]">
                Upload payout sheets, monitor progress and failure pressure, then action retries with full row-level evidence.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={refreshSimulation}
                className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-black/10 bg-white text-[#111111]"
                aria-label="Refresh batch"
              >
                <Glyph name="refresh" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={downloadReport}
                className="rounded-[12px] border border-[#111111] bg-white px-3 py-2.5 text-[13px] font-medium text-[#111111]"
              >
                Download report
              </button>
              <button
                type="button"
                onClick={retryFailedRows}
                disabled={summary.failed === 0}
                className="rounded-[12px] border border-[#111111] bg-white px-3 py-2.5 text-[13px] font-medium text-[#111111] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Retry failed
              </button>
              <Link
                href="/payout-command-view/today"
                className="inline-flex items-center rounded-[12px] border border-[#111111] bg-white px-3 py-2.5 text-[13px] font-medium text-[#111111]"
              >
                Command view
              </Link>
              <button
                type="button"
                className="flex items-center gap-3 rounded-[12px] bg-[#111111] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
              >
                <div className="flex -space-x-2">
                  {['A', 'F', 'E'].map((item, index) => (
                    <span
                      key={item}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/60 text-[11px] font-medium text-[#111111]"
                      style={{ background: ['#d8e6ff', '#dbf7dd', '#edd8f4'][index] }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <span>Share</span>
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            <section className="rounded-[1.45rem] border border-[#E5E5E5] bg-white p-5 shadow-[0_12px_32px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a8a86]">Batch context</div>
              <h1 className="mt-2 text-[2.1rem] font-medium tracking-[-0.04em] text-[#111111]">Vendor Payout – April 27</h1>
              <div className="mt-4 grid gap-2 text-[14px] text-[#5f5f5b] sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <span className="text-[#8a8a86]">Batch ID:</span> BATCH_78231
                </div>
                <div>
                  <span className="text-[#8a8a86]">Total Rows:</span> {summary.totalRows.toLocaleString('en-IN')}
                </div>
                <div>
                  <span className="text-[#8a8a86]">Created At:</span> 10:00 AM
                </div>
                <div>
                  <span className="text-[#8a8a86]">Last Refresh:</span>{' '}
                  {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(lastRefreshedAt)}
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="text-[#8a8a86]">Status:</span>
                  <span className="inline-flex items-center rounded-full bg-[#eff6ff] px-2.5 py-1 text-[12px] font-medium text-[#1d4ed8]">
                    ⚡ {processingCount > 0 ? 'Processing' : 'Finalized'}
                  </span>
                </div>
              </div>
            </div>

            <div className="inline-flex items-center rounded-full border border-[#4ADE80]/40 bg-[#ecfdf3] px-3 py-1.5 text-[12px] font-medium text-[#166534]">
              Live simulation
            </div>
          </div>

          <div className="mt-5 rounded-[1rem] border border-dashed border-[#d4d4d2] bg-[#fafaf8] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[13px] font-medium text-[#111111]">Upload payout sheet (CSV / Excel)</div>
                <div className="mt-1 text-[12px] text-[#7a7a76]">
                  Drop a file to stage a batch and preview operational rows before final dispatch.
                </div>
                {uploadedFileName ? (
                  <div className="mt-2 text-[12px] text-[#2b2b29]">
                    Loaded file: <span className="font-medium">{uploadedFileName}</span>
                  </div>
                ) : null}
                {uploadRelayMessage ? (
                  <div
                    className={`mt-2 text-[12px] ${
                      uploadRelayState === 'synced'
                        ? 'text-[#166534]'
                        : uploadRelayState === 'failed'
                          ? 'text-[#b91c1c]'
                          : 'text-[#5f5f5b]'
                    }`}
                  >
                    {uploadRelayMessage}
                  </div>
                ) : null}
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-[10px] border border-[#111111] bg-white px-4 py-2.5 text-[13px] font-medium text-[#111111]">
                {uploadState === 'uploading' ? 'Uploading…' : 'Choose file'}
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  className="hidden"
                  onChange={(event) => void onUploadFile(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>
            </section>

        <section className="sticky top-0 z-20 rounded-[1rem] border border-[#E5E5E5] bg-[#ebebeb]/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {timeline.map((step, index) => (
              <div key={step.label} className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${timelineStateClass(step.state)}`}>
                  {step.state === 'done' ? '✔' : step.state === 'active' ? '⚡' : step.state === 'warning' ? '⚠' : '•'} {step.label}
                </span>
                {index < timeline.length - 1 ? <span className="text-[#b0b0ac]">──</span> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1rem] border border-[#E5E5E5] bg-white p-4">
            <div className="text-[12px] uppercase tracking-[0.1em] text-[#8a8a86]">Processed</div>
            <div className="mt-2 text-[2rem] font-light tracking-[-0.04em] text-[#111111]">{formatPercent(progress.processedPct)}</div>
            <div className="mt-2 text-[13px] text-[#6f716d]">{summary.processed.toLocaleString('en-IN')} / {summary.totalRows.toLocaleString('en-IN')}</div>
          </article>
          <article className="rounded-[1rem] border border-[#E5E5E5] bg-white p-4">
            <div className="text-[12px] uppercase tracking-[0.1em] text-[#8a8a86]">Success</div>
            <div className="mt-2 text-[2rem] font-light tracking-[-0.04em] text-[#15803d]">{formatPercent(progress.successPct)}</div>
            <div className="mt-2 text-[13px] text-[#6f716d]">{summary.success.toLocaleString('en-IN')}</div>
          </article>
          <article className="rounded-[1rem] border border-[#E5E5E5] bg-white p-4">
            <div className="text-[12px] uppercase tracking-[0.1em] text-[#8a8a86]">Failed</div>
            <div className="mt-2 text-[2rem] font-light tracking-[-0.04em] text-[#b91c1c]">{formatPercent(progress.failedPct)}</div>
            <div className="mt-2 text-[13px] text-[#6f716d]">{summary.failed.toLocaleString('en-IN')}</div>
          </article>
          <article className="rounded-[1rem] border border-[#E5E5E5] bg-white p-4">
            <div className="text-[12px] uppercase tracking-[0.1em] text-[#8a8a86]">Pending</div>
            <div className="mt-2 text-[2rem] font-light tracking-[-0.04em] text-[#b45309]">{formatPercent(progress.pendingPct)}</div>
            <div className="mt-2 text-[13px] text-[#6f716d]">{summary.pending.toLocaleString('en-IN')}</div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-[1rem] border border-[#E5E5E5] bg-white p-5">
            <div className="text-[12px] uppercase tracking-[0.1em] text-[#8a8a86]">Status distribution</div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_0.92fr]">
              <ClientChart className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {pieData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                      contentStyle={{ border: '0.5px solid #E5E5E5', borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ClientChart>
              <div className="space-y-2.5">
                {pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center justify-between rounded-[0.8rem] border border-[#efefec] bg-[#fafaf8] px-3 py-2.5">
                    <div className="inline-flex items-center gap-2 text-[13px] text-[#4d4d49]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      {entry.name}
                    </div>
                    <div className="text-[13px] font-medium text-[#111111]">{entry.value.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="rounded-[1rem] border border-[#E5E5E5] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[12px] uppercase tracking-[0.1em] text-[#8a8a86]">Failure reasons</div>
              {selectedFailureReason ? (
                <button
                  type="button"
                  onClick={() => setSelectedFailureReason(null)}
                  className="rounded-full border border-[#E5E5E5] bg-[#fafaf8] px-3 py-1 text-[12px] text-[#6f716d]"
                >
                  Clear filter
                </button>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {failureCounts.map((item) => {
                const max = Math.max(1, ...failureCounts.map((reason) => reason.count))
                const width = (item.count / max) * 100
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
                    className={`w-full rounded-[0.85rem] border px-3 py-2.5 text-left transition ${
                      active ? 'border-[#111111] bg-[#f5f5f3]' : 'border-[#efefec] bg-[#fafaf8] hover:border-[#d6d6d2]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-[#4f4f4b]">{item.reason}</span>
                      <span className="font-medium text-[#111111]">{item.count}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[#ecece9]">
                      <div className="h-2 rounded-full bg-[#111111]" style={{ width: `${Math.max(4, width)}%` }} />
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="mt-4 text-[12px] text-[#7a7a76]">Click a reason to filter table rows and speed up operator triage.</div>
          </article>
        </section>

        {uploadState === 'uploading' ? (
          <section className="rounded-[1rem] border border-[#E5E5E5] bg-white p-4 text-[14px] text-[#6f716d]">
            Uploading… Batch received. Processing will begin shortly.
          </section>
        ) : null}

        {processingCount === 0 && summary.pending === 0 ? (
          <section className="rounded-[1rem] border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-[14px] font-medium text-[#166534]">
            ✔ All payouts finalized successfully.
          </section>
        ) : null}

        {failureRate >= 15 ? (
          <section className="rounded-[1rem] border border-[#fecaca] bg-[#fef2f2] p-4">
            <div className="text-[13px] font-semibold text-[#b91c1c]">⚠ High failure rate detected ({failureRate.toFixed(1)}%)</div>
            <div className="mt-1 text-[13px] text-[#7f1d1d]">Open the failure breakdown and route retries to the right owner queue.</div>
          </section>
        ) : null}

        <section className="rounded-[1rem] border border-[#E5E5E5] bg-white p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Search by Ref ID"
                className="h-10 min-w-[220px] rounded-[10px] border border-[#E5E5E5] bg-[#fafaf8] px-3 text-[13px] outline-none"
              />
              <div className="inline-flex rounded-[10px] border border-[#E5E5E5] bg-[#fafaf8] p-1">
                {(['All', 'Success', 'Failed', 'Pending', 'Processing'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setStatusFilter(option)
                      setPage(1)
                    }}
                    className={`rounded-[8px] px-3 py-1.5 text-[12px] transition ${
                      statusFilter === option ? 'bg-[#111111] text-white' : 'text-[#6f716d]'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="h-10 rounded-[10px] border border-[#E5E5E5] bg-[#fafaf8] px-3 text-[13px]"
            >
              <option value="Latest">Sort: Latest</option>
              <option value="Oldest">Sort: Oldest</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-[0.9rem] border border-[#E5E5E5]">
            <table className="min-w-full text-left">
              <thead className="bg-[#f7f7f4] text-[12px] uppercase tracking-[0.08em] text-[#8a8a86]">
                <tr>
                  <th className="px-4 py-3">Ref ID</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Beneficiary</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0ed] bg-white text-[13px]">
                {pageRows.map((row) => {
                  const expanded = expandedRef === row.refId
                  return (
                    <Fragment key={row.refId}>
                      <tr
                        className="cursor-pointer hover:bg-[#fafaf8]"
                        onClick={() => setExpandedRef((current) => (current === row.refId ? null : row.refId))}
                      >
                        <td className="px-4 py-3 font-medium text-[#111111]">{row.refId}</td>
                        <td className="px-4 py-3 text-[#111111]">{formatInr(row.amount)}</td>
                        <td className="px-4 py-3">{row.beneficiary}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusBadgeClass(row.status)}`}>{row.status}</span>
                        </td>
                        <td className="px-4 py-3 text-[#4f4f4b]">{row.stage}</td>
                        <td className="px-4 py-3 text-[#4f4f4b]">{row.reason}</td>
                        <td className="px-4 py-3 text-[#4f4f4b]">{row.time}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={row.status !== 'Failed' && row.actionLabel === 'Retry row'}
                            className="rounded-[8px] border border-[#E5E5E5] bg-[#fafaf8] px-2.5 py-1.5 text-[12px] text-[#111111] disabled:opacity-40"
                            onClick={(event) => {
                              event.stopPropagation()
                              if (row.status === 'Failed') {
                                setRows((current) =>
                                  current.map((item) =>
                                    item.refId === row.refId
                                      ? {
                                          ...item,
                                          status: 'Processing',
                                          stage: 'Rows Processing',
                                          reason: '-',
                                          actionLabel: 'Track progress',
                                        }
                                      : item,
                                  ),
                                )
                              }
                            }}
                          >
                            {row.actionLabel}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-[#fbfbfa]">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="rounded-[0.9rem] border border-[#E5E5E5] bg-white p-4">
                              <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8a8a86]">
                                {row.refId} — {formatInr(row.amount)}
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                  {row.timeline.map((step) => (
                                    <div key={`${row.refId}-${step.label}`} className="flex items-center gap-2 text-[13px]">
                                      <span
                                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                                          step.state === 'done'
                                            ? 'bg-[#dcfce7] text-[#166534]'
                                            : step.state === 'active'
                                              ? 'bg-[#dbeafe] text-[#1d4ed8]'
                                              : 'bg-[#f5f5f3] text-[#8a8a86]'
                                        }`}
                                      >
                                        {step.state === 'done' ? '✔' : step.state === 'active' ? '⚡' : '•'}
                                      </span>
                                      <span className="min-w-[180px] text-[#111111]">{step.label}</span>
                                      <span className="text-[#7a7a76]">{step.time}</span>
                                    </div>
                                  ))}
                                </div>
                                <details className="rounded-[0.8rem] border border-[#E5E5E5] bg-[#fafaf8] p-3 text-[12px] text-[#6f716d]">
                                  <summary className="cursor-pointer font-medium text-[#4f4f4b]">Optional debug context</summary>
                                  <div className="mt-2 space-y-1">
                                    <div>Dispatch ID: {row.dispatchId}</div>
                                    <div>Reference: {row.bankReference}</div>
                                    <div>Provider: {row.provider}</div>
                                    <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E5E5] bg-white px-2 py-1">
                                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#111111] text-[11px] text-white">
                                        {providerGlyph(row.provider)}
                                      </span>
                                      {row.provider}
                                    </div>
                                  </div>
                                </details>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <div className="text-[#7a7a76]">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} rows
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={currentPage === 1}
                className="rounded-[8px] border border-[#E5E5E5] bg-[#fafaf8] px-3 py-1.5 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-[#4f4f4b]">
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={currentPage === totalPages}
                className="rounded-[8px] border border-[#E5E5E5] bg-[#fafaf8] px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[1rem] border border-[#E5E5E5] bg-white p-5">
          <div className="text-[12px] uppercase tracking-[0.1em] text-[#8a8a86]">Batch summary</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[0.9rem] border border-[#f0f0ed] bg-[#fafaf8] px-3 py-3">
              <div className="text-[11px] text-[#8a8a86]">Total Amount</div>
              <div className="mt-1 text-[15px] font-medium text-[#111111]">{formatInr(amountSummary.totalAmount)}</div>
            </div>
            <div className="rounded-[0.9rem] border border-[#f0f0ed] bg-[#fafaf8] px-3 py-3">
              <div className="text-[11px] text-[#8a8a86]">Settled Amount</div>
              <div className="mt-1 text-[15px] font-medium text-[#15803d]">{formatInr(amountSummary.settledAmount)}</div>
            </div>
            <div className="rounded-[0.9rem] border border-[#f0f0ed] bg-[#fafaf8] px-3 py-3">
              <div className="text-[11px] text-[#8a8a86]">Failed Amount</div>
              <div className="mt-1 text-[15px] font-medium text-[#b91c1c]">{formatInr(amountSummary.failedAmount)}</div>
            </div>
            <div className="rounded-[0.9rem] border border-[#f0f0ed] bg-[#fafaf8] px-3 py-3">
              <div className="text-[11px] text-[#8a8a86]">Pending Amount</div>
              <div className="mt-1 text-[15px] font-medium text-[#b45309]">{formatInr(amountSummary.pendingAmount)}</div>
            </div>
          </div>
        </section>
          </div>
        </section>
      </div>
    </main>
  )
}
