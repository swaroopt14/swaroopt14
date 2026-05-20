'use client'

import { useMemo, useState } from 'react'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { formatMinorInr } from '../utils/formatMinorInr'

type BarDef = {
  id: string
  label: string
  minor: number
  targetPct: number
}

const ASSET_OPTIONS = ['Asset class', 'Risk bucket', 'Rail mix'] as const

export function AllocationPerformanceCard({ data }: { data: PortfolioLeakageViewModel }) {
  const [assetClass, setAssetClass] = useState<string>(ASSET_OPTIONS[0])

  const bars: BarDef[] = useMemo(
    () => [
      { id: 'reversal', label: 'Reversal Exp', minor: data.reversalMinor, targetPct: 45 },
      { id: 'ambiguous', label: 'Ambiguous Risk', minor: data.ambiguousRiskMinor, targetPct: 85 },
      { id: 'settled', label: 'Settled', minor: data.totalSettledMinor, targetPct: 48 },
      { id: 'crypto', label: 'Crypto', minor: 0, targetPct: 0 },
    ],
    [data],
  )

  const maxMinor = Math.max(...bars.map((b) => b.minor), 1)

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900">Allocation Performance</h2>
        <select
          value={assetClass}
          onChange={(e) => setAssetClass(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-600"
          aria-label="Asset class filter"
        >
          {ASSET_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 flex flex-1 items-end justify-between gap-4 border-b border-slate-100 pb-2">
        {bars.map((bar) => {
          const livePct = bar.minor > 0 ? Math.round((bar.minor / maxMinor) * 100) : 0
          const heightPct = Math.max(bar.targetPct, livePct > 0 ? Math.min(livePct, 100) : 0)

          return (
            <div key={bar.id} className="flex flex-1 flex-col items-center gap-2">
              
              <div className="relative flex h-40 w-full max-w-[72px] items-end justify-center">
                <div
                  className="w-full max-w-[56px] rounded-t-md bg-slate-800 transition-all"
                  style={{ height: `${heightPct}%`, minHeight: bar.minor > 0 ? '8px' : '2px', opacity: bar.minor > 0 ? 1 : 0.15 }}
                  title={formatMinorInr(bar.minor)}
                />
              </div>
              <p className="text-center text-[11px] font-medium text-slate-600">{bar.label}</p>
              <p className="text-[10px] tabular-nums text-slate-400">{heightPct}%</p>
            </div>
          )
        })}
      </div>
    </article>
  )
}
