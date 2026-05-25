'use client'

import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from '../copy/ambiguityCopy'
import { deriveReviewReasons } from '../selectors/deriveReviewReasons'

type TopReasonsForReviewProps = {
  amb: AmbiguityKpiResolved | null
}

const SEVERITY_STYLES = {
  high: 'border-red-200 bg-red-50/60 text-red-950',
  medium: 'border-amber-200 bg-amber-50/60 text-amber-950',
  low: 'border-slate-200 bg-slate-50 text-slate-800',
}

export function TopReasonsForReview({ amb }: TopReasonsForReviewProps) {
  const reasons = deriveReviewReasons(amb)

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold text-slate-900">{ambiguityCopy.topReasons.title}</h2>
      {reasons.length === 0 ? (
        <p className="mt-3 text-[14px] text-slate-600">{ambiguityCopy.topReasons.empty}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {reasons.map((r) => (
            <li
              key={r.id}
              className={`rounded-xl border px-3 py-2.5 text-[13px] leading-relaxed ${SEVERITY_STYLES[r.severity]}`}
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
