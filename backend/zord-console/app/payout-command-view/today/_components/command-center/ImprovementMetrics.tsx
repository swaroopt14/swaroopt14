'use client'

import type { ImprovementMetric } from './types'

function Arrow({ dir }: { dir: 'down' | 'up' }) {
  return (
    <span className="text-[23px] font-bold leading-none text-[#111827]" aria-hidden>
      {dir === 'down' ? '↓' : '↑'}
    </span>
  )
}

export function ImprovementMetrics({ items }: { items: ImprovementMetric[] }) {
  if (items.length === 0) return null

  return (
    <section aria-label="Improvement metrics">
      <h2 className="mb-1 text-[16px] font-semibold tracking-[-0.02em] text-[#111827]">Improvements after using Zord</h2>
      <p className="mb-4 text-[13px] text-[#64748b]">Each metric includes an explicit comparison — no vague claims.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => (
          <article
            key={it.id}
            className="flex flex-col rounded-2xl border border-black/10 bg-white p-4 shadow-sm transition hover:border-black/15 hover:shadow-md"
          >
            <div className="flex items-start gap-2">
              {it.direction === 'inr' ? (
                <span className="text-[21px] font-bold leading-none text-emerald-700" aria-hidden>
                  ₹
                </span>
              ) : (
                <Arrow dir={it.direction} />
              )}
              <div>
                <p className="text-[23px] font-bold tracking-[-0.03em] text-[#111827]">{it.value}</p>
                <p className="mt-1 text-[14px] font-medium leading-snug text-[#374151]">{it.label}</p>
                <p className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-[#94a3b8]">{it.comparison}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
