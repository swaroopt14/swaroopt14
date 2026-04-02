'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { TenantIdentity } from '../_components/TenantIdentity'

type TimeRangeKey = '1H' | '6H' | '24H'
type ExceptionType = 'API Error' | 'Webhook Failure' | 'Adapter Error'
type ExceptionStatus = 'Open' | 'Retrying' | 'Investigating'
type ReasonCode =
  | 'PROVIDER_TIMEOUT'
  | 'WEBHOOK_DELIVERY_FAILED'
  | 'INVALID_SIGNATURE'
  | 'RATE_LIMIT'
  | 'CONNECTOR_DISCONNECTED'

type ExceptionRow = {
  id: string
  time: string
  minutesAgo: number
  type: ExceptionType
  source: string
  sourceLogo?: string
  tenant: string
  reasonCode: ReasonCode
  status: ExceptionStatus
  endpoint: string
  timeline: string[]
}

const TIME_RANGES: Record<TimeRangeKey, { label: string; minutes: number }> = {
  '1H': { label: 'Last 1h', minutes: 60 },
  '6H': { label: 'Last 6h', minutes: 360 },
  '24H': { label: 'Last 24h', minutes: 1440 },
}

const PLATFORM_HEALTH = [
  { label: 'API Success Rate', value: '99.6%' },
  { label: 'Webhook Delivery Rate', value: '99.2%' },
  { label: 'Adapters Healthy', value: '3 / 3' },
  { label: 'SLA Compliance', value: '98.9%' },
]

const ACTIVE_EXCEPTIONS: ExceptionRow[] = [
  {
    id: 'exc_001',
    time: '12:05',
    minutesAgo: 3,
    type: 'API Error',
    source: '/v1/refunds',
    sourceLogo: '/sources/razorpay-clean.png',
    tenant: 'Amazon',
    reasonCode: 'PROVIDER_TIMEOUT',
    status: 'Open',
    endpoint: 'POST /v1/refunds',
    timeline: ['API Request', 'Adapter Call', 'Provider Timeout', 'Error Returned'],
  },
  {
    id: 'exc_002',
    time: '12:01',
    minutesAgo: 7,
    type: 'Webhook Failure',
    source: 'payout.success',
    sourceLogo: '/sources/paypal-clean.png',
    tenant: 'Zomato',
    reasonCode: 'WEBHOOK_DELIVERY_FAILED',
    status: 'Retrying',
    endpoint: 'https://client.com/webhook',
    timeline: ['Event Created', 'Webhook Dispatch', 'Endpoint Unreachable', 'Retry Scheduled'],
  },
  {
    id: 'exc_003',
    time: '11:55',
    minutesAgo: 13,
    type: 'Adapter Error',
    source: 'Cashfree Connector',
    sourceLogo: '/sources/cashfree.png',
    tenant: 'Ajio',
    reasonCode: 'CONNECTOR_DISCONNECTED',
    status: 'Investigating',
    endpoint: 'cashfree-adapter-1',
    timeline: ['Health Check', 'Heartbeat Missed', 'Connector Disconnect', 'Failover Triggered'],
  },
]

const SLA_METRICS = [
  { metric: 'API p95 Latency', target: '<200ms', current: '118ms' },
  { metric: 'Webhook Delivery', target: '<30s', current: '14s' },
  { metric: 'Retry Resolution', target: '<5m', current: '3.2m' },
  { metric: 'Queue Processing', target: '<10s', current: '4s' },
]

const SLA_BREACHES = [
  { metric: 'API Latency', breaches: 3, worstCase: '410ms' },
  { metric: 'Webhook Delay', breaches: 1, worstCase: '54s' },
  { metric: 'Adapter Timeout', breaches: 2, worstCase: '6m' },
]

