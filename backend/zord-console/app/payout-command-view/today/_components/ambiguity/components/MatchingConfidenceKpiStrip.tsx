'use client'

import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import {
  ambiguityCopy,
  mapReviewPriorityLabel,
  mapReviewPriorityShort,
  reviewRateColor,
} from '../copy/ambiguityCopy'
import { formatAmbiguityInr } from '../utils/formatAmbiguityInr'

type MatchingConfidenceKpiStripProps = {
  amb: AmbiguityKpiResolved | null
  loading?: boolean
}

export function MatchingConfidenceKpiStrip({ amb, loading }: MatchingConfidenceKpiStripProps) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    )
  }

  const rate = amb?.ambiguity_rate ?? 0
  const rateStyle = reviewRateColor(rate)

  const cards = [
    {
      label: ambiguityCopy.kpi.paymentsNeedingReview,
      value: amb ? amb.ambiguous_intent_count.toLocaleString('en-IN') : '—',
      helper: ambiguityCopy.kpi.paymentsNeedingReviewHelper,
    },
    {
      label: ambiguityCopy.kpi.reviewRate,
      value: amb ? `${(rate * 100).toFixed(2)}%` : '—',
      helper: `${ambiguityCopy.kpi.reviewRateHelper} ${ambiguityCopy.kpi.reviewRateThresholds}`,
      valueClass: rateStyle.text,
    },
    {
      label: ambiguityCopy.kpi.unclearValue,
      value: formatAmbiguityInr(amb?.value_at_risk_minor),
      helper: ambiguityCopy.kpi.unclearValueHelper,
    },
    {
      label: ambiguityCopy.kpi.avgConfidence,
      value: amb ? `${(amb.avg_attachment_confidence * 100).toFixed(1)}%` : '—',
      helper: ambiguityCopy.kpi.avgConfidenceHelper,
    },
    {
      label: ambiguityCopy.kpi.missingRefRate,
      value: amb ? `${(amb.provider_ref_missing_rate * 100).toFixed(2)}%` : '—',
      helper: ambiguityCopy.kpi.missingRefRateHelper,
    },
  ]

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className={`mt-2 text-[1.75rem] font-bold tabular-nums ${card.valueClass ?? 'text-slate-900'}`}>
              {card.value}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{card.helper}</p>
          </article>
        ))}
      </div>
      {amb?.risk_tier ? (
        <p className="text-[12px] text-slate-600">
          <span className="font-semibold">{ambiguityCopy.kpi.reviewPriority}:</span>{' '}
          {mapReviewPriorityShort(amb.risk_tier)} · {mapReviewPriorityLabel(amb.risk_tier)}
        </p>
      ) : null}
    </div>
  )
}
