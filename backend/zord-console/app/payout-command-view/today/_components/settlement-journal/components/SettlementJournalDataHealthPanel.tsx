'use client'

import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementBatchSummary } from '../hooks/useSettlementBatchSummary'
import { settlementJournalCopy } from '../copy/settlementJournalCopy'
import {
  deriveSettlementDataHealth,
  formatOrphanValue,
} from '../selectors/deriveSettlementDataHealth'

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className={`relative ${COMMAND_CENTER_KPI_CARD} !p-3`}>
      <CommandCenterCardGlow />
      <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{label}</p>
      <p className={`relative mt-1 text-[18px] font-bold tabular-nums ${HOME_TITLE_BLACK}`}>{value}</p>
      {sub ? <p className={`relative mt-0.5 text-[12px] ${HOME_BODY_IMPERIAL_SM}`}>{sub}</p> : null}
    </article>
  )
}

export function SettlementJournalDataHealthPanel() {
  const { selectedClientBatchId } = useSettlementBatchSelection()
  const { rows, loading } = useSettlementBatchSummary()

  if (!selectedClientBatchId) return null

  if (loading && rows.length === 0) {
    return (
      <p className={`mb-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3 ${HOME_BODY_IMPERIAL_SM}`}>
        Loading data health metrics…
      </p>
    )
  }

  const health = deriveSettlementDataHealth(rows)
  const copy = settlementJournalCopy.dataHealth

  return (
    <section className="mb-4">
      <h3 className={`mb-2 text-sm font-semibold ${HOME_TITLE_BLACK}`}>{copy.title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={copy.recordsReceived} value={health.recordsReceived.toLocaleString('en-IN')} />
        <MetricCard label={copy.withBankRef} value={`${health.withBankRefPct}%`} />
        <MetricCard label={copy.withClientRef} value={`${health.withClientRefPct}%`} />
        <MetricCard
          label={copy.matchedToIntents}
          value={health.matchedCount.toLocaleString('en-IN')}
          sub="Provisional match from attachment score"
        />
        <MetricCard label={copy.unmatchedValue} value={formatOrphanValue(health.unmatchedOrphanValue)} />
        <MetricCard
          label={copy.avgMatchConfidence}
          value={
            health.avgMatchConfidence != null ? `${(health.avgMatchConfidence * 100).toFixed(0)}%` : '—'
          }
        />
        <MetricCard label={copy.missingRefRate} value={`${health.missingRefRatePct}%`} />
      </div>
    </section>
  )
}
