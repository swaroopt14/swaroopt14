import { NextRequest, NextResponse } from 'next/server'
import { fetchDLQItems } from '@/services/backend/dlq'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const tenantId = searchParams.get('tenant_id') || undefined

    // Fetch from real backend (zord-intent-engine)
    const items = await fetchDLQItems({ tenant_id: tenantId })

    // Transform backend response to match frontend DLQItem type
    const transformedItems = items.map((item) => ({
      dlq_id: item.dlq_id,
      envelope_id: item.envelope_id,
      stage: item.stage,
      reason_code: item.reason_code,
      error_detail: item.error_detail,
      replayable: item.replayable,
      created_at: item.created_at,
      tenant_id: item.tenant_id,
    }))

    return NextResponse.json({
      items: transformedItems,
      pagination: {
        page: 1,
        page_size: transformedItems.length,
        total: transformedItems.length,
      },
    })
  } catch (error) {
    console.error('Error fetching DLQ items from backend:', error)

    // Return empty response on error (no mock data)
    return NextResponse.json({
      items: [],
      pagination: {
        page: 1,
        page_size: 50,
        total: 0,
      },
      error: error instanceof Error ? error.message : 'Failed to fetch DLQ items',
    })
  }
}
