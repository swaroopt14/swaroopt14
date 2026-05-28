import type { IntentJournalPaymentIntentItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { JournalIntentRow, JournalIntentStatus } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { tenantZordIdSuffix } from '@/services/payout-command/prod-api/tenantDisplay'

export const READINESS_REVIEW_THRESHOLD = 0.7

function formatJournalExecutionAt(iso: string | undefined): string {
  const s = apiTrimmedString(iso)
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatConfidenceLabel(score: number | undefined): string {
  if (score == null || !Number.isFinite(score)) return '—'
  const pct = score <= 1 ? score * 100 : score
  return `${pct.toFixed(0)}%`
}

function resolveProviderHint(hint: string | undefined): string {
  const h = apiTrimmedString(hint)
  if (!h) return '—'
  return h.charAt(0).toUpperCase() + h.slice(1)
}

function resolveLifecycleStatus(qualityScore: number | undefined): JournalIntentStatus {
  if (typeof qualityScore === 'number' && qualityScore < READINESS_REVIEW_THRESHOLD) {
    return 'Needs Review'
  }
  return 'Pending'
}

function parseAmount(raw: string | number | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const n = Number.parseFloat(String(raw ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function syntheticRequestId(batchId: string, index: number, item: IntentJournalPaymentIntentItem): string {
  if (apiTrimmedString(item.intent_id)) return apiTrimmedString(item.intent_id)!
  if (apiTrimmedString(item.envelope_id)) return apiTrimmedString(item.envelope_id)!
  return `${batchId}-row-${index + 1}`
}

/** Map thin payment-intents list item → journal table row. */
export function mapPaymentIntentListItemToRow(
  item: IntentJournalPaymentIntentItem,
  batchId: string,
  index: number,
  sessionTenantId: string,
): JournalIntentRow {
  const amount = parseAmount(item.amount)
  const qualityScore =
    typeof item.intent_quality_score === 'number' && Number.isFinite(item.intent_quality_score)
      ? item.intent_quality_score
      : null
  const status = resolveLifecycleStatus(qualityScore ?? undefined)
  const provider = resolveProviderHint(item.provider_hint)
  const requestId = syntheticRequestId(batchId, index, item)
  const zordId = tenantZordIdSuffix(sessionTenantId || apiTrimmedString(item.tenant_id))
  const paymentRef = apiTrimmedString(item.client_payout_ref)

  return {
    batchId,
    zordId,
    requestId,
    reference: paymentRef || '—',
    amount,
    method: 'Bank Transfer',
    status,
    match: 'Awaiting',
    lastUpdated: formatJournalExecutionAt(item.intended_execution_at),
    paymentPartner: provider,
    bank: provider,
    paymentMethodDetail: provider,
    engineStatus: undefined,
    currency: apiTrimmedString(item.currency ?? 'INR') || 'INR',
    tenantId: apiTrimmedString(item.tenant_id) || '—',
    intendedExecutionAt: formatJournalExecutionAt(item.intended_execution_at),
    provider,
    confidenceScore: qualityScore,
    confidenceLabel: formatConfidenceLabel(qualityScore ?? undefined),
    infoSummary: status === 'Needs Review' ? 'Low intent readiness' : 'Awaiting bank confirmation',
  }
}

/** Customer-facing status label for intent journal rows. */
export function intentRowCustomerStatus(status: JournalIntentStatus): string {
  if (status === 'Pending') return 'Awaiting Bank Confirmation'
  if (status === 'Ready to Process') return 'Ready for Dispatch'
  return status
}
