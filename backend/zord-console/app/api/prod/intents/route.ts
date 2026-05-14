import { NextRequest, NextResponse } from 'next/server'
import { fetchIntents } from '@/services/backend/intents'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('page_size') || '50', 10)
    const status = searchParams.get('status') || undefined
    const batchId = searchParams.get('batch_id') || undefined

    const response = await fetchIntents({
      page,
      page_size: pageSize,
      status,
      tenant_id: tenantId,
      batch_id: batchId,
    })

    const items = (response.items ?? []).map((intent) => ({
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
      items,
      pagination: response.pagination,
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json({
      items: [],
      pagination: {
        page: 1,
        page_size: 50,
        total: 0,
      },
      error: error instanceof Error ? error.message : 'Failed to fetch intents',
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
