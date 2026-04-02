'use client'

import { useEffect, useMemo, useState } from 'react'

type RecoveryStatus = 'Failed' | 'Retrying' | 'Recovered'
type PaymentMethod = 'UPI' | 'Card' | 'Netbanking' | 'Wallet'

type RecoveryPayment = {
  paymentId: string
  amount: number
  createdAt: string
  method: PaymentMethod
  status: RecoveryStatus
  reason: string
}

const INITIAL_RECOVERY_ROWS: RecoveryPayment[] = [
  { paymentId: 'TXN-89321', amount: 1500, createdAt: '9 Mar 2026, 12:02 PM', method: 'UPI', status: 'Failed', reason: 'Payment confirmation delayed' },
  { paymentId: 'TXN-89318', amount: 800, createdAt: '9 Mar 2026, 11:58 AM', method: 'Card', status: 'Failed', reason: 'Provider response timed out' },
  { paymentId: 'TXN-89317', amount: 2375, createdAt: '9 Mar 2026, 11:54 AM', method: 'Netbanking', status: 'Failed', reason: 'Beneficiary bank unavailable' },
  { paymentId: 'TXN-89314', amount: 4200, createdAt: '9 Mar 2026, 11:41 AM', method: 'Wallet', status: 'Retrying', reason: 'Webhook delivery pending' },
  { paymentId: 'TXN-89311', amount: 980, createdAt: '9 Mar 2026, 11:22 AM', method: 'UPI', status: 'Failed', reason: 'UPI collect request expired' },
  { paymentId: 'TXN-89309', amount: 3150, createdAt: '9 Mar 2026, 11:08 AM', method: 'Card', status: 'Recovered', reason: 'Issuer auth confirmed after retry' },
  { paymentId: 'TXN-89305', amount: 1240, createdAt: '9 Mar 2026, 10:44 AM', method: 'UPI', status: 'Failed', reason: 'Confirmation signal missing' },
  { paymentId: 'TXN-89301', amount: 5100, createdAt: '9 Mar 2026, 10:12 AM', method: 'Netbanking', status: 'Failed', reason: 'Bank response malformed' },
  { paymentId: 'TXN-89296', amount: 2600, createdAt: '8 Mar 2026, 08:57 PM', method: 'Card', status: 'Retrying', reason: 'Acquirer timeout' },
  { paymentId: 'TXN-89293', amount: 740, createdAt: '8 Mar 2026, 08:31 PM', method: 'UPI', status: 'Failed', reason: 'Customer confirmation not received' },
  { paymentId: 'TXN-89290', amount: 1810, createdAt: '8 Mar 2026, 07:59 PM', method: 'Wallet', status: 'Failed', reason: 'Wallet debit callback delayed' },
  { paymentId: 'TXN-89286', amount: 3299, createdAt: '8 Mar 2026, 07:33 PM', method: 'Card', status: 'Recovered', reason: 'Provider retried and settled successfully' },
  { paymentId: 'TXN-89282', amount: 905, createdAt: '8 Mar 2026, 07:04 PM', method: 'UPI', status: 'Failed', reason: 'Intent verification mismatch' },
  { paymentId: 'TXN-89278', amount: 6700, createdAt: '8 Mar 2026, 06:42 PM', method: 'Netbanking', status: 'Failed', reason: 'Bank gateway maintenance window' },
  { paymentId: 'TXN-89271', amount: 1125, createdAt: '8 Mar 2026, 06:15 PM', method: 'UPI', status: 'Failed', reason: 'PSP response not acknowledged' },
  { paymentId: 'TXN-89264', amount: 4080, createdAt: '8 Mar 2026, 05:47 PM', method: 'Card', status: 'Retrying', reason: '3DS callback not finalized' },
  { paymentId: 'TXN-89257', amount: 1990, createdAt: '8 Mar 2026, 05:03 PM', method: 'Wallet', status: 'Failed', reason: 'Wallet provider timeout' },
  { paymentId: 'TXN-89249', amount: 2870, createdAt: '8 Mar 2026, 04:32 PM', method: 'UPI', status: 'Recovered', reason: 'Delayed confirmation mapped correctly' },
  { paymentId: 'TXN-89241', amount: 1330, createdAt: '8 Mar 2026, 03:58 PM', method: 'Card', status: 'Failed', reason: 'Issuer declined recovery retry' },
  { paymentId: 'TXN-89233', amount: 4525, createdAt: '8 Mar 2026, 03:09 PM', method: 'Netbanking', status: 'Failed', reason: 'Settlement callback pending' },
]

const ROWS_PER_PAGE_OPTIONS = [8, 10, 15]

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

