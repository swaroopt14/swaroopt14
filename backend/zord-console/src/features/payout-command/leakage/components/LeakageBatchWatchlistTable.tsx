'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { formatKpiMoneyMinor, formatLeakageApiPct } from '../../shared/formatApiKpiFields'
import { leakageCopy } from '../copy/leakageCopy'
import { Glyph } from '../../shared'
import { HOME_TITLE_BLACK } from '../../command-center/homeCommandCenterTokens'

function leakageBadgeTone(pct: number | string | undefined): string {
  if (pct == null) return 'bg-slate-100 text-slate-600'
  const n = typeof pct === 'number' ? pct : Number(pct)
  if (!Number.isFinite(n)) return 'bg-slate-100 text-slate-600'
  const displayPct = n > 1 ? n : n * 100
  if (displayPct >= 12) return 'bg-red-50 text-red-700'
  if (displayPct >= 6) return 'bg-amber-50 text-amber-800'
  return 'bg-emerald-50 text-emerald-800'
}

type LeakageBatchWatchlistTableProps = {
  batches: IntelligenceBatchRow[]
  loading?: boolean
  selectedBatchId?: string
  onSelectBatch?: (batchId: string) => void
}

export function LeakageBatchWatchlistTable({
  batches,
  loading,
  selectedBatchId,
  onSelectBatch,
}: LeakageBatchWatchlistTableProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return batches
    return batches.filter(
      (b) =>
        b.batch_id.toLowerCase().includes(q) ||
        (b.source_reference?.toLowerCase().includes(q) ?? false),
    )
  }, [batches, query])

  return (
    <section className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-sm" data-testid="leakage-batch-watchlist">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-[20px] font-semibold ${HOME_TITLE_BLACK}`}>{leakageCopy.watchlist.title}</p>
          <p className="text-[12px] font-medium text-[#00239C]">Click a batch to scope Payment Gaps and open review</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Glyph name="search" className="h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search batch ID or provider"
            className={`w-52 border-0 bg-transparent text-[13px] font-medium outline-none placeholder:text-slate-400 ${HOME_TITLE_BLACK}`}
            aria-label="Search batch watchlist"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-slate-200">
        <table className="min-w-full border-collapse text-left text-[15px]">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-3 py-3 text-[14px] font-semibold text-[#00239C]">Batch</th>
              <th className="px-3 py-3 text-right text-[14px] font-semibold text-[#00239C]">Intended value</th>
              <th className="px-3 py-3 text-right text-[14px] font-semibold text-[#00239C]">Variance</th>
              <th className="px-3 py-3 text-right text-[14px] font-semibold text-[#00239C]">Leakage %</th>
              <th className="px-3 py-3 text-right text-[14px] font-semibold text-[#00239C]">Reversal</th>
              <th className="px-3 py-3 text-right text-[14px] font-semibold text-[#00239C]">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-200">
                  <td colSpan={6} className="px-3 py-3">
                    <div className="h-4 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[14px] font-medium text-[#00239C]">
                  {query.trim() ? 'No batches match your search.' : 'No batches loaded for this tenant.'}
                </td>
              </tr>
            ) : (
              filtered.map((b) => {
                const selected = b.batch_id === selectedBatchId
                const leakagePct = b.leakage_percentage
                return (
                  <tr
                    key={b.batch_id}
                    className={`cursor-pointer border-t border-slate-200 transition hover:bg-sky-50/50 ${
                      selected ? 'bg-sky-50/80' : ''
                    }`}
                    onClick={() => onSelectBatch?.(b.batch_id)}
                  >
                    <td className="px-3 py-3">
                      <p className={`text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>
                        {b.source_reference?.trim() || b.batch_id}
                      </p>
                      <p className="font-mono text-[13px] font-medium text-[#00239C]">{b.batch_id}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-slate-900">
                      {formatKpiMoneyMinor(b.total_intended_amount_minor)}
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-slate-700">
                      {formatKpiMoneyMinor(b.total_variance_minor)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums ${leakageBadgeTone(leakagePct)}`}
                      >
                        {formatLeakageApiPct(
                          typeof leakagePct === 'number' ? leakagePct : Number(leakagePct),
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-slate-700">
                      {formatKpiMoneyMinor(b.reversal_exposure_minor)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/payout-command-view/batch-command-center?batch_id=${encodeURIComponent(b.batch_id)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-700"
                      >
                        Track
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
