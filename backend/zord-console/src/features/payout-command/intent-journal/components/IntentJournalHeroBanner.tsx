'use client'

import { JournalIntelligenceKpiHero } from '../../command-center/JournalIntelligenceKpiHero'
import { useJournalBatchSelection } from '../context/JournalBatchSelectionContext'
import { useJournalBatchMetrics } from '../hooks/useJournalBatchMetrics'
import { useJournalIntelligenceBatch } from '../hooks/useJournalIntelligenceBatch'
import { intentJournalCopy } from '../copy/intentJournalCopy'
import { fmtInrFromMinorExact } from '../../command-center/commandCenterFormat'
import { formatConfidencePct } from '../intentJournalSidebarUtils'
import { useDlqManualReviewCount } from '../hooks/useDlqManualReviewCount'
import { IntentJournalExportMenu } from './IntentJournalExportMenu'

type IntentJournalHeroBannerProps = {
  onExportIntents: () => void
  onExportReviewItems: () => void
  exportDisabled?: boolean
  intentExportCount?: number
  reviewExportCount?: number
}

export function IntentJournalHeroBanner({
  onExportIntents,
  onExportReviewItems,
  exportDisabled,
  intentExportCount = 0,
  reviewExportCount = 0,
}: IntentJournalHeroBannerProps) {
  const { selectedBatchId, journalEnabled } = useJournalBatchSelection()
  const { batch, metrics, loading } = useJournalBatchMetrics(selectedBatchId, journalEnabled)
  const { detail: intelDetail } = useJournalIntelligenceBatch(selectedBatchId, journalEnabled)
  const { displayCount: manualReviewCount, loading: manualReviewLoading } = useDlqManualReviewCount(
    journalEnabled,
    selectedBatchId,
  )

  const valueLabel = fmtInrFromMinorExact(metrics?.intendedValue ?? batch?.totalValue ?? 0)
  const instructionCount = metrics?.instructionCount ?? batch?.transactions ?? 0
  const qualityPct = formatConfidencePct(metrics?.batchAggregateConfidenceScore ?? null)
  const needsReviewDisplay =
    manualReviewCount != null ? manualReviewCount.toLocaleString('en-IN') : manualReviewLoading ? '…' : '—'
  const needsReviewSub =
    manualReviewCount != null
      ? 'Items in manual-review DLQ queue'
      : manualReviewLoading
        ? 'Loading manual-review count…'
        : '—'
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
      value: qualityPct,
      sub: 'Batch aggregate confidence score',
    },
    {
      label: intentJournalCopy.kpi.needsReview,
      value: needsReviewDisplay,
      sub: needsReviewSub,
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
          intentCount={intentExportCount}
          reviewCount={reviewExportCount}
        />
      }
    />
  )
}
