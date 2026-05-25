import type { IntentEngineBatchSidebarItem, PaymentIntentRecord } from './getProdIntentEngineBatches'
import type { ApiDlqRow } from './prodApiTypes'
import type { IntelligenceBatchRow } from './intelligenceTypes'
import { apiTrimmedString } from './coerceApiField'
import { tenantZordIdSuffix } from './tenantDisplay'

export type JournalBatchType = 'Disbursement' | 'Settlement'
export type JournalIntentStatus = 'Ready to Process' | 'Confirmed' | 'Pending' | 'Needs Review' | 'In Progress'
export type JournalIntentMatch = 'Matched' | 'Likely Matched' | 'Awaiting' | 'Mismatch' | 'Not Found'

export type JournalBatchRecord = {
  batchId: string
  type: JournalBatchType
  /** Raw `type` from intent-engine sidebar (e.g. PAYOUT, COLLECTION). */
  apiType: string
  source: string
  totalValue: number
  transactions: number
  confirmedCount: number
  /** Legacy field name — when from engine sidebar, stores rounded count fallback only. */
  highConfidenceCount: number
  /** Avg aggregate confidence 0–1 from engine (`highConfidenceCount` in API JSON). */
  avgConfidenceScore?: number
  mismatchCount: number
  unresolvedCount: number
  intelligenceCounts?: Pick<IntelligenceBatchRow, 'success_count' | 'failed_count' | 'pending_count' | 'finality_status'>
  engineSidebar?: boolean
}

export type JournalIntentRow = {
  batchId: string
  /** Short tenant suffix for Zord ID column. */
  zordId: string
  /** Intent id (or synthetic id) for drawer selection. */
  requestId: string
  reference: string
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH'
  status: JournalIntentStatus
  match: JournalIntentMatch
  lastUpdated: string
  paymentPartner: string
  bank: string
  paymentMethodDetail: string
  engineStatus?: string
  currency?: string
  tenantId: string
  intendedExecutionAt: string
  provider: string
  confidenceScore: number | null
  confidenceLabel: string
  infoSummary: string
  /** Full engine row for expandable details (not fabricated). */
  rawIntent?: PaymentIntentRecord
}

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

function resolveProvider(intent: PaymentIntentRecord): string {
  const instrument = apiTrimmedString(intent.beneficiary?.instrument?.kind)
  const beneficiaryType = apiTrimmedString(intent.beneficiary_type)
  return instrument || beneficiaryType || '—'
}

