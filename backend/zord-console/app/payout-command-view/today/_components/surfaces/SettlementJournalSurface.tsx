'use client'

import Link from 'next/link'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { formatJournalMoney } from '../intent-journal/formatJournalMoney'
import { useSettlementJournalFeed } from '../settlement-journal/useSettlementJournalFeed'
import { CommandCenterCardGlow } from '../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import {
  JOURNAL_PAGE_BG,
  JournalOverviewStat,
  JournalPageHeader,
} from '../journal/JournalCommandCenterPrimitives'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import { dockItems } from '@/services/payout-command/model'
import {
  observationSearchHaystack,
  type SettlementObservationTableRow,
} from '@/services/payout-command/prod-api/settlementObservations'
import { markSandboxSetupStep } from '@/services/payout-command/sandbox-setup-guide'
import { SessionTenantScopeBar } from '../layout/SessionTenantScopeBar'
import { LiveDataHint } from '../shared'

const SETTLEMENT_PAGE_SUMMARY = dockItems.find((d) => d.id === 'settlement')?.summary ?? ''

const JOURNAL_BORDER = 'border-slate-200/90'
const JOURNAL_FILTER_LABEL =
  'mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]'

const filterInputClass =
  'h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50 px-3 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400/55 focus:bg-white focus:ring-2 focus:ring-sky-400/15'

const filterSelectClass =
  'h-9 w-full min-w-[7.5rem] rounded-xl border border-slate-200/90 bg-slate-50 px-2.5 text-[14px] text-slate-900 outline-none transition focus:border-sky-400/55 focus:bg-white focus:ring-2 focus:ring-sky-400/15'

const ROW_SIZE_OPTIONS = [25, 50, 100, 200] as const
const SIDEBAR_PAGE_SIZE = 8

const TABLE_ROW_NUM_TH =
  'w-11 min-w-[2.75rem] px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-[#888888]'
const TABLE_ROW_NUM_TD =
  'w-11 min-w-[2.75rem] px-2 py-2.5 text-center text-[13px] font-semibold tabular-nums text-[#64748b]'

const TABLE_TH =
  'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#888888] whitespace-nowrap'

const TABLE_COL_COUNT = 10

type DateRangePreset = 'all' | '7d' | '30d' | '90d' | 'ytd'

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
]

const AMOUNT_RANGE_OPTIONS = [
  'All',
  'Under ₹10,000',
  '₹10,000 – ₹1,00,000',
  'Over ₹1,00,000',
] as const
type AmountRangeFilter = (typeof AMOUNT_RANGE_OPTIONS)[number]

function observationInDateRange(observationTime: string, preset: DateRangePreset): boolean {
  if (preset === 'all') return true
  const parsed = Date.parse(observationTime)
  if (!Number.isFinite(parsed)) return true
  const observed = new Date(parsed)
  const now = new Date()
  const start = new Date(now)
  if (preset === '7d') start.setDate(now.getDate() - 7)
  else if (preset === '30d') start.setDate(now.getDate() - 30)
  else if (preset === '90d') start.setDate(now.getDate() - 90)
  else if (preset === 'ytd') start.setMonth(0, 1)
  start.setHours(0, 0, 0, 0)
  return observed >= start
}

function matchesAmountRange(amount: number, range: AmountRangeFilter): boolean {
  if (range === 'All') return true
  if (range === 'Under ₹10,000') return amount < 10_000
  if (range === '₹10,000 – ₹1,00,000') return amount >= 10_000 && amount <= 100_000
  return amount > 100_000
}

type SettlementSidebarOutcome = {
  total: number
  settled: number
  failed: number
  settledPct: number | null
  label: 'Settled' | 'Partial' | 'Failed'
  dotClass: string
  progressPct: number
  toneText: string
  barClass: string
}

function isSettledObservationStatus(statusRaw: string): boolean {
  const u = statusRaw.toUpperCase()
  return u.includes('SETTLED') || u.includes('SUCCESS')
}

function isFailedObservationStatus(statusRaw: string): boolean {
  const u = statusRaw.toUpperCase()
  return u.includes('FAIL') || u.includes('REJECT')
}

