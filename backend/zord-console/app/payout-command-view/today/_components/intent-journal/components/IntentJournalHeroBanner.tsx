'use client'

import {
  JOURNAL_HERO_BLACK_CARD,
  JOURNAL_INSIGHT_DARK_LABEL,
  JOURNAL_INSIGHT_DARK_MUTED,
} from '../../command-center/homeCommandCenterTokens'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'
import { useJournalBatchMetrics } from '../hooks/useJournalBatchMetrics'
import { intentJournalCopy } from '../copy/intentJournalCopy'
import { fmtInrFull } from '../../command-center/commandCenterFormat'
import { IntentJournalExportMenu } from './IntentJournalExportMenu'

type IntentJournalHeroBannerProps = {
  onExportIntents: () => void
  onExportReviewItems: () => void
  exportDisabled?: boolean
}

export function IntentJournalHeroBanner({
  onExportIntents,
  onExportReviewItems,
  exportDisabled,
}: IntentJournalHeroBannerProps) {
  const { selectedBatchId, journalEnabled } = useJournalBatchSelection()
  const { batch, metrics, loading } = useJournalBatchMetrics(selectedBatchId, journalEnabled)

  const valueLabel = fmtInrFull(metrics?.intendedValue ?? batch?.totalValue ?? 0, { decimals: 0 })
  const instructionCount = metrics?.instructionCount ?? batch?.transactions ?? 0

  return (
    <section className={`mb-4 ${JOURNAL_HERO_BLACK_CARD}`}>
      <motionlessGradient />
      <div className="relative flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className={JOURNAL_INSIGHT_DARK_MUTED}>{intentJournalCopy.hero.label}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/45">
            {intentJournalCopy.hero.subtitle}
          </p>
          {loading && !batch ? (
            <p className={`mt-3 text-[15px] ${JOURNAL_INSIGHT_DARK_LABEL}`}>Loading batch value…</p>
          ) : (
            <>
              <p className="mt-2 text-[2.25rem] font-extrabold tabular-nums tracking-[-0.03em] text-white">{valueLabel}</p>
              <p className="mt-1 font-mono text-[13px] text-white/55">
                {selectedBatchId || intentJournalCopy.sidebar.selectBatch} · {instructionCount.toLocaleString('en-IN')}{' '}
                {intentJournalCopy.sidebar.instructions}
              </p>
            </>
          )}
        </div>
        <IntentJournalExportMenu
          onExportIntents={onExportIntents}
          onExportReviewItems={onExportReviewItems}
          disabled={exportDisabled || !selectedBatchId}
        />
      </div>
    </section>
  )
}

function motionlessGradient() {
  return (
    <div
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_72%_18%,rgba(255,255,255,0.08)_0%,transparent_58%)]"
      aria-hidden
    />
  )
}
