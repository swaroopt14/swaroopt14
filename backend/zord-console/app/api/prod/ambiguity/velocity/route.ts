import { NextRequest, NextResponse } from 'next/server'
import { forwardIntelligence } from '../../intelligence/_shared'

export const dynamic = 'force-dynamic'

/** Ambiguity Velocity scatter — separate from dashboard/ambiguity KPIs. */
export async function GET(request: NextRequest) {
  const res = await forwardIntelligence(request, '/v1/intelligence/timeseries/ambiguity-velocity')
  if (res.status === 200) return res
  return NextResponse.json(
    {
      data_available: false as const,
      reason: 'Ambiguity velocity timeseries not available yet.',
    },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
}
