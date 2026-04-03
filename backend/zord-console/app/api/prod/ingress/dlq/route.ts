import { NextRequest, NextResponse } from 'next/server'
import { DLQData } from '@/types/ingress'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  await new Promise(resolve => setTimeout(resolve, 80))

  const mockData: DLQData = {
    overview: {
      total_failures: 181,
      replayable: 12,
      non_replayable: 169,
      time_range: '24h',
    },
    by_channel: [
      { channel: 'API', count: 147, percent: 81 },
      { channel: 'WEBHOOK', count: 67, percent: 37 },
      { channel: 'STREAM', count: 8, percent: 4 },
      { channel: 'BATCH', count: 9, percent: 5 },
    ],
    top_reasons: [
      { reason: 'Schema Validation', count: 85, percent: 47 },
      { reason: 'PII Tokenization', count: 42, percent: 23 },
      { reason: 'Authentication', count: 23, percent: 13 },
      { reason: 'Constraint Violation', count: 18, percent: 10 },
      { reason: 'Rate Limit', count: 13, percent: 7 },
    ],
    recent_failures: [
      { dlq_id: 'dlq_cab57eaa', envelope_id: 'env_20260113T122911Z_twyh', reason: 'Schema: $.beneficiary.ifsc missing', channel: 'API', tenant_name: 'acme_nbfc', timestamp: '2026-01-13T12:29:11Z', replayable: false },
      { dlq_id: 'dlq_d8f91b2c', envelope_id: 'env_20260113T123122Z_xyz1', reason: 'PII: Token service timeout', channel: 'WEBHOOK', tenant_name: 'foo_psp', timestamp: '2026-01-13T12:31:22Z', replayable: true },
      { dlq_id: 'dlq_e7a42d3f', envelope_id: 'env_20260113T123345Z_abc2', reason: 'Schema: amount type mismatch', channel: 'API', tenant_name: 'acme_nbfc', timestamp: '2026-01-13T12:33:45Z', replayable: false },
      { dlq_id: 'dlq_f6b53e4a', envelope_id: 'env_20260113T123500Z_def3', reason: 'Auth: Invalid API key', channel: 'API', tenant_name: 'bar_bank', timestamp: '2026-01-13T12:35:00Z', replayable: false },
      { dlq_id: 'dlq_a5c64f5b', envelope_id: 'env_20260113T123815Z_ghi4', reason: 'Schema: required field missing', channel: 'BATCH', tenant_name: 'xyz_wallet', timestamp: '2026-01-13T12:38:15Z', replayable: false },
    ],
  }

  return NextResponse.json(mockData)
}
