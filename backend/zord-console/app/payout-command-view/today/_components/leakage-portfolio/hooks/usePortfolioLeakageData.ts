'use client'

import { useMemo } from 'react'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { DefensibilityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { toPortfolioLeakageViewModel, type PortfolioLeakageViewModel } from '../normalizeLeakagePayload'

export function usePortfolioLeakageData(tenantReady: boolean, batchId?: string) {
  const { leakage, defensibility, loading, lastFetchedAt, refresh } = useIntelligenceKpis({ tenantReady, batchId })

  const leak = isDataAvailable(leakage) ? leakage : null
  const def = isDataAvailable(defensibility) ? defensibility : null

  const viewModel: PortfolioLeakageViewModel | null = useMemo(
    () => (leak ? toPortfolioLeakageViewModel(leak) : null),
    [leak],
  )

  return {
    viewModel,
    leak,
    defensibility: def as DefensibilityKpiResolved | null,
    loading,
    lastFetchedAt,
    refresh,
    hasData: Boolean(viewModel),
    emptyReason: leakage && !isDataAvailable(leakage) ? leakage.reason : undefined,
  }
}
