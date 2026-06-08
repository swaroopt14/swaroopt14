import type { BatchStepState, BatchSummary, BatchTimelineStep } from '@/services/payout-command/batch-model'
import { BATCH_REVIEW_COPY } from '../../copy/batchCommandCenterCopy'
import type { BatchIntakeSnapshot } from '../BatchIntakePanel'
import type { BatchPortalProgressItem } from './BatchPortalProgressList'

function stepToProgress(state: BatchStepState): {
  percent: number
  tone: BatchPortalProgressItem['tone']
  statusLabel: string
  statusTone: BatchPortalProgressItem['statusTone']
} {
  if (state === 'done') {
    return { percent: 100, tone: 'green', statusLabel: 'Successfully Completed', statusTone: 'success' }
  }
  if (state === 'active') {
    return { percent: 45, tone: 'blue', statusLabel: 'Active', statusTone: 'active' }
  }
  if (state === 'warning') {
    return { percent: 40, tone: 'slate', statusLabel: 'Needs attention', statusTone: 'warning' }
  }
  return { percent: 0, tone: 'blue', statusLabel: 'Pending', statusTone: 'idle' }
}

function intakeIntentProgress(snapshot: BatchIntakeSnapshot) {
  if (snapshot.intentIngestOk) {
    return { pct: 100, tone: 'green' as const, statusLabel: 'Successfully Completed', statusTone: 'success' as const }
  }
  if (snapshot.intakeStep === 'intent_uploading' || snapshot.uploadState === 'uploading') {
    return { pct: 95, tone: 'blue' as const, statusLabel: 'Active', statusTone: 'active' as const }
  }
  if (snapshot.intentFileName || snapshot.uploadedFileName) {
    return { pct: 15, tone: 'blue' as const, statusLabel: 'Ready to upload', statusTone: 'idle' as const }
  }
  return null
}

function intakeSettlementProgress(snapshot: BatchIntakeSnapshot) {
  if (snapshot.settlementIngestOk || snapshot.intakeStep === 'closed') {
    return { pct: 100, tone: 'green' as const, statusLabel: 'Successfully Completed', statusTone: 'success' as const }
  }
  if (snapshot.intakeStep === 'settlement_uploading') {
    return { pct: 95, tone: 'blue' as const, statusLabel: 'Active', statusTone: 'active' as const }
  }
  if (snapshot.settlementFileName) {
    return { pct: 20, tone: 'blue' as const, statusLabel: 'Ready to upload', statusTone: 'idle' as const }
  }
  if (snapshot.intentIngestOk) {
    return { pct: 5, tone: 'blue' as const, statusLabel: 'Awaiting file', statusTone: 'idle' as const }
  }
  return null
}

function pushTimelineSteps(items: BatchPortalProgressItem[], timeline: BatchTimelineStep[]) {
  for (const step of timeline) {
    if (step.state === 'upcoming') continue
    const mapped = stepToProgress(step.state)
    if (mapped.percent <= 0 && step.state !== 'warning') continue
    items.push({
      id: `pipeline-${step.label.replace(/\s+/g, '-').toLowerCase()}`,
      label: step.label,
      percent: mapped.percent,
      tone: mapped.tone,
      statusLabel: mapped.statusLabel,
      statusTone: mapped.statusTone,
    })
  }
}

