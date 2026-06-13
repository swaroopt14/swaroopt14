'use client'

import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import { formatJournalMoney } from '../../intent-journal/formatJournalMoney'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementBatchSummary } from '../hooks/useSettlementBatchSummary'
import { useSettlementBatchIntelligence } from '../hooks/useSettlementBatchIntelligence'
import { useSettlementParseErrorTotal } from '../hooks/useSettlementParseErrorTotal'
import { settlementJournalCopy } from '../copy/settlementJournalCopy'
import { deriveSettlementDataHealth } from '../selectors/deriveSettlementDataHealth'

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

function formatMoneyKpi(value: number | null, loading: boolean): string {
  if (loading && value == null) return '—'
  if (value == null) return '—'
  return formatJournalMoney(value)
}

export function SettlementJournalDataHealthPanel() {
  const { selectedClientBatchId, journalEnabled, tenantReady } = useSettlementBatchSelection()
  const { rows, loading } = useSettlementBatchSummary()
  const { kpis, loading: intelligenceLoading } = useSettlementBatchIntelligence(
    selectedClientBatchId,
    journalEnabled && tenantReady,
  )
  const { total: parseErrorTotal, loading: parseErrorsLoading } = useSettlementParseErrorTotal(
    selectedClientBatchId,
    journalEnabled && tenantReady,
  )

  if (!selectedClientBatchId) return null

  if ((loading || intelligenceLoading || parseErrorsLoading) && rows.length === 0) {
    return (
      <p className={`mb-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3 ${HOME_BODY_IMPERIAL_SM}`}>
        Loading data health metrics…
      </p>
    )
  }

  const health = deriveSettlementDataHealth(rows)
  const copy = settlementJournalCopy.dataHealth
  const bankRefDisplay = kpis.bankReferenceCoverage ?? `${health.withBankRefPct}%`
  const clientRefDisplay = kpis.clientReferenceCoverage ?? `${health.withClientRefPct}%`
  const bankRefSub = kpis.bankReferenceCoverage ? copy.bankRefCoverageSub : undefined
  const clientRefSub = kpis.clientReferenceCoverage ? copy.clientRefCoverageSub : undefined
  const parseIssuesDisplay =
    parseErrorsLoading && parseErrorTotal == null ? '—' : (parseErrorTotal ?? 0).toLocaleString('en-IN')

  return (
    <section className="mb-4">
      <h3 className={`mb-2 text-sm font-semibold ${HOME_TITLE_BLACK}`}>{copy.title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={copy.settlementParseIssues}
          value={parseIssuesDisplay}
          sub={copy.settlementParseIssuesSub}
        />
        <MetricCard label={copy.withBankRef} value={bankRefDisplay} sub={bankRefSub} />
        <MetricCard label={copy.withClientRef} value={clientRefDisplay} sub={clientRefSub} />
        <MetricCard
          label={copy.unmatchedSettlementValue}
          value={formatMoneyKpi(kpis.unmatchedSettlementValue, intelligenceLoading)}
          sub={copy.unmatchedSettlementValueSub}
        />
        <MetricCard
          label={copy.orphanAmount}
          value={formatMoneyKpi(kpis.orphanAmount, intelligenceLoading)}
          sub={copy.orphanAmountSub}
        />
        <MetricCard
          label={copy.matchConfidence}
          value={
            kpis.matchConfidence != null ? `${(kpis.matchConfidence * 100).toFixed(0)}%` : '—'
          }
        />
        <MetricCard
          label={copy.missingRefRate}
          value={kpis.missingReferenceRate ?? '—'}
        />
      </div>
    </section>
  )
}
