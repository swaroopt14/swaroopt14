import type { DefensibilityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'

export function deriveRiskScore(
  data: PortfolioLeakageViewModel,
  defensibility: DefensibilityKpiResolved | null,
): number {
  const tier = (data.riskTier ?? '').toUpperCase()
  const frac = data.leakageFraction > 1 ? data.leakageFraction / 100 : data.leakageFraction

  if ((tier === 'CLEAN' || tier === 'LOW') && frac < 0.02) return 99
  if (defensibility?.defensibility_score != null && Number.isFinite(defensibility.defensibility_score)) {
    return Math.round(Math.min(100, Math.max(0, defensibility.defensibility_score)))
  }
  if (tier === 'CRITICAL' || tier === 'HIGH') return 42
  if (tier === 'MEDIUM') return 68
  return 85
}
