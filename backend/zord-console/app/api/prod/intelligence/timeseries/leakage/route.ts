import { NextRequest } from 'next/server'
import { forwardIntelligence } from '../../_shared'

export const dynamic = 'force-dynamic'

/** Proxies leakage exposure time series; upstream may return data_available: false until shipped. */
export async function GET(request: NextRequest) {
  return forwardIntelligence(request, '/v1/intelligence/timeseries/leakage-exposure')
}
