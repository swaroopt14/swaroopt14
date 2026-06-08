'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BORROWER_VERIFICATION_MOCK,
  type BorrowerQueueRow,
  type BorrowerQueueStatus,
} from '../verification/borrowerVerificationMock'
import {
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
  INTELLIGENCE_BLUE_GRADIENT,
} from '../command-center/homeCommandCenterTokens'
import { JournalIntelligenceKpiHero } from '../command-center/JournalIntelligenceKpiHero'
import { JOURNAL_DM_MONO, JOURNAL_DM_SANS } from '../journal/journalFonts'
import { Glyph } from '../shared'

type QueueFilter = 'All' | BorrowerQueueStatus
type SortKey = 'borrower' | 'loan' | 'status' | 'source'
type SortDirection = 'asc' | 'desc'

const ROWS_PER_PAGE = 10
const QUEUE_FILTERS: QueueFilter[] = ['All', 'Safe', 'Review', 'Blocked', 'Rejected']
const STATUS_ORDER: Record<BorrowerQueueStatus, number> = {
  Safe: 0,
  Review: 1,
  Blocked: 2,
  Rejected: 3,
}

function formatLoanCompact(amountInr: number): string {
  const lakh = amountInr / 100_000
  const rounded = Number.isInteger(lakh) ? lakh.toFixed(0) : lakh.toFixed(1)
  return `₹${rounded}L`
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function statusBadgeTone(status: BorrowerQueueStatus): string {
  if (status === 'Safe') return 'bg-[#166534] text-white'
  if (status === 'Review') return 'bg-[#854d0e] text-white'
  if (status === 'Blocked') return 'bg-[#991b1b] text-white'
  return 'bg-[#7f1d1d] text-white'
}

function sourceBadgeTone(source: BorrowerQueueRow['source']): string {
  return source === 'Sumsub'
    ? 'bg-[#dbeafe] text-[#1d4ed8]'
    : 'bg-[#fef3c7] text-[#92400e]'
}

function rowSearchHaystack(row: BorrowerQueueRow): string {
  return [
    row.borrowerId,
    row.borrowerName,
    row.status,
    row.source,
  ]
    .join(' ')
    .toLowerCase()
}

function compareRows(a: BorrowerQueueRow, b: BorrowerQueueRow, sortKey: SortKey): number {
  if (sortKey === 'loan') return a.loanAmountInr - b.loanAmountInr
  if (sortKey === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  if (sortKey === 'source') return a.source.localeCompare(b.source)
  const byId = a.borrowerId.localeCompare(b.borrowerId)
  if (byId !== 0) return byId
  return a.borrowerName.localeCompare(b.borrowerName)
}

function SortHeader({
  label,
  sortKey,
  activeSort,
  direction,
  onSort,
  variant = 'light',
}: {
  label: string
  sortKey: SortKey
  activeSort: SortKey
  direction: SortDirection
  onSort: (key: SortKey) => void
  variant?: 'light' | 'dark'
}) {
  const isActive = activeSort === sortKey
  const dark = variant === 'dark'
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-left text-[13px] font-semibold transition ${
        dark ? 'text-[#a3a3a3] hover:bg-[#2e2e2e]' : 'text-[#334155] hover:bg-slate-100'
      }`}
    >
      {label}
      <span className={`text-[11px] ${dark ? 'text-[#71717a]' : 'text-slate-500'}`}>{isActive ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
}

export function BorrowerVerificationSurface() {
  const source = BORROWER_VERIFICATION_MOCK
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('All')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('borrower')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [runningCheck, setRunningCheck] = useState(false)
  const [lastCheckAt, setLastCheckAt] = useState(() => new Date())
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setPage(1)
  }, [queueFilter, query, sortKey, sortDirection])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const rows = source.queueRows
  const normalizedQuery = query.trim().toLowerCase()

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (queueFilter !== 'All' && row.status !== queueFilter) return false
      if (!normalizedQuery) return true
      return rowSearchHaystack(row).includes(normalizedQuery)
    })
  }, [rows, queueFilter, normalizedQuery])

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows]
    copy.sort((a, b) => {
      const base = compareRows(a, b, sortKey)
      return sortDirection === 'asc' ? base : -base
    })
    return copy
  }, [filteredRows, sortKey, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * ROWS_PER_PAGE
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE)

  const baseFunnel = source.funnel[0]?.count ?? 1
  const funnelRows = source.funnel.map((step, index) => {
    const ratio = Math.max(1, Math.round((step.count / baseFunnel) * 1000) / 10)
    const prev = source.funnel[index - 1]?.count ?? step.count
    const drop = Math.max(0, prev - step.count)
    return { ...step, ratio, drop }
  })
  const riskTotal = source.riskSignals.reduce((sum, signal) => sum + signal.value, 0)
  const riskSlices = source.riskSignals.map((signal) => {
    const percent = riskTotal > 0 ? (signal.value / riskTotal) * 100 : 0
    return { ...signal, percent }
  })
  const riskPalette = ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#3b82f6']
  const riskPieBackground = (() => {
    if (riskSlices.length === 0) return '#e2e8f0'
    let cursor = 0
    const stops = riskSlices.map((slice, idx) => {
      const start = cursor
      cursor += slice.percent
      const end = cursor
      return `${riskPalette[idx % riskPalette.length]} ${start}% ${end}%`
    })
    return `conic-gradient(${stops.join(', ')})`
  })()
  const radarCenter = { x: 170, y: 136 }
  const radarRadius = 100
  const radarAngles = source.funnel.map((_, idx) => (-Math.PI / 2) + (idx * ((2 * Math.PI) / source.funnel.length)))
  const radarCurrent = source.funnel.map((step) => step.count / Math.max(baseFunnel, 1))
  const radarBaseline = [0.86, 0.82, 0.78, 0.75, 0.72, 0.69]
  const radarPoint = (angle: number, ratio: number) => ({
    x: radarCenter.x + Math.cos(angle) * radarRadius * ratio,
    y: radarCenter.y + Math.sin(angle) * radarRadius * ratio,
  })
  const radarPath = (ratios: number[]) =>
    ratios
      .map((ratio, idx) => {
        const point = radarPoint(radarAngles[idx], Math.max(0, Math.min(1, ratio)))
        return `${point.x},${point.y}`
      })
      .join(' ')
  const radarGrid = [0.25, 0.5, 0.75, 1]
  const heroBuckets = [
    {
      label: 'Safe to disburse',
      value: String(source.summary.safeToDisburse),
      sub: `of ${source.totals.totalBorrowers} borrowers`,
    },
    {
      label: 'Blocked / review',
      value: String(source.summary.blockedOrReview),
      sub: 'Requires verification action',
    },
    {
      label: 'Exposure prevented',
      value: source.summary.exposurePreventedLabel,
      sub: 'Fraud and mismatch prevention',
    },
    {
      label: 'KYC pass rate',
      value: `${source.summary.kycPassRate}%`,
      sub: 'Primary provider: Sumsub',
    },
    {
      label: 'Proof coverage',
      value: `${source.summary.proofCoveragePct}%`,
      sub: 'Disbursal evidence readiness',
    },
  ] as const
  const handleRunCheck = () => {
    if (runningCheck) return
    setRunningCheck(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setRunningCheck(false)
      setLastCheckAt(new Date())
      timerRef.current = null
    }, 900)
  }

  const handleSort = (next: SortKey) => {
    if (sortKey === next) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(next)
    setSortDirection('asc')
  }

  return (
    <div className={`mt-2 space-y-4 ${JOURNAL_DM_SANS}`}>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={`text-[1.35rem] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>{source.header.title}</h2>
            <span className="inline-flex items-center rounded-full border border-[#86efac] bg-[#f0fdf4] px-2.5 py-0.5 text-[12px] font-semibold text-[#166534]">
              {source.header.statusPill}
            </span>
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[12px] font-semibold text-sky-700">
              {source.header.providerPill}
            </span>
          </div>
          <p className={HOME_BODY_IMPERIAL_SM}>
            Operate borrower readiness before disbursal with one verification workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/payout-command-view/batch-command-center"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-[#0f172a] transition hover:bg-slate-50"
          >
            <Glyph name="folder" className="h-4 w-4" />
            Upload batch
          </Link>
          <button
            type="button"
            onClick={handleRunCheck}
            disabled={runningCheck}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f172a] px-3.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:opacity-70"
          >
            <Glyph name="refresh" className={`h-4 w-4 ${runningCheck ? 'animate-spin' : ''}`} />
            {runningCheck ? 'Running check…' : 'Run check'}
          </button>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-2.5">
        <p className="text-[13px] font-medium text-sky-900">
          {source.header.syncLine} · Last pull {source.header.lastPullMinutes} min ago · Manual review fallback active for{' '}
          {source.header.manualReviewFallbackBorrowers} borrowers · Last check {formatClock(lastCheckAt)}
        </p>
        <Link
          href="/payout-command-view/today?dock=grid&tab=failures"
          className="text-[13px] font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4"
        >
          View manual queue
        </Link>
      </section>

      <JournalIntelligenceKpiHero
        eyebrow="Borrower verification"
        value={String(source.summary.safeToDisburse)}
        deltaPill={`${source.summary.kycPassRate}% pass`}
        subcopy={`Total borrowers ${source.totals.totalBorrowers.toLocaleString('en-IN')} · Last pull ${source.header.lastPullMinutes} min ago`}
        buckets={heroBuckets}
        testId="borrower-verification-kpi-hero"
      />

      <section className="grid gap-3 xl:grid-cols-3 xl:items-stretch">
        <article className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-[#24499e] p-5 text-white shadow-[0_14px_34px_rgba(0,35,156,0.32)]" style={{ background: INTELLIGENCE_BLUE_GRADIENT }}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/75">Verification insights</p>
          <p className="mt-2 text-[1.95rem] leading-[1.18] text-white">
            You have <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[1.25rem] font-semibold text-[#00239C]">6</span> insights on KYC verification
            flow and active <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[1.25rem] font-semibold text-[#00239C]">12</span> cases
          </p>
          <div className="mt-8 flex items-center justify-between text-[14px] font-medium text-white/90">
            <span>Updates</span>
            <span className={JOURNAL_DM_MONO}>Sep 28,2pm</span>
          </div>
        </article>

        <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h3 className={`text-[1.1rem] font-semibold ${HOME_TITLE_BLACK}`}>Top risk signals</h3>
            <span className={`text-[12px] font-semibold ${HOME_BODY_IMPERIAL_SM}`}>Risk mix</span>
          </div>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>Flagged across active verifications</p>

          <div className="mt-3 grid flex-1 items-center gap-4 md:grid-cols-[1fr_220px]">
            <div>
              <p className={`text-[13px] ${HOME_BODY_IMPERIAL_SM}`}>Total flags</p>
              <p className={`mt-1 text-[2.4rem] font-semibold leading-none ${HOME_TITLE_BLACK} ${JOURNAL_DM_MONO}`}>{riskTotal}</p>
              <div className="mt-4 space-y-2.5">
                {riskSlices.map((signal, idx) => (
                  <div key={signal.label} className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <span className={`inline-flex items-center gap-2 text-[14px] font-medium text-[#00239C]`}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: riskPalette[idx % riskPalette.length] }} />
                      {signal.label}
                    </span>
                    <span className={`text-[14px] font-semibold ${HOME_TITLE_BLACK} ${JOURNAL_DM_MONO}`}>{signal.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center">
              <div className="relative h-[200px] w-[200px] rounded-full border border-slate-200" style={{ background: riskPieBackground }}>
                <div className="absolute inset-[28px] rounded-full bg-white shadow-inner" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className={`text-[1.8rem] font-semibold ${HOME_TITLE_BLACK} ${JOURNAL_DM_MONO}`}>{riskTotal}</p>
                    <p className={`text-[12px] font-semibold text-[#00239C]`}>TOTAL FLAGS</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className={`text-[1.1rem] font-semibold ${HOME_TITLE_BLACK}`}>Verification funnel</h3>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>Drop-off at each stage from intake to disbursal</p>
          <div className="mt-4 rounded-xl border border-slate-200 bg-[#f8fafc] p-3">
            <svg viewBox="0 0 340 270" className="h-[210px] w-full">
              {radarGrid.map((gridRatio) => (
                <polygon
                  key={`grid-${gridRatio}`}
                  points={radarPath(source.funnel.map(() => gridRatio))}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
              ))}
              {radarAngles.map((angle, idx) => {
                const outer = radarPoint(angle, 1)
                return (
                  <line
                    key={`axis-${source.funnel[idx]?.label}`}
                    x1={radarCenter.x}
                    y1={radarCenter.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                )
              })}
              <polygon
                points={radarPath(radarBaseline)}
                fill="rgba(217,70,239,0.16)"
                stroke="#d946ef"
                strokeWidth="2"
              />
              <polygon
                points={radarPath(radarCurrent)}
                fill="rgba(59,130,246,0.16)"
                stroke="#3b82f6"
                strokeWidth="2.4"
              />
              {source.funnel.map((step, idx) => {
                const labelPoint = radarPoint(radarAngles[idx], 1.14)
                return (
                  <text
                    key={`label-${step.label}`}
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor="middle"
                    className="fill-[#00239C] text-[9px] font-semibold"
                  >
                    {step.label.split(' ')[0]}
                  </text>
                )
              })}
            </svg>
          </div>
          <div className="mt-3 space-y-2">
            {funnelRows.map((step) => (
              <div key={step.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[13px]">
                <span className="font-medium text-[#00239C]">{step.label}</span>
                <span className={`font-semibold ${HOME_TITLE_BLACK} ${JOURNAL_DM_MONO}`}>{step.count}</span>
                <span className={`${step.drop > 0 ? 'text-[#dc2626]' : 'text-slate-400'} ${JOURNAL_DM_MONO}`}>
                  {step.drop > 0 ? `-${step.drop}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section>
          <div className="rounded-[14px] border border-slate-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className={`text-[20px] font-semibold ${HOME_TITLE_BLACK}`}>Borrower queue</p>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Glyph name="search" className="h-4 w-4 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search borrower or id"
                  className={`w-52 border-0 bg-transparent text-[13px] font-medium outline-none placeholder:text-slate-400 ${HOME_TITLE_BLACK}`}
                />
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {QUEUE_FILTERS.map((filter) => {
                const active = queueFilter === filter
                const count = source.queueCounts[filter]
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setQueueFilter(filter)}
                    className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition ${
                      active
                        ? 'border-[#0f172a] bg-[#0f172a] text-white'
                        : `border-slate-300 bg-white ${HOME_TITLE_BLACK} hover:bg-slate-50`
                    }`}
                  >
                    {filter} ({count})
                  </button>
                )
              })}
            </div>

            <div className="overflow-x-auto rounded-[10px] border border-slate-200">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left">
                      <SortHeader label="Borrower" sortKey="borrower" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <SortHeader label="Loan" sortKey="loan" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <SortHeader label="Status" sortKey="status" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <SortHeader label="Source" sortKey="source" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-[14px] font-medium text-slate-500">
                        No borrowers match your filters.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => (
                      <tr key={row.borrowerId} className="border-t border-slate-200">
                        <td className="px-3 py-2.5">
                          <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>{row.borrowerId}</p>
                          <p className={`text-[14px] font-medium ${HOME_BODY_IMPERIAL_SM}`}>{row.borrowerName}</p>
                        </td>
                        <td className={`px-3 py-2.5 text-[14px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>{formatLoanCompact(row.loanAmountInr)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${statusBadgeTone(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${sourceBadgeTone(row.source)}`}>
                            {row.source}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[13px] font-medium text-slate-600">
              <p>
                Showing {sortedRows.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + ROWS_PER_PAGE, sortedRows.length)} of {sortedRows.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-300 px-2 py-1 text-[12px] font-semibold text-slate-700"
                >
                  Prev
                </button>
                <span>
                  Page {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded border border-slate-300 px-2 py-1 text-[12px] font-semibold text-slate-700"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
      </section>
    </div>
  )
}
