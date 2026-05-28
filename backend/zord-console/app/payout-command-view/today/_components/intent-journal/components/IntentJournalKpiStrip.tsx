'use client'

import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'
import { useJournalBatchMetrics } from '../hooks/useJournalBatchMetrics'
import { useJournalIntelligenceBatch } from '../hooks/useJournalIntelligenceBatch'
import { fmtInrFull } from '../../command-center/commandCenterFormat'
import { intentJournalCopy } from '../copy/intentJournalCopy'

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

const KPI_GRID_CLASS = 'mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5'

export function IntentJournalKpiStrip() {
  const { selectedBatchId, journalEnabled, tenantReady } = useJournalBatchSelection()
  const feedEnabled = journalEnabled && tenantReady
  const { batch, metrics, loading } = useJournalBatchMetrics(selectedBatchId, feedEnabled)
  const { detail: intelDetail } = useJournalIntelligenceBatch(selectedBatchId, feedEnabled)

  const copy = intentJournalCopy.kpi
  const placeholderLabels = [copy.paymentWorkflow, copy.instructionsCreated, copy.intendedValue, copy.readiness, copy.needsReview]

  if (!selectedBatchId) {
    return (
      <div className={KPI_GRID_CLASS}>
        {placeholderLabels.map((label) => (
          <KpiCard key={label} label={label} value="—" sub={intentJournalCopy.sidebar.selectBatch} />
        ))}
      </div>
    )
  }

  if (loading && !batch) {
    return (
      <p className={`mb-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3 ${HOME_BODY_IMPERIAL_SM}`}>
        Loading batch KPIs…
      </p>
    )
  }

  const tx = metrics?.instructionCount ?? batch?.transactions ?? 0
  const intendedValue = metrics?.intendedValue ?? batch?.totalValue ?? 0
  const readinessPct =
    metrics?.avgReadinessPct != null ? `${metrics.avgReadinessPct.toFixed(0)}%` : '—'
  const needsReview = metrics?.needsReviewCount ?? batch?.unresolvedCount ?? 0
  const finality = intelDetail?.batch?.finality_status

  return (
    <div className={KPI_GRID_CLASS}>
      <KpiCard
        label={copy.paymentWorkflow}
        value={batch?.apiType && batch.apiType !== '—' ? batch.apiType : 'Payment batch'}
        sub={batch?.source ?? 'Payment instructions'}
      />
      <KpiCard
        label={copy.instructionsCreated}
        value={tx.toLocaleString('en-IN')}
        sub={tx > 0 ? `${tx.toLocaleString('en-IN')} payment instruction${tx === 1 ? '' : 's'}` : 'No instructions yet'}
      />
      <KpiCard
        label={copy.intendedValue}
        value={fmtInrFull(intendedValue, { decimals: 0 })}
        sub="Sum of payment instruction amounts"
      />
      <KpiCard
        label={copy.readiness}
        value={readinessPct}
        sub={finality ? `Batch finality · ${finality.replace(/_/g, ' ')}` : 'Average intent quality score'}
      />
      <KpiCard
        label={copy.needsReview}
        value={needsReview.toLocaleString('en-IN')}
        sub={
          needsReview > 0
            ? `${metrics?.dlqCount ?? 0} review items · ${metrics?.lowReadinessCount ?? 0} low readiness`
            : 'No items need review'
        }
      />
    </div>
  )
}
