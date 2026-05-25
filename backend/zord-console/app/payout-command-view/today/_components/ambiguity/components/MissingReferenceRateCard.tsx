'use client'

import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from '../copy/ambiguityCopy'

export function MissingReferenceRateCard({ amb }: { amb: AmbiguityKpiResolved | null }) {
  const rate = amb ? (amb.provider_ref_missing_rate * 100).toFixed(2) : '—'

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold text-slate-900">{ambiguityCopy.kpi.missingRefRate}</h2>
      <p className="mt-4 text-[2rem] font-semibold tabular-nums text-slate-900">{rate === '—' ? '—' : `${rate}%`}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{ambiguityCopy.kpi.missingRefRateHelper}</p>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-[12px] font-semibold text-slate-800">{ambiguityCopy.missingRef.benchmarkTitle}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{ambiguityCopy.missingRef.benchmarkBody}</p>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-slate-500">{ambiguityCopy.missingRef.opsNote}</p>
    </article>
  )
}
