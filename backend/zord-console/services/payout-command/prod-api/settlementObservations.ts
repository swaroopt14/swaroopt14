import { fetchProdJsonGetWithMeta, type ProdJsonGetResult } from './fetchProdJsonGet'

export type SettlementObservationBatchListItem = {
  client_batch_id: string
}

export type SettlementObservationBatchListResponse = {
  items: SettlementObservationBatchListItem[]
}

/** Canonical settlement observation row (mode 2) — mirrors outcome-engine JSON. */
export type CanonicalSettlementObservation = {
  settlement_observation_id: string
  tenant_id?: string
  trace_id?: string | null
  settlement_envelope_id?: string
  ingest_run_id?: string
  settlement_batch_id?: string
  source_file_ref?: string
  source_row_ref?: string
  source_system?: string
  connector_id?: string | null
  observation_kind?: string
  source_strength_class?: string
  client_reference_candidate?: string | null
  provider_reference?: string | null
  bank_reference?: string | null
  external_reference?: string | null
  batch_reference?: string | null
  amount?: string | number
  settled_amount?: string | number | null
  fee_amount?: string | number | null
  deduction_amount?: string | number | null
  currency_code?: string
  settlement_status?: string
  provider_status_code?: string | null
  failure_reason_code?: string | null
  retry_flag?: boolean
  reversal_flag?: boolean
  return_flag?: boolean
  observation_timestamp?: string
  value_date?: string
  provider_ref_status?: string
  provider_ref_first_seen_at?: string | null
  provider_ref_last_seen_at?: string | null
  provider_ref_consistency_flag?: boolean | null
  mapping_profile_id?: string
  mapping_profile_version?: string
  client_batch_id?: string
  parse_confidence?: number
  mapping_confidence?: number
  carrier_richness_score?: number
  attachment_readiness_score?: number
  score_breakdown_json?: unknown
  score_reason_codes_json?: unknown
  score_version?: string
  canonical_hash?: string
  canonical_snapshot_ref?: string | null
  source_strength?: string
  source_type?: string
  source_system_id?: string
  corridor_id?: string
  beneficiary_fingerprint?: string | null
  zord_signature_carrier?: string | null
  warnings_json?: unknown
  created_at?: string
  updated_at?: string
}

export type SettlementObservationDetailResponse = {
  items: CanonicalSettlementObservation[]
}

/** Mode-2 rows from outcome-engine (subset of canonical columns). */
export type SettlementObservationBatchDetailItem = {
  settlement_batch_id?: string
  source_row_ref?: string
  source_system?: string
  amount?: string | number
  settled_amount?: string | number | null
  fee_amount?: string | number | null
  deduction_amount?: string | number | null
  currency_code?: string
  settlement_status?: string
  bank_reference?: string | null
  provider_status_code?: string | null
  failure_reason_code?: string | null
  retry_flag?: boolean
  reversal_flag?: boolean
  return_flag?: boolean
  observation_timestamp?: string
  value_date?: string | null
  source_system_id?: string
  created_at?: string
  updated_at?: string
}

function isBatchIdListItem(
  item: SettlementObservationBatchListItem | CanonicalSettlementObservation | SettlementObservationBatchDetailItem,
): item is SettlementObservationBatchListItem {
  const keys = Object.keys(item as object)
  return keys.length <= 2 && 'client_batch_id' in (item as object)
}

/** Normalize list vs detail `items` from GET …/observations/batches. */
export function extractClientBatchIdsFromListResponse(
  data: SettlementObservationBatchListResponse | SettlementObservationDetailResponse | null | undefined,
): string[] {
  if (!data?.items?.length) return []
  const first = data.items[0]
  if (isBatchIdListItem(first)) {
    return (data.items as SettlementObservationBatchListItem[])
      .map((it) => String(it.client_batch_id ?? '').trim())
      .filter(Boolean)
  }
  const fromRows = (data.items as Array<{ client_batch_id?: string }>)
    .map((it) => String(it.client_batch_id ?? '').trim())
    .filter(Boolean)
  return [...new Set(fromRows)]
}

export const SETTLEMENT_OBSERVATIONS_BFF_PATH = '/api/prod/settlement/observations/batches'