const REASON_CODE_DICTIONARY: Record<ReasonCode, { meaning: string; explanation: string; action: string }> = {
  PROVIDER_TIMEOUT: {
    meaning: 'Provider did not respond',
    explanation: 'External provider failed to respond within timeout window.',
    action: 'Retry request or verify provider connectivity.',
  },
  WEBHOOK_DELIVERY_FAILED: {
    meaning: 'Webhook endpoint unreachable',
    explanation: 'Webhook delivery attempt failed due to destination endpoint unavailability.',
    action: 'Check endpoint uptime and inspect retry backlog.',
  },
  INVALID_SIGNATURE: {
    meaning: 'Webhook verification failed',
    explanation: 'Incoming webhook signature verification failed against configured secret.',
    action: 'Rotate secret and verify signature/canonicalization logic.',
  },
  RATE_LIMIT: {
    meaning: 'Tenant exceeded request rate',
    explanation: 'Tenant request volume exceeded configured rate limits.',
    action: 'Apply client backoff and tune approved rate policy.',
  },
  CONNECTOR_DISCONNECTED: {
    meaning: 'Adapter lost connection',
    explanation: 'Adapter heartbeat failed and connector moved to disconnected state.',
    action: 'Validate adapter auth/network and trigger controlled reconnect.',
  },
}

function statusPillClass(status: ExceptionStatus) {
  if (status === 'Open') return 'border-[#0F172A] bg-[#0F172A]/15 text-[#0F172A]'
  if (status === 'Retrying') return 'border-[#F59E0B] bg-[#F59E0B]/25 text-[#78350F]'
  return 'border-[#6366F1] bg-[#A5B4FC]/40 text-[#3730A3]'
}

function reasonCodePillClass(reasonCode: ReasonCode) {
  if (reasonCode === 'PROVIDER_TIMEOUT') return 'border-[#F59E0B] bg-[#F59E0B]/25 text-[#78350F]'
  if (reasonCode === 'WEBHOOK_DELIVERY_FAILED') return 'border-[#6366F1] bg-[#A5B4FC]/40 text-[#312E81]'
  if (reasonCode === 'CONNECTOR_DISCONNECTED') return 'border-[#0D9488] bg-[#2DD4BF]/25 text-[#134E4A]'
  if (reasonCode === 'INVALID_SIGNATURE') return 'border-[#0F172A] bg-[#0F172A]/15 text-[#0F172A]'
  return 'border-[#6366F1] bg-[#A5B4FC]/35 text-[#312E81]'
}

function rowHighlightClass(status: ExceptionStatus) {
  if (status === 'Open') return 'hover:bg-[#0F172A]/5'
  if (status === 'Retrying') return 'hover:bg-[#F59E0B]/10'
  return 'hover:bg-[#6366F1]/8'
}

function healthCardClass(index: number) {
  if (index === 0) return 'border-[#6366F1]/35 bg-[#A5B4FC]/25 text-[#312E81]'
  if (index === 1) return 'border-[#0D9488]/35 bg-[#2DD4BF]/18 text-[#134E4A]'
  if (index === 2) return 'border-[#0F172A]/20 bg-[#0F172A]/8 text-[#0F172A]'
  return 'border-[#F59E0B]/35 bg-[#F59E0B]/18 text-[#78350F]'
}

function metricCurrentClass(current: string) {
  if (current.includes('ms') || current.includes('s') || current.includes('m')) return 'text-[#312E81]'
  return 'text-slate-800'
}

function breachCountClass(count: number) {
  if (count >= 3) return 'text-[#0F172A]'
  if (count >= 2) return 'text-[#78350F]'
  return 'text-[#134E4A]'
}

