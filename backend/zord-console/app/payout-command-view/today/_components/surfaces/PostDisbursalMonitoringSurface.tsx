'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  POST_DISBURSAL_MONITORING_MOCK,
  type LoanMonitoringRow,
  type MonitoringQueueStatus,
} from '../monitoring/postDisbursalMonitoringMock'
import { COMMAND_CENTER_LABEL_GREEN, HOME_BODY_IMPERIAL_SM, HOME_TITLE_BLACK } from '../command-center/homeCommandCenterTokens'
import { JournalIntelligenceKpiHero } from '../command-center/JournalIntelligenceKpiHero'
import { Glyph } from '../shared'

type QueueFilter = 'All' | MonitoringQueueStatus
type SortKey = 'loan' | 'amount' | 'confirmed' | 'repayment' | 'status'
type SortDirection = 'asc' | 'desc'

const ROWS_PER_PAGE = 10
const QUEUE_FILTERS: QueueFilter[] = ['All', 'Confirmed', 'Pending', 'At risk']
const STATUS_ORDER: Record<MonitoringQueueStatus, number> = {
  Confirmed: 0,
  Pending: 1,
  'At risk': 2,
}

function formatLoanCompact(amountInr: number): string {
  const lakh = amountInr / 100_000
  const rounded = Number.isInteger(lakh) ? lakh.toFixed(0) : lakh.toFixed(1)
  return `₹${rounded}L`
}

function metricTone(tone?: 'good' | 'warn' | 'bad' | 'neutral'): string {
  if (tone === 'good') return 'text-[#166534]'
  if (tone === 'warn') return 'text-[#92400e]'
  if (tone === 'bad') return 'text-[#b91c1c]'
  return 'text-[#0f172a]'
}

function statusTone(status: MonitoringQueueStatus): string {
  if (status === 'Confirmed') return 'border border-[#bbf7d0] bg-[#dcfce7] text-[#166534]'
  if (status === 'Pending') return 'border border-[#fde68a] bg-[#fef3c7] text-[#92400e]'
  return 'border border-[#fecaca] bg-[#fee2e2] text-[#b91c1c]'
}

function textTone(value: LoanMonitoringRow['repayment'] | LoanMonitoringRow['riskSignal'] | LoanMonitoringRow['evidence']): string {
  if (value === 'On-time' || value === 'None' || value === 'Complete') return 'text-[#166534]'
  if (value === 'Partial' || value === 'Dormant' || value === 'Device risk') return 'text-[#92400e]'
  if (value === 'Late' || value === 'Instant withdrawal' || value === 'Linked + Circular') return 'text-[#b91c1c]'
  return 'text-[#334155]'
}

function rowSearchHaystack(row: LoanMonitoringRow): string {
  return [
    row.loanId,
    row.borrowerName,
    row.confirmed,
    row.repayment,
    row.riskSignal,
    row.evidence,
    row.status,
  ]
    .join(' ')
    .toLowerCase()
}

function compareRows(a: LoanMonitoringRow, b: LoanMonitoringRow, sortKey: SortKey): number {
  if (sortKey === 'amount') return a.amountInr - b.amountInr
  if (sortKey === 'confirmed') return a.confirmed.localeCompare(b.confirmed)
  if (sortKey === 'repayment') return a.repayment.localeCompare(b.repayment)
  if (sortKey === 'status') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  return a.loanId.localeCompare(b.loanId)
}

function parseCrValue(amount: string): number {
  const match = amount.match(/([\d.]+)/)
  return match ? Number(match[1]) : 0
}

