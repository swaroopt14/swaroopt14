'use client'

import { useMemo } from 'react'
import { leakageCopy } from '../../leakage/copy/leakageCopy'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { formatMinorInr } from '../utils/formatMinorInr'

type BarDef = {
  id: string
  label: string
  minor: number
}

export function AllocationPerformanceCard({ data }: { data: PortfolioLeakageViewModel }) {
  const bars: BarDef[] = useMemo(
    () => [
      { id: 'unmatched', label: leakageCopy.exposure.unmatched, minor: data.unmatchedMinor },
      { id: 'ambiguous', label: leakageCopy.exposure.ambiguous, minor: data.ambiguousRiskMinor },
      { id: 'short', label: leakageCopy.exposure.shortSettled, minor: data.underSettlementMinor },
      { id: 'reversal', label: leakageCopy.exposure.reversal, minor: data.reversalMinor },
      { id: 'orphan', label: leakageCopy.exposure.unlinked, minor: data.orphanMinor },
    ],
    [data],
  )

  const maxMinor = Math.max(...bars.map((b) => b.minor), 1)

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold text-slate-900">{leakageCopy.exposure.title}</h2>

      <div className="mt-6 flex flex-1 items-end justify-between gap-2 border-b border-slate-100 pb-2">
        {bars.map((bar) => {
          const heightPct = bar.minor > 0 ? Math.round((bar.minor / maxMinor) * 100) : 0

          return (
            <div key={bar.id} className="flex flex-1 flex-col items-center gap-2">
              <div className="relative flex h-40 w-full max-w-[56px] items-end justify-center">
                <div
                  className="w-full rounded-t-md bg-slate-800 transition-all"
                  style={{
                    height: `${Math.max(heightPct, bar.minor > 0 ? 8 : 2)}%`,
                    minHeight: bar.minor > 0 ? '8px' : '2px',
                    opacity: bar.minor > 0 ? 1 : 0.15,
                  }}
                  title={formatMinorInr(bar.minor)}
                />
              </div>
              <p className="text-center text-[10px] font-medium leading-tight text-slate-600">{bar.label}</p>
              <p className="text-[10px] tabular-nums text-slate-400">{formatMinorInr(bar.minor)}</p>
            </div>
          )
        })}
      </div>
    </article>
  )
}
