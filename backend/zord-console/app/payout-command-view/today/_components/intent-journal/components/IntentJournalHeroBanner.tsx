'use client'

import { JournalIntelligenceKpiHero } from '../../command-center/JournalIntelligenceKpiHero'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'
import { useJournalBatchMetrics } from '../hooks/useJournalBatchMetrics'
import { useJournalIntelligenceBatch } from '../hooks/useJournalIntelligenceBatch'
import { intentJournalCopy } from '../copy/intentJournalCopy'
import { fmtInrFull } from '../../command-center/commandCenterFormat'
import { IntentJournalExportMenu } from './IntentJournalExportMenu'
import { useDlqTerminalCount } from '../hooks/useDlqTerminalCount'

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
  const { detail: intelDetail } = useJournalIntelligenceBatch(selectedBatchId, journalEnabled)
  const { count: terminalDlqCount } = useDlqTerminalCount(journalEnabled)

  const valueLabel = fmtInrFull(metrics?.intendedValue ?? batch?.totalValue ?? 0, { decimals: 0 })
  const instructionCount = metrics?.instructionCount ?? batch?.transactions ?? 0
  const readinessPct = metrics?.avgReadinessPct != null ? `${metrics.avgReadinessPct.toFixed(0)}%` : '—'
  const needsReview = metrics?.needsReviewCount ?? batch?.unresolvedCount ?? 0
  const manualReviewCount = metrics?.manualReviewCount ?? metrics?.dlqCount ?? 0
  const terminalLine =
    terminalDlqCount != null
      ? `${terminalDlqCount.toLocaleString('en-IN')} terminal DLQ (tenant)`
      : 'Terminal DLQ count loading…'
  const finalityLabel = intelDetail?.batch?.finality_status
    ? intelDetail.batch.finality_status.replace(/_/g, ' ')
    : 'Awaiting finality'

  const buckets = [
    {
      label: intentJournalCopy.kpi.paymentWorkflow,
      value: batch?.apiType && batch.apiType !== '—' ? batch.apiType : 'Payment batch',
      sub: batch?.source ?? 'Payment instructions',
    },
    {
      label: intentJournalCopy.kpi.instructionsCreated,
      value: instructionCount.toLocaleString('en-IN'),
      sub:
        instructionCount > 0
          ? `${instructionCount.toLocaleString('en-IN')} payment instruction${instructionCount === 1 ? '' : 's'}`
          : 'No instructions yet',
    },
    {
      label: intentJournalCopy.kpi.intendedValue,
      value: valueLabel,
      sub: 'Sum of payment instruction amounts',
    },
    {
      label: intentJournalCopy.kpi.readiness,
      value: readinessPct,
      sub: finalityLabel === 'Awaiting finality' ? 'Average intent quality score' : `Batch finality · ${finalityLabel}`,
    },
    {
      label: intentJournalCopy.kpi.needsReview,
      value: needsReview.toLocaleString('en-IN'),
      sub:
        needsReview > 0
          ? `${manualReviewCount.toLocaleString('en-IN')} manual review · ${metrics?.lowReadinessCount ?? 0} low readiness · ${terminalLine}`
          : `No batch review items · ${terminalLine}`,
    },
  ] as const

  return (
    <JournalIntelligenceKpiHero
      className="mb-4"
      eyebrow={intentJournalCopy.hero.label}
      value={loading && !batch ? '—' : valueLabel}
      deltaPill={finalityLabel}
      subcopy={`${selectedBatchId || intentJournalCopy.sidebar.selectBatch} · ${instructionCount.toLocaleString('en-IN')} ${intentJournalCopy.sidebar.instructions}`}
      buckets={buckets}
      testId="intent-kpi-hero"
      footer={
        <IntentJournalExportMenu
          onExportIntents={onExportIntents}
          onExportReviewItems={onExportReviewItems}
          disabled={exportDisabled || !selectedBatchId}
        />
      }
    />
  )
}
