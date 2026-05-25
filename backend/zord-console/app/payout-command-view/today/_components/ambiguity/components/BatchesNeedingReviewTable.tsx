'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { FinalityStatus, IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from '../copy/ambiguityCopy'

const FINALITY_FILTERS: Array<{ value: '' | FinalityStatus; label: string }> = [
  { value: '', label: 'All batches' },
  { value: 'REQUIRES_REVIEW', label: 'Needs review' },
  { value: 'PARTIALLY_SETTLED', label: 'Partially settled' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SETTLED', label: 'Settled' },
]

function batchReviewRate(b: IntelligenceBatchRow): number {
  const t = Math.max(1, b.total_count)
  return ((b.failed_count + b.pending_count) / t) * 100
}

type BatchesNeedingReviewTableProps = {
  batches: IntelligenceBatchRow[]
  loading: boolean
  finalityFilter: '' | FinalityStatus
  onFilterChange: (v: '' | FinalityStatus) => void
}

export function BatchesNeedingReviewTable({
  batches,
  loading,
  finalityFilter,
  onFilterChange,
}: BatchesNeedingReviewTableProps) {
  const pathname = usePathname()
  const c = ambiguityCopy.batches.columns

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">{ambiguityCopy.batches.title}</h2>
          <p className="mt-1 max-w-2xl text-[12px] text-slate-500">{ambiguityCopy.batches.subtitle}</p>
        </div>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {ambiguityCopy.batches.filterLabel}
          <select
            value={finalityFilter}
            onChange={(e) => onFilterChange(e.target.value as '' | FinalityStatus)}
            className="h-9 min-w-[12rem] rounded-lg border border-slate-200 bg-white px-2 text-[13px] font-medium text-slate-900"
          >
            {FINALITY_FILTERS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">{c.batch}</th>
              <th className="py-2 pr-3">{c.payments}</th>
              <th className="py-2 pr-3">{c.needsReview}</th>
              <th className="py-2 pr-3">{c.reviewRate}</th>
              <th className="py-2 pr-3">{c.avgConfidence}</th>
              <th className="py-2 pr-3">{c.status}</th>
              <th className="py-2">{c.action}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  {ambiguityCopy.batches.loading}
                </td>
              </tr>
            ) : batches.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  {ambiguityCopy.batches.empty}
                </td>
              </tr>
            ) : (
              batches.map((b) => {
                const proxy = batchReviewRate(b)
                const open = b.failed_count + b.pending_count
                return (
                  <tr key={b.batch_id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-mono text-[12px] text-slate-900">{b.batch_id}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{b.total_count.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{open.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{proxy.toFixed(1)}%</td>
                    <td className="py-2.5 pr-3 text-slate-500" title={ambiguityCopy.batches.perBatchConfidencePending}>
                      —
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {b.finality_status}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <Link
                        href={`${pathname}?dock=grid&batch_id=${encodeURIComponent(b.batch_id)}`}
                        className="inline-flex rounded-lg bg-slate-900 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-slate-800"
                      >
                        {ambiguityCopy.batches.reviewBatch}
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
