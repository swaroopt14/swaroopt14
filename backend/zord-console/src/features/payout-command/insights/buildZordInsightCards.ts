import type { DisbursementTrendResponse } from '@/services/payout-command/prod-api/disbursementTrendTypes'
import type {
  AmbiguityKpiResolved,
  DefensibilityKpiResolved,
  LeakageKpiResolved,
  PatternsKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { fmtInrFromMinorExact } from '../command-center/commandCenterFormat'
import { formatApiPct, formatLeakageApiPct } from '../shared/formatApiKpiFields'
import type { InsightDelta, ZordInsightCard } from './zordInsightCarouselTypes'

/** Home command center — number of insight carousel slots rendered. */
export const HOME_ZORD_INSIGHT_SLOT_COUNT = 6

type MinorField = string | number | null | undefined

function readMinor(value: MinorField): number | null {
  if (value == null || String(value).trim() === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function formatMinorDisplay(value: MinorField): string {
  const minor = readMinor(value)
  return minor == null ? '—' : fmtInrFromMinorExact(minor)
}

function metricCard(
  id: string,
  label: string,
  amountField: MinorField,
  subtext: string,
  count?: number,
  countLabel?: string,
): ZordInsightCard | null {
  const minor = readMinor(amountField)
  if (minor == null) return null
  return {
    type: 'metric',
    id,
    label,
    valueRupee: minor,
    valueDisplay: formatMinorDisplay(amountField),
    subtext,
    count,
    countLabel,
  }
}

function bucketDelta(buckets: DisbursementTrendResponse['buckets']): InsightDelta | undefined {
  if (!buckets || buckets.length < 2) return undefined
  const a0 = Number(buckets[buckets.length - 2]?.total_amount) || 0
  const a1 = Number(buckets[buckets.length - 1]?.total_amount) || 0
  if (a0 <= 0) return undefined
  const raw = ((a1 - a0) / a0) * 100
  return { pct: Math.abs(raw), dir: raw >= 0 ? 'up' : 'down', label: 'vs prior bucket' }
}

function buildAccountInsightParagraph(
  leakageData: LeakageKpiResolved | null,
  ambData: AmbiguityKpiResolved | null,
  patternsData: PatternsKpiResolved | null,
  carouselPeriod: string,
  fallback: string,
): string {
  const intended = formatMinorDisplay(leakageData?.total_intended_amount_minor)
  const settled = formatMinorDisplay(leakageData?.total_observed_settled_amount_minor)
  const openException = formatMinorDisplay(leakageData?.total_amount_minor)
  const gapRate =
    leakageData?.leakage_percentage != null
      ? `${leakageData.leakage_percentage}%`
      : null

  if (intended !== '—' && settled !== '—') {
    return `${intended} was intended and ${settled} was observed in settlement records for the ${carouselPeriod} period.`
  }

  if (openException !== '—') {
    return `${openException} in open financial exception value needs review this ${carouselPeriod} period.`
  }

  if (ambData?.intelligence_headline?.trim()) {
    return ambData.intelligence_headline.trim()
  }

  if (patternsData && patternsData.total_count > 0) {
    return `${patternsData.pending_count} of ${patternsData.total_count} payments are still pending confirmation in the latest batch signal.`
  }

  return fallback
}

/**
 * Maps live intelligence + disbursement trend payloads into carousel cards.
 * Amounts use API minor fields only — formatted with fmtInrFromMinorExact.
 */
export function buildZordInsightCards(params: {
  tenantReady: boolean
  kpiLoading: boolean
  carouselPeriod: string
  emptyInsightParagraph: string
  mismatchPendingCount: number
  trendSeries: DisbursementTrendResponse | null | undefined
  trendChartReady: boolean
  leakageData: LeakageKpiResolved | null
  ambData: AmbiguityKpiResolved | null
  defData: DefensibilityKpiResolved | null
  patternsData: PatternsKpiResolved | null
}): ZordInsightCard[] {
  const {
    tenantReady,
    kpiLoading,
    carouselPeriod,
    emptyInsightParagraph,
    mismatchPendingCount,
    trendSeries,
    trendChartReady,
    leakageData,
    ambData,
    defData,
    patternsData,
  } = params

  if (!tenantReady) return []
  if (kpiLoading) return []

  const pendingCount =
    patternsData?.pending_count ?? ambData?.ambiguous_intent_count ?? mismatchPendingCount

  const hasSignal = Boolean(trendChartReady || leakageData || patternsData || ambData || defData)

  if (!hasSignal) {
    return [
      {
        type: 'insight',
        id: 'account-insights',
        label: 'Account Insights',
        paragraph: emptyInsightParagraph,
      },
      {
        type: 'metric',
        id: 'value-needing-review',
        label: 'Value needing review',
        valueRupee: 0,
        valueDisplay: '—',
        subtext: 'Open financial exception value from leakage API.',
        count: 0,
        countLabel: 'awaiting data',
      },
    ]
  }

  const cards: ZordInsightCard[] = []

  cards.push({
    type: 'insight',
    id: 'account-insights',
    label: 'Account Insights',
    paragraph: buildAccountInsightParagraph(
      leakageData,
      ambData,
      patternsData,
      carouselPeriod,
      emptyInsightParagraph,
    ),
    gapRate:
      leakageData?.leakage_percentage != null
        ? `${leakageData.leakage_percentage}%`
        : undefined,
    delta: trendChartReady ? bucketDelta(trendSeries?.buckets ?? []) : undefined,
  })

  const intendedCard = metricCard(
    'intended-value',
    'Intended payment value',
    leakageData?.total_intended_amount_minor,
    'Total value your business intended to pay in this period.',
    patternsData?.total_count ?? pendingCount,
    'payment intents',
  )
  if (intendedCard) cards.push(intendedCard)

  const reviewCard = metricCard(
    'value-needing-review',
    'Value needing review',
    leakageData?.total_amount_minor,
    'Open financial exception value from leakage total_amount_minor.',
    pendingCount,
    'items pending review',
  )
  if (reviewCard) cards.push(reviewCard)

  const unmatchedCard = metricCard(
    'unmatched-value',
    'Value at risk',
    leakageData?.unmatched_amount_minor,
    'Intended payments without a linked bank or settlement outcome.',
  )
  if (unmatchedCard) cards.push(unmatchedCard)

  const settledCard = metricCard(
    'settlement-observed',
    'Settlement value observed',
    leakageData?.total_observed_settled_amount_minor,
    'Total value found in bank, PSP, or settlement records.',
    patternsData?.success_count ?? 0,
    'confirmed payments',
  )
  if (settledCard) cards.push(settledCard)

  const shortSettledCard = metricCard(
    'short-settled',
    'Short-settled value',
    leakageData?.under_settlement_amount_minor,
    'Settlement value lower than the instructed payment amount.',
  )
  if (shortSettledCard) cards.push(shortSettledCard)

  const ambiguousCard = metricCard(
    'ambiguous-value',
    'Ambiguous amount',
    ambData?.ambiguous_amount_minor,
    'Payment value with unclear match signal.',
  )
  if (ambiguousCard) cards.push(ambiguousCard)

  if (defData?.evidence_pack_rate != null) {
    const proofPct = formatApiPct(defData.evidence_pack_rate, false, true)
    cards.push({
      type: 'metric',
      id: 'proof-coverage',
      label: 'Proof readiness',
      valueRupee: 0,
      valueDisplay: proofPct,
      subtext: 'Evidence pack rate for audit or export.',
      count: defData.weak_evidence_count ?? 0,
      countLabel: 'incomplete proof items',
    })
  }

  if (trendChartReady && trendSeries?.buckets?.length) {
    const rawSpark = trendSeries.buckets.map((bucket, i) => ({
      w: bucket.label?.trim() || `P${i + 1}`,
      v: Math.max(0, Number(bucket.total_amount) || 0),
    }))
    const lastBucketMinor = rawSpark[rawSpark.length - 1]?.v ?? 0
    const maxV = Math.max(...rawSpark.map((s) => s.v), 1)
    const spark = rawSpark.map((s) => ({ w: s.w, v: Math.round((s.v / maxV) * 100) }))

    cards.push({
      type: 'trend',
      id: 'disbursement-trend',
      label: 'Payment value trend',
      spark,
      currentValueRupee: lastBucketMinor,
      delta: bucketDelta(trendSeries.buckets),
    })
  }

  if (patternsData && patternsData.total_count > 0) {
    const exposureMinor = readMinor(leakageData?.total_amount_minor) ?? 0
    const riskLabel = [patternsData.anomaly_level, patternsData.risk_tier]
      .filter((v) => v != null && String(v).trim() !== '')
      .join(' · ')
    cards.push({
      type: 'alert',
      id: 'leakage',
      label: 'Payments needing attention',
      count: patternsData.pending_count,
      topPattern: riskLabel || 'Batch review signal',
      exposureRupee: exposureMinor,
    })
  }

  return cards
}
