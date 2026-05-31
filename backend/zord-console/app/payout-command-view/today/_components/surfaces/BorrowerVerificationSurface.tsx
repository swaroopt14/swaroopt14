'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BORROWER_VERIFICATION_MOCK,
  type BorrowerQueueRow,
  type BorrowerQueueStatus,
  type SignalLevel,
} from '../verification/borrowerVerificationMock'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { JournalIntelligenceKpiHero } from '../command-center/JournalIntelligenceKpiHero'
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

function signalTone(level: SignalLevel): string {
  if (level === 'pass') return 'border-[#84cc16] bg-[#f7fee7]'
  if (level === 'warn') return 'border-[#f59e0b] bg-[#fffbeb]'
  return 'border-[#ef4444] bg-[#fef2f2]'
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

function riskBarTone(index: number): string {
  if (index === 0 || index >= 3) return 'bg-gradient-to-r from-[#ef4444] to-[#dc2626]'
  return 'bg-gradient-to-r from-[#d97706] to-[#ca8a04]'
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

function SignalCell({ level }: { level: SignalLevel }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-[6px] border ${signalTone(level)}`}
      aria-label={level}
      title={level}
    >
      <span className={`h-2 w-2 rounded-[3px] ${level === 'pass' ? 'bg-[#65a30d]' : level === 'warn' ? 'bg-[#ca8a04]' : 'bg-[#dc2626]'}`} />
    </span>
  )
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

  const riskMax = Math.max(...source.riskSignals.map((s) => s.value), 1)
  const baseFunnel = source.funnel[0]?.count ?? 1
  const riskAxisMax = Math.max(20, Math.ceil(riskMax / 5) * 5)
  const riskAxisTicks = Array.from({ length: Math.floor(riskAxisMax / 5) + 1 }, (_, idx) => idx * 5)
  const funnelMax = Math.max(...source.funnel.map((step) => step.count), baseFunnel)
  const funnelMin = Math.min(...source.funnel.map((step) => step.count))
  const funnelFloor = Math.max(0, Math.floor((funnelMin - 70) / 50) * 50)
  const funnelCeil = Math.ceil((funnelMax + 40) / 50) * 50
  const funnelSpan = Math.max(1, funnelCeil - funnelFloor)
  const funnelCoordinates = source.funnel.map((step, idx) => {
    const x = source.funnel.length <= 1 ? 0 : (idx / (source.funnel.length - 1)) * 100
    const y = 100 - ((step.count - funnelFloor) / funnelSpan) * 100
    return { x, y, count: step.count, label: step.label }
  })
  const funnelStepPoints = funnelCoordinates
    .flatMap((point, idx) => {
      if (idx === 0) return [`${point.x},${point.y}`]
      const prev = funnelCoordinates[idx - 1]
      return [`${point.x},${prev.y}`, `${point.x},${point.y}`]
    })
    .join(' ')
  const funnelAreaPoints = `0,100 ${funnelStepPoints} 100,100`
  const funnelTicks = Array.from({ length: 6 }, (_, idx) => {
    const value = funnelFloor + Math.round((funnelSpan / 5) * idx)
    const y = 100 - ((value - funnelFloor) / funnelSpan) * 100
    return { value, y }
  })
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
    <div className="mt-2 space-y-4">
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

      <section className="space-y-2">
        <p className={COMMAND_CENTER_LABEL_GREEN}>Check breakdown</p>
        <div className="grid gap-3 xl:grid-cols-4">
          <article className={`${COMMAND_CENTER_KPI_CARD} gap-2`}>
            <h3 className={`text-[1.05rem] font-semibold ${HOME_TITLE_BLACK}`}>Borrower verification</h3>
            <dl className="space-y-1 text-[15px]">
              <div className="flex items-center justify-between"><dt className="text-slate-600">Verified</dt><dd className="font-semibold text-[#65a30d]">{source.checkBreakdown.borrowerVerification.verified}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Pass rate</dt><dd className="font-semibold text-slate-800">{source.summary.kycPassRate}%</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">High risk</dt><dd className="font-semibold text-[#ca8a04]">{source.checkBreakdown.borrowerVerification.highRisk}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Rejected</dt><dd className="font-semibold text-[#dc2626]">{source.checkBreakdown.borrowerVerification.rejected}</dd></div>
            </dl>
          </article>
          <article className={`${COMMAND_CENTER_KPI_CARD} gap-2`}>
            <h3 className={`text-[1.05rem] font-semibold ${HOME_TITLE_BLACK}`}>Bank account</h3>
            <dl className="space-y-1 text-[15px]">
              <div className="flex items-center justify-between"><dt className="text-slate-600">Verified</dt><dd className="font-semibold text-[#65a30d]">{source.checkBreakdown.bankAccount.verified}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Name mismatch</dt><dd className="font-semibold text-[#ca8a04]">{source.checkBreakdown.bankAccount.nameMismatch}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Verify failed</dt><dd className="font-semibold text-[#dc2626]">{source.checkBreakdown.bankAccount.verifyFailed}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Penny-drop ok</dt><dd className="font-semibold text-[#65a30d]">{source.checkBreakdown.bankAccount.pennyDropOk}</dd></div>
            </dl>
          </article>
          <article className={`${COMMAND_CENTER_KPI_CARD} gap-2`}>
            <h3 className={`text-[1.05rem] font-semibold ${HOME_TITLE_BLACK}`}>Fraud and risk</h3>
            <dl className="space-y-1 text-[15px]">
              <div className="flex items-center justify-between"><dt className="text-slate-600">AML alerts</dt><dd className="font-semibold text-[#dc2626]">{source.checkBreakdown.fraudRisk.amlAlerts}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Device risk</dt><dd className="font-semibold text-[#ca8a04]">{source.checkBreakdown.fraudRisk.deviceRisk}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Duplicates</dt><dd className="font-semibold text-[#dc2626]">{source.checkBreakdown.fraudRisk.duplicates}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Deepfake signal</dt><dd className="font-semibold text-[#dc2626]">{source.checkBreakdown.fraudRisk.deepfakeSignal}</dd></div>
            </dl>
          </article>
          <article className={`${COMMAND_CENTER_KPI_CARD} gap-2`}>
            <h3 className={`text-[1.05rem] font-semibold ${HOME_TITLE_BLACK}`}>Proof readiness</h3>
            <dl className="space-y-1 text-[15px]">
              <div className="flex items-center justify-between"><dt className="text-slate-600">Ready</dt><dd className="font-semibold text-[#65a30d]">{source.checkBreakdown.proofReadiness.ready}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Awaiting confirm</dt><dd className="font-semibold text-[#ca8a04]">{source.checkBreakdown.proofReadiness.awaitingConfirm}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Coverage</dt><dd className="font-semibold text-slate-800">{source.summary.proofCoveragePct}%</dd></div>
              <div className="flex items-center justify-between"><dt className="text-slate-600">Missing proof</dt><dd className="font-semibold text-[#dc2626]">{source.checkBreakdown.proofReadiness.missingProof}</dd></div>
            </dl>
          </article>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <article className={COMMAND_CENTER_KPI_CARD}>
          <h3 className={`text-[1.1rem] font-semibold ${HOME_TITLE_BLACK}`}>Top risk signals</h3>
          <div className="mt-4 rounded-xl border border-[#394554] bg-[#252a32] p-4">
            <div className="space-y-3">
              {source.riskSignals.map((signal, index) => {
                const percent = Math.max(8, Math.round((signal.value / riskAxisMax) * 100))
                const tone = index === 0 ? 'bg-gradient-to-r from-[#d08a18] to-[#c97f10]' : riskBarTone(index)
                return (
                  <div key={signal.label} className="grid grid-cols-[160px_1fr_auto] items-center gap-3">
                    <p className="text-[15px] font-semibold text-slate-200">{signal.label}</p>
                    <div className="relative h-10 overflow-hidden rounded-lg bg-[#1e232b]">
                      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(148,163,184,0.15)_25%,transparent_26%,transparent_49%,rgba(148,163,184,0.15)_50%,transparent_51%,transparent_74%,rgba(148,163,184,0.15)_75%,transparent_76%)]" />
                      <div className={`relative h-full rounded-lg ${tone}`} style={{ width: `${percent}%` }} />
                    </div>
                    <p className="w-8 text-right text-[20px] font-semibold tabular-nums text-slate-100">{signal.value}</p>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 ml-[172px] flex items-center justify-between text-[12px] font-semibold text-slate-400">
              {riskAxisTicks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
          </div>
        </article>

        <article className={COMMAND_CENTER_KPI_CARD}>
          <h3 className={`text-[1.1rem] font-semibold ${HOME_TITLE_BLACK}`}>Verification funnel — {source.totals.totalBorrowers} borrowers</h3>
          <div className="mt-4 rounded-xl border border-[#394554] bg-[#252a32] p-4">
            <div className="relative h-56">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                {funnelTicks.map((tick) => (
                  <line
                    key={tick.value}
                    x1="0"
                    y1={tick.y}
                    x2="100"
                    y2={tick.y}
                    stroke="rgba(148,163,184,0.22)"
                    strokeWidth="0.5"
                  />
                ))}
                <polygon points={funnelAreaPoints} fill="rgba(59,130,246,0.12)" />
                <polyline
                  fill="none"
                  stroke="#4a94e8"
                  strokeWidth="1.8"
                  points={funnelStepPoints}
                  vectorEffect="non-scaling-stroke"
                />
                {funnelCoordinates.map((point) => (
                  <circle key={point.label} cx={point.x} cy={point.y} r="1.9" fill="#4a94e8" />
                ))}
              </svg>
            </div>
            <div className="mt-2 grid grid-cols-6 gap-1 text-center">
              {source.funnel.map((step, index) => {
                const ratio = Math.max(1, Math.round((step.count / baseFunnel) * 100))
                const prev = source.funnel[index - 1]?.count ?? step.count
                const drop = Math.max(0, prev - step.count)
                return (
                  <div key={step.label} className="rounded-lg border border-[#3a4757] bg-[#1f252d] px-1 py-1.5">
                    <p className="text-[11px] font-semibold text-slate-400">{step.label}</p>
                    <p className="text-[13px] font-semibold tabular-nums text-slate-100">{step.count}</p>
                    <p className="text-[11px] font-semibold tabular-nums text-slate-400">
                      {ratio}%{index > 0 ? ` · -${drop}` : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </article>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={COMMAND_CENTER_LABEL_GREEN}>Borrower queue</p>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Glyph name="search" className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search borrower or id"
              className="w-52 border-0 bg-transparent text-[13px] font-medium text-slate-800 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
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
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
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
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Borrower" sortKey="borrower" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-3 py-2 text-left">
                  <SortHeader label="Loan" sortKey="loan" activeSort={sortKey} direction={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#334155]">KYC</th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#334155]">Bank</th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#334155]">Fraud</th>
                <th className="px-3 py-2 text-left text-[13px] font-semibold text-[#334155]">AML</th>
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
                  <td colSpan={8} className="px-4 py-12 text-center text-[14px] font-medium text-slate-500">
                    No borrowers match your filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.borrowerId} className="border-t border-slate-200">
                    <td className="px-3 py-2.5">
                      <p className="text-[14px] font-semibold text-slate-900">{row.borrowerId}</p>
                      <p className="text-[14px] font-medium text-slate-600">{row.borrowerName}</p>
                    </td>
                    <td className="px-3 py-2.5 text-[14px] font-semibold tabular-nums text-slate-900">{formatLoanCompact(row.loanAmountInr)}</td>
                    <td className="px-3 py-2.5"><SignalCell level={row.kyc} /></td>
                    <td className="px-3 py-2.5"><SignalCell level={row.bank} /></td>
                    <td className="px-3 py-2.5"><SignalCell level={row.fraud} /></td>
                    <td className="px-3 py-2.5"><SignalCell level={row.aml} /></td>
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[13px] font-medium text-slate-600">
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
      </section>
    </div>
  )
}