function observationsUrl(clientBatchId?: string) {
  const params = new URLSearchParams()
  if (clientBatchId?.trim()) params.set('client_batch_id', clientBatchId.trim())
  const qs = params.toString()
  return qs ? `${SETTLEMENT_OBSERVATIONS_BFF_PATH}?${qs}` : SETTLEMENT_OBSERVATIONS_BFF_PATH
}

export async function getSettlementObservationBatchesForSession(): Promise<
  ProdJsonGetResult<SettlementObservationBatchListResponse>
> {
  return fetchProdJsonGetWithMeta<SettlementObservationBatchListResponse>(observationsUrl())
}

export async function getSettlementObservationsForClientBatch(
  clientBatchId: string,
): Promise<ProdJsonGetResult<SettlementObservationDetailResponse>> {
  const bid = clientBatchId.trim()
  if (!bid) {
    return { data: { items: [] }, ok: true, status: 200, url: observationsUrl() }
  }
  return fetchProdJsonGetWithMeta<SettlementObservationDetailResponse>(observationsUrl(bid))
}

export type SettlementObservationTableRow = {
  observationId: string
  settlementBatchId: string
  ingestRunId: string
  clientBatchId: string
  sourceRowRef: string
  sourceFileRef: string
  clientRef: string
  providerRef: string
  bankRef: string
  amount: number
  settledAmount: number
  feeAmount: number
  deductionAmount: number
  currency: string
  status: string
  statusRaw: string
  sourceSystem: string
  sourceSystemId: string
  sourceType: string
  sourceStrength: string
  observationKind: string
  observationTime: string
  valueDate: string
  createdAt: string
  updatedAt: string
  providerStatusCode: string
  failureReasonCode: string
  retryFlag: boolean
  reversalFlag: boolean
  returnFlag: boolean
  parseConfidence: number | null
  mappingConfidence: number | null
  carrierRichnessScore: number | null
  attachmentReadinessScore: number | null
  traceId: string
  settlementEnvelopeId: string
  connectorId: string
  externalReference: string
  batchReference: string
  sourceStrengthClass: string
  providerRefStatus: string
  providerRefFirstSeenAt: string
  providerRefLastSeenAt: string
  providerRefConsistent: string
  mappingProfileId: string
  mappingProfileVersion: string
  scoreVersion: string
  canonicalHash: string
  canonicalSnapshotRef: string
  corridorId: string
  beneficiaryFingerprint: string
  zordSignatureCarrier: string
}