function outcomeFromObservationRows(rows: SettlementObservationTableRow[]): SettlementSidebarOutcome {
  const total = rows.length
  if (total === 0) {
    return {
      total: 0,
      settled: 0,
      failed: 0,
      settledPct: null,
      label: 'Partial',
      dotClass: 'bg-slate-300',
      progressPct: 0,
      toneText: 'text-slate-600',
      barClass: 'bg-slate-400',
    }
  }
  const settled = rows.filter((r) => isSettledObservationStatus(r.statusRaw)).length
  const failed = rows.filter((r) => isFailedObservationStatus(r.statusRaw)).length
  const settledPct = Math.round((settled / total) * 100)
  let label: SettlementSidebarOutcome['label'] = 'Partial'
  if (failed > 0 && failed >= settled) label = 'Failed'
  else if (settled === total) label = 'Settled'

  const failedRatio = failed / total
  const settledRatio = settled / total
  let dotClass = 'bg-amber-500'
  let toneText = 'text-amber-700'
  let barClass = 'bg-amber-500'
  if (failedRatio >= 0.5 || (failed > 0 && settled === 0)) {
    dotClass = 'bg-rose-500'
    toneText = 'text-rose-700'
    barClass = 'bg-rose-500'
  } else if (settledRatio >= 0.8 && failed === 0) {
    dotClass = 'bg-emerald-500'
    toneText = 'text-emerald-700'
    barClass = 'bg-emerald-500'
  }

  return {
    total,
    settled,
    failed,
    settledPct,
    label,
    dotClass,
    progressPct: settledPct,
    toneText,
    barClass,
  }
}

function settlementStatusBadgeClass(statusRaw: string) {
  const u = statusRaw.toUpperCase()
  if (u.includes('SETTLED') || u.includes('SUCCESS')) {
    return 'inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-800'
  }
  if (u.includes('FAIL') || u.includes('REJECT')) {
    return 'inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[12px] font-semibold text-rose-800'
  }
  if (u.includes('PEND') || u.includes('PROCESS')) {
    return 'inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-900'
  }
  return 'inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[12px] font-semibold text-slate-700'
}