export default function ExceptionsSlaPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('24H')
  const [selectedId, setSelectedId] = useState<string>(ACTIVE_EXCEPTIONS[0]?.id ?? '')
  const [tableQuery, setTableQuery] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(8)
  const [activePage, setActivePage] = useState(1)

  const rows = useMemo(() => {
    const windowMinutes = TIME_RANGES[timeRange].minutes
    return ACTIVE_EXCEPTIONS.filter((row) => row.minutesAgo <= windowMinutes)
  }, [timeRange])

  const searchedRows = useMemo(() => {
    const normalized = tableQuery.trim().toLowerCase()
    if (!normalized) return rows
    return rows.filter((row) =>
      `${row.type} ${row.source} ${row.tenant} ${row.reasonCode} ${row.endpoint}`.toLowerCase().includes(normalized)
    )
  }, [rows, tableQuery])

  const totalPages = Math.max(1, Math.ceil(searchedRows.length / rowsPerPage))
  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, index) => index + 1), [totalPages])
  const pagedRows = useMemo(() => {
    const from = (activePage - 1) * rowsPerPage
    return searchedRows.slice(from, from + rowsPerPage)
  }, [activePage, rowsPerPage, searchedRows])

  const selected = pagedRows.find((row) => row.id === selectedId) ?? pagedRows[0] ?? null
  const reasonDetails = selected ? REASON_CODE_DICTIONARY[selected.reasonCode] : null

  useEffect(() => {
    if (searchedRows.length === 0) {
      setSelectedId('')
      return
    }
    if (!selectedId || !searchedRows.some((row) => row.id === selectedId)) {
      setSelectedId(searchedRows[0].id)
    }
  }, [searchedRows, selectedId])

  useEffect(() => {
    setActivePage(1)
  }, [tableQuery, timeRange, rowsPerPage])

  useEffect(() => {
    setActivePage((previous) => Math.min(previous, totalPages))
  }, [totalPages])

  useEffect(() => {
    if (!pagedRows.length) return
    if (!selectedId || !pagedRows.some((row) => row.id === selectedId)) {
      setSelectedId(pagedRows[0].id)
    }
  }, [pagedRows, selectedId])

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 overflow-hidden">
        <section className="rounded-t-[28px] border-b border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.96)_0%,rgba(35,39,46,0.98)_100%)] px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">Exceptions & SLA</h1>
              <p className="mt-1 text-sm text-slate-200">Operational alert center for unresolved exceptions and SLA reliability.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={timeRange}
                onChange={(event) => setTimeRange(event.target.value as TimeRangeKey)}
                className="h-10 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none shadow-[0_8px_18px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]"
              >
                {Object.entries(TIME_RANGES).map(([key, range]) => (
                  <option key={key} value={key} className="text-slate-900">
                    {range.label}
                  </option>
                ))}
              </select>
              <button className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.28)] transition duration-200 ease-out hover:-translate-y-[1px] hover:bg-white/15 hover:shadow-[0_16px_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.32)] active:translate-y-[1px]">
                Incident Queue
              </button>
            </div>
          </div>
        </section>

        <section className="px-6 pb-7 pt-5">
          <section className="grid gap-3 md:grid-cols-4">
            {PLATFORM_HEALTH.map((item, index) => (
              <div
                key={item.label}
                className={`rounded-xl border p-3 text-sm shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)] ${healthCardClass(index)}`}
              >
                <span className="font-medium">{item.label}</span>
                <span className="float-right font-semibold">{item.value}</span>
              </div>
            ))}
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold uppercase tracking-wider text-slate-700">Active Exceptions</h2>
                <span className="text-sm text-slate-500">Unresolved only</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-[#f8fafc] px-4 py-3">
                <div className="relative min-w-[280px] flex-1">
                  <input
                    value={tableQuery}
                    onChange={(event) => setTableQuery(event.target.value)}
                    placeholder="Search exception, tenant, reason, endpoint"
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none"
                  />
                  <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                  </svg>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={rowsPerPage}
                    onChange={(event) => setRowsPerPage(Number(event.target.value))}
                    className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-slate-700"
                  >
                    <option value={8}>Show 8 Rows</option>
                    <option value={15}>Show 15 Rows</option>
                  </select>
                  <button className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-slate-700">Manage Columns</button>
                </div>
              </div>
              <div className="ct-sidebar-scroll overflow-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-[#f3f4f6] text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      <input type="checkbox" aria-label="Select all rows" className="h-4 w-4 rounded border-gray-300" />
                    </th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Reason Code</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Investigate</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      className={`border-t border-gray-100 text-sm text-gray-700 transition ${
                        row.id === selected?.id ? 'bg-[#EEF2FF]' : rowHighlightClass(row.status)
                      } cursor-pointer`}
                    >
                      <td className="px-4 py-3">
                        <input type="checkbox" aria-label={`Select ${row.id}`} className="h-4 w-4 rounded border-gray-300" />
                      </td>
                      <td className="px-4 py-3">{row.time}</td>
                      <td className="px-4 py-3">{row.type}</td>
                      <td className="px-4 py-3">
                        {row.sourceLogo ? (
                          <Image
                            src={row.sourceLogo}
                            alt={row.source}
                            width={row.sourceLogo.includes('razorpay') ? 220 : 110}
                            height={row.sourceLogo.includes('razorpay') ? 56 : 28}
                            className={row.sourceLogo.includes('razorpay') ? 'h-14 w-auto max-w-[220px] object-contain' : 'h-7 w-auto max-w-[110px] object-contain'}
                          />
                        ) : (
                          row.source
                        )}
                      </td>
                      <td className="px-4 py-3"><TenantIdentity tenant={row.tenant} /></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${reasonCodePillClass(row.reasonCode)}`}>
                          {row.reasonCode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${statusPillClass(row.status)}`}>{row.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedId(row.id)
                          }}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100"
                        >
                          Investigate
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pagedRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-500" colSpan={8}>
                        No exceptions found for this filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-[#fafafa] px-4 py-3 text-sm text-slate-600">
                <p>
                  Showing <span className="font-semibold text-slate-700">{pagedRows.length}</span> of {searchedRows.length} exceptions
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActivePage((previous) => Math.max(1, previous - 1))}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 disabled:opacity-40"
                    disabled={activePage === 1}
                  >
                    Prev
                  </button>
                  {pageNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      onClick={() => setActivePage(pageNumber)}
                      className={`rounded-md border px-2 py-1 ${
                        pageNumber === activePage
                          ? 'border-[#6366F1] bg-[#6366F1] text-white'
                          : 'border-gray-200 bg-white text-slate-700'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    onClick={() => setActivePage((previous) => Math.min(totalPages, previous + 1))}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 disabled:opacity-40"
                    disabled={activePage === totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            </article>

            <aside className="sticky top-24 h-fit rounded-2xl border border-white/15 bg-[linear-gradient(180deg,rgba(44,49,57,0.94)_0%,rgba(35,39,46,0.96)_100%)] p-4 text-slate-100 shadow-[0_24px_50px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
              <h2 className="text-base font-semibold uppercase tracking-wider text-slate-100">Exception Investigation</h2>
              {!selected ? (
                <p className="mt-3 text-sm text-slate-300">Select an exception to inspect details.</p>
              ) : (
                <div className="mt-3 space-y-3 text-sm text-slate-200">
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Type:</span> {selected.type}</div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Endpoint:</span> {selected.endpoint}</div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"><span className="font-semibold text-white">Tenant:</span> {selected.tenant}</div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <span className="font-semibold text-white">Reason Code:</span>{' '}
                    <span className="inline-flex rounded border border-white/35 bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">{selected.reasonCode}</span>
                  </div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <p><span className="font-semibold text-white">Meaning:</span> {reasonDetails?.meaning}</p>
                    <p className="mt-1"><span className="font-semibold text-white">Explanation:</span> {reasonDetails?.explanation}</p>
                    <p className="mt-1"><span className="font-semibold text-white">Suggested Action:</span> {reasonDetails?.action}</p>
                  </div>
                  <div className="rounded-lg border border-white/15 bg-white/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <p className="font-semibold text-white">Timeline</p>
                    <p className="mt-1 text-xs text-slate-300">{selected.timeline.join(' → ')}</p>
                  </div>
                </div>
              )}
            </aside>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold uppercase tracking-wider text-slate-700">SLA Metrics</h2>
              </div>
              <div className="ct-sidebar-scroll overflow-auto">
                <table className="min-w-[420px] w-full text-left text-sm">
                  <thead className="bg-gray-50 text-sm uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Metric</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SLA_METRICS.map((item) => (
                      <tr key={item.metric} className="border-t border-gray-100 text-sm text-gray-700 hover:bg-gray-50/70">
                        <td className="px-4 py-3">{item.metric}</td>
                        <td className="px-4 py-3">{item.target}</td>
                        <td className={`px-4 py-3 font-semibold ${metricCurrentClass(item.current)}`}>{item.current}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold uppercase tracking-wider text-slate-700">SLA Breaches (Last 24h)</h2>
              </div>
              <div className="ct-sidebar-scroll overflow-auto">
                <table className="min-w-[420px] w-full text-left text-sm">
                  <thead className="bg-gray-50 text-sm uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Metric</th>
                      <th className="px-4 py-3">Breaches</th>
                      <th className="px-4 py-3">Worst Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SLA_BREACHES.map((item) => (
                      <tr key={item.metric} className="border-t border-gray-100 text-sm text-gray-700 hover:bg-gray-50/70">
                        <td className="px-4 py-3">{item.metric}</td>
                        <td className={`px-4 py-3 font-semibold ${breachCountClass(item.breaches)}`}>{item.breaches}</td>
                        <td className="px-4 py-3">{item.worstCase}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </section>
      </main>
    </div>
  )
}
