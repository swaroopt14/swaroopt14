'use client'

import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy, confidenceZoneLabel } from '../copy/ambiguityCopy'

export function AverageMatchConfidenceCard({ amb }: { amb: AmbiguityKpiResolved | null }) {
  const conf = amb?.avg_attachment_confidence ?? 0
  const pct = Math.max(0, Math.min(100, conf * 100))

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold text-slate-900">{ambiguityCopy.confidence.title}</h2>
      <p className="mt-4 text-[2rem] font-semibold tabular-nums text-slate-900">{amb ? `${pct.toFixed(0)}%` : '—'}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${pct < 50 ? 'bg-red-500' : pct < 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-slate-600">
        {amb ? confidenceZoneLabel(amb.avg_attachment_confidence) : '—'}
      </p>
      <p className="mt-2 text-[13px] text-slate-600">
        {ambiguityCopy.confidence.summaryPrefix}{' '}
        <span className="font-semibold tabular-nums">{amb ? `${pct.toFixed(1)}%` : '—'}</span>{' '}
        {ambiguityCopy.confidence.summarySuffix}
      </p>
    </article>
  )
}
