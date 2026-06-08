'use client'

import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { formatMinorInr } from '../utils/formatMinorInr'
import { leakagePercentDeltaClass, leakagePercentLabel } from '../utils/leakagePercentLabel'
import { Sparkline } from './Sparkline'

const SUB_METRICS = [
  { key: 'intendedMinor' as const, title: 'Intended Amt', spark: 'M2 14 L6 11 L10 13 L14 9 L18 11 L22 8' },
  { key: 'underSettlementMinor' as const, title: 'Under Settlement', spark: 'M2 12 L6 13 L10 10 L14 12 L18 9 L22 11' },
  { key: 'unmatchedMinor' as const, title: 'Unmatched', spark: 'M2 13 L6 10 L10 12 L14 8 L18 10 L22 7' },
  { key: 'orphanMinor' as const, title: 'Orphan Amt', spark: 'M2 15 L6 12 L10 14 L14 11 L18 13 L22 10' },
]

type MetricsStackProps = {
  data: PortfolioLeakageViewModel
  loading?: boolean
}

export function MetricsStack({ data, loading }: MetricsStackProps) {
  const pctLabel = leakagePercentLabel(data.leakageFraction)
  const pctClass = leakagePercentDeltaClass(data.leakageFraction)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <article className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <p className="text-[13px] font-medium text-slate-500">Total Settled</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-[2.25rem] font-bold tabular-nums tracking-tight text-slate-900">
            {formatMinorInr(data.totalSettledMinor)}
          </p>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${pctClass}`}
          >
            <span aria-hidden="true">↑</span>
            {pctLabel}
          </span>
        </div>
      </article>

      <div className="grid grid-cols-2 gap-3">
        {SUB_METRICS.map((item) => (
          <article
            key={item.key}
            className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] font-medium text-slate-500">{item.title}</p>
                <p className="mt-1 text-[1.1rem] font-semibold tabular-nums text-slate-900">
                  {formatMinorInr(data[item.key])}
                </p>
              </div>
              <Sparkline path={item.spark} className="h-8 w-12 text-slate-300" stroke="#94a3b8" />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
