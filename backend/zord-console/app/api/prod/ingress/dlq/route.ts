import { NextResponse } from 'next/server'
import type { DLQData } from '@/types/ingress'

export const dynamic = 'force-dynamic'

/** Empty DLQ dashboard payload — no fabricated rows. Prefer `/api/prod/dlq` for list data. */
const EMPTY_DLQ: DLQData = {
  overview: {
    total_failures: 0,
    replayable: 0,
    non_replayable: 0,
    time_range: '24h',
  },
  by_channel: [],
  top_reasons: [],
  recent_failures: [],
}

export async function GET() {
  return NextResponse.json(EMPTY_DLQ)
}
