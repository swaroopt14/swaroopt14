import { NextRequest, NextResponse } from 'next/server'
import { fetchIntents } from '@/services/backend/intents'

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('page_size') || '50', 10)
    const status = searchParams.get('status') || undefined
    const tenantId = searchParams.get('tenant_id') || undefined
    const batchId = searchParams.get('batch_id') || undefined
    // Defensive gate: never proxy without tenant_id. Intent-engine already
    // requires it; blocking here returns a faster error and prevents any
    // accidental cross-tenant leak if the upstream contract loosens.
    if (!tenantId) {
      return NextResponse.json(
        { items: [], pagination: { page: 1, page_size: 0, total: 0 }, error: 'tenant_id is required' },
        { status: 400 },
      )
    }

    // Fetch from real backend (zord-intent-engine)
    const response = await fetchIntents({
      page,
      page_size: pageSize,
      status,
      tenant_id: tenantId,
      batch_id: batchId,
    })

    // Transform backend response to match frontend types
    const items = response.items.map((intent) => ({
      intent_id: intent.intent_id,
      intent_type: intent.intent_type,
      source: intent.intent_type || 'API', // Map intent_type or default
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

    return NextResponse.json({
      items,
      pagination: response.pagination,
    })
  } catch (error) {
    console.error('Error fetching intents from backend:', error)

    // Return empty response on error (no mock data)
    return NextResponse.json({
      items: [],
      pagination: {
        page: 1,
        page_size: 50,
        total: 0,
      },
      error: error instanceof Error ? error.message : 'Failed to fetch intents',
    })
  }
}
