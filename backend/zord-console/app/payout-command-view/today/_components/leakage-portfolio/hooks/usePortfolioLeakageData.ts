'use client'

import { useMemo } from 'react'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { DefensibilityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { toPortfolioLeakageViewModel, type PortfolioLeakageViewModel } from '../normalizeLeakagePayload'

export function usePortfolioLeakageData(tenantReady: boolean, batchId?: string) {
  const { leakage, ambiguity, defensibility, loading, lastFetchedAt, refresh } = useIntelligenceKpis({ tenantReady, batchId })

  const leak = isDataAvailable(leakage) ? leakage : null
  const amb = isDataAvailable(ambiguity) ? ambiguity : null
  const def = isDataAvailable(defensibility) ? defensibility : null

  const viewModel: PortfolioLeakageViewModel | null = useMemo(() => {
    if (!leak) return null
    const base = toPortfolioLeakageViewModel(leak)
    return {
      ...base,
      valueNeedingReviewMinor:
        amb && amb.value_at_risk_minor != null && amb.value_at_risk_minor !== ''
          ? Number.isFinite(Number(amb.value_at_risk_minor))
            ? Number(amb.value_at_risk_minor)
            : null
          : null,
    }
  }, [leak, amb])

  return {
    viewModel,
    leak,
    ambiguity: amb,
    defensibility: def as DefensibilityKpiResolved | null,
    loading,
    lastFetchedAt,
    refresh,
    hasData: Boolean(viewModel),
    emptyReason: leakage && !isDataAvailable(leakage) ? leakage.reason : undefined,
  }
}
