'use client'

import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { useJournalBatchFromList } from '../hooks/useJournalBatchFromList'
import { useJournalIntelligenceBatch } from '../hooks/useJournalIntelligenceBatch'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'

function formatInrRupees(rupees: number): string {
  if (!Number.isFinite(rupees)) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    rupees,
  )
}

function confidencePct(batch: { avgConfidenceScore?: number; highConfidenceCount: number }): string {
  if (typeof batch.avgConfidenceScore === 'number' && Number.isFinite(batch.avgConfidenceScore)) {
    const pct = batch.avgConfidenceScore <= 1 ? batch.avgConfidenceScore * 100 : batch.avgConfidenceScore
    return `${pct.toFixed(0)}%`
  }
  return '—'
}

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

export function IntentJournalKpiStrip() {
  const { selectedBatchId, journalEnabled } = useJournalBatchSelection()
  const { batch, loading } = useJournalBatchFromList(selectedBatchId, journalEnabled)
  const { detail: intelDetail } = useJournalIntelligenceBatch(selectedBatchId, journalEnabled)

  if (!selectedBatchId) {
    return (
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {['Batch program', 'Confirmed intents', 'Batch volume', 'Confidence'].map((label) => (
          <KpiCard key={label} label={label} value="—" sub="Select a batch from the sidebar" />
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

  const tx = batch?.transactions ?? 0
  const confirmed = batch?.confirmedCount ?? 0
  const finality = intelDetail?.batch?.finality_status

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Batch program"
        value={batch?.apiType ?? batch?.type ?? '—'}
        sub={`${batch?.source ?? 'Intent engine'} · disbursement rail`}
      />
      <KpiCard
        label="Confirmed intents"
        value={confirmed.toLocaleString('en-IN')}
        sub={tx > 0 ? `${((confirmed / tx) * 100).toFixed(0)}% of ${tx.toLocaleString('en-IN')} intents` : 'No intents in batch'}
      />
      <KpiCard
        label="Batch volume"
        value={tx.toLocaleString('en-IN')}
        sub={batch ? `${formatInrRupees(batch.totalValue)} gross` : '—'}
      />
      <KpiCard
        label="Confidence"
        value={batch ? confidencePct(batch) : '—'}
        sub={finality ? `Finality · ${finality.replace(/_/g, ' ')}` : 'Aggregate confidence from engine'}
      />
    </div>
  )
}
