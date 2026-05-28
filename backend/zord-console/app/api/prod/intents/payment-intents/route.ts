import { NextRequest, NextResponse } from 'next/server'
import { fetchIntents, type BackendIntent } from '@/services/backend/intents'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  TENANT_MISMATCH_BODY,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

function inferRailHint(intent: BackendIntent): string | undefined {
  const beneficiary = intent.beneficiary as { instrument?: unknown } | undefined
  const instrumentKind =
    typeof beneficiary?.instrument === 'object' &&
    beneficiary?.instrument &&
    typeof (beneficiary.instrument as { kind?: unknown }).kind === 'string'
      ? String((beneficiary.instrument as { kind?: string }).kind || '')
      : ''

  const candidates = [
    String(intent.provider_hint ?? ''),
    String(intent.beneficiary_type ?? ''),
    instrumentKind,
  ]
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)

  for (const value of candidates) {
    if (value.includes('RTGS')) return 'RTGS'
    if (value.includes('NEFT')) return 'NEFT'
    if (value.includes('NACH')) return 'NACH'
    if (value.includes('IMPS')) return 'IMPS'
    if (value.includes('UPI')) return 'UPI'
    if (value.includes('LSM') || value.includes('INSTA')) return 'LSM'
  }
  return undefined
}

/** BFF: GET /api/prod/intents/payment-intents?batch_id= (session-tenant scoped, enriched fields). */
export async function GET(request: NextRequest) {
  const batchId = request.nextUrl.searchParams.get('batch_id')?.trim()
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response

  const queryTenant = request.nextUrl.searchParams.get('tenant_id')?.trim()
  if (queryTenant && queryTenant !== gate.tenantId) {
    const res = NextResponse.json(TENANT_MISMATCH_BODY, { status: 403 })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }

  if (!batchId) {
    const res = NextResponse.json({ error: 'batch_id query parameter is required' }, { status: 400 })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }

  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(
    500,
    Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page_size') ?? '200', 10) || 200),
  )

  try {
    const response = await fetchIntents({
      page,
      page_size: pageSize,
      tenant_id: gate.tenantId,
      batch_id: batchId,
    })

    const items = (response.items ?? []).map((intent) => {
      const aggregate =
        typeof intent.aggregate_confidence_score === 'number' && Number.isFinite(intent.aggregate_confidence_score)
          ? intent.aggregate_confidence_score
          : null
      const fallback =
        typeof intent.confidence_score === 'number' && Number.isFinite(intent.confidence_score)
          ? intent.confidence_score
          : null
      const intentQualityScore =
        typeof intent.intent_quality_score === 'number' && Number.isFinite(intent.intent_quality_score)
          ? intent.intent_quality_score
          : aggregate ?? fallback

      return {
        tenant_id: intent.tenant_id,
        amount: intent.amount,
        currency: intent.currency,
        intended_execution_at: intent.intended_execution_at ?? intent.deadline_at ?? null,
        provider_hint: intent.provider_hint ?? null,
        intent_quality_score: intentQualityScore,
        intent_id: intent.intent_id,
        envelope_id: intent.envelope_id,
        batch_id: intent.batch_id ?? null,
        client_payout_ref: intent.client_payout_ref ?? null,
        client_batch_ref: intent.client_batch_ref ?? intent.batch_id ?? null,
        source_row_num: intent.source_row_num ?? null,
        beneficiary_type: intent.beneficiary_type ?? null,
        beneficiary: intent.beneficiary ?? null,
        rail_hint: inferRailHint(intent) ?? null,
      }
    })

    const res = NextResponse.json({
      items,
      pagination: response.pagination,
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        items: [],
        pagination: {
          page,
          page_size: pageSize,
          total: 0,
        },
        error: error instanceof Error ? error.message : 'Failed to fetch payment intents',
      },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