export function SettlementJournalSurface({
  initialClientBatchId,
}: {
  initialClientBatchId?: string
} = {}) {
  const {
    tenantReady,
    tenantId,
    clientBatches,
    selectedClientBatchId,
    observationRows,
    feedLoaded,
    detailLoading,
    syncAt,
    feedMeta,
    selectClientBatch,
    refreshFeed,
  } = useSettlementJournalFeed({ enabled: true, initialClientBatchId })

  const { mode } = useEnvironment()

  useEffect(() => {
    if (mode === 'sandbox' && feedLoaded && observationRows.length > 0) {
      markSandboxSetupStep('settlement-journal')
    }
  }, [mode, feedLoaded, observationRows.length])

  const [tableSearch, setTableSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | string>('All')
  const [dateRange, setDateRange] = useState<DateRangePreset>('all')
  const [filterBankRef, setFilterBankRef] = useState('')
  const [filterClientRef, setFilterClientRef] = useState('')
  const [filterSettlementBatchId, setFilterSettlementBatchId] = useState('')
  const [sourceSystemFilter, setSourceSystemFilter] = useState<'All' | string>('All')
  const [amountRangeFilter, setAmountRangeFilter] = useState<AmountRangeFilter>('All')
  const [rowsPerPage, setRowsPerPage] = useState<(typeof ROW_SIZE_OPTIONS)[number]>(50)
  const [page, setPage] = useState(1)
  const [jumpPage, setJumpPage] = useState('1')
  const [sidebarPage, setSidebarPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [feedRefreshing, setFeedRefreshing] = useState(false)
  const [batchOutcomeCache, setBatchOutcomeCache] = useState<Record<string, SettlementSidebarOutcome>>({})

  const batchCommandCenterHref = payoutBatchCommandCenterHref(true)

  useEffect(() => {
    if (!selectedClientBatchId || observationRows.length === 0) return
    const outcome = outcomeFromObservationRows(observationRows)
    setBatchOutcomeCache((prev) => ({ ...prev, [selectedClientBatchId]: outcome }))
  }, [selectedClientBatchId, observationRows])

  useEffect(() => {
    setPage(1)
    setJumpPage('1')
    setExpandedId(null)
  }, [
    selectedClientBatchId,
    tableSearch,
    statusFilter,
    dateRange,
    filterBankRef,
    filterClientRef,
    filterSettlementBatchId,
    sourceSystemFilter,
    amountRangeFilter,
  ])

  const statusOptions = useMemo(() => {
    const set = new Set(observationRows.map((r) => r.status).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [observationRows])

  const sourceSystemOptions = useMemo(() => {
    const set = new Set(
      observationRows.map((r) => r.sourceSystem).filter((s) => s && s !== '—'),
    )
    return ['All', ...Array.from(set).sort()]
  }, [observationRows])

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    const bankQ = filterBankRef.trim().toLowerCase()
    const clientQ = filterClientRef.trim().toLowerCase()
    const settlementBatchQ = filterSettlementBatchId.trim().toLowerCase()
    return observationRows.filter((row) => {
      const bySearch = !q || observationSearchHaystack(row).includes(q)
      const byStatus = statusFilter === 'All' || row.status === statusFilter
      const byDate = observationInDateRange(row.observationTime, dateRange)
      const byBank = !bankQ || row.bankRef.toLowerCase().includes(bankQ)
      const byClient = !clientQ || row.clientRef.toLowerCase().includes(clientQ)
      const bySettlementBatch =
        !settlementBatchQ || row.settlementBatchId.toLowerCase().includes(settlementBatchQ)
      const bySource = sourceSystemFilter === 'All' || row.sourceSystem === sourceSystemFilter
      const byAmount = matchesAmountRange(row.amount, amountRangeFilter)
      return (
        bySearch &&
        byStatus &&
        byDate &&
        byBank &&
        byClient &&
        bySettlementBatch &&
        bySource &&
        byAmount
      )
    })
  }, [
    observationRows,
    tableSearch,
    statusFilter,
    dateRange,
    filterBankRef,
    filterClientRef,
    filterSettlementBatchId,
    sourceSystemFilter,
    amountRangeFilter,
  ])

  const totalAmount = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.amount, 0),
    [filteredRows],
  )
  const totalSettled = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.settledAmount, 0),
    [filteredRows],
  )
  const totalFees = useMemo(
    () => filteredRows.reduce((sum, r) => sum + r.feeAmount, 0),
    [filteredRows],
  )

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage))
  const safePage = Math.min(page, totalPages)
  const pageRows = filteredRows.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage)

  const sidebarTotalPages = Math.max(1, Math.ceil(clientBatches.length / SIDEBAR_PAGE_SIZE))
  const safeSidebarPage = Math.min(sidebarPage, sidebarTotalPages)
  const sidebarRows = clientBatches.slice(
    (safeSidebarPage - 1) * SIDEBAR_PAGE_SIZE,
    safeSidebarPage * SIDEBAR_PAGE_SIZE,
  )

  const handleRefresh = async () => {
    setFeedRefreshing(true)
    try {
      await refreshFeed()
    } finally {
      setFeedRefreshing(false)
    }
  }

  const clearTableFilters = () => {
    setTableSearch('')
    setStatusFilter('All')
    setDateRange('all')
    setFilterBankRef('')
    setFilterClientRef('')
    setFilterSettlementBatchId('')
    setSourceSystemFilter('All')
    setAmountRangeFilter('All')
  }

  const applySidebarBatchToFilters = () => {
    if (!selectedClientBatchId) return
    setFilterSettlementBatchId('')
    setFilterClientRef('')
    setTableSearch(selectedClientBatchId)
  }

  const feedMetaLine = [
    feedMeta?.ok ? `${feedMeta.batchCount} batch${feedMeta.batchCount === 1 ? '' : 'es'}` : null,
    syncAt ? `synced ${syncAt.toLocaleTimeString()}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={`h-[calc(100vh-8rem)] overflow-hidden ${JOURNAL_PAGE_BG} text-[13px] font-normal leading-relaxed text-slate-900 antialiased`}
    >
      <div className="grid h-full grid-cols-[272px,minmax(0,1fr)]">
        <aside className={`flex h-full flex-col overflow-hidden border-r ${JOURNAL_BORDER} bg-white`}>
          <div className="border-b border-slate-200/90 px-4 pb-3 pt-4">
            <h2 className={`text-[14px] font-semibold tracking-tight ${HOME_TITLE_BLACK}`}>Batches</h2>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
              {clientBatches.length} batch{clientBatches.length === 1 ? '' : 'es'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {!tenantReady ? (
              <p className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50 px-3 py-4 text-center text-[14px] text-[#64748b]">
                Sign in to load settlement batches for your session tenant.
              </p>
            ) : feedLoaded && clientBatches.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50 px-3 py-4 text-center text-[14px] leading-relaxed text-[#64748b]">
                No batches yet. Upload settlement from{' '}
                <Link href={batchCommandCenterHref} className="font-semibold text-[#0f172a] underline">
                  Batch Command Center
                </Link>
                .
              </p>
            ) : null}

            {sidebarRows.map((batchId) => {
              const selected = batchId === selectedClientBatchId
              const cached = batchOutcomeCache[batchId]
              const liveOutcome =
                selected && observationRows.length > 0
                  ? outcomeFromObservationRows(observationRows)
                  : cached
              const dotClass = liveOutcome?.dotClass ?? 'bg-slate-300'
              const countLine = liveOutcome
                ? `${liveOutcome.total.toLocaleString('en-US')} observations${
                    liveOutcome.settledPct != null ? ` · ${liveOutcome.settledPct}% settled` : ''
                  }`
                : '—'

              return (
                <button
                  key={batchId}
                  type="button"
                  onClick={() => selectClientBatch(batchId)}
                  className={`mb-1.5 w-full rounded-[10px] border px-3 py-2 text-left transition ${
                    selected
                      ? 'border-[#111111] bg-slate-100'
                      : 'border-transparent hover:border-slate-200/90 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
                      <span className={`truncate font-mono text-[13px] font-medium ${HOME_TITLE_BLACK}`}>
                        {batchId}
                      </span>
                    </div>
                    {liveOutcome?.settledPct != null ? (
                      <span className={`shrink-0 text-[14px] font-semibold tabular-nums ${liveOutcome.toneText}`}>
                        {liveOutcome.settledPct}%
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 pl-4 text-[13px] text-[#64748b]">{countLine}</p>
                  {selected && liveOutcome ? (
                    <div className="mt-2 space-y-1.5 pl-4">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                        <div
                          className={`h-full rounded-full ${liveOutcome.barClass}`}
                          style={{ width: `${liveOutcome.progressPct}%` }}
                        />
                      </div>
                      <p className={`text-[13px] font-semibold ${liveOutcome.toneText}`}>{liveOutcome.label}</p>
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>

          {clientBatches.length > SIDEBAR_PAGE_SIZE ? (
            <div className="border-t border-slate-200/90 bg-slate-50 px-3 py-2 text-[14px] text-[#64748b]">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={safeSidebarPage <= 1}
                  onClick={() => setSidebarPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-200/90 bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="tabular-nums">
                  {safeSidebarPage} / {sidebarTotalPages}
                </span>
                <button
                  type="button"
                  disabled={safeSidebarPage >= sidebarTotalPages}
                  onClick={() => setSidebarPage((p) => Math.min(sidebarTotalPages, p + 1))}
                  className="rounded-md border border-slate-200/90 bg-white px-2 py-1 text-[#0f172a] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <main className="flex h-full min-w-0 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <JournalPageHeader label="Settlement journal" summary={SETTLEMENT_PAGE_SUMMARY}>
              <LiveDataHint isLive={Boolean(tenantReady && feedLoaded)} source="settlement" />
              <button
                type="button"
                disabled={feedRefreshing || !tenantReady}
                onClick={() => void handleRefresh()}
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {feedRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <Link
                href={batchCommandCenterHref}
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Batch Command Center
              </Link>
            </JournalPageHeader>
            <div className="mb-4">
              <SessionTenantScopeBar
                batchId={selectedClientBatchId}
                onBatchIdChange={(id) => selectClientBatch(id)}
                onAfterFetch={() => void handleRefresh()}
              />
            </div>
            {feedMetaLine ? (
              <p className={`mb-4 font-mono text-[12px] text-slate-500`}>{feedMetaLine}</p>
            ) : null}

            {selectedClientBatchId ? (
              <section className={`relative mb-4 overflow-hidden ${COMMAND_CENTER_KPI_CARD}`}>
                <CommandCenterCardGlow />
                <div className="relative border-b border-slate-100 px-5 py-4">
                  <p className={COMMAND_CENTER_LABEL_GREEN}>Batch overview</p>
                  <h2 className={`mt-1 font-mono text-[20px] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
                    {selectedClientBatchId}
                  </h2>
                  <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
                    {detailLoading
                      ? 'Loading observations…'
                      : `${observationRows.length.toLocaleString('en-US')} canonical observation${observationRows.length === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Observations', value: filteredRows.length.toLocaleString('en-US') },
                    { label: 'Gross amount', value: formatJournalMoney(totalAmount) },
                    { label: 'Settled amount', value: formatJournalMoney(totalSettled) },
                    { label: 'Fees (sum)', value: formatJournalMoney(totalFees) },
                  ].map((stat) => (
                    <JournalOverviewStat key={stat.label} label={stat.label} value={stat.value} />
                  ))}
                </div>
              </section>
            ) : (
              <section className={`relative mb-4 ${COMMAND_CENTER_KPI_CARD} px-6 py-8 text-center`}>
                <CommandCenterCardGlow />
                <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Settlement journal</p>
                <p className={`relative mx-auto mt-2 max-w-xl ${HOME_BODY_IMPERIAL_SM}`}>
                  Select a client batch from the sidebar to browse canonical settlement observations.
                </p>
              </section>
            )}

            <div className={`relative mb-4 overflow-hidden ${COMMAND_CENTER_KPI_CARD} p-4`}>
              <CommandCenterCardGlow />
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label htmlFor="settlement-journal-search" className={JOURNAL_FILTER_LABEL}>
                    Search
                  </label>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"
                      aria-hidden
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </span>
                    <input
                      id="settlement-journal-search"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search bank ref, client ref, status, source, amount…"
                      className={`${filterInputClass} pl-9`}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!selectedClientBatchId}
                    onClick={applySidebarBatchToFilters}
                    className="h-9 shrink-0 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-[15px] font-medium text-[#334155] shadow-sm transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Use sidebar batch
                  </button>
                  <button
                    type="button"
                    onClick={clearTableFilters}
                    className="h-9 shrink-0 rounded-lg border border-[#e2e8f0] bg-white px-3 text-[15px] font-medium text-[#475569] shadow-sm transition hover:bg-[#f8fafc]"
                  >
                    Clear filters
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Date range</label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value as DateRangePreset)}
                    className={filterSelectClass}
                  >
                    {DATE_RANGE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Settlement batch</label>
                  <input
                    value={filterSettlementBatchId}
                    onChange={(e) => setFilterSettlementBatchId(e.target.value)}
                    placeholder="UUID prefix…"
                    className={filterInputClass}
                  />
                </div>
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Bank ref</label>
                  <input
                    value={filterBankRef}
                    onChange={(e) => setFilterBankRef(e.target.value)}
                    placeholder="UTR / bank ref"
                    className={filterInputClass}
                  />
                </div>
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Client ref</label>
                  <input
                    value={filterClientRef}
                    onChange={(e) => setFilterClientRef(e.target.value)}
                    placeholder="Client reference"
                    className={filterInputClass}
                  />
                </div>
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Source</label>
                  <select
                    value={sourceSystemFilter}
                    onChange={(e) => setSourceSystemFilter(e.target.value)}
                    className={filterSelectClass}
                  >
                    {sourceSystemOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === 'All' ? 'All sources' : opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={JOURNAL_FILTER_LABEL}>Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={filterSelectClass}
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === 'All' ? 'All statuses' : opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={JOURNAL_FILTER_LABEL}>Amount range</label>
                  <select
                    value={amountRangeFilter}
                    onChange={(e) => setAmountRangeFilter(e.target.value as AmountRangeFilter)}
                    className={filterSelectClass}
                  >
                    {AMOUNT_RANGE_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <section className={`overflow-hidden ${COMMAND_CENTER_KPI_CARD} !p-0`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <p className={`text-[14px] font-medium ${HOME_TITLE_BLACK}`}>Settlement observations</p>
                  <p className={HOME_BODY_IMPERIAL_SM}>
                    <span className="rounded-full border border-[#4ADE80]/45 bg-[#f0fdf4] px-2 py-0.5 text-[12px] font-semibold text-[#166534]">
                      {filteredRows.length.toLocaleString('en-US')} rows
                    </span>{' '}
                    match filters
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className={`w-full min-w-[1040px] border-collapse text-[14px] ${HOME_TITLE_BLACK}`}>
                  <thead className="bg-[#f8fafc]">
                    <tr>
                      <th className={TABLE_ROW_NUM_TH}>No.</th>
                      {[
                        'Settlement batch',
                        'Client ref',
                        'Bank ref',
                        'Amount',
                        'Settled',
                        'Fee',
                        'Status',
                        'Source',
                        'Observed',
                      ].map((h) => (
                        <th key={h} className={TABLE_TH}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={TABLE_COL_COUNT} className="px-4 py-14 text-center text-[15px] text-[#64748b]">
                          {selectedClientBatchId
                            ? detailLoading
                              ? 'Loading observations…'
                              : 'No observations match your search or status filter.'
                            : 'Select a client batch to load observations.'}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row, rowIndex) => {
                        const expanded = expandedId === row.observationId
                        return (
                          <Fragment key={row.observationId}>
                            <tr
                              className={`cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50/80 ${
                                expanded ? 'bg-slate-50/60' : rowIndex % 2 === 1 ? 'bg-slate-50/30' : ''
                              }`}
                              onClick={() =>
                                setExpandedId((id) => (id === row.observationId ? null : row.observationId))
                              }
                            >
                              <td className={TABLE_ROW_NUM_TD}>
                                {(safePage - 1) * rowsPerPage + rowIndex + 1}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-[12px] text-[#334155]">
                                {row.settlementBatchId}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-[#1e293b]">{row.clientRef}</td>
                              <td className="px-3 py-2.5 font-mono text-[12px] text-[#334155]">{row.bankRef}</td>
                              <td className="px-3 py-2.5 tabular-nums font-medium">
                                {formatJournalMoney(row.amount, row.currency)}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums">
                                {formatJournalMoney(row.settledAmount, row.currency)}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-[#64748b]">
                                {formatJournalMoney(row.feeAmount, row.currency)}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={settlementStatusBadgeClass(row.statusRaw)}>{row.status}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="inline-flex rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-[13px] font-medium capitalize text-slate-700">
                                  {row.sourceSystem}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-[13px] text-[#64748b] whitespace-nowrap">
                                {row.observationTime}
                              </td>
                            </tr>
                            {expanded ? (
                              <tr className="bg-slate-50/80">
                                <td colSpan={TABLE_COL_COUNT} className="px-5 pb-5 pt-3">
                                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">
                                    Observation detail
                                  </p>
                                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[13px]">
                                    <p>
                                      <span className="text-[#888888]">Source row</span>
                                      <br />
                                      <span className="font-mono">{row.sourceRowRef}</span>
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Observation ID</span>
                                      <br />
                                      <span className="font-mono break-all">{row.observationId}</span>
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Ingest run</span>
                                      <br />
                                      <span className="font-mono">{row.ingestRunId}</span>
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Client batch</span>
                                      <br />
                                      <span className="font-mono">{row.clientBatchId}</span>
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Deduction</span>
                                      <br />
                                      {formatJournalMoney(row.deductionAmount, row.currency)}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Provider ref</span>
                                      <br />
                                      {row.providerRef}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Bank ref</span>
                                      <br />
                                      {row.bankRef}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Source system ID</span>
                                      <br />
                                      {row.sourceSystemId}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Source type / strength</span>
                                      <br />
                                      {row.sourceType} · {row.sourceStrength}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Kind</span>
                                      <br />
                                      {row.observationKind}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Flags</span>
                                      <br />
                                      {row.retryFlag ? 'Retry ' : ''}
                                      {row.reversalFlag ? 'Reversal ' : ''}
                                      {row.returnFlag ? 'Return ' : ''}
                                      {!row.retryFlag && !row.reversalFlag && !row.returnFlag ? '—' : ''}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Provider / failure code</span>
                                      <br />
                                      {row.providerStatusCode} · {row.failureReasonCode}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Parse / mapping confidence</span>
                                      <br />
                                      {row.parseConfidence != null ? `${(row.parseConfidence * 100).toFixed(0)}%` : '—'}{' '}
                                      /{' '}
                                      {row.mappingConfidence != null
                                        ? `${(row.mappingConfidence * 100).toFixed(0)}%`
                                        : '—'}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Value date</span>
                                      <br />
                                      {row.valueDate}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Created / updated</span>
                                      <br />
                                      {row.createdAt} · {row.updatedAt}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Envelope / trace</span>
                                      <br />
                                      <span className="font-mono text-[12px] break-all">{row.settlementEnvelopeId}</span>
                                      <br />
                                      <span className="font-mono text-[12px] break-all">{row.traceId}</span>
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Connector</span>
                                      <br />
                                      {row.connectorId}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Source file</span>
                                      <br />
                                      <span className="font-mono break-all">{row.sourceFileRef}</span>
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">External / batch ref</span>
                                      <br />
                                      {row.externalReference} · {row.batchReference}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Strength class</span>
                                      <br />
                                      {row.sourceStrengthClass}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Provider ref status</span>
                                      <br />
                                      {row.providerRefStatus} · {row.providerRefConsistent}
                                      <br />
                                      <span className="text-[12px] text-[#64748b]">
                                        {row.providerRefFirstSeenAt} → {row.providerRefLastSeenAt}
                                      </span>
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Mapping profile</span>
                                      <br />
                                      {row.mappingProfileId} v{row.mappingProfileVersion}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Carrier / attachment scores</span>
                                      <br />
                                      {row.carrierRichnessScore != null
                                        ? `${(row.carrierRichnessScore * 100).toFixed(0)}%`
                                        : '—'}{' '}
                                      /{' '}
                                      {row.attachmentReadinessScore != null
                                        ? `${(row.attachmentReadinessScore * 100).toFixed(0)}%`
                                        : '—'}{' '}
                                      · {row.scoreVersion}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Canonical</span>
                                      <br />
                                      <span className="font-mono text-[12px] break-all">{row.canonicalHash}</span>
                                      <br />
                                      {row.canonicalSnapshotRef}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Corridor / beneficiary</span>
                                      <br />
                                      {row.corridorId} · {row.beneficiaryFingerprint}
                                    </p>
                                    <p>
                                      <span className="text-[#888888]">Zord signature carrier</span>
                                      <br />
                                      {row.zordSignatureCarrier}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-200/80 bg-[#f8fbff] px-4 py-3 text-[14px] text-[#64748b]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Showing {(filteredRows.length === 0 ? 0 : (safePage - 1) * rowsPerPage + 1)}-
                    {filteredRows.length === 0
                      ? 0
                      : Math.min(safePage * rowsPerPage, filteredRows.length)}{' '}
                    of {filteredRows.length.toLocaleString('en-US')} observations
                  </span>
                  <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value) as (typeof ROW_SIZE_OPTIONS)[number])
                        setPage(1)
                        setJumpPage('1')
                      }}
                      className="rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-[14px]"
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
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="rounded-lg border border-slate-200/90 bg-white px-3 py-1 text-[14px] font-medium text-slate-800 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="tabular-nums">
                    Page {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="rounded-lg border border-slate-200/90 bg-white px-3 py-1 text-[14px] font-medium text-slate-800 disabled:opacity-40"
                  >
                    Next
                  </button>
                  <input
                    value={jumpPage}
                    onChange={(e) => setJumpPage(e.target.value.replace(/[^0-9]/g, ''))}
                    aria-label="Jump to page"
                    className="w-16 rounded-lg border border-slate-200/90 bg-white px-2 py-1 text-center"
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200/90 bg-white px-3 py-1 text-[14px] font-medium text-slate-800"
                    onClick={() => {
                      const target = Number(jumpPage)
                      if (!Number.isFinite(target) || target < 1) return
                      setPage(Math.min(totalPages, target))
                    }}
                  >
                    Go
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
