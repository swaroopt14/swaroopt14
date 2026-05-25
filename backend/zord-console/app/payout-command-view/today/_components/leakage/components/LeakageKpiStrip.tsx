'use client'

import type { PortfolioLeakageViewModel } from '../../leakage-portfolio/normalizeLeakagePayload'
import { formatMinorInr } from '../../leakage-portfolio/utils/formatMinorInr'
import { leakageCopy, mapReviewPriorityLabel, mapReviewPriorityShort } from '../copy/leakageCopy'

const SECONDARY = [
  { key: 'unmatchedMinor' as const, label: leakageCopy.kpi.unmatched, tooltip: leakageCopy.kpi.unmatchedTooltip },
  {
    key: 'underSettlementMinor' as const,
    label: leakageCopy.kpi.shortSettled,
    tooltip: leakageCopy.kpi.shortSettledTooltip,
  },
  { key: 'orphanMinor' as const, label: leakageCopy.kpi.unlinked, tooltip: leakageCopy.kpi.unlinkedTooltip },
  { key: 'reversalMinor' as const, label: leakageCopy.kpi.reversal, tooltip: '' },
]

type LeakageKpiStripProps = {
  data: PortfolioLeakageViewModel
  loading?: boolean
}

export function LeakageKpiStrip({ data, loading }: LeakageKpiStripProps) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    )
  }

  const heroCards = [
    { label: leakageCopy.kpi.intendedValue, value: formatMinorInr(data.intendedMinor), helper: leakageCopy.kpi.intendedHelper },
    {
      label: leakageCopy.kpi.bankObserved,
      value: formatMinorInr(data.totalSettledMinor),
      helper: leakageCopy.kpi.bankObservedHelper,
    },
    {
      label: leakageCopy.kpi.valueNeedingReview,
      value: formatMinorInr(data.valueNeedingReviewMinor),
      helper: leakageCopy.kpi.valueNeedingReviewHelper,
      accent: true,
    },
    {
      label: leakageCopy.kpi.paymentGapRate,
      value: `${(data.paymentGapRate <= 1 ? data.paymentGapRate * 100 : data.paymentGapRate).toFixed(1)}%`,
      helper: leakageCopy.kpi.paymentGapRateHelper,
    },
    {
      label: leakageCopy.kpi.reviewPriority,
      value: mapReviewPriorityShort(data.riskTier),
      helper: mapReviewPriorityLabel(data.riskTier),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {heroCards.map((card) => (
          <article
            key={card.label}
            className={`rounded-2xl border bg-white p-4 shadow-sm ${card.accent ? 'border-amber-200/80' : 'border-slate-100'}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-[1.75rem] font-bold tabular-nums text-slate-900">{card.value}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{card.helper}</p>
          </article>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SECONDARY.map((item) => (
          <article key={item.key} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" title={item.tooltip}>
            <p className="text-[12px] font-medium text-slate-500">{item.label}</p>
            <p className="mt-1 text-[1.1rem] font-semibold tabular-nums text-slate-900">{formatMinorInr(data[item.key])}</p>
            {item.tooltip ? <p className="mt-2 text-[11px] text-slate-400">{item.tooltip}</p> : null}
          </article>
        ))}
      </div>
    </div>
  )
}
