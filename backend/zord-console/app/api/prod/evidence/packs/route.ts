import { NextRequest } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import { forwardEvidence } from '../_shared'

export const dynamic = 'force-dynamic'

// GET /api/prod/evidence/packs?tenant_id=…&batch_id=…&intent_id=…
// Forwards to zord-evidence GET /v1/evidence/packs with the same query string.
export async function GET(request: NextRequest) {
  return forwardEvidence(request, BACKEND_SERVICES.EVIDENCE.ENDPOINTS.PACKS)
}