function SortHeader({
  label,
  sortKey,
  activeSort,
  direction,
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeSort: SortKey
  direction: SortDirection
  onSort: (key: SortKey) => void
}) {
  const isActive = activeSort === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-left text-[13px] font-semibold text-[#334155] transition hover:bg-slate-100"
    >
      {label}
      <span className="text-[11px] text-slate-500">{isActive ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  )
}

export function PostDisbursalMonitoringSurface() {
  const data = POST_DISBURSAL_MONITORING_MOCK
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('All')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('loan')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [runningCheck, setRunningCheck] = useState(false)
  const [lastRunLabel, setLastRunLabel] = useState('2 min ago')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setPage(1)
  }, [queueFilter, query, sortKey, sortDirection])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = useMemo(() => {
    return data.queueRows.filter((row) => {
      if (queueFilter !== 'All' && row.status !== queueFilter) return false
      if (!normalizedQuery) return true
      return rowSearchHaystack(row).includes(normalizedQuery)
    })
  }, [data.queueRows, queueFilter, normalizedQuery])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]
    rows.sort((a, b) => {
      const base = compareRows(a, b, sortKey)
      return sortDirection === 'asc' ? base : -base
    })
    return rows
  }, [filteredRows, sortKey, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * ROWS_PER_PAGE
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE)

  const moneyFlowRows = data.moneyFlow.map((row) => ({
    ...row,
    valueCr: parseCrValue(row.amount),
  }))
  const moneyFlowMaxCr = Math.max(...moneyFlowRows.map((row) => row.valueCr), 1)
  const moneyFlowAxisMax = Math.max(45, Math.ceil(moneyFlowMaxCr / 5) * 5)
  const moneyFlowTicks = Array.from({ length: Math.floor(moneyFlowAxisMax / 5) + 1 }, (_, idx) => idx * 5).reverse()
  const suspiciousTotal = data.suspiciousBehavior.reduce((sum, row) => sum + row.value, 0)
  const suspiciousPalette = ['#ef4444', '#d08a18', '#3b82f6', '#7c6fd1']
  let suspiciousCursor = 0
  const suspiciousSlices = data.suspiciousBehavior.map((row, index) => {
    const start = suspiciousCursor
    const pct = suspiciousTotal > 0 ? (row.value / suspiciousTotal) * 100 : 0
    suspiciousCursor += pct
    return {
      ...row,
      color: suspiciousPalette[index % suspiciousPalette.length],
      stop: `${suspiciousPalette[index % suspiciousPalette.length]} ${start}% ${suspiciousCursor}%`,
    }
  })
  const suspiciousDonutGradient = suspiciousSlices.map((slice) => slice.stop).join(', ')
  const repaymentMin = 55
  const repaymentMax = 95
  const repaymentSpan = repaymentMax - repaymentMin
  const repaymentCoordinates = data.repaymentTrend.map((row, idx) => {
    const x = data.repaymentTrend.length <= 1 ? 0 : (idx / (data.repaymentTrend.length - 1)) * 100
    const y = 100 - ((row.pct - repaymentMin) / repaymentSpan) * 100
    return { x, y, label: row.label, pct: row.pct, tone: row.tone }
  })
  const repaymentLinePoints = repaymentCoordinates.map((point) => `${point.x},${point.y}`).join(' ')
  const repaymentAreaPoints = `0,100 ${repaymentLinePoints} 100,100`
  const repaymentTicks = [95, 85, 75, 65, 55]
  const heroBuckets = data.summaryCards.map((card) => ({
    label: card.label,
    value: card.value,
    sub: card.sub,
  }))

  const handleSort = (next: SortKey) => {
    if (sortKey === next) {
      setSortDirection((p) => (p === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(next)
    setSortDirection('asc')
  }

  const runCheck = () => {
    if (runningCheck) return
    setRunningCheck(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setRunningCheck(false)
      setLastRunLabel('Just now')
      timerRef.current = null
    }, 900)
  }

  return (
    <div className="mt-2 space-y-4">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className={`text-[1.35rem] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>{data.header.title}</h2>
          <span className="inline-flex items-center rounded-full border border-[#86efac] bg-[#f0fdf4] px-2.5 py-0.5 text-[12px] font-semibold text-[#166534]">
            {data.header.statusPill}
          </span>
        </div>
        <p className={HOME_BODY_IMPERIAL_SM}>Track disbursed loans, confirmation posture, repayment signals, and post-disbursal risk checks in one queue.</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/payout-command-view/batch-command-center"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-[#0f172a] transition hover:bg-slate-50"
          >
            <Glyph name="folder" className="h-4 w-4" />
            Upload bank confirmation
          </Link>
          <Link
            href="/payout-command-view/batch-command-center"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-[#0f172a] transition hover:bg-slate-50"
          >
            <Glyph name="folder" className="h-4 w-4" />
            Upload repayment data
          </Link>
          <Link
            href="/payout-command-view/today?dock=proof"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-[#0f172a] transition hover:bg-slate-50"
          >
            <Glyph name="arrow-up-right" className="h-4 w-4" />
            Export report
          </Link>
          <button
            type="button"
            onClick={runCheck}
            disabled={runningCheck}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0f172a] px-3.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:opacity-70"
          >
            <Glyph name="refresh" className={`h-4 w-4 ${runningCheck ? 'animate-spin' : ''}`} />
            {runningCheck ? 'Running check…' : 'Run check'}
          </button>
          <span className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[12px] font-semibold text-slate-600">
            Last check: {lastRunLabel}
          </span>
        </div>
      </section>

      <JournalIntelligenceKpiHero
        eyebrow="Post-disbursal monitoring"
        value={data.summaryCards[0]?.value ?? '—'}
        deltaPill={data.header.statusPill}
        subcopy={`Portfolio queue: ${data.queueCounts.All.toLocaleString('en-IN')} loans · Last check ${lastRunLabel}`}
        buckets={heroBuckets}
        testId="post-disbursal-kpi-hero"
      />

      <section className="space-y-2">
        <p className={COMMAND_CENTER_LABEL_GREEN}>Check breakdown</p>
        <div className="grid gap-3 xl:grid-cols-4">
          {data.checkBreakdownCards.map((card) => (
            <article key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-[1.05rem] font-semibold text-[#0f172a]">{card.title}</h3>
              <dl className="mt-3 space-y-1.5 text-[15px]">
                {card.metrics.map((metric) => (
                  <div key={metric.label} className="flex items-center justify-between">
                    <dt className="text-[#475569]">{metric.label}</dt>
                    <dd className={`font-semibold ${metricTone(metric.tone)}`}>{metric.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-[1.2rem] font-semibold tracking-[-0.01em] text-[#0f172a]">Money flow status</h3>
          <div className="mt-4 rounded-xl border border-[#394554] bg-[#252a32] p-4">
            <div className="grid grid-cols-[54px_1fr] gap-3">
              <div className="relative h-60 text-right text-[12px] font-semibold text-slate-400">
                {moneyFlowTicks.map((tick) => {
                  const y = ((moneyFlowAxisMax - tick) / moneyFlowAxisMax) * 100
                  return (
                    <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${y}%` }}>
                      ₹{tick}Cr
                    </span>
                  )
                })}
              </div>
              <div className="relative h-60 rounded-lg border border-[#3a4757] bg-[#1e232b] px-3 pt-2 pb-10">
                {moneyFlowTicks.map((tick) => {
                  const y = ((moneyFlowAxisMax - tick) / moneyFlowAxisMax) * 100
                  return (
                    <div key={tick} className="absolute left-0 right-0 border-t border-[#334155]" style={{ top: `${y}%` }} />
                  )
                })}
                <div className="absolute inset-x-3 bottom-10 top-3 flex items-end justify-between gap-3">
                  {moneyFlowRows.map((row) => {
                    const height = Math.max(5, (row.valueCr / moneyFlowAxisMax) * 100)
                    const color =
                      row.tone === 'blue'
                        ? 'bg-[#3f88cf]'
                        : row.tone === 'green'
                          ? 'bg-[#28a07a]'
                          : row.tone === 'amber'
                            ? 'bg-[#c9861a]'
                            : row.tone === 'red'
                              ? 'bg-[#ea4b4b]'
                              : 'bg-[#4f8f17]'
                    return (
                      <div key={row.label} className="flex h-full flex-1 flex-col items-center justify-end">
                        <div className={`w-full rounded-md ${color}`} style={{ height: `${height}%` }} />
                      </div>
                    )
                  })}
                </div>
                <div className="absolute inset-x-3 bottom-2 grid grid-cols-5 gap-3 text-center text-[13px] font-semibold text-slate-600">
                  {moneyFlowRows.map((row) => (
                    <div key={row.label}>
                      <p className="text-slate-300">{row.label}</p>
                      <p className="text-[12px] text-slate-400">{row.amount}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-[1.2rem] font-semibold tracking-[-0.01em] text-[#0f172a]">Suspicious behavior</h3>
          <div className="mt-4 rounded-xl border border-[#394554] bg-[#252a32] p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {suspiciousSlices.map((row) => (
                <div key={row.label} className="flex items-center gap-2 rounded-lg border border-[#3a4757] bg-[#1f252d] px-2.5 py-1.5">
                  <span className="h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: row.color }} />
                  <span className="text-[13px] font-semibold text-slate-300">{row.label}</span>
                  <span className="ml-auto text-[15px] font-semibold text-slate-100">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              <div
                className="grid h-56 w-56 place-items-center rounded-full border-2 border-[#111827]"
                style={{ background: `conic-gradient(${suspiciousDonutGradient})` }}
              >
                <div className="grid h-[8.5rem] w-[8.5rem] place-items-center rounded-full bg-[#252a32] shadow-[inset_0_0_0_2px_#1f2937]">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">Signals</p>
                  <p className="text-[24px] font-semibold text-slate-100">{suspiciousTotal}</p>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-[1.2rem] font-semibold tracking-[-0.01em] text-[#0f172a]">Repayment trend</h3>
          <div className="mt-4 rounded-xl border border-[#394554] bg-[#252a32] p-4">
            <p className="mb-2 text-[13px] font-semibold text-slate-300">● On-time repayment %</p>
            <div className="relative h-56">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                {repaymentTicks.map((tick) => {
                  const y = 100 - ((tick - repaymentMin) / repaymentSpan) * 100
                  return (
                    <line
                      key={tick}
                      x1="0"
                      y1={y}
                      x2="100"
                      y2={y}
                      stroke="rgba(148,163,184,0.25)"
                      strokeWidth="0.5"
                    />
                  )
                })}
                <polygon points={repaymentAreaPoints} fill="rgba(16,185,129,0.1)" />
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="1.8"
                  points={repaymentLinePoints}
                  vectorEffect="non-scaling-stroke"
                />
                {repaymentCoordinates.map((point) => {
                  const fill =
                    point.tone === 'green'
                      ? '#10b981'
                      : point.tone === 'amber'
                        ? '#d97706'
                        : '#ef4444'
                  return <circle key={point.label} cx={point.x} cy={point.y} r="2" fill={fill} stroke="#0f172a" strokeWidth="0.4" />
                })}
              </svg>
            </div>
            <div className="mt-2 grid grid-cols-4 text-center">
              {repaymentCoordinates.map((point) => (
                <div key={point.label}>
                  <p className="text-[12px] font-semibold text-slate-400">{point.label}</p>
                  <p className="text-[15px] font-semibold text-slate-100">{point.pct}%</p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-5 border-t border-slate-200 pt-3 text-[14px] font-semibold text-[#b91c1c]">
            Repayment rate declining — down 16pp over 4 weeks
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-[1.2rem] font-semibold tracking-[-0.01em] text-[#0f172a]">Account connection map</h3>
          <div className="mt-4 space-y-2">
            {data.accountConnectionMap.map((row, idx) => (
              <div key={row} className="space-y-1">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[15px] font-medium text-[#334155]">{row}</div>
                {idx < data.accountConnectionMap.length - 1 ? <p className="pl-5 text-[#94a3b8]">↓</p> : null}
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[15px] font-semibold text-[#b91c1c]">
            Shared device detected across all 3 accounts
          </p>
        </article>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={COMMAND_CENTER_LABEL_GREEN}>Loan monitoring queue</p>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Glyph name="search" className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search loan or borrower"
              className="w-52 border-0 bg-transparent text-[13px] font-medium text-[#0f172a] outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {QUEUE_FILTERS.map((filter) => {
            const active = queueFilter === filter
            const count = data.queueCounts[filter]
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setQueueFilter(filter)}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition ${
                  active
                    ? 'border-[#0f172a] bg-[#0f172a] text-white'
                    : 'border-slate-300 bg-white text-[#334155] hover:bg-slate-50'
                }`}
              >
                {filter} ({count})
              </button>
            )
          })}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left"><SortHeader label="Loan ID" sortKey="loan" activeSort={sortKey} direction={sortDirection} onSort={handleSort} /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="Amount" sortKey="amount" activeSort={sortKey} direction={sortDirection} onSort={handleSort} /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="Confirmed" sortKey="confirmed" activeSort={sortKey} direction={sortDirection} onSort={handleSort} /></th>
                <th className="px-3 py-2 text-left"><SortHeader label="Repayment" sortKey="repayment" activeSort={sortKey} direction={sortDirection} onSort={handleSort} /></th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#334155]">Risk signal</th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#334155]">Evidence</th>
                <th className="px-3 py-2 text-left"><SortHeader label="Status" sortKey="status" activeSort={sortKey} direction={sortDirection} onSort={handleSort} /></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[14px] font-medium text-slate-400">No loans match your filters.</td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.loanId} className="border-t border-slate-100">
                    <td className="px-3 py-2.5">
                      <p className="text-[14px] font-semibold text-[#0f172a]">{row.loanId}</p>
                      <p className="text-[14px] font-medium text-slate-500">{row.borrowerName}</p>
                    </td>
                    <td className="px-3 py-2.5 text-[14px] font-semibold tabular-nums text-[#0f172a]">{formatLoanCompact(row.amountInr)}</td>
                    <td className={`px-3 py-2.5 text-[14px] font-semibold ${row.confirmed === 'Yes' ? 'text-[#166534]' : 'text-[#92400e]'}`}>{row.confirmed}</td>
                    <td className={`px-3 py-2.5 text-[14px] font-semibold ${textTone(row.repayment)}`}>{row.repayment}</td>
                    <td className={`px-3 py-2.5 text-[14px] font-semibold ${textTone(row.riskSignal)}`}>{row.riskSignal}</td>
                    <td className={`px-3 py-2.5 text-[14px] font-semibold ${textTone(row.evidence)}`}>{row.evidence}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${statusTone(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[13px] font-medium text-slate-600">
          <p>
            Showing {sortedRows.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + ROWS_PER_PAGE, sortedRows.length)} of {sortedRows.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 px-2 py-1 text-[12px] font-semibold text-[#334155]"
            >
              Prev
            </button>
            <span>
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-slate-300 px-2 py-1 text-[12px] font-semibold text-[#334155]"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
