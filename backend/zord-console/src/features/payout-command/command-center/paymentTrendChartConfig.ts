import type { PaymentTrendChartPoint } from './PaymentValueTrendChart'

/** Matches IncomeDashboard GRAN — longer span → more bars (denser chart). */
export type PaymentTrendGranularity = 'week' | 'month' | 'quarter' | 'year'

export const PAYMENT_TREND_GRANULARITY: Record<
  PaymentTrendGranularity,
  { label: string; bars: number; factor: number }
> = {
  week: { label: 'Week', bars: 80, factor: 0.55 },
  month: { label: 'Month', bars: 170, factor: 0.8 },
  quarter: { label: 'Quarter', bars: 250, factor: 1.1 },
  year: { label: 'Year', bars: 340, factor: 1.6 },
}

export const PAYMENT_TREND_GRAN_ORDER: PaymentTrendGranularity[] = ['week', 'month', 'quarter', 'year']

/** Bar width from slot spacing — thin everywhere, tighter as bar count rises. */
export function paymentTrendBarWidthPx(spacing: number): number {
  return Math.max(2, Math.min(11, spacing * 0.5))
}

/** Interpolate finest-resolution API series to the target bar count for the active tab. */
export function resamplePaymentTrendPoints(
  series: PaymentTrendChartPoint[],
  targetCount: number,
): PaymentTrendChartPoint[] {
  if (!series.length || targetCount < 1) return []
  if (series.length === 1) {
    return Array.from({ length: targetCount }, () => ({ ...series[0] }))
  }
  const out: PaymentTrendChartPoint[] = []
  for (let j = 0; j < targetCount; j += 1) {
    const t = j / Math.max(1, targetCount - 1)
    const idx = t * (series.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.min(series.length - 1, lo + 1)
    const frac = idx - lo
    const a = series[lo]
    const b = series[hi]
    out.push({
      label: frac < 0.5 ? a.label : b.label,
      intendedMinor: a.intendedMinor * (1 - frac) + b.intendedMinor * frac,
      confirmedMinor: a.confirmedMinor * (1 - frac) + b.confirmedMinor * frac,
      reviewMinor: a.reviewMinor * (1 - frac) + b.reviewMinor * frac,
    })
  }
  return out
}

/** Headline from source window total (₹k) × tab factor — not resampled bar sum. */
export function paymentTrendHeadlineK(sourceSeries: PaymentTrendChartPoint[], factor: number): number {
  const sumK = sourceSeries.reduce((s, p) => s + Math.max(0, p.intendedMinor / 1000), 0)
  return Math.round(sumK * factor)
}

export function mapDisbursementBucketsToTrendPoints(
  buckets: Array<{
    label?: string | null
    total_amount?: number | string | null
    confirmed_amount?: number | string | null
    review_amount?: number | string | null
  }>,
): PaymentTrendChartPoint[] {
  return buckets.map((b) => ({
    label: b.label?.trim() || '—',
    intendedMinor: Number(b.total_amount) || 0,
    confirmedMinor: Number(b.confirmed_amount) || 0,
    reviewMinor: Number(b.review_amount) || 0,
  }))
}