function parseMoney(raw: string | number | null | undefined): number {
  if (raw == null || raw === '') return 0
  const n = Number.parseFloat(String(raw).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function formatObsTime(iso: string | undefined): string {
  if (!iso?.trim()) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function displayOrDash(value: string | null | undefined): string {
  const v = value?.trim()
  return v ? v : '—'
}

export function mapObservationToTableRow(
  obs: CanonicalSettlementObservation | SettlementObservationBatchDetailItem,
  opts?: { clientBatchId?: string; rowIndex?: number },
): SettlementObservationTableRow {
  const full = obs as CanonicalSettlementObservation
  const slim = obs as SettlementObservationBatchDetailItem
  const statusRaw = (full.settlement_status ?? slim.settlement_status ?? '').trim()
  const settlementBatchId = displayOrDash(full.settlement_batch_id ?? slim.settlement_batch_id)
  const sourceRowRef = displayOrDash(full.source_row_ref ?? slim.source_row_ref)
  const createdAt = formatObsTime(full.created_at ?? slim.created_at)
  const observationId =
    full.settlement_observation_id?.trim() ||
    `${settlementBatchId}:${sourceRowRef}:${opts?.rowIndex ?? 0}:${createdAt}`

  return {
    observationId,
    settlementBatchId,
    ingestRunId: displayOrDash(full.ingest_run_id),
    clientBatchId: displayOrDash(full.client_batch_id ?? opts?.clientBatchId),
    sourceRowRef,
    sourceFileRef: displayOrDash(full.source_file_ref),
    clientRef: displayOrDash(full.client_reference_candidate),
    providerRef: displayOrDash(full.provider_reference),
    bankRef: displayOrDash(full.bank_reference ?? slim.bank_reference),
    amount: parseMoney(full.amount ?? slim.amount),
    settledAmount: parseMoney(full.settled_amount ?? slim.settled_amount),
    feeAmount: parseMoney(full.fee_amount ?? slim.fee_amount),
    deductionAmount: parseMoney(full.deduction_amount ?? slim.deduction_amount),
    currency: (full.currency_code ?? slim.currency_code ?? 'INR').trim() || 'INR',
    statusRaw,
    status: statusRaw ? statusRaw.replace(/_/g, ' ') : '—',
    sourceSystem: displayOrDash(full.source_system ?? slim.source_system),
    sourceSystemId: displayOrDash(full.source_system_id ?? slim.source_system_id),
    sourceType: displayOrDash(full.source_type),
    sourceStrength: displayOrDash(full.source_strength ?? full.source_strength_class),
    observationKind: displayOrDash(full.observation_kind?.replace(/_/g, ' ')),
    observationTime: formatObsTime(full.observation_timestamp ?? slim.observation_timestamp ?? full.created_at ?? slim.created_at),
    valueDate: formatObsTime(full.value_date ?? slim.value_date ?? undefined),
    createdAt,
    updatedAt: formatObsTime(full.updated_at ?? slim.updated_at),
    providerStatusCode: displayOrDash(full.provider_status_code ?? slim.provider_status_code),
    failureReasonCode: displayOrDash(full.failure_reason_code ?? slim.failure_reason_code),
    retryFlag: Boolean(full.retry_flag ?? slim.retry_flag),
    reversalFlag: Boolean(full.reversal_flag ?? slim.reversal_flag),
    returnFlag: Boolean(full.return_flag ?? slim.return_flag),
    parseConfidence: typeof full.parse_confidence === 'number' ? full.parse_confidence : null,
    mappingConfidence: typeof full.mapping_confidence === 'number' ? full.mapping_confidence : null,
    carrierRichnessScore:
      typeof full.carrier_richness_score === 'number' ? full.carrier_richness_score : null,
    attachmentReadinessScore:
      typeof full.attachment_readiness_score === 'number' ? full.attachment_readiness_score : null,
    traceId: displayOrDash(full.trace_id ?? undefined),
    settlementEnvelopeId: displayOrDash(full.settlement_envelope_id),
    connectorId: displayOrDash(full.connector_id ?? undefined),
    externalReference: displayOrDash(full.external_reference),
    batchReference: displayOrDash(full.batch_reference),
    sourceStrengthClass: displayOrDash(full.source_strength_class),
    providerRefStatus: displayOrDash(full.provider_ref_status),
    providerRefFirstSeenAt: formatObsTime(full.provider_ref_first_seen_at ?? undefined),
    providerRefLastSeenAt: formatObsTime(full.provider_ref_last_seen_at ?? undefined),
    providerRefConsistent:
      full.provider_ref_consistency_flag === true
        ? 'Yes'
        : full.provider_ref_consistency_flag === false
          ? 'No'
          : '—',
    mappingProfileId: displayOrDash(full.mapping_profile_id),
    mappingProfileVersion: displayOrDash(full.mapping_profile_version),
    scoreVersion: displayOrDash(full.score_version),
    canonicalHash: displayOrDash(full.canonical_hash),
    canonicalSnapshotRef: displayOrDash(full.canonical_snapshot_ref ?? undefined),
    corridorId: displayOrDash(full.corridor_id),
    beneficiaryFingerprint: displayOrDash(full.beneficiary_fingerprint ?? undefined),
    zordSignatureCarrier: displayOrDash(full.zord_signature_carrier ?? undefined),
  }
}

export function observationSearchHaystack(row: SettlementObservationTableRow): string {
  return [
    row.observationId,
    row.settlementBatchId,
    row.ingestRunId,
    row.clientBatchId,
    row.sourceRowRef,
    row.sourceFileRef,
    row.clientRef,
    row.providerRef,
    row.bankRef,
    row.status,
    row.statusRaw,
    row.sourceSystem,
    row.sourceSystemId,
    row.sourceType,
    row.sourceStrength,
    row.observationKind,
    row.providerStatusCode,
    row.failureReasonCode,
    row.settlementEnvelopeId,
    row.externalReference,
    row.batchReference,
    row.connectorId,
    row.canonicalHash,
    String(row.amount),
    String(row.settledAmount),
    String(row.feeAmount),
  ]
    .join(' ')
    .toLowerCase()
}
