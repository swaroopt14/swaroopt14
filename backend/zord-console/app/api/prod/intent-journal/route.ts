import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { fetchDLQItems } from '@/services/backend/dlq'
import type { BackendDLQItem } from '@/services/backend/dlq'
import { fetchIntents } from '@/services/backend/intents'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

async function fetchIntelligenceJson(url: string, tenantId: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
      },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

/**
 * Composed feed for the payout Intent Journal: intelligence batches (+ optional
 * batch detail), scoped intents from intent-engine, and DLQ rows for the tenant.
 * Tenant is taken from the signed-in session only (query tenant_id is ignored).
 */
export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  const batchId = request.nextUrl.searchParams.get('batch_id')?.trim() || undefined

  try {
    const intelBase = BACKEND_SERVICES.INTELLIGENCE.BASE_URL
    const batchesUrl = `${intelBase}${BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.BATCHES}?tenant_id=${encodeURIComponent(tenantId)}&limit=100`

    const [intentsRes, dlqRaw, batchesJson] = await Promise.all([
      fetchIntents({ tenant_id: tenantId, batch_id: batchId }),
      fetchDLQItems({ tenant_id: tenantId }),
      fetchIntelligenceJson(batchesUrl, tenantId),
    ])

    let batch_detail: unknown = null
    if (batchId) {
      const detailUrl = `${intelBase}${BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.BATCH_BY_ID(batchId)}?tenant_id=${encodeURIComponent(tenantId)}`
      batch_detail = await fetchIntelligenceJson(detailUrl, tenantId)
    }

    const dlqList: BackendDLQItem[] = Array.isArray(dlqRaw) ? dlqRaw : []
    const dlqItems = dlqList.map((item) => ({
      dlq_id: item.dlq_id,
      envelope_id: item.envelope_id,
      stage: item.stage,
      reason_code: item.reason_code,
      error_detail: item.error_detail,
      replayable: item.replayable,
      created_at: item.created_at,
      tenant_id: item.tenant_id,
    }))

    const items = (intentsRes.items ?? []).map((intent) => ({
      intent_id: intent.intent_id,
      intent_type: intent.intent_type,
      source: intent.intent_type || 'API',
      amount: intent.amount,
      currency: intent.currency,
      instrument: intent.beneficiary_type || 'BANK',
      status: intent.status,
      confidence_score: intent.confidence_score,
      created_at: intent.created_at,
      envelope_id: intent.envelope_id,
      tenant_id: intent.tenant_id,
      batch_id: intent.batch_id,
    }))

    const res = NextResponse.json({
      batches: batchesJson,
      batch_detail,
      intents: { items, pagination: intentsRes.pagination },
      dlq: { items: dlqItems },
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        batches: null,
        batch_detail: null,
        intents: { items: [], pagination: { page: 1, page_size: 0, total: 0 } },
        dlq: { items: [] },
        error: error instanceof Error ? error.message : 'Failed to load intent journal',
      },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
