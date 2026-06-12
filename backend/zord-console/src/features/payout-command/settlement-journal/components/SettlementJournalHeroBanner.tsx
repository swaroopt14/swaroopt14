'use client'

import { JournalIntelligenceKpiHero } from '../../command-center/JournalIntelligenceKpiHero'
import { formatJournalMoney } from '../../intent-journal/formatJournalMoney'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementBatchSummary } from '../hooks/useSettlementBatchSummary'
import { settlementJournalCopy } from '../copy/settlementJournalCopy'
import { deriveNetSettledDisplay } from '../selectors/deriveNetSettledDisplay'
import { deriveSettlementDataHealth } from '../selectors/deriveSettlementDataHealth'

type SettlementJournalHeroBannerProps = {
  onExport: () => void
  exportDisabled?: boolean
  filteredCount: number
  filtersActive: boolean
}

export function SettlementJournalHeroBanner({
  onExport,
  exportDisabled,
  filteredCount,
  filtersActive,
}: SettlementJournalHeroBannerProps) {
  const { selectedClientBatchId } = useSettlementBatchSelection()
  const { totalAmount, totalSettled, loading, rows, outcome } = useSettlementBatchSummary()

  const copy = settlementJournalCopy.kpi
  const netSettled = deriveNetSettledDisplay(totalAmount, totalSettled, outcome.settled, rows.length)
  const observedValue =
    loading && !rows.length ? '—' : rows.length === 0 ? '—' : formatJournalMoney(totalAmount)
  const countLine = rows.length.toLocaleString('en-IN')
  const health = deriveSettlementDataHealth(rows)
  const explicitMatches = rows.filter((r) => r.matchedIntentId && r.matchedIntentId !== '—').length
  const matchedDisplay =
    explicitMatches > 0 ? explicitMatches.toLocaleString('en-IN') : health.matchedCount.toLocaleString('en-IN')
  const matchedSub =
    explicitMatches > 0
      ? copy.matchedFromIntentId
      : rows.length > 0 && health.matchedCount === 0
        ? copy.matchedAwaitingPipeline
        : 'Heuristic match status until upstream match IDs ship'
  const obsSub = filtersActive
    ? `${filteredCount.toLocaleString('en-IN')} filtered · ${rows.length.toLocaleString('en-IN')} total`
    : `${rows.length.toLocaleString('en-IN')} settlement records`

  const buckets = [
    { label: copy.linkedBatch, value: selectedClientBatchId || '—', sub: `Outcome · ${outcome.label}` },
    { label: copy.recordsReceived, value: filteredCount.toLocaleString('en-IN'), sub: obsSub },
    {
      label: copy.recordsMarkedSettled,
      value: outcome.settled.toLocaleString('en-IN'),
      sub:
        outcome.failed > 0
          ? `${outcome.failed.toLocaleString('en-IN')} failed · ${rows.length.toLocaleString('en-IN')} total rows`
          : outcome.settledPct != null
            ? `${outcome.settledPct}% of rows marked settled in source`
            : '—',
    },
    { label: copy.netSettled, value: netSettled.value, sub: netSettled.sub },
    { label: copy.matchedToIntents, value: matchedDisplay, sub: matchedSub },
  ] as const

  return (
    <JournalIntelligenceKpiHero
      className="mb-4"
      eyebrow={settlementJournalCopy.hero.label}
      value={observedValue}
      deltaPill={outcome.label}
      subcopy={`${selectedClientBatchId || settlementJournalCopy.sidebar.selectBatch} · ${countLine} ${settlementJournalCopy.sidebar.records}`}
      buckets={buckets}
      testId="settlement-kpi-hero"
      footer={
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled || !selectedClientBatchId}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          {settlementJournalCopy.export.menuLabel}
        </button>
      }
    />
  )
}
