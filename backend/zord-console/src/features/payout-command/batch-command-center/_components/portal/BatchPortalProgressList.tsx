'use client'

export type BatchPortalProgressItem = {
  id: string
  label: string
  percent: number
  tone: 'blue' | 'green' | 'slate'
  statusLabel?: string
  statusTone?: 'success' | 'active' | 'warning' | 'idle'
}

function statusPillClass(tone: BatchPortalProgressItem['statusTone']) {
  if (tone === 'success') return 'border border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]'
  if (tone === 'active') return 'border border-[#d9f99d] bg-[#f7fee7] text-[#4d7c0f]'
  if (tone === 'warning') return 'border border-[#fde68a] bg-[#fffbeb] text-[#b45309]'
  return 'border border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
}

function trackFillClass(tone: BatchPortalProgressItem['tone']) {
  if (tone === 'green') return 'bg-[#22c55e]'
  if (tone === 'slate') return 'bg-[#94a3b8]'
  return 'bg-[#1e3a8a]'
}

export function BatchPortalProgressList({ items }: { items: BatchPortalProgressItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-[14px] leading-relaxed text-[#64748b]">
        Upload intent or settlement files above to track progress here.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-[#f1f5f9]">
      {items.map((item) => {
        const pct = Math.min(100, Math.max(0, Math.round(item.percent)))
        const showBadge = Boolean(item.statusLabel && (pct > 0 || item.statusTone === 'success'))

        return (
          <li key={item.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-4">
              <span
                className="min-w-0 truncate text-[14px] font-medium text-[#334155]"
                title={item.label}
              >
                {item.label}
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#475569]">{pct}%</span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#e8edf3]">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out ${trackFillClass(item.tone)}`}
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.label} ${pct}%`}
              />
            </div>
            {showBadge ? (
              <span
                className={`mt-2.5 inline-flex rounded-md px-2.5 py-1 text-[12px] font-medium ${statusPillClass(item.statusTone)}`}
              >
                {item.statusLabel}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
