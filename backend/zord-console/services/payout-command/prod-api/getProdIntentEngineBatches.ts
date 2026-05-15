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

function batchesUrl(
  tenantId: string | undefined,
  extra?: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams()
  const tid = tenantId?.trim()
  if (tid) params.set('tenant_id', tid)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== '') params.set(k, String(v))
    }
  }
  const qs = params.toString()
  return qs ? `${BATCHES_PATH}?${qs}` : BATCHES_PATH
}

/**
 * Sidebar list — BFF resolves `tenant_id` from session cookies when omitted.
 * Prefer this when the client hook has not yet resolved a tenant string.
 */
export async function getProdIntentEngineBatchesForSession(): Promise<IntentEngineBatchesListResponse | null> {
  return fetchProdJsonGet<IntentEngineBatchesListResponse>(batchesUrl(undefined))
}

/** Sidebar list with explicit tenant (must match session on BFF). */
export async function getProdIntentEngineBatches(
  tenantId: string,
): Promise<IntentEngineBatchesListResponse | null> {
  const tid = tenantId.trim()
  if (!tid) return getProdIntentEngineBatchesForSession()
  return fetchProdJsonGet<IntentEngineBatchesListResponse>(batchesUrl(tid))
}

/** Batch drill-down — BFF session tenant when `tenantId` omitted. */
export async function getProdIntentEngineBatchDetail(
  tenantId: string | undefined,
  batchId: string,
  opts?: { page?: number; pageSize?: number },
): Promise<IntentEngineBatchesDetailResponse | null> {
  const bid = batchId.trim()
  if (!bid) return null
  const tid = tenantId?.trim()
  return fetchProdJsonGet<IntentEngineBatchesDetailResponse>(
    batchesUrl(tid || undefined, {
      batch_id: bid,
      page: opts?.page ?? 1,
      page_size: opts?.pageSize ?? 20,
    }),
  )
}
