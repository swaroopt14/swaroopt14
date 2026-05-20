'use client'

import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { formatJournalMoney } from '../../intent-journal/formatJournalMoney'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementBatchSummary } from '../hooks/useSettlementBatchSummary'

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
  const { rows, loading, outcome, totalSettled } = useSettlementBatchSummary()

  if (!selectedClientBatchId) {
    return (
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {['Client batch', 'Observations', 'Settled volume', 'Settlement rate'].map((label) => (
          <KpiCard key={label} label={label} value="—" sub="Select a batch from the sidebar" />
        ))}
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
  const settledPct = outcome.settledPct != null ? `${outcome.settledPct}%` : '—'
  const obsSub = filtersActive
    ? `${filteredCount.toLocaleString('en-US')} filtered · ${total.toLocaleString('en-US')} total`
    : `${total.toLocaleString('en-US')} canonical observations`

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Client batch"
        value={selectedClientBatchId}
        sub={`Outcome · ${outcome.label}`}
      />
      <KpiCard label="Observations" value={filteredCount.toLocaleString('en-US')} sub={obsSub} />
      <KpiCard label="Settled volume" value={formatJournalMoney(totalSettled)} sub="Sum of settled amounts" />
      <KpiCard
        label="Settlement rate"
        value={settledPct}
        sub={
          outcome.failed > 0
            ? `${outcome.failed.toLocaleString('en-US')} failed · ${outcome.settled.toLocaleString('en-US')} settled`
            : `${outcome.settled.toLocaleString('en-US')} settled rows`
        }
      />
    </div>
  )
}
