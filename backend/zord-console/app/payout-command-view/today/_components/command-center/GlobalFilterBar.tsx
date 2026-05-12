'use client'

import { useState } from 'react'

import { Glyph } from '../shared'

const TIMES = ['Today', 'Week', 'Month'] as const
const METHODS = ['All', 'Bank Transfer', 'LSM', 'NACH'] as const
const STATUSES = ['Confirmed', 'Pending', 'Review'] as const

export function GlobalFilterBar() {
  const [time, setTime] = useState<(typeof TIMES)[number]>('Today')
  const [method, setMethod] = useState<(typeof METHODS)[number]>('All')
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('Confirmed')
  const [batchId, setBatchId] = useState('')

  return (
    <section
      className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm sm:p-5"
      aria-label="Global filters"
    >
      <h2 className="mb-3 text-[14px] font-semibold uppercase tracking-wide text-[#6b7280]">Global filter bar</h2>
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-[#64748b]">Time</span>
          <div className="flex flex-wrap gap-1.5">
            {TIMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTime(t)}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                  time === t ? 'bg-[#111111] text-white' : 'border border-black/10 bg-[#fafaf9] text-[#374151] hover:bg-[#f3f4f6]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-[12rem] flex-col gap-1.5">
          <label htmlFor="ccf-method" className="text-[12px] font-semibold text-[#64748b]">
            Payment method
          </label>
          <select
            id="ccf-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-[14px] text-[#111827] outline-none focus:ring-2 focus:ring-indigo-400/30"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-[12rem] flex-col gap-1.5">
          <label htmlFor="ccf-status" className="text-[12px] font-semibold text-[#64748b]">
            Status
          </label>
          <select
            id="ccf-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-[14px] text-[#111827] outline-none focus:ring-2 focus:ring-indigo-400/30"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0 flex-1 lg:min-w-[14rem]">
          <label htmlFor="ccf-batch" className="mb-1.5 block text-[12px] font-semibold text-[#64748b]">
            Batch ID
          </label>
          <div className="flex h-10 items-center gap-2 rounded-lg border border-black/10 bg-[#fafaf9] px-3">
            <Glyph name="search" className="h-4 w-4 shrink-0 text-[#64748b]" aria-hidden />
            <input
              id="ccf-batch"
              type="search"
              autoComplete="off"
              placeholder="Search batch or payout ID…"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#111827] outline-none placeholder:text-[#94a3b8]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
