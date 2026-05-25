'use client'

import { useEffect, useMemo, useState } from 'react'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { PortfolioLeakageViewModel } from '../../leakage-portfolio/normalizeLeakagePayload'
import { formatMinorInr } from '../../leakage-portfolio/utils/formatMinorInr'
import { leakageCopy, mapReviewPriorityShort } from '../copy/leakageCopy'

type ReviewWatchlistProps = {
  tenantReady: boolean
  data: PortfolioLeakageViewModel
}

function batchReviewRate(b: IntelligenceBatchRow): number {
  const t = Math.max(1, b.total_count)
  return ((b.failed_count + b.pending_count) / t) * 100
}

export function ReviewWatchlist({ tenantReady, data }: ReviewWatchlistProps) {
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tenantReady) {
      setBatches([])
      return
    }
    let cancelled = false
    setLoading(true)
    void getIntelligenceBatches({ limit: 12 })
      .then((res) => {
        if (cancelled) return
        setBatches(res?.batches ?? [])
      })
      .catch(() => {
        if (!cancelled) setBatches([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenantReady])

  const issueGroups = useMemo(
    () => [
      {
        id: 'unmatched',
        label: 'Unmatched value',
        value: formatMinorInr(data.unmatchedMinor),
        tier: data.unmatchedMinor > 0 ? mapReviewPriorityShort(data.riskTier) : 'CLEAN',
      },
      {
        id: 'short',
        label: 'Short-settlement',
        value: formatMinorInr(data.underSettlementMinor),
        tier: data.underSettlementMinor > 0 ? 'WATCH' : 'CLEAN',
      },
      {
        id: 'orphan',
        label: 'Orphan settlements',
        value: formatMinorInr(data.orphanMinor),
        tier: data.orphanMinor > 0 ? 'WATCH' : 'CLEAN',
      },
    ],
    [data],
  )

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold text-slate-900">{leakageCopy.watchlist.title}</h2>
      <p className="mt-1 text-[12px] text-slate-500">{leakageCopy.watchlist.providerPending}</p>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {issueGroups.map((g) => (
          <article
            key={g.id}
            className="flex min-w-[160px] shrink-0 flex-col rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
          >
            <p className="text-[12px] font-medium text-slate-600">{g.label}</p>
            <p className="mt-1 text-[18px] font-bold tabular-nums text-slate-900">{g.value}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase text-slate-500">{g.tier}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {loading ? (
          <p className="text-[13px] text-slate-500">Loading batches…</p>
        ) : batches.length === 0 ? (
          <p className="text-[13px] text-slate-500">No batches loaded for this tenant.</p>
        ) : (
          batches.map((b) => {
            const rate = batchReviewRate(b)
            const tone =
              rate >= 35 ? 'border-red-200 bg-red-50/50' : rate >= 15 ? 'border-amber-200 bg-amber-50/50' : 'border-slate-100 bg-white'
            return (
              <article key={b.batch_id} className={`min-w-[180px] shrink-0 rounded-xl border px-4 py-3 ${tone}`}>
                <p className="truncate font-mono text-[12px] font-semibold text-slate-900">{b.batch_id}</p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {b.pending_count + b.failed_count} needs review · {b.total_count} payments
                </p>
                <p className="mt-1 text-[14px] font-semibold tabular-nums">{rate.toFixed(1)}% review rate</p>
                <p className="text-[11px] text-slate-500">{b.finality_status}</p>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
