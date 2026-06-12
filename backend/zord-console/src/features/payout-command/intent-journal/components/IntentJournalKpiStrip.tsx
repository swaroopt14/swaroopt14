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
import { fmtInrFromMinorExact } from '../../command-center/commandCenterFormat'
import { formatConfidencePct } from '../intentJournalSidebarUtils'
import { useDlqManualReviewCount } from '../hooks/useDlqManualReviewCount'
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
  const { displayCount: manualReviewCount, loading: manualReviewLoading } = useDlqManualReviewCount(
    feedEnabled,
    selectedBatchId,
  )

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
  const qualityPct = formatConfidencePct(metrics?.batchAggregateConfidenceScore ?? null)
  const needsReviewDisplay =
    manualReviewCount != null ? manualReviewCount.toLocaleString('en-IN') : manualReviewLoading ? '…' : '—'
  const needsReviewSub =
    manualReviewCount != null
      ? 'Items in manual-review DLQ queue'
      : manualReviewLoading
        ? 'Loading manual-review count…'
        : '—'

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
        value={fmtInrFromMinorExact(intendedValue)}
        sub="Sum of payment instruction amounts"
      />
      <KpiCard
        label={copy.readiness}
        value={qualityPct}
        sub="Batch aggregate confidence score"
      />
      <KpiCard
        label={copy.needsReview}
        value={needsReviewDisplay}
        sub={needsReviewSub}
      />
    </div>
  )
}
