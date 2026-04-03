'use client'

import { useEffect, useMemo, useState } from 'react'
import { TenantIdentity } from '../../_components/TenantIdentity'
import { IntegrationsTabs } from '../_components/IntegrationsTabs'
import {
  API_LOGS,
  REASON_CODE_EXPLANATIONS,
  TIME_RANGES,
  TimeRangeKey,
  stringifyMasked,
  type ApiLogEntry,
} from '../_lib/mock'

type StatusFilter = 'ALL' | '2XX' | '4XX' | '5XX'

function statusFilterMatch(statusFilter: StatusFilter, code: number) {
  if (statusFilter === 'ALL') return true
  if (statusFilter === '2XX') return code >= 200 && code < 300
  if (statusFilter === '4XX') return code >= 400 && code < 500
  return code >= 500
}

function methodBadgeClass(method: ApiLogEntry['method']) {
  if (method === 'GET') return 'border-slate-200 bg-slate-50 text-slate-600'
  if (method === 'POST') return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-slate-400 bg-slate-200 text-slate-800'
}

function statusBadgeClass(code: number) {
  void code
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function rowHighlightClass(code: number) {
  void code
  return 'hover:bg-white'
}

function latencyClass(latencyMs: number) {
  if (latencyMs >= 180) return 'text-slate-900'
  if (latencyMs >= 120) return 'text-slate-700'
  return 'text-slate-500'
}

function errorRateClass(rate: string) {
  const numeric = Number.parseFloat(rate.replace('%', ''))
  if (numeric >= 50) return 'text-slate-900'
  if (numeric >= 20) return 'text-slate-700'
  return 'text-slate-500'
}

function reasonCodeClass(reasonCode: ApiLogEntry['reasonCode']) {
  void reasonCode
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

const PAGE_SIZE = 15

export default function IntegrationsApiLogsPage() {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('1H')
  const [activePage, setActivePage] = useState(1)
  const [selectedId, setSelectedId] = useState<string>(API_LOGS[1]?.id ?? API_LOGS[0]?.id ?? '')

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const rangeMinutes = TIME_RANGES[timeRange].minutes

    return API_LOGS.filter((row) => {
      if (row.minutesAgo > rangeMinutes) return false
      if (!statusFilterMatch(statusFilter, row.status)) return false
      if (!normalizedQuery) return true
      return (
        row.traceId.toLowerCase().includes(normalizedQuery) ||
        row.intentId.toLowerCase().includes(normalizedQuery) ||
        row.idempotencyKey.toLowerCase().includes(normalizedQuery) ||
        row.endpoint.toLowerCase().includes(normalizedQuery) ||
        row.tenant.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [query, statusFilter, timeRange])

  const requests24h = API_LOGS.length * 6248
  const errorRate = `${((API_LOGS.filter((row) => row.status >= 400).length / API_LOGS.length) * 100).toFixed(1)}%`
  const avgLatency = `${Math.round(API_LOGS.reduce((acc, row) => acc + row.latencyMs, 0) / API_LOGS.length)}ms`

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pageNumbers = useMemo(() => Array.from({ length: totalPages }, (_, index) => index + 1), [totalPages])
  const pagedRows = useMemo(() => {
    const from = (activePage - 1) * PAGE_SIZE
    return filteredRows.slice(from, from + PAGE_SIZE)
  }, [activePage, filteredRows])
  const selectedRow = pagedRows.find((row) => row.id === selectedId) ?? pagedRows[0] ?? null
  const explanation = selectedRow ? REASON_CODE_EXPLANATIONS[selectedRow.reasonCode] : null

  useEffect(() => {
    setActivePage(1)
  }, [query, statusFilter, timeRange])

  useEffect(() => {
    setActivePage((previous) => Math.min(previous, totalPages))
  }, [totalPages])

  useEffect(() => {
    if (filteredRows.length === 0) {
      setSelectedId('')
      return
    }
    if (!selectedId || !filteredRows.some((row) => row.id === selectedId)) {
      setSelectedId(filteredRows[0].id)
    }
  }, [filteredRows, selectedId])

  useEffect(() => {
    if (pagedRows.length === 0) return
    if (!selectedId || !pagedRows.some((row) => row.id === selectedId)) {
      setSelectedId(pagedRows[0].id)
    }
  }, [activePage, pagedRows, selectedId])

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 overflow-hidden">
        <section className="rounded-t-[28px] border-b border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.96)_0%,rgba(35,39,46,0.98)_100%)] px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight">API Logs</h1>
              <p className="mt-1 text-sm text-slate-200">Search-first request debugging with reason-code explainability.</p>
            </div>
            <button className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.28)] transition duration-200 ease-out hover:-translate-y-[1px] hover:bg-white/15 hover:shadow-[0_16px_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.32)] active:translate-y-[1px]">
              Export Logs
            </button>
          </div>
        </section>

        <section className="px-6 pb-7 pt-5">
          <IntegrationsTabs />

          <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_170px_170px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search trace_id / intent_id / idempotency_key / endpoint"
              className="h-11 rounded-xl border border-slate-200 bg-white/95 px-3 text-sm text-slate-700 outline-none shadow-[0_6px_14px_rgba(15,23,42,0.06)] transition focus:border-slate-400 focus:shadow-[0_10px_18px_rgba(15,23,42,0.1)]"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none shadow-[0_6px_14px_rgba(15,23,42,0.06)] transition focus:shadow-[0_10px_18px_rgba(15,23,42,0.1)]"
            >
              <option value="ALL">Status: All</option>
              <option value="2XX">2xx</option>
              <option value="4XX">4xx</option>
              <option value="5XX">5xx</option>
            </select>
            <select
              value={timeRange}
              onChange={(event) => setTimeRange(event.target.value as TimeRangeKey)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none shadow-[0_6px_14px_rgba(15,23,42,0.06)] transition focus:shadow-[0_10px_18px_rgba(15,23,42,0.1)]"
            >
              {Object.entries(TIME_RANGES).map(([key, range]) => (
                <option key={key} value={key}>
                  Time: {range.label}
                </option>
              ))}
            </select>
          </section>

          <section className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]"><span className="font-medium">Requests (24h)</span><span className="float-right font-semibold">{requests24h.toLocaleString()}</span></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]"><span className="font-medium">Error Rate</span><span className={`float-right font-semibold ${errorRateClass(errorRate)}`}>{errorRate}</span></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-[0_14px_28px_rgba(15,23,42,0.1),0_4px_10px_rgba(15,23,42,0.06)]"><span className="font-medium">Avg Latency</span><span className="float-right font-semibold">{avgLatency}</span></div>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <article className="ct-clear-glass rounded-xl p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">API Workspace</h2>
              <div className="mt-3 overflow-auto rounded-xl border border-gray-200/70 bg-white/80 shadow-[0_8px_22px_rgba(15,23,42,0.08)]">
                <table className="w-full min-w-[1020px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/70 text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2">Endpoint</th>
                      <th className="px-3 py-2">Tenant</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Latency</th>
                      <th className="px-3 py-2">Reason Code</th>
                      <th className="px-3 py-2">Trace ID</th>
                      <th className="px-3 py-2">Inspect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => (
                      <tr
                        key={row.id}
                        className={`cursor-pointer border-b border-gray-100/80 text-xs text-slate-700 transition ${
                          row.id === selectedRow?.id ? 'bg-slate-200/90' : rowHighlightClass(row.status)
                        }`}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <td className="px-3 py-2">{row.time}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold tracking-wide ${methodBadgeClass(row.method)}`}>{row.method}</span>
                        </td>
                        <td className="px-3 py-2">{row.endpoint}</td>
                        <td className="px-3 py-2"><TenantIdentity tenant={row.tenant} /></td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold tracking-wide ${statusBadgeClass(row.status)}`}>{row.status}</span>
                        </td>
                        <td className={`px-3 py-2 font-semibold ${latencyClass(row.latencyMs)}`}>{row.latencyMs}ms</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold tracking-wide ${reasonCodeClass(row.reasonCode)}`}>
                            {row.reasonCode}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono">{row.traceId}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedId(row.id)
                            }}
                            className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.08)] transition hover:shadow-[0_6px_14px_rgba(15,23,42,0.12)]"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                    {pagedRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-xs text-slate-500" colSpan={9}>
                          No records found for selected filters.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-700">
                <button
                  onClick={() => setActivePage((previous) => Math.max(1, previous - 1))}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 shadow-[0_4px_10px_rgba(15,23,42,0.07)] disabled:opacity-40"
                  disabled={activePage === 1}
                >
                  Prev
                </button>
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    onClick={() => setActivePage(pageNumber)}
                    className={`rounded-md border px-2.5 py-1 shadow-[0_4px_10px_rgba(15,23,42,0.07)] ${
                      activePage === pageNumber ? 'border-slate-700 bg-slate-700 text-white' : 'border-gray-200 bg-white'
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  onClick={() => setActivePage((previous) => Math.min(totalPages, previous + 1))}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 shadow-[0_4px_10px_rgba(15,23,42,0.07)] disabled:opacity-40"
                  disabled={activePage === totalPages}
                >
                  Next
                </button>
              </div>
            </article>

            <aside
              key={selectedId || 'no-selection'}
              className="sticky top-24 h-fit rounded-2xl border border-slate-300 bg-slate-200 p-4 text-slate-800 shadow-[0_16px_32px_rgba(15,23,42,0.14),0_4px_10px_rgba(15,23,42,0.08)]"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-800">Request Investigation</h2>
            {!selectedRow ? (
              <p className="mt-3 text-sm text-slate-600">Select a row to inspect details.</p>
            ) : (
              <div className="mt-3 space-y-3 text-xs text-slate-700">
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3"><span className="font-semibold text-slate-800">Trace ID:</span> <span className="font-mono">{selectedRow.traceId}</span></div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3"><span className="font-semibold text-slate-800">Endpoint:</span> {selectedRow.method} {selectedRow.endpoint}</div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3"><span className="font-semibold text-slate-800">Tenant:</span> {selectedRow.tenant}</div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3">
                  <span className="font-semibold text-slate-800">Status:</span>{' '}
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(selectedRow.status)}`}>
                    {selectedRow.status}
                  </span>{' '}
                  {selectedRow.status >= 500 ? 'Internal Server Error' : 'OK'}
                </div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3"><span className="font-semibold text-slate-800">Latency:</span> <span className={latencyClass(selectedRow.latencyMs)}>{selectedRow.latencyMs}ms</span></div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3">
                  <span className="font-semibold text-slate-800">Reason Code:</span>{' '}
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${reasonCodeClass(selectedRow.reasonCode)}`}>{selectedRow.reasonCode}</span>
                </div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3">
                  <p><span className="font-semibold text-slate-800">Explanation:</span> {explanation?.description}</p>
                  <p className="mt-1"><span className="font-semibold text-slate-800">Suggested Action:</span> {explanation?.action}</p>
                </div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3">
                  <p className="font-semibold text-slate-800">Idempotency</p>
                  <p className="mt-1 font-mono">{selectedRow.idempotencyKey}</p>
                </div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3">
                  <p className="font-semibold text-slate-800">Request</p>
                  <pre className="mt-2 overflow-x-auto text-[11px]">{stringifyMasked(selectedRow.requestPayload)}</pre>
                </div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3">
                  <p className="font-semibold text-slate-800">Response</p>
                  <pre className="mt-2 overflow-x-auto text-[11px]">{stringifyMasked(selectedRow.responsePayload)}</pre>
                </div>
                <div className="rounded-lg border border-slate-300 bg-slate-100 p-3">
                  <p className="font-semibold text-slate-800">Execution Timeline</p>
                  <p className="mt-1 text-[11px]">{selectedRow.timeline.join(' → ')}</p>
                </div>
              </div>
            )}
            </aside>
          </section>
        </section>
      </main>
    </div>
  )
}