function pushFileProcessingMetrics(
  items: BatchPortalProgressItem[],
  snapshot: BatchIntakeSnapshot,
  summary: BatchSummary,
) {
  const fp = BATCH_REVIEW_COPY.fileProcessing
  const hasActivity =
    snapshot.intentIngestOk ||
    snapshot.intentFileName ||
    snapshot.uploadedFileName ||
    summary.totalRows > 0

  if (!hasActivity) return

  const fileReceived = snapshot.intentIngestOk || snapshot.uploadState === 'ready'
  items.push({
    id: 'fp-file-received',
    label: fp.fileReceived,
    percent: fileReceived ? 100 : snapshot.intakeStep === 'intent_uploading' ? 60 : 10,
    tone: fileReceived ? 'green' : 'blue',
    statusLabel: fileReceived ? 'Successfully Completed' : 'Active',
    statusTone: fileReceived ? 'success' : 'active',
  })

  const mapped = fileReceived
  items.push({
    id: 'fp-header-mapping',
    label: fp.headerMapping,
    percent: mapped ? 100 : 0,
    tone: mapped ? 'green' : 'blue',
    statusLabel: mapped ? 'Successfully Completed' : 'Pending',
    statusTone: mapped ? 'success' : 'idle',
  })

  if (summary.totalRows > 0) {
    const processedPct = Math.round((summary.processed / summary.totalRows) * 100)
    items.push({
      id: 'fp-rows-processed',
      label: fp.rowsProcessed,
      percent: processedPct,
      tone: processedPct >= 100 ? 'green' : 'blue',
      statusLabel: `${summary.processed.toLocaleString('en-IN')} / ${summary.totalRows.toLocaleString('en-IN')}`,
      statusTone: processedPct >= 100 ? 'success' : 'active',
    })
    if (summary.failed > 0) {
      items.push({
        id: 'fp-rows-failed',
        label: fp.rowsFailed,
        percent: Math.min(100, Math.round((summary.failed / summary.totalRows) * 100)),
        tone: 'slate',
        statusLabel: String(summary.failed),
        statusTone: 'warning',
      })
    }
    items.push({
      id: 'fp-intents-created',
      label: fp.intentsCreated,
      percent: summary.success > 0 ? 100 : processedPct,
      tone: summary.success > 0 ? 'green' : 'blue',
      statusLabel: String(summary.success),
      statusTone: summary.success > 0 ? 'success' : 'active',
    })
    const needsReview = summary.failed + summary.pending
    if (needsReview > 0) {
      items.push({
        id: 'fp-needs-review',
        label: fp.needsReview,
        percent: Math.min(100, Math.round((needsReview / summary.totalRows) * 100)),
        tone: 'slate',
        statusLabel: String(needsReview),
        statusTone: 'warning',
      })
    }
  }
}

export function deriveBatchPortalProgress(args: {
  snapshot: BatchIntakeSnapshot
  summary: BatchSummary
  processedPct: number
  timeline: BatchTimelineStep[]
  activeBatchId: string
  includeUploadCards?: boolean
}): BatchPortalProgressItem[] {
  const items: BatchPortalProgressItem[] = []

  pushFileProcessingMetrics(items, args.snapshot, args.summary)

  const intentLabel =
    args.snapshot.intentFileName ?? args.snapshot.uploadedFileName ?? null
  const intent = intakeIntentProgress(args.snapshot)
  if (
    args.includeUploadCards !== false &&
    intent &&
    (intentLabel || args.snapshot.intentIngestOk || args.snapshot.uploadState !== 'idle')
  ) {
    items.push({
      id: 'intent-upload',
      label: intentLabel ?? 'Intent batch upload',
      percent: intent.pct,
      tone: intent.tone,
      statusLabel: intent.statusLabel,
      statusTone: intent.statusTone,
    })
  }

  const settlementLabel = args.snapshot.settlementFileName ?? null
  const settlement = intakeSettlementProgress(args.snapshot)
  if (
    args.includeUploadCards !== false &&
    settlement &&
    (settlementLabel ||
      args.snapshot.settlementIngestOk ||
      args.snapshot.intakeStep === 'settlement_uploading' ||
      args.snapshot.intakeStep === 'closed' ||
      args.snapshot.intentIngestOk)
  ) {
    items.push({
      id: 'settlement-upload',
      label: settlementLabel ?? 'Settlement batch upload',
      percent: settlement.pct,
      tone: settlement.tone,
      statusLabel: settlement.statusLabel,
      statusTone: settlement.statusTone,
    })
  }

  pushTimelineSteps(items, args.timeline)

  if (args.activeBatchId && args.summary.totalRows > 0) {
    const pct = Math.round(args.processedPct)
    const done = pct >= 100
    items.push({
      id: 'batch-processing',
      label:
        args.summary.totalRows > 0
          ? `Batch processing (${args.summary.processed.toLocaleString('en-IN')} / ${args.summary.totalRows.toLocaleString('en-IN')} rows)`
          : 'Batch processing',
      percent: done ? 100 : Math.max(pct, 12),
      tone: done ? 'green' : 'blue',
      statusLabel: done ? 'Successfully Completed' : 'Active',
      statusTone: done ? 'success' : 'active',
    })
  }

  return items
}
