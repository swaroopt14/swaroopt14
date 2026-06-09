import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  TENANT_MISMATCH_BODY,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

type UpstreamIntent = {
  tenant_id?: string
  amount?: string | number
  currency?: string
  intended_execution_at?: string | null
  provider_hint?: string | null
  intent_quality_score?: number
  aggregate_confidence_score?: number
  confidence_score?: number
  intent_id?: string
  envelope_id?: string
  batchid?: string | null
  batch_id?: string | null
  client_payout_ref?: string | null
  client_batch_ref?: string | null
  source_row_num?: number | null
  beneficiary_type?: string | null
  beneficiary?: Record<string, unknown> | null
}

function inferRailHint(intent: UpstreamIntent): string | undefined {
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

function mapUpstreamIntent(intent: UpstreamIntent, batchId: string) {
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

  const resolvedBatchId =
    (typeof intent.batchid === 'string' && intent.batchid.trim()) ||
    (typeof intent.batch_id === 'string' && intent.batch_id.trim()) ||
    batchId

  return {
    tenant_id: intent.tenant_id,
    amount: intent.amount,
    currency: intent.currency,
    intended_execution_at: intent.intended_execution_at ?? null,
    provider_hint: intent.provider_hint ?? null,
    intent_quality_score: intentQualityScore,
    intent_id: intent.intent_id,
    envelope_id: intent.envelope_id,
    batch_id: resolvedBatchId,
    client_payout_ref: intent.client_payout_ref ?? null,
    client_batch_ref: intent.client_batch_ref ?? resolvedBatchId,
    source_row_num: intent.source_row_num ?? null,
    beneficiary_type: intent.beneficiary_type ?? null,
    beneficiary: intent.beneficiary ?? null,
    rail_hint: inferRailHint(intent) ?? null,
  }
}

/** BFF: GET /api/prod/intents/payment-intents?batch_id= → zord-intent-engine batch-scoped list. */
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

  const upstreamParams = new URLSearchParams({
    tenant_id: gate.tenantId,
    batch_id: batchId,
  })
  const url = `${BACKEND_SERVICES.INTENT_ENGINE.BASE_URL}/api/prod/intents/payment-intents?${upstreamParams.toString()}`

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': gate.tenantId,
        'tenant-id': gate.tenantId,
        tenant_id: gate.tenantId,
        batch_id: batchId,
      },
      cache: 'no-store',
    })

    const text = await upstream.text()
    if (!upstream.ok) {
      const res = new NextResponse(text, {
        status: upstream.status,
        headers: {
          'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    let body: { items?: UpstreamIntent[]; pagination?: { page?: number; page_size?: number; total?: number } }
    try {
      body = text ? (JSON.parse(text) as typeof body) : { items: [] }
    } catch {
      const res = NextResponse.json({ error: 'Invalid upstream response' }, { status: 502 })
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    const items = (body.items ?? []).map((intent) => mapUpstreamIntent(intent, batchId))
    const pagination = body.pagination ?? {
      page: 1,
      page_size: items.length,
      total: items.length,
    }

    const res = NextResponse.json({ items, pagination })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      {
        items: [],
        pagination: { page: 1, page_size: 0, total: 0 },
        error: error instanceof Error ? error.message : 'Failed to fetch payment intents',
      },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