function buildIntentInfoSummary(intent: PaymentIntentRecord): string {
  const parts = [
    apiTrimmedString(intent.status),
    apiTrimmedString(intent.governance_state),
    apiTrimmedString(intent.business_state),
    apiTrimmedString(intent.client_payout_ref),
  ].filter(Boolean)
  if (intent.duplicate_risk_flag) parts.push('duplicate-risk')
  if (intent.governance?.semantic_valid === false) parts.push('semantic-invalid')
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export type JournalFailureRow = {
  batchId: string
  requestId: string
  reference: string
  amount: number
  method: 'Bank Transfer' | 'LSM' | 'NACH'
  paymentPartner: string
  connectorSubtitle: string
  failureReason: string
  failureStage: 'Validation' | 'Dispatch' | 'Processing' | 'Settlement'
  lastUpdated: string
  action: 'Retry' | 'Fix Details' | 'Investigate' | 'Escalate' | 'Fix Mandate'
}

function inferBatchSource(batchId: string, finality?: string): string {
  const id = batchId.toLowerCase()
  if (id.includes('bulk') || id.includes('upload') || id.includes('file')) return 'Bulk ingest'
  if (finality === 'REQUIRES_REVIEW') return 'Intelligence · review'
  return 'Intelligence'
}

/** Engine in-flight only — used for Billing “processing in Zord” count (GET, no POST). */
export function isZordProcessingPaymentIntent(intent: PaymentIntentRecord): boolean {
  const st = String(intent.status ?? '').toUpperCase()
  const biz = String(intent.business_state ?? '').toUpperCase()
  const gov = String(intent.governance_state ?? '').toUpperCase()
  if (st.includes('FAIL') || st.includes('REJECT') || st.includes('ERROR') || gov === 'FLAGGED') return false
  if (st.includes('CONFIRM') || st.includes('SUCCESS') || st === 'COMPLETED' || st === 'SETTLED') return false
  if (st.includes('PROCESS') || st.includes('DISPAT') || st === 'IN_FLIGHT' || biz === 'PROCESSING') return true
  return false
}

export function mapSidebarItemToBatchRecord(it: IntentEngineBatchSidebarItem): JournalBatchRecord {
  const typeUpper = (it.type ?? '').toUpperCase()
  const batchType: JournalBatchType = typeUpper.includes('SETTLEMENT') ? 'Settlement' : 'Disbursement'
  const tv = Number.parseFloat(String(it.totalValue ?? '').replace(/,/g, ''))
  const totalValue = Number.isFinite(tv) ? tv : 0
  const hcRaw = it.highConfidenceCount
  const avgConfidenceScore =
    typeof hcRaw === 'number' && Number.isFinite(hcRaw) && hcRaw <= 1 ? hcRaw : undefined
  const highConfidenceCount =
    avgConfidenceScore != null ? Math.round(avgConfidenceScore * 100) : typeof hcRaw === 'number' && Number.isFinite(hcRaw) ? Math.round(hcRaw) : 0

  return {
    batchId: String(it.batchId ?? '').trim() || '—',
    type: batchType,
    apiType: typeUpper || '—',
    source: 'Intent engine',
    totalValue,
    transactions: it.transactions ?? 0,
    confirmedCount: it.confirmedCount ?? 0,
    highConfidenceCount,
    avgConfidenceScore,
    mismatchCount: it.mismatchCount ?? 0,
    unresolvedCount: it.unresolvedCount ?? 0,
    engineSidebar: true,
  }
}

export function mapIntelligenceRowToBatchRecord(b: IntelligenceBatchRow): JournalBatchRecord {
  return {
    batchId: b.batch_id,
    type: 'Disbursement',
    apiType: '—',
    source: inferBatchSource(b.batch_id, b.finality_status),
    totalValue: 0,
    transactions: b.total_count ?? 0,
    confirmedCount: b.success_count ?? 0,
    highConfidenceCount: 0,
    mismatchCount: 0,
    unresolvedCount: 0,
    intelligenceCounts: {
      success_count: b.success_count ?? 0,
      failed_count: b.failed_count ?? 0,
      pending_count: b.pending_count ?? 0,
      finality_status: b.finality_status,
    },
  }
}

export function mapPaymentIntentToIntentRow(
  intent: PaymentIntentRecord,
  batchId: string,
  sessionTenantId?: string,
): JournalIntentRow {
  const raw = intent.amount
  const amount = typeof raw === 'string' ? parseFloat(raw) : Number(raw ?? 0)
  const safe = Number.isFinite(amount) ? amount : 0
  const stRaw = String(intent.status ?? '').trim()
  const gov = String(intent.governance_state ?? '').toUpperCase()
  const biz = String(intent.business_state ?? '').toUpperCase()
  const st = stRaw.toUpperCase()

  let status: JournalIntentStatus = 'Ready to Process'
  if (st.includes('FAIL') || st.includes('REJECT') || st.includes('ERROR') || gov === 'FLAGGED') {
    status = 'Needs Review'
  } else if (st.includes('CONFIRM') || st.includes('SUCCESS') || st === 'COMPLETED' || st === 'SETTLED') {
    status = 'Ready to Process'
  } else if (st.includes('PROCESS') || st.includes('DISPAT') || st === 'IN_FLIGHT' || biz === 'PROCESSING') {
    status = 'In Progress'
  } else if (st.includes('PEND') || st.includes('CREAT')) {
    status = 'Pending'
  }

  const conf = intent.aggregate_confidence_score
  let match: JournalIntentMatch = 'Awaiting'
  if (status === 'Confirmed') match = 'Matched'
  else if (status === 'Needs Review') match = 'Not Found'
  else if (typeof conf === 'number' && conf >= 0.8) match = 'Likely Matched'
  else if (typeof conf === 'number' && conf < 0.5) match = 'Mismatch'

  const created = intent.created_at ? new Date(intent.created_at) : new Date()
  const instrument =
    String(intent.beneficiary_type ?? '').trim() ||
    String(intent.beneficiary?.instrument?.kind ?? '').trim()
  let method: JournalIntentRow['method'] = 'Bank Transfer'
  const iu = instrument.toUpperCase()
  if (iu.includes('NACH')) method = 'NACH'
  else if (iu.includes('IMPS') || iu.includes('UPI') || iu.includes('LSM') || iu.includes('INSTA') || iu.includes('NEFT')) {
    method = 'LSM'
  }

  const paymentMethodDetail = [instrument || null, intent.constraints?.execution_window || null]
    .filter(Boolean)
    .join(' · ') || '—'

  const confidenceScore =
    typeof intent.aggregate_confidence_score === 'number' && Number.isFinite(intent.aggregate_confidence_score)
      ? intent.aggregate_confidence_score
      : null

  return {
    batchId,
    zordId: tenantZordIdSuffix(sessionTenantId || apiTrimmedString(intent.tenant_id)),
    requestId: intent.intent_id,
    reference: apiTrimmedString(intent.client_payout_ref) || '—',
    amount: safe,
    method,
    status,
    match,
    lastUpdated: created.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    paymentPartner: instrument || '—',
    bank: instrument || '—',
    paymentMethodDetail,
    engineStatus: [stRaw, gov, biz].filter(Boolean).join(' · ') || undefined,
    currency: apiTrimmedString(intent.currency ?? 'INR') || 'INR',
    tenantId: apiTrimmedString(intent.tenant_id) || '—',
    intendedExecutionAt: formatJournalExecutionAt(intent.intended_execution_at),
    provider: resolveProvider(intent),
    confidenceScore,
    confidenceLabel: formatConfidenceLabel(confidenceScore ?? undefined),
    infoSummary: buildIntentInfoSummary(intent),
    rawIntent: intent,
  }
}

export function mapDlqToFailureRow(row: ApiDlqRow): JournalFailureRow {
  const batchFromIngest = apiTrimmedString(row.client_batch_ref)
  const batchId = batchFromIngest || (row.envelope_id ? String(row.envelope_id) : '—')
  const stageRaw = (row.stage ?? '').toLowerCase()
  let failureStage: JournalFailureRow['failureStage'] = 'Processing'
  if (stageRaw.includes('valid')) failureStage = 'Validation'
  else if (stageRaw.includes('dispatch')) failureStage = 'Dispatch'
  else if (stageRaw.includes('settle')) failureStage = 'Settlement'
  const lastUpdated = row.created_at
    ? new Date(row.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—'
  const connectorSubtitle = [row.stage, row.reason_code].filter(Boolean).join(' · ') || '—'
  return {
    batchId,
    requestId: row.dlq_id,
    reference: row.envelope_id ?? row.dlq_id,
    amount: 0,
    method: 'Bank Transfer',
    paymentPartner: '',
    connectorSubtitle,
    failureReason: row.error_detail || row.reason_code || '—',
    failureStage,
    lastUpdated,
    action: row.replayable ? 'Retry' : 'Investigate',
  }
}
