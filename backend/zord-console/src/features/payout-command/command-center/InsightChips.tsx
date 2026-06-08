'use client'

import type { InsightChipItem } from './types'

const CHIP: Record<InsightChipItem['variant'], { border: string; bg: string; dot: string; text: string }> = {
  success: {
    border: 'border-emerald-200/90',
    bg: 'bg-emerald-50/90',
    dot: 'bg-emerald-500',
    text: 'text-emerald-950',
  },
  caution: {
    border: 'border-amber-200/90',
    bg: 'bg-amber-50/90',
    dot: 'bg-amber-500',
    text: 'text-amber-950',
  },
  critical: {
    border: 'border-red-200/90',
    bg: 'bg-red-50/90',
    dot: 'bg-red-500',
    text: 'text-red-950',
  },
  mandate: {
    border: 'border-violet-200/90',
    bg: 'bg-violet-50/90',
    dot: 'bg-violet-500',
    text: 'text-violet-950',
  },
}

export function InsightChips({ items }: { items: InsightChipItem[] }) {
  if (items.length === 0) return null

  return (
    <section aria-label="Insight chips">
      <h2 className="mb-3 text-[14px] font-semibold uppercase tracking-wide text-[#6b7280]">Insight chips</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const s = CHIP[item.variant]
          return (
            <span
              key={item.text}
              className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium leading-snug shadow-sm ${s.border} ${s.bg} ${s.text}`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden />
              {item.text}
            </span>
          )
        })}
      </div>
    </section>
  )
}
