'use client'

import type { PatternsKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { displayApiField } from '../../shared/formatApiKpiFields'
import { HOME_TITLE_BLACK } from '../../command-center/homeCommandCenterTokens'

type BatchScoreHealthCardProps = {
  patterns: PatternsKpiResolved | null
  loading?: boolean
}

export function BatchScoreHealthCard({ patterns, loading }: BatchScoreHealthCardProps) {
  const scoreDisplay = loading ? '…' : displayApiField(patterns?.batch_risk_score)
  const drivers = patterns?.risk_driver_breakdown ?? []
  const stats = patterns?.summary_stats

  return (
    <article
      className="relative overflow-hidden rounded-[14px] border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="batch-score-health"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#f59e0b] via-[#f97316] to-[#ef4444]" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-[20px] font-semibold ${HOME_TITLE_BLACK}`}>Batch score health</h3>
          <p className="mt-0.5 text-[14px] font-medium text-[#00239C]">
            {patterns?.total_count != null
              ? `${displayApiField(patterns.total_count)} batches this cycle`
              : 'Batch risk from intelligence pattern'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[28px] font-semibold leading-none text-[#b91c1c] tabular-nums">{scoreDisplay}</p>
          <p className="text-[13px] font-semibold text-[#00239C]">batch risk score</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {drivers.length === 0 ? (
          <p className="text-[14px] font-medium text-[#00239C]">Risk driver breakdown pending from patterns API.</p>
        ) : (
          drivers.map((row) => (
            <div key={row.label} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
              <span className="text-[14px] font-semibold text-[#00239C]">{row.label}</span>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#ef4444]"
                  style={{ width: `${Math.min(100, Math.max(0, row.share_pct))}%` }}
                />
              </div>
              <span className={`w-8 text-right text-[15px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>
                {displayApiField(row.count)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-center">
        <div>
          <p className={`text-[20px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>
            {loading ? '…' : displayApiField(patterns?.ambiguous_count)}
          </p>
          <p className="text-[12px] font-semibold text-slate-500">flagged</p>
        </div>
        <div>
          <p className={`text-[20px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>
            {loading ? '…' : displayApiField(stats?.match_confidence_pct)}
          </p>
          <p className="text-[12px] font-semibold text-slate-500">match conf</p>
        </div>
        <div>
          <p className={`text-[20px] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>
            {loading
              ? '…'
              : displayApiField(stats?.total_decision_count ?? patterns?.total_count)}
          </p>
          <p className="text-[12px] font-semibold text-slate-500">decisions</p>
        </div>
      </div>
    </article>
  )
}
