import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiDlqRow } from './prodApiTypes'

/** Matches zord-intent-engine `models.BatchSidebarItem` JSON. */
export type IntentEngineBatchSidebarItem = {
  batchId: string
  type: string
  totalValue: string
  transactions: number
  confirmedCount: number
  highConfidenceCount?: number
  mismatchCount: number
  unresolvedCount: number
}

export type IntentEnginePagination = {
  page?: number
  page_size?: number
  total?: number
}

export type PaymentIntentRecord = {
  intent_id: string
  envelope_id?: string
  tenant_id?: string
  amount?: string | number
  currency?: string
  status?: string
  created_at?: string
  updated_at?: string
  beneficiary_type?: string
  client_payout_ref?: string
  governance_state?: string
  business_state?: string
  duplicate_risk_flag?: boolean
  aggregate_confidence_score?: number
  constraints?: { execution_window?: string }
  beneficiary?: {
    instrument?: { kind?: string }
  }
}

export type IntentEngineBatchesListResponse = {
  items: IntentEngineBatchSidebarItem[]
}

export type IntentEngineBatchesDetailResponse = {
  items: IntentEngineBatchSidebarItem[]
  batchDetails: {
    batchId: string
    paymentIntents: {
      items: PaymentIntentRecord[]
      pagination: IntentEnginePagination
    }
    dlqItems: {
      items: ApiDlqRow[]
      pagination: IntentEnginePagination
    }
  }
}

const BATCHES_PATH = '/api/prod/intents/batches'

function batchesUrl(tenantId: string, extra?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams({ tenant_id: tenantId.trim() })
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== '') params.set(k, String(v))
    }
  }
  return `${BATCHES_PATH}?${params.toString()}`
}

/** Sidebar list — `GET /api/prod/intents/batches?tenant_id=…` (session-validated on BFF). */
export async function getProdIntentEngineBatches(
  tenantId: string,
): Promise<IntentEngineBatchesListResponse | null> {
  const tid = tenantId.trim()
  if (!tid) return null
  return fetchProdJsonGet<IntentEngineBatchesListResponse>(batchesUrl(tid))
}

/** Batch drill-down — same endpoint with `batch_id`, `page`, `page_size`. */
export async function getProdIntentEngineBatchDetail(
  tenantId: string,
  batchId: string,
  opts?: { page?: number; pageSize?: number },
): Promise<IntentEngineBatchesDetailResponse | null> {
  const tid = tenantId.trim()
  const bid = batchId.trim()
  if (!tid || !bid) return null
  return fetchProdJsonGet<IntentEngineBatchesDetailResponse>(
    batchesUrl(tid, {
      batch_id: bid,
      page: opts?.page ?? 1,
      page_size: opts?.pageSize ?? 20,
    }),
  )
}
