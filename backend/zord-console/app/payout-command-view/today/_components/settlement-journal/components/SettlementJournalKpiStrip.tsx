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
import { deriveNetSettledDisplay } from '../selectors/deriveNetSettledDisplay'
import { deriveSettlementDataHealth } from '../selectors/deriveSettlementDataHealth'

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article className={`relative ${COMMAND_CENTER_KPI_CARD} !p-4`}>
      <CommandCenterCardGlow />
      <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{label}</p>
      <p className={`relative mt-2 text-[22px] font-extrabold tabular-nums leading-none tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
        {value}
      </p>
      <p className={`relative mt-1 ${HOME_BODY_IMPERIAL_SM}`}>{sub}</p>
    </article>
  )
}

type SettlementJournalKpiStripProps = {
  filteredCount: number
  filtersActive: boolean
}

export function SettlementJournalKpiStrip({ filteredCount, filtersActive }: SettlementJournalKpiStripProps) {
  const { selectedClientBatchId } = useSettlementBatchSelection()
  const { rows, loading, outcome, totalAmount, totalSettled } = useSettlementBatchSummary()

  const copy = settlementJournalCopy.kpi

  if (!selectedClientBatchId) {
    return (
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[copy.linkedBatch, copy.recordsReceived, copy.recordsMarkedSettled, copy.netSettled, copy.matchedToIntents].map(
          (label) => (
            <KpiCard key={label} label={label} value="—" sub={settlementJournalCopy.sidebar.selectBatch} />
          ),
        )}
      </div>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <p className={`mb-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3 ${HOME_BODY_IMPERIAL_SM}`}>
        Loading batch KPIs…
      </p>
    )
  }

  const total = rows.length
  const netSettled = deriveNetSettledDisplay(totalAmount, totalSettled, outcome.settled, total)
  const health = deriveSettlementDataHealth(rows)
  const explicitMatches = rows.filter((r) => r.matchedIntentId && r.matchedIntentId !== '—').length
  const matchedDisplay =
    explicitMatches > 0 ? explicitMatches.toLocaleString('en-IN') : health.matchedCount.toLocaleString('en-IN')
  const matchedSub =
    explicitMatches > 0
      ? 'From matched_intent_id on observations'
      : 'Heuristic match status until upstream match IDs ship'
  const obsSub = filtersActive
    ? `${filteredCount.toLocaleString('en-IN')} filtered · ${total.toLocaleString('en-IN')} total`
    : `${total.toLocaleString('en-IN')} settlement records`

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard label={copy.linkedBatch} value={selectedClientBatchId} sub={`Outcome · ${outcome.label}`} />
      <KpiCard label={copy.recordsReceived} value={filteredCount.toLocaleString('en-IN')} sub={obsSub} />
      <KpiCard
        label={copy.recordsMarkedSettled}
        value={outcome.settled.toLocaleString('en-IN')}
        sub={
          outcome.failed > 0
            ? `${outcome.failed.toLocaleString('en-IN')} failed · ${total.toLocaleString('en-IN')} total rows`
            : `${outcome.settledPct ?? 0}% of rows marked settled in source`
        }
      />
      <KpiCard label={copy.netSettled} value={netSettled.value} sub={netSettled.sub} />
      <KpiCard label={copy.matchedToIntents} value={matchedDisplay} sub={matchedSub} />
    </div>
  )
}
