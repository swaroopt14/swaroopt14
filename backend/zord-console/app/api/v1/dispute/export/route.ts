import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import {
  applyEvidenceGateCookies,
  gateEvidenceTenant,
  getEvidencePackById,
  getEvidenceTimelineById,
  listEvidencePacksByQuery,
} from '../../evidence/_shared'
import type { EvidencePackFull, EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ExportType = 'FINANCE_SUMMARY' | 'AUDIT_DETAILED' | 'BANK_PSP_PACK' | 'RAW_JSON'
type DisputeReason =
  | 'BENEFICIARY_SAYS_NOT_RECEIVED'
  | 'AMOUNT_MISMATCH'
  | 'SETTLEMENT_NOT_FOUND'

type ExportRequestBody = {
  payment_reference?: string
  dispute_reason?: DisputeReason
  export_type?: ExportType
}

function sanitizeFileSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function simplePdfFromLines(title: string, lines: string[]): Buffer {
  const safeLines = [title, ...lines].slice(0, 44)
  let content = 'BT\n/F1 11 Tf\n50 790 Td\n'
  safeLines.forEach((line, idx) => {
    if (idx > 0) content += '0 -16 Td\n'
    content += `(${escapePdfText(line)}) Tj\n`
  })
  content += 'ET'

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  objects.forEach((obj, idx) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(pdf, 'utf8')
}

function toMinorAmount(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(parsed)) return null
  if (parsed > 1000000000) return Math.round(parsed)
  return Math.round(parsed * 100)
}

function formatInr(minor: number | null): string {
  if (minor == null) return 'N/A'
  return `INR ${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function masked(value: string | undefined): string {
  const v = apiTrimmedString(value)
  if (!v) return 'N/A'
  if (v.length <= 6) return `${v.slice(0, 1)}***${v.slice(-1)}`
  return `${v.slice(0, 3)}***${v.slice(-3)}`
}

function packPaymentReference(pack: EvidencePackFull): string {
  return (
    apiTrimmedString(pack.client_payout_ref) ||
    apiTrimmedString(pack.client_reference) ||
    apiTrimmedString(pack.intent_id) ||
    apiTrimmedString(pack.evidence_pack_id) ||
    'unknown-payment'
  )
}

function packUtrLike(pack: EvidencePackFull): string {
  const attach = (pack.items ?? []).find((item) => (item.type || '').toUpperCase().includes('ATTACH'))
  return apiTrimmedString(attach?.ref) || 'N/A'
}

function pickPackFromList(reference: string, rows: EvidencePackSummaryRow[]): EvidencePackSummaryRow | null {
  const lower = reference.toLowerCase()
  for (const row of rows) {
    const candidates = [
      apiTrimmedString(row.evidence_pack_id),
      apiTrimmedString(row.intent_id),
      apiTrimmedString(row.client_payout_ref),
      apiTrimmedString(row.client_reference),
      apiTrimmedString(row.bank_reference),
    ]
      .filter(Boolean)
      .map((v) => v.toLowerCase())
    if (candidates.some((candidate) => candidate === lower)) return row
  }
  return rows[0] ?? null
}

async function resolvePack(tenantId: string, paymentReference: string): Promise<EvidencePackFull | null> {
  const byId = await getEvidencePackById(tenantId, paymentReference)
  if (byId.ok) return byId.data

  const directIntent = await listEvidencePacksByQuery(
    tenantId,
    new URLSearchParams({ intent_id: paymentReference }),
  )
  if (directIntent.ok && (directIntent.data.packs?.length ?? 0) > 0) {
    const first = directIntent.data.packs[0]
    const full = await getEvidencePackById(tenantId, first.evidence_pack_id)
    if (full.ok) return full.data
  }

  const broad = await listEvidencePacksByQuery(tenantId, new URLSearchParams())
  if (broad.ok && (broad.data.packs?.length ?? 0) > 0) {
    const match = pickPackFromList(paymentReference, broad.data.packs)
    if (match) {
      const full = await getEvidencePackById(tenantId, match.evidence_pack_id)
      if (full.ok) return full.data
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  const gate = await gateEvidenceTenant(request)
  if (!gate.ok) return gate.response

  let body: ExportRequestBody
  try {
    body = (await request.json()) as ExportRequestBody
  } catch {
    const res = NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const paymentReference = apiTrimmedString(body.payment_reference)
  const exportType = apiTrimmedString(body.export_type).toUpperCase() as ExportType
  const disputeReason = apiTrimmedString(body.dispute_reason).toUpperCase() as DisputeReason

  if (!paymentReference || !exportType || !disputeReason) {
    const res = NextResponse.json(
      {
        error: 'payment_reference, dispute_reason, and export_type are required',
      },
      { status: 400 },
    )
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const pack = await resolvePack(gate.tenantId, paymentReference)
  if (!pack) {
    const res = NextResponse.json(
      { error: `No evidence pack found for payment_reference ${paymentReference}` },
      { status: 404 },
    )
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const packRef = sanitizeFileSafe(packPaymentReference(pack))
  const minorAmount = toMinorAmount(pack.amount_minor) ?? toMinorAmount(pack.amount)
  const matchingConfidence = pack.proof_score != null ? `${Number(pack.proof_score).toFixed(1)}` : 'N/A'
  const utr = packUtrLike(pack)

  if (exportType === 'FINANCE_SUMMARY') {
    const pdf = simplePdfFromLines('Finance Summary', [
      `Payment reference: ${masked(packPaymentReference(pack))}`,
      `Evidence pack: ${pack.evidence_pack_id}`,
      `Absolute processing status: ${apiTrimmedString(pack.pack_status) || 'N/A'}`,
      `Target UTR: ${utr}`,
      `Transaction amount: ${formatInr(minorAmount)}`,
      `Matching confidence index: ${matchingConfidence}`,
      `Dispute reason: ${disputeReason}`,
      `PII policy: masked in finance summary output`,
    ])
    const res = new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="finance-summary-${packRef}.pdf"`,
        'cache-control': 'no-store',
      },
    })
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  if (exportType === 'AUDIT_DETAILED') {
    const timeline = await getEvidenceTimelineById(gate.tenantId, pack.evidence_pack_id)
    const events =
      timeline.ok && Array.isArray(timeline.data.timeline)
        ? timeline.data.timeline.map((entry) => `${entry.timestamp} · ${entry.event}`).slice(0, 10)
        : []
    const checklist = [
      'Instruction captured',
      'Payload hashed',
      'Intent canonicalized',
      'Settlement observed',
      'Attachment decision sealed',
      'Merkle root committed',
    ]
    const pdf = simplePdfFromLines('Audit Evidence Pack', [
      `Evidence pack: ${pack.evidence_pack_id}`,
      `Created at: ${pack.created_at}`,
      `Mode: ${apiTrimmedString(pack.mode) || 'N/A'}`,
      `Contract id: ${apiTrimmedString(pack.contract_id) || 'N/A'}`,
      `Ruleset version: ${apiTrimmedString(pack.ruleset_version) || 'N/A'}`,
      `Cryptographic root: ${apiTrimmedString(pack.merkle_root) || 'N/A'}`,
      `Dispute reason: ${disputeReason}`,
      `Checklist: ${checklist.join(' | ')}`,
      ...events.map((line) => `Timeline: ${line}`),
    ])
    const res = new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="audit-evidence-${packRef}.pdf"`,
        'cache-control': 'no-store',
      },
    })
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  if (exportType === 'BANK_PSP_PACK') {
    const ws = XLSX.utils.json_to_sheet([
      {
        UTR: utr,
        'Client Reference ID': packPaymentReference(pack),
        'Value Date': pack.created_at,
        'Clearing Ledger Record': apiTrimmedString(pack.pack_status) || 'N/A',
        'Variance Issue Log': apiTrimmedString(pack.proof_status) || 'N/A',
        'Processing Status': apiTrimmedString(pack.pack_status) || 'N/A',
        'Dispute Reason': disputeReason,
      },
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bank_PSP_Dispute')
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const res = new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="bank-psp-dispute-${packRef}.xlsx"`,
        'cache-control': 'no-store',
      },
    })
    applyEvidenceGateCookies(res, gate.refreshedPayload)
    return res
  }

  const raw = {
    export_type: exportType,
    dispute_reason: disputeReason,
    payment_reference: paymentReference,
    generated_at: new Date().toISOString(),
    evidence_pack: pack,
  }
  const res = new NextResponse(JSON.stringify(raw, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="technical-payload-${packRef}.json"`,
      'cache-control': 'no-store',
    },
  })
  applyEvidenceGateCookies(res, gate.refreshedPayload)
  return res
}
