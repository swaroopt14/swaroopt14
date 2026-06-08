'use client'

import type { ConnectorHealthItem } from './types'

function statusLabel(s: ConnectorHealthItem['status']) {
  if (s === 'healthy') return 'Healthy'
  if (s === 'delayed') return 'Delayed'
  return 'Attention needed'
}

function statusStyles(s: ConnectorHealthItem['status']) {
  if (s === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-950'
  if (s === 'delayed') return 'border-amber-200 bg-amber-50 text-amber-950'
  return 'border-red-200 bg-red-50 text-red-950'
}

function dotClass(s: ConnectorHealthItem['status']) {
  if (s === 'healthy') return 'bg-emerald-500'
  if (s === 'delayed') return 'bg-amber-500'
  return 'bg-red-500'
}

export function ConnectorHealthStrip({
  title = 'Payment partner performance',
  sectionInsight,
  items,
}: {
  title?: string
  sectionInsight: string
  items: ConnectorHealthItem[]
}) {
  return (
    <section className="rounded-2xl border border-black/10 bg-[#fafaf8] px-4 py-4 sm:px-5" aria-label={title}>
      <h2 className="mb-3 text-[14px] font-semibold uppercase tracking-wide text-[#6b7280]">{title}</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {items.map((it) => (
          <div
            key={it.name}
            className={`min-w-[min(100%,14rem)] flex-1 rounded-xl border px-4 py-3 ${statusStyles(it.status)}`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(it.status)}`} aria-hidden />
              <span className="text-[15px] font-semibold text-[#111827]">{it.name}</span>
            </div>
            <p className="mt-1 text-[13px] font-medium">{statusLabel(it.status)}</p>
            <p className="mt-2 font-mono text-[13px] tabular-nums opacity-90">{it.metric}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-xl border border-indigo-100/80 bg-white/80 px-3 py-2.5 text-[13px] leading-relaxed text-[#4338ca]">
        <span className="font-semibold text-[#312e81]">AI insight · </span>
        {sectionInsight}
      </p>
    </section>
  )
}
