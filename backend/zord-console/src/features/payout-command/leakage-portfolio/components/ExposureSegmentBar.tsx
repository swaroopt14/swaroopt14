'use client'

import { useState } from 'react'
import type { ExposureBand, SegmentRollRate } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { formatMinorInr } from '../utils/formatMinorInr'
import { leakageCopy } from '../../leakage/copy/leakageCopy'

const FALLBACK_BANDS = [
  { id: 'unmatched', label: leakageCopy.exposure.unmatched },
  { id: 'short_settled', label: leakageCopy.exposure.shortSettled },
  { id: 'orphan', label: leakageCopy.exposure.unlinked },
  { id: 'reversal', label: leakageCopy.exposure.reversal },
] as const

type ExposureSegmentBarProps = {
  data: PortfolioLeakageViewModel
  exposureBands?: ExposureBand[]
  segmentRollRates?: SegmentRollRate[]
}

function normalizeBandKey(band: string): string {
  const lower = band.toLowerCase()
  if (lower.includes('unmatched')) return 'unmatched'
  if (lower.includes('short')) return 'short_settled'
  if (lower.includes('unlinked') || lower.includes('orphan')) return 'orphan'
  if (lower.includes('reversal')) return 'reversal'
  return band
}

function rollPctForBand(
  bandId: string,
  exposureBands: ExposureBand[] | undefined,
  segmentRollRates: SegmentRollRate[] | undefined,
): string {
  const key = normalizeBandKey(bandId)
  const fromBand = exposureBands?.find((b) => normalizeBandKey(b.band) === key)?.share_pct
  if (fromBand != null) return `${fromBand.toFixed(1)}%`
  const roll = segmentRollRates?.find(
    (r) => normalizeBandKey(r.to_band) === key || normalizeBandKey(r.from_band) === key,
  )
  if (roll?.roll_pct != null) return `${roll.roll_pct.toFixed(1)}%`
  return '—'
}

export function ExposureSegmentBar({ data, exposureBands, segmentRollRates }: ExposureSegmentBarProps) {
  const [activeBand, setActiveBand] = useState<string>('all')

  const bands: Array<{ id: string; label: string; amount: string; rollPct: string }> =
    exposureBands && exposureBands.length > 0
      ? exposureBands.map((b) => ({
          id: b.band,
          label: b.band,
          amount: formatMinorInr(b.amount_minor),
          rollPct: rollPctForBand(b.band, exposureBands, segmentRollRates),
        }))
      : [
          {
            id: 'unmatched',
            label: leakageCopy.exposure.unmatched,
            amount: formatMinorInr(data.unmatchedMinor),
            rollPct: rollPctForBand('unmatched', exposureBands, segmentRollRates),
          },
          {
            id: 'short_settled',
            label: leakageCopy.exposure.shortSettled,
            amount: formatMinorInr(data.underSettlementMinor),
            rollPct: rollPctForBand('short_settled', exposureBands, segmentRollRates),
          },
          {
            id: 'orphan',
            label: leakageCopy.exposure.unlinked,
            amount: formatMinorInr(data.orphanMinor),
            rollPct: rollPctForBand('orphan', exposureBands, segmentRollRates),
          },
          {
            id: 'reversal',
            label: leakageCopy.exposure.reversal,
            amount: formatMinorInr(data.reversalMinor),
            rollPct: rollPctForBand('reversal', exposureBands, segmentRollRates),
          },
        ]

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="exposure-segment-bar">
      <h2 className="text-[14px] font-semibold text-slate-700">{leakageCopy.exposure.title}</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveBand('all')}
          className={`rounded-full px-3 py-1 text-[12px] font-medium ${
            activeBand === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          All segments
        </button>
        {FALLBACK_BANDS.map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => setActiveBand(pill.id)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium ${
              activeBand === pill.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {bands
          .filter((b) => activeBand === 'all' || normalizeBandKey(b.id) === normalizeBandKey(activeBand))
          .map((band) => (
            <div key={band.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-slate-800">{band.label}</p>
                <p className="text-[12px] text-slate-500">Roll rate: {band.rollPct}</p>
              </div>
              <p className="text-[15px] font-semibold tabular-nums text-slate-900">{band.amount}</p>
            </div>
          ))}
      </div>
    </article>
  )
}
