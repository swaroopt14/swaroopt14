import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
  TENANT_MISMATCH_BODY,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

const ENGINE = BACKEND_SERVICES.INTENT_ENGINE.BASE_URL

type BatchIdItem = { batch_id?: string }
type LitePaymentIntent = Record<string, unknown>
type LiteDlqItem = Record<string, unknown>

function tenantHeaders(tenantId: string, batchId?: string): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-tenant-id': tenantId,
    'tenant-id': tenantId,
    tenant_id: tenantId,
    ...(batchId ? { batch_id: batchId } : {}),
  }
}

async function engineGet(path: string, tenantId: string, batchId?: string) {
  const url = `${ENGINE}${path}`
  const res = await fetch(url, {
    method: 'GET',
    headers: tenantHeaders(tenantId, batchId),
    cache: 'no-store',
  })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text }
    }
  }
  return { status: res.status, body }
}

function mapBatchIdToSidebarItem(item: BatchIdItem) {
  const batchId = String(item.batch_id ?? '').trim()
  return {
    batchId,
    type: 'PAYMENT',
    totalValue: '0',
    transactions: 0,
    confirmedCount: 0,
    mismatchCount: 0,
    unresolvedCount: 0,
  }
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length
  const start = (page - 1) * pageSize
  const slice = items.slice(start, start + pageSize)
  return {
    items: slice,
    pagination: { page, page_size: pageSize, total },
  }
}

/**
 * Legacy composite: GET /api/prod/intents/batches
 * Intent-engine now exposes split routes; this BFF rebuilds the old shape for
 * batch command center and other callers still on /batches.
 */
export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  const queryTenant = request.nextUrl.searchParams.get('tenant_id')?.trim()
  if (queryTenant && queryTenant !== tenantId) {
    const res = NextResponse.json(TENANT_MISMATCH_BODY, { status: 403 })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }

  const batchId = request.nextUrl.searchParams.get('batch_id')?.trim()
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(
    200,
    Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page_size') ?? '20', 10) || 20),
  )

  try {
    const idsRes = await engineGet('/api/prod/intents/batch-ids', tenantId)
    if (idsRes.status >= 500) {
      const res = NextResponse.json(
        { error: 'intent-engine error', upstream_status: idsRes.status },
        { status: 502 },
      )
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }
    if (idsRes.status >= 400) {
      const res = NextResponse.json(idsRes.body ?? { error: 'upstream error' }, { status: idsRes.status })
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    const idItems = ((idsRes.body as { items?: BatchIdItem[] })?.items ?? []).map(mapBatchIdToSidebarItem)

    if (!batchId) {
      const res = NextResponse.json({ items: idItems })
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    const [piRes, dlqRes] = await Promise.all([
      engineGet('/api/prod/intents/payment-intents', tenantId, batchId),
      engineGet('/api/prod/intents/dlq-items', tenantId, batchId),
    ])

    if (piRes.status >= 500 || dlqRes.status >= 500) {
      const res = NextResponse.json({ error: 'intent-engine error' }, { status: 502 })
      applyRefreshedSessionCookies(res, gate.refreshedPayload)
      return res
    }

    const paymentItems = ((piRes.body as { items?: LitePaymentIntent[] })?.items ?? []) as LitePaymentIntent[]
    const dlqItems = ((dlqRes.body as { items?: LiteDlqItem[] })?.items ?? []) as LiteDlqItem[]

    const paymentSection = paginate(paymentItems, page, pageSize)
    const dlqSection = paginate(dlqItems, page, pageSize)

    const res = NextResponse.json({
      items: idItems,
      batchDetails: {
        batchId,
        paymentIntents: paymentSection,
        dlqItems: dlqSection,
      },
    })
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  } catch (error) {
    const res = NextResponse.json(
      { error: 'intent-engine unreachable', details: error instanceof Error ? error.message : 'unknown' },
      { status: 502 },
    )
    applyRefreshedSessionCookies(res, gate.refreshedPayload)
    return res
  }
}
