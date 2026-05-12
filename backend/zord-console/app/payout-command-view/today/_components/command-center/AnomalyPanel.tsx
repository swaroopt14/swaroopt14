'use client'

import type { AnomalyInsight } from './types'

export function AnomalyInsightPanel({
  anomalies,
}: {
  anomalies: AnomalyInsight[]
}) {
  if (anomalies.length === 0) return null

  return (
    <section className="rounded-2xl border border-red-200/90 bg-red-50/90 px-5 py-4 shadow-sm" aria-label="Action required">
      <h2 className="text-[16px] font-bold tracking-[-0.02em] text-red-950">Action required</h2>
      <ul className="mt-3 space-y-4">
        {anomalies.map((a) => (
          <li key={a.id} className="rounded-xl border border-red-100 bg-white/95 px-4 py-3">
            <p className="text-[15px] font-semibold leading-snug text-[#111827]">{a.headline}</p>
            <p className="mt-2 text-[14px] font-medium text-[#b91c1c]">
              Impact: {a.impactLine}
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-[#4b5563]">
              <span className="font-semibold text-[#374151]">Suggested action: </span>
              {a.suggestedAction}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-red-700 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-red-800"
              >
                Confirm action
              </button>
              <button
                type="button"
                className="rounded-lg border border-black/15 bg-white px-3 py-2 text-[13px] font-semibold text-[#374151] hover:bg-[#fafafa]"
              >
                Dismiss
              </button>
              <button
                type="button"
                className="rounded-lg border border-transparent px-3 py-2 text-[13px] font-semibold text-[#4f46e5] underline-offset-2 hover:underline"
              >
                Explain more
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
