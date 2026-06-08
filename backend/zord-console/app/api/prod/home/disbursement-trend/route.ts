import { NextRequest, NextResponse } from 'next/server'
import { fetchIntents } from '@/services/backend/intents'
import {
  aggregateIntentsToTrend,
  trendWindowBounds,
} from '@/services/payout-command/prod-api/aggregateIntentsToTrend'
import type {
  DisbursementTrendRange,
  DisbursementTrendResponse,
} from '@/services/payout-command/prod-api/disbursementTrendTypes'
import {
  applyRefreshedSessionCookies,
  requireSessionTenantForProdProxy,
} from '@/services/auth/resolvePayoutTenant.server'

export const dynamic = 'force-dynamic'

const RANGES: DisbursementTrendRange[] = ['week', 'month', 'quarter', 'year']
const PAGE_SIZE = 400
const MAX_PAGES = 8

/**
 * Temporary aggregation for the home trend chart: pulls paginated intents from
 * **zord-intent-engine** and buckets by `created_at`. Tenant is session-scoped.
 */
export async function GET(request: NextRequest) {
  const gate = await requireSessionTenantForProdProxy(request)
  if (!gate.ok) return gate.response
  const tenantId = gate.tenantId

  const rangeRaw = (request.nextUrl.searchParams.get('range') || 'month').toLowerCase()
  const range = rangeRaw as DisbursementTrendRange

  if (!RANGES.includes(range)) {
    return NextResponse.json(
      { error: 'range must be one of: week, month, quarter, year' },
      { status: 400 },
    )
  }

  const { from } = trendWindowBounds(range)
  const windowStartMs = from.getTime()
  const items: Awaited<ReturnType<typeof fetchIntents>>['items'] = []

  const first = await fetchIntents({ tenant_id: tenantId, page: 1, page_size: PAGE_SIZE })
  const firstBatch = first.items ?? []
  items.push(...firstBatch)

  const total = first.pagination?.total ?? firstBatch.length
  const totalPages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(total / PAGE_SIZE)))

  const oldestOnPage = (batch: typeof firstBatch) => {
    const last = batch[batch.length - 1]
    return last?.created_at ? Date.parse(last.created_at) : Number.NaN
  }

  let reachedHistory = firstBatch.length < PAGE_SIZE || oldestOnPage(firstBatch) < windowStartMs

  if (!reachedHistory && totalPages > 1) {
    const extraPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
    const pageResults = await Promise.all(
      extraPages.map((page) => fetchIntents({ tenant_id: tenantId, page, page_size: PAGE_SIZE })),
    )
    for (const res of pageResults) {
      const batch = res.items ?? []
      if (!batch.length) continue
      items.push(...batch)
      if (batch.length < PAGE_SIZE || oldestOnPage(batch) < windowStartMs) break
    }
  }

  const buckets = aggregateIntentsToTrend(items, range)
  const body: DisbursementTrendResponse = {
    data_available: buckets.some((b) => b.intent_count > 0 && b.total_amount > 0),
    range,
    currency: 'INR',
    buckets,
    source: 'intent_engine_aggregate',
    note: `Aggregated from up to ${MAX_PAGES * PAGE_SIZE} intents (newest-first, window-clipped). Dedicated time-series API recommended for production.`,
  }

  const res = NextResponse.json(body)
  applyRefreshedSessionCookies(res, gate.refreshedPayload)
  return res
}
