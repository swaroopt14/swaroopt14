import { NextRequest, NextResponse } from 'next/server'
import { BACKEND_SERVICES } from '@/config/api.endpoints'
import type { LeakageKpiResponse } from '@/services/payout-command/prod-api/intelligenceTypes'

export const dynamic = 'force-dynamic'

/**
 * KPI 2 — Total observed settled volume ("Total Disbursement Value" on Home center).
 *
 * Doc: `docs/next-iteration-gaps.md` §8.1 — `total_observed_settled_volume` is the canonical
 * name; zord-intelligence does not yet expose it as its own JSON field. It is derived from
 * the **leakage** dashboard (16-KPI doc: KPIs 1–6 share `GET /v1/intelligence/dashboard/leakage`).
 *
 * Formula kept in sync with `HomeSurface.tsx`: intended − unmatched − under_settlement (minor units).
 */
function deriveTotalObservedSettledVolumeMinor(leakage: {
  total_intended_amount_minor: string
  unmatched_amount_minor: string
  under_settlement_amount_minor: string
}): { valueMinor: string; intended: number; unmatched: number; underSettlement: number } {
  const intended = Number(leakage.total_intended_amount_minor)
  const unmatched = Number(leakage.unmatched_amount_minor) || 0
  const underSettlement = Number(leakage.under_settlement_amount_minor) || 0
  if (!Number.isFinite(intended)) {
    return { valueMinor: '0', intended: 0, unmatched, underSettlement }
  }
  const observed = Math.max(0, Math.round(intended - unmatched - underSettlement))
  return { valueMinor: String(observed), intended, unmatched, underSettlement }
}

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get('tenant_id')?.trim() ?? ''
  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
  }

  const upstreamPath = BACKEND_SERVICES.INTELLIGENCE.ENDPOINTS.LEAKAGE
  const url = `${BACKEND_SERVICES.INTELLIGENCE.BASE_URL}${upstreamPath}?tenant_id=${encodeURIComponent(tenantId)}`

  let upstream: Response
  try {
    upstream = await fetch(url, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': tenantId,
      },
      cache: 'no-store',
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'intelligence service unreachable',
        details: error instanceof Error ? error.message : 'unknown',
      },
      { status: 502 },
    )
  }

  const raw = await upstream.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return new NextResponse(raw, {
      status: upstream.status >= 400 ? upstream.status : 502,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  const leakage = parsed as LeakageKpiResponse

  const baseMeta = {
    kpi_id: 'KPI_2',
    kpi_key: 'total_observed_settled_volume',
    label: 'Total Disbursement Value',
    /** Same contract as other intelligence tiles — mirrors upstream leakage. */
    upstream: {
      service: 'zord-intelligence',
      method: 'GET',
      path: upstreamPath,
      /** KPIs 1–6 in the 16-KPI mapping (`docs/next-iteration-gaps.md`). */
      sixteen_kpi_slice: 'KPIs_1_through_6',
    },
    /** KPI 2 is not a separate field on the leakage JSON yet; see gaps doc §8.1. */
    derivation: 'total_intended_amount_minor - unmatched_amount_minor - under_settlement_amount_minor',
    home_surface_note: 'Matches HomeSurface hero computation.',
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        ...baseMeta,
        data_available: false,
        status: upstream.status,
        upstream_body: typeof parsed === 'object' && parsed !== null ? parsed : { raw },
      },
      { status: upstream.status },
    )
  }

  if (!leakage || typeof leakage !== 'object') {
    return NextResponse.json(
      { ...baseMeta, data_available: false, reason: 'invalid_upstream_json', tenant_id: tenantId },
      { status: 502 },
    )
  }

  if (leakage.data_available !== true) {
    return NextResponse.json({
      ...baseMeta,
      data_available: false,
      reason: 'reason' in leakage ? leakage.reason : 'no_leakage_snapshot',
      tenant_id: tenantId,
    })
  }

  const { valueMinor } = deriveTotalObservedSettledVolumeMinor(leakage)

  return NextResponse.json({
    ...baseMeta,
    data_available: true,
    tenant_id: leakage.tenant_id,
    snapshot_id: leakage.snapshot_id,
    computed_at: leakage.computed_at,
    total_observed_settled_volume_minor: valueMinor,
    components: {
      total_intended_amount_minor: leakage.total_intended_amount_minor,
      unmatched_amount_minor: leakage.unmatched_amount_minor,
      under_settlement_amount_minor: leakage.under_settlement_amount_minor,
    },
  })
}