function statusChipClass(status: RecoveryStatus): string {
  if (status === 'Failed') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (status === 'Retrying') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

export default function CustomerTestRecoveryPage() {
  const [rows, setRows] = useState<RecoveryPayment[]>(INITIAL_RECOVERY_ROWS)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | RecoveryStatus>('All')
  const [rowsPerPage, setRowsPerPage] = useState(8)
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [retryStartedFor, setRetryStartedFor] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const selected = useMemo(
    () => rows.find((item) => item.paymentId === selectedPaymentId) ?? null,
    [rows, selectedPaymentId]
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesStatus = statusFilter === 'All' || row.status === statusFilter
      if (!matchesStatus) return false
      if (!q) return true
      return (
        row.paymentId.toLowerCase().includes(q) ||
        row.reason.toLowerCase().includes(q) ||
        row.method.toLowerCase().includes(q) ||
        row.createdAt.toLowerCase().includes(q)
      )
    })
  }, [rows, search, statusFilter])

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(filteredRows.length / rowsPerPage)),
    [filteredRows.length, rowsPerPage]
  )

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pageStart = (page - 1) * rowsPerPage
  const pageRows = filteredRows.slice(pageStart, pageStart + rowsPerPage)
  const pageEnd = filteredRows.length === 0 ? 0 : pageStart + pageRows.length

  const allVisibleSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.paymentId))
  const selectedFailedCount = rows.filter((row) => selectedIds.has(row.paymentId) && row.status === 'Failed').length

  const toggleRowSelection = (paymentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(paymentId)) next.delete(paymentId)
      else next.add(paymentId)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        pageRows.forEach((row) => next.delete(row.paymentId))
      } else {
        pageRows.forEach((row) => next.add(row.paymentId))
      }
      return next
    })
  }

  const runRetry = () => {
    if (!selected) return
    const paymentId = selected.paymentId
    setRunning(true)
    setRows((prev) => prev.map((row) => (row.paymentId === paymentId ? { ...row, status: 'Retrying' } : row)))
    window.setTimeout(() => {
      setRows((prev) => prev.map((row) => (row.paymentId === paymentId ? { ...row, status: 'Recovered' } : row)))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(paymentId)
        return next
      })
      setRunning(false)
      setSelectedPaymentId(null)
      setRetryStartedFor(paymentId)
    }, 850)
  }

  const openRetryForSelected = () => {
    const firstFailed = rows.find((row) => selectedIds.has(row.paymentId) && row.status === 'Failed')
    if (firstFailed) setSelectedPaymentId(firstFailed.paymentId)
  }

  return (
    <div className="w-full p-6 lg:p-8">
      <main className="ct-main-panel mt-1 overflow-hidden">
        <section className="rounded-t-[28px] border-b border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.96)_0%,rgba(35,39,46,0.98)_100%)] px-6 py-4 text-white">
          <h1 className="text-[28px] font-semibold tracking-tight">Recovery</h1>
          <p className="mt-1 text-base text-slate-200">Retry and track failed payments in one workspace.</p>
        </section>

        <section className="px-6 pb-7 pt-5">
          {retryStartedFor ? (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">Retry Started</p>
              <p className="mt-1 text-sm text-emerald-700">
                Payment <span className="font-semibold">{retryStartedFor}</span> has been replayed and is being monitored.
              </p>
            </div>
          ) : null}

          <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <h2 className="text-[26px] font-semibold text-slate-900">Recent Failed Payments</h2>
              <div className="flex items-center gap-2">
                <button className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.05)] hover:bg-slate-50">
                  Export Data
                </button>
                <button
                  onClick={openRetryForSelected}
                  disabled={selectedFailedCount === 0}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(15,23,42,0.18)] transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Retry Selected
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
              <div className="relative min-w-[260px] flex-1">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                </svg>
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Search payment ID, method, reason..."
                  className="h-10 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none focus:border-slate-400"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as 'All' | RecoveryStatus)
                  setPage(1)
                }}
                className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm text-slate-700 outline-none"
              >
                <option value="All">All Status</option>
                <option value="Failed">Failed</option>
                <option value="Retrying">Retrying</option>
                <option value="Recovered">Recovered</option>
              </select>
              <select
                value={rowsPerPage}
                onChange={(event) => {
                  setRowsPerPage(Number(event.target.value))
                  setPage(1)
                }}
                className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm text-slate-700 outline-none"
              >
                {ROWS_PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    Show {option} Rows
                  </option>
                ))}
              </select>
            </div>

            <div className="ct-sidebar-scroll overflow-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="bg-gray-50 text-[12px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        className="h-4 w-4 rounded border-slate-300 accent-slate-700"
                      />
                    </th>
                    <th className="px-4 py-3">Payment ID</th>
                    <th className="px-4 py-3">Date Created</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length ? (
                    pageRows.map((row) => (
                      <tr key={row.paymentId} className="border-t border-gray-100 text-slate-700 hover:bg-gray-50/70">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.paymentId)}
                            onChange={() => toggleRowSelection(row.paymentId)}
                            className="h-4 w-4 rounded border-slate-300 accent-slate-700"
                          />
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.paymentId}</td>
                        <td className="px-4 py-3">{row.createdAt}</td>
                        <td className="px-4 py-3">{row.method}</td>
                        <td className="px-4 py-3 font-medium">{formatRupees(row.amount)}</td>
                        <td className="max-w-[340px] truncate px-4 py-3" title={row.reason}>
                          {row.reason}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusChipClass(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedPaymentId(row.paymentId)}
                            disabled={row.status !== 'Failed'}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-[0_4px_10px_rgba(15,23,42,0.08)] transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {row.status === 'Failed' ? 'Retry' : row.status}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                        No payments match current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
              <p className="text-sm text-slate-600">
                Showing {filteredRows.length === 0 ? 0 : pageStart + 1}-{pageEnd} of {filteredRows.length} payments
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
                >
                  Prev
                </button>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    onClick={() => setPage(pageNumber)}
                    className={`h-8 min-w-8 rounded-lg px-2 text-sm ${
                      page === pageNumber ? 'bg-slate-800 font-semibold text-white' : 'border border-gray-300 bg-white text-slate-700'
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                  disabled={page === pageCount}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </article>
        </section>
      </main>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
            <h3 className="text-lg font-semibold text-slate-900">Retry Payment</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="font-semibold">Transaction</span>
                <p className="mt-1">{selected.paymentId}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="font-semibold">Amount</span>
                <p className="mt-1">{formatRupees(selected.amount)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="font-semibold">Reason</span>
                <p className="mt-1">{selected.reason}</p>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={runRetry}
                disabled={running}
                className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {running ? 'Retrying...' : 'Retry Payment'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedPaymentId(null)}
                disabled={running}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
