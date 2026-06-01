import { apiTrimmedString } from './coerceApiField'

export type ParsedDlqIntentContext = {
  amount: number
  beneficiaryName: string | null
  idempotencyKey: string | null
}

export function parseDlqIntentContext(raw: unknown): ParsedDlqIntentContext {
  if (!raw || typeof raw !== 'object') {
    return { amount: 0, beneficiaryName: null, idempotencyKey: null }
  }
  const ctx = raw as Record<string, unknown>
  const amountRaw = ctx.amount
  let amount = 0
  if (typeof amountRaw === 'number' && Number.isFinite(amountRaw)) {
    amount = amountRaw
  } else if (typeof amountRaw === 'string') {
    const n = Number.parseFloat(amountRaw.replace(/,/g, ''))
    if (Number.isFinite(n)) amount = n
  }
  return {
    amount,
    beneficiaryName: typeof ctx.beneficiary_name === 'string' ? ctx.beneficiary_name.trim() || null : null,
    idempotencyKey: typeof ctx.idempotency_key === 'string' ? ctx.idempotency_key.trim() || null : null,
  }
}

export function formatDlqStatusLabel(status?: string): string {
  const s = apiTrimmedString(status)
  if (!s) return 'Need to review'
  if (s === 'NEEDS_MANUAL_REVIEW') return 'Manual review'
  if (s === 'DLQ_TERMINAL') return 'Terminal DLQ'
  return s.replace(/_/g, ' ')
}

export function dlqItemMatchesBatch(
  item: { client_batch_ref?: string; batch_id?: string },
  batchId: string,
): boolean {
  const bid = batchId.trim()
  if (!bid) return false
  const ref = apiTrimmedString(item.client_batch_ref) || apiTrimmedString(item.batch_id)
  return ref === bid
}

export function mergeDlqItemsById<T extends { dlq_id?: string }>(primary: T[], secondary: T[]): T[] {
  const merged = new Map<string, T>()
  for (const item of [...secondary, ...primary]) {
    const id = apiTrimmedString(item.dlq_id)
    if (!id) continue
    const existing = merged.get(id)
    merged.set(id, existing ? { ...existing, ...item } : item)
  }
  return [...merged.values()]
}
