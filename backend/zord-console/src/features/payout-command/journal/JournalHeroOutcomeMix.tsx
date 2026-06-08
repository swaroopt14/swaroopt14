'use client'

import { JournalBatchMixCardBody, type JournalMixLegendItem } from './JournalBatchMixCardLayout'

type JournalHeroOutcomeMixProps = {
  title?: string
  subtitle?: string
  slices: Array<{ name: string; value: number }>
  legend: JournalMixLegendItem[]
  colors: string[]
  loading?: boolean
  emptyMessage?: string
  formatValue?: (v: number) => string
}

/** Outcome mix block for the black journal hero (beside gross value). */
export function JournalHeroOutcomeMix({
  title = 'Batch outcome mix',
  subtitle = 'Intent-engine snapshot',
  slices,
  legend,
  colors,
  loading,
  emptyMessage = 'No batch selected',
  formatValue,
}: JournalHeroOutcomeMixProps) {
  return (
    <div className="min-w-0 lg:max-w-[min(100%,640px)] lg:justify-self-end">
      <p className="text-[24px] font-medium text-white">{title}</p>
      {subtitle ? (
        <p className="mt-1 text-[22px] font-semibold uppercase tracking-[0.08em] text-white">{subtitle}</p>
      ) : null}
      {loading ? (
        <p className="mt-4 text-[26px] font-medium text-white">Loading…</p>
      ) : slices.length === 0 && legend.length === 0 ? (
        <p className="mt-4 text-[26px] font-medium text-white">{emptyMessage}</p>
      ) : (
        <div className="mt-4">
          <JournalBatchMixCardBody
            slices={slices}
            legend={legend}
            colors={colors}
            embeddedInHero
            formatValue={formatValue}
          />
        </div>
      )}
    </div>
  )
}
