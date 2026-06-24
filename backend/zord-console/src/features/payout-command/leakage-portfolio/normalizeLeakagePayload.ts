import type { LeakageKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { coerceMinor } from './utils/formatMinorInr'

export type PortfolioLeakageViewModel = {
  totalSettledMinor: number
  intendedMinor: number
  underSettlementMinor: number
  unmatchedMinor: number
  orphanMinor: number
  reversalMinor: number
  ambiguousRiskMinor: number
  riskAdjustedMinor: number
  /** Open financial exception value from API `total_amount_minor` only — null when missing. */
  openFinancialExceptionValueMinor: number | null
  /** Exposure amount — leakage `unmatched_amount_minor`. */
  exposureAmountMinor: number
  /** @deprecated use exposureAmountMinor */
  valueNeedingReviewMinor: number
  paymentGapRate: number | null
  leakageFraction: number
  riskTier: string
  tenantId: string
  snapshotId: string
  computedAt: string
  windowStart: string
  windowEnd: string
}

export function toPortfolioLeakageViewModel(leak: LeakageKpiResolved): PortfolioLeakageViewModel {
  const unmatchedMinor = coerceMinor(leak.unmatched_amount_minor)
  const underSettlementMinor = coerceMinor(leak.under_settlement_amount_minor)
  const orphanMinor = coerceMinor(leak.orphan_amount_minor)
  const reversalMinor = coerceMinor(leak.reversal_exposure_minor)
  const ambiguousRiskMinor = coerceMinor(leak.ambiguous_value_at_risk_minor)
  const paymentGapRate =
    leak.leakage_percentage != null && Number.isFinite(Number(leak.leakage_percentage))
      ? Number(leak.leakage_percentage)
      : null
  const totalAmountRaw = leak.total_amount_minor
  const openFinancialExceptionValueMinor =
    totalAmountRaw != null && String(totalAmountRaw).trim() !== '' ? coerceMinor(totalAmountRaw) : null

  return {
    totalSettledMinor: coerceMinor(leak.total_observed_settled_amount_minor),
    intendedMinor: coerceMinor(leak.total_intended_amount_minor),
    underSettlementMinor,
    unmatchedMinor,
    orphanMinor,
    reversalMinor,
    ambiguousRiskMinor,
    riskAdjustedMinor: coerceMinor(leak.risk_adjusted_leakage_minor),
    openFinancialExceptionValueMinor,
    exposureAmountMinor: unmatchedMinor,
    valueNeedingReviewMinor: unmatchedMinor,
    paymentGapRate,
    leakageFraction: paymentGapRate ?? 0,
    riskTier: leak.risk_tier ?? 'N/A',
    tenantId: leak.tenant_id,
    snapshotId: leak.snapshot_id ?? '—',
    computedAt: leak.computed_at ?? '',
    windowStart: leak.window_start ?? '',
    windowEnd: leak.window_end ?? '',
  }
}
