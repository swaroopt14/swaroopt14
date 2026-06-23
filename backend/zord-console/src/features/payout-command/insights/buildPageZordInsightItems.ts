import type {
  AmbiguityKpiResolved,
  LeakageKpiResolved,
  PatternsKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { fmtInrFromMinorExact } from '../command-center/commandCenterFormat'
import { formatLeakageApiPct } from '../shared/formatApiKpiFields'
import type { ZordInsightItem } from '../shared/ZordInsightsPanel'

type MinorField = string | number | null | undefined

function readMinor(value: MinorField): number | null {
  if (value == null || String(value).trim() === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function formatMinor(value: MinorField): string {
  const minor = readMinor(value)
  return minor == null ? '—' : fmtInrFromMinorExact(minor)
}

function riskSeverity(tier: string | undefined): ZordInsightItem['severity'] {
  const normalized = tier?.toUpperCase()
  if (normalized === 'HIGH' || normalized === 'CRITICAL') return 'high'
  if (normalized === 'MEDIUM') return 'medium'
  return 'low'
}

const MAX_INSIGHTS = 6

/** Payment Gaps — insight list from leakage, ambiguity, and patterns APIs only. */
export function buildLeakagePageInsightItems(params: {
  leakage: LeakageKpiResolved | null
  ambiguity: AmbiguityKpiResolved | null
  patterns: PatternsKpiResolved | null
}): ZordInsightItem[] {
  const { leakage, ambiguity, patterns } = params
  const items: ZordInsightItem[] = []

  if (ambiguity?.intelligence_headline?.trim()) {
    items.push({
      title: ambiguity.intelligence_headline.trim(),
      detail: ambiguity.intelligence_body?.trim() || 'From ambiguity intelligence API.',
      severity: 'high',
      caseCount: ambiguity.ambiguous_intent_count,
    })
  }

  const openException = formatMinor(leakage?.total_amount_minor)
  if (openException !== '—') {
    items.push({
      title: 'Open financial exception value',
      detail: `${openException} in open exposure (total_amount_minor).`,
      severity: riskSeverity(leakage?.risk_tier),
      caseCount: patterns?.pending_count,
    })
  }

  if (leakage?.leakage_percentage != null) {
    const gapRate = `${leakage.leakage_percentage}%`
    if (gapRate !== '—') {
      items.push({
        title: 'Payment gap rate',
        detail: `Leakage percentage is ${gapRate} for this scope.`,
        severity: riskSeverity(leakage.risk_tier),
      })
    }
  }

  const unmatched = formatMinor(ambiguity?.value_at_risk_minor)
  if (unmatched !== '—') {
    items.push({
      title: 'Unmatched payment value',
      detail: `${unmatched} in intended payments without a settlement link.`,
      severity: 'medium',
      caseCount: ambiguity?.ambiguous_intent_count,
    })
  }

  const shortSettled = formatMinor(leakage?.under_settlement_amount_minor)
  if (shortSettled !== '—') {
    items.push({
      title: 'Short-settled value',
      detail: `${shortSettled} where settlement was below the instructed amount.`,
      severity: 'medium',
    })
  }

  const reversal = formatMinor(leakage?.reversal_exposure_minor)
  if (reversal !== '—') {
    items.push({
      title: 'Reversal exposure',
      detail: `${reversal} exposed to reversal risk.`,
      severity: 'medium',
    })
  }

  if (patterns && patterns.pending_count > 0) {
    items.push({
      title: 'Payments pending confirmation',
      detail: `${patterns.pending_count} of ${patterns.total_count} payment decisions still pending in batch signals.`,
      severity: 'medium',
      caseCount: patterns.pending_count,
    })
  }

  return items.slice(0, MAX_INSIGHTS)
}

/** Match Review — insight list from ambiguity, leakage, and patterns APIs only. */
export function buildMatchReviewInsightItems(params: {
  ambiguity: AmbiguityKpiResolved | null
  leakage: LeakageKpiResolved | null
  patterns: PatternsKpiResolved | null
}): ZordInsightItem[] {
  const { ambiguity, leakage, patterns } = params
  const items: ZordInsightItem[] = []

  if (ambiguity?.intelligence_headline?.trim()) {
    items.push({
      title: ambiguity.intelligence_headline.trim(),
      detail: ambiguity.intelligence_body?.trim() || 'From ambiguity intelligence API.',
      severity: 'high',
      caseCount: ambiguity.ambiguous_intent_count,
    })
  }

  const ambiguousAmount = formatMinor(ambiguity?.ambiguous_amount_minor ?? ambiguity?.value_at_risk_minor)
  if (ambiguousAmount !== '—') {
    items.push({
      title: 'Ambiguous payment value',
      detail: `${ambiguousAmount} tied to intents with unclear match signal.`,
      severity: riskSeverity(ambiguity?.risk_tier),
      caseCount: ambiguity?.ambiguous_intent_count,
    })
  }

  const variance = formatMinor(ambiguity?.total_variance_minor)
  if (variance !== '—') {
    items.push({
      title: 'Settlement variance',
      detail: `${variance} in total variance between intended and observed settlement.`,
      severity: 'medium',
    })
  }

  const unresolved = formatMinor(ambiguity?.unresolved_amount_minor)
  if (unresolved !== '—') {
    items.push({
      title: 'Unresolved amount',
      detail: `${unresolved} still unresolved in match review.`,
      severity: 'high',
      caseCount: ambiguity?.unresolved_count,
    })
  }

  const reversal = formatMinor(ambiguity?.reversal_exposure_minor)
  if (reversal !== '—') {
    items.push({
      title: 'Reversal exposure',
      detail: `${reversal} in reversal exposure on ambiguous intents.`,
      severity: 'medium',
    })
  }

  if (ambiguity?.matching_execution_summary?.trim()) {
    items.push({
      title: 'Matching execution signal',
      detail: ambiguity.matching_execution_summary.trim(),
      severity: 'medium',
      caseCount: ambiguity.intents_under_evaluation_count,
    })
  }

  if (patterns && patterns.pending_count > 0) {
    items.push({
      title: 'Decisions awaiting confirmation',
      detail: `${patterns.pending_count} of ${patterns.total_count} attachment decisions still pending.`,
      severity: 'medium',
      caseCount: patterns.pending_count,
    })
  }

  const settled = formatMinor(
    ambiguity?.total_observed_settled_amount_minor ?? leakage?.total_observed_settled_amount_minor,
  )
  if (settled !== '—') {
    items.push({
      title: 'Settlement value observed',
      detail: `${settled} found in bank, PSP, or settlement records.`,
      severity: 'low',
      caseCount: patterns?.success_count,
    })
  }

  return items.slice(0, MAX_INSIGHTS)
}
