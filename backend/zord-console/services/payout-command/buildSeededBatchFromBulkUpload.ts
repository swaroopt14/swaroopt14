/**
 * Turns Batch Command Center parsed rows + bulk-ingest batch id into a
 * `SeededBatch` so Intent Journal can list the upload beside sandbox scenarios.
 */
import type { BatchRow } from './batch-model'
import type { AttachmentDecision, EvidencePackStatus, IntentDetail, IntentLifecycleStatus, SeededBatch, Variance } from './intent-journal-types'
import { generateBenToken, tokenizeBeneficiaryFull } from './tokenize'

function rowStatusToLifecycle(status: BatchRow['status']): IntentLifecycleStatus {
  switch (status) {
    case 'Success':
      return 'confirmed'
    case 'Failed':
      return 'failed'
    case 'Pending':
      return 'pending'
    case 'Processing':
      return 'processing'
    default:
      return 'pending'
  }
}

function providerToConnector(provider: BatchRow['provider']): string {
  if (provider === 'RazorpayX') return 'Razorpay'
  return provider
}

function minimalAttachment(connector: string): AttachmentDecision {
  return {
    chosenConnector: connector,
    chosenConnectorType: 'psp',
    chosenRail: 'IMPS',
    score: 78,
    reasonCodes: ['BULK_INGEST_DEFAULT'],
    alternatives: [],
  }
}

function minimalEvidence(status: IntentLifecycleStatus, intentId: string, at: string): EvidencePackStatus {
  const failed = status === 'failed'
  const artifacts: EvidencePackStatus['artifacts'] = [
    { kind: 'intent_json', label: 'Intent JSON (canonical)', present: true, sizeBytes: 1100 },
    { kind: 'signals_bundle', label: 'Signals bundle', present: !failed, sizeBytes: failed ? null : 2800 },
    { kind: 'governance_trace', label: 'Governance trace', present: true, sizeBytes: 720 },
    { kind: 'dispatch_receipt', label: 'Dispatch receipt', present: !failed, sizeBytes: failed ? null : 480 },
    { kind: 'settlement_extract', label: 'Settlement extract', present: status === 'confirmed', sizeBytes: status === 'confirmed' ? 1600 : null },
  ]
  const present = artifacts.filter((a) => a.present).length
  const state: EvidencePackStatus['state'] =
    present >= artifacts.length ? 'complete' : present >= 2 ? 'partial' : 'pending'
  return {
    state,
    artifactCount: present,
    totalArtifacts: artifacts.length,
    lastUpdatedAt: at,
    artifacts,
  }
}

function minimalVariance(status: IntentLifecycleStatus, reason: string): Variance {
  if (status === 'failed' && reason && reason !== '-') {
    return { kind: 'reference', summary: reason, expected: '—', observed: reason }
  }
  return { kind: 'none', summary: '' }
}

/** Split "First Last" or use whole string as first name for tokenization. */
function beneficiaryParts(name: string): { first: string; last: string; last4: string } {
  const t = name.trim() || 'Beneficiary'
  const parts = t.split(/\s+/)
  const first = parts[0] ?? 'Beneficiary'
  const last = parts.length > 1 ? parts[parts.length - 1]! : 'Record'
  const digits = t.replace(/\D/g, '')
  const last4 = digits.slice(-4).padStart(4, '0')
  return { first, last, last4 }
}

function batchRowToIntentDetail(row: BatchRow, batchId: string, index: number): IntentDetail {
  const connector = providerToConnector(row.provider)
  const status = rowStatusToLifecycle(row.status)
  const intentId = row.dispatchId?.trim() || row.refId?.trim() || `BULK-${batchId}-${index}`
  const { first, last, last4 } = beneficiaryParts(row.beneficiary)
  const bank = 'HDFC Bank'
  const dispatchedAt = new Date().toISOString()
  const beneficiaryFull = tokenizeBeneficiaryFull(first, last, last4, bank)
  const beneficiaryToken = generateBenToken(intentId)

  return {
    intentId,
    batchId,
    beneficiaryFull,
    beneficiaryToken,
    amount: row.amount,
    currency: 'INR',
    rail: 'IMPS',
    connector,
    status,
    defensibilityScore: status === 'confirmed' ? 82 : status === 'failed' ? 38 : 64,
    dispatchedAt,
    lastSignalAt: null,
    lineage: [
      {
        id: 'ingest',
        system: 'zord',
        action: 'Accepted via bulk ingest',
        at: dispatchedAt,
        status: 'done',
        detail: row.stage,
      },
    ],
    signals: [],
    attachment: minimalAttachment(connector),
    variance: minimalVariance(status, row.reason),
    evidence: minimalEvidence(status, intentId, dispatchedAt),
  }
}

export function buildSeededBatchFromBulkUpload(params: {
  batchId: string
  fileName: string
  rows: BatchRow[]
}): SeededBatch {
  const { batchId, fileName, rows } = params
  const confirmed = rows.filter((r) => r.status === 'Success').length
  const failed = rows.filter((r) => r.status === 'Failed').length
  const pending = rows.filter((r) => r.status === 'Pending').length
  const processing = rows.filter((r) => r.status === 'Processing').length
  const totalValue = rows.reduce((sum, r) => sum + r.amount, 0)
  const intents = rows.map((row, i) => batchRowToIntentDetail(row, batchId, i))
  const now = new Date().toISOString()

  return {
    batchId,
    scenarioId: 'bulk_upload',
    scenarioName: fileName,
    seededAt: now,
    batch: {
      batchId,
      type: 'Disbursement',
      source: 'Bulk ingest',
      totalValue,
      transactions: rows.length,
      confirmedCount: confirmed,
      highConfidenceCount: Math.min(confirmed, Math.max(0, Math.round(confirmed * 0.9))),
      mismatchCount: failed,
      unresolvedCount: pending + processing,
    },
    intents,
  }
}
