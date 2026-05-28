import type { IntentJournalDlqItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { JournalFailureRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

function mapStage(stage: string | undefined): JournalFailureRow['failureStage'] {
  const stageRaw = (stage ?? '').toLowerCase()
  if (stageRaw.includes('valid')) return 'Validation'
  if (stageRaw.includes('dispatch')) return 'Dispatch'
  if (stageRaw.includes('settle')) return 'Settlement'
  return 'Processing'
}

/** Map dlq-items list item → Review Items table row. */
export function mapDlqListItemToReviewRow(
  row: IntentJournalDlqItem,
  selectedBatchId?: string,
): JournalFailureRow {
  const batchFromIngest =
    apiTrimmedString(row.client_batch_ref) || apiTrimmedString(row.batch_id)
  const batchId =
    batchFromIngest || apiTrimmedString(selectedBatchId) || (row.envelope_id ? String(row.envelope_id) : '—')
  const lastUpdated = row.created_at
    ? new Date(row.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const connectorSubtitle = [row.stage, row.reason_code].filter(Boolean).join(' · ') || '—'
  const failureReason = row.error_detail || row.reason_code || '—'

  return {
    batchId,
    requestId: row.dlq_id,
    reference: row.envelope_id ?? row.dlq_id,
    amount: 0,
    method: 'Bank Transfer',
    paymentPartner: '',
    connectorSubtitle,
    failureReason,
    failureStage: mapStage(row.stage),
    lastUpdated,
    action: row.replayable ? 'Retry' : 'Investigate',
  }
}
