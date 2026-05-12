import { NextRequest, NextResponse } from 'next/server'
import { fetchIntents } from '@/services/backend/intents'
import { aggregateIntentsToTrend } from '@/services/payout-command/prod-api/aggregateIntentsToTrend'
import type {
  DisbursementTrendRange,
  DisbursementTrendResponse,
} from '@/services/payout-command/prod-api/disbursementTrendTypes'

export const dynamic = 'force-dynamic'

const RANGES: DisbursementTrendRange[] = ['week', 'month', 'quarter', 'year']

/**
 * Temporary aggregation for the home trend chart: pulls paginated intents from
 * **zord-intent-engine** and buckets by `created_at`. Replace with a dedicated
 * analytics endpoint when the backend team ships it (see product note in response).
 */
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenant_id')?.trim() ?? ''
  const rangeRaw = (request.nextUrl.searchParams.get('range') || 'month').toLowerCase()
  const range = rangeRaw as DisbursementTrendRange

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }
  if (!RANGES.includes(range)) {
    return NextResponse.json(
      { error: 'range must be one of: week, month, quarter, year' },
      { status: 400 },
    )
  }

  const pageSize = 400
  const maxPages = 8
  const items: Awaited<ReturnType<typeof fetchIntents>>['items'] = []

  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetchIntents({ tenant_id: tenantId, page, page_size: pageSize })
      items.push(...res.items)
      if (res.items.length < pageSize) break
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'intent_engine_error'
    const body: DisbursementTrendResponse = {
      data_available: false,
      range,
      currency: 'INR',
      buckets: [],
      source: 'intent_engine_aggregate',
      note: message,
    }
    return NextResponse.json(body, { status: 502 })
  }

  const buckets = aggregateIntentsToTrend(items, range)
  const body: DisbursementTrendResponse = {
    data_available: buckets.some((b) => b.intent_count > 0),
    range,
    currency: 'INR',
    buckets,
    source: 'intent_engine_aggregate',
    note: `Aggregated client-side from up to ${maxPages * pageSize} intents. Dedicated time-series API recommended for production.`,
  }

  return NextResponse.json(body)
}
