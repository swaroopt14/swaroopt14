'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { clamp, HOME_CHART_DOMAIN_MAX, type HomeTimeframe } from '@/services/payout-command/model'
import { buildZordInsightCards } from '../insights/buildZordInsightCards'
import { ZordInsightCarousel } from '../insights/ZordInsightCarousel'
import { PaymentCommandCenterBand } from '../command-center/PaymentCommandCenterBand'
import {
  type CommandCenterPeriod,
  type CarouselInsightPeriod,
  commandPeriodToDateRange,
  commandPeriodToTrendRange,
  carouselPeriodToTrendRange,
  COMMAND_CENTER_PERIOD_OPTIONS,
} from '../command-center/commandCenterPeriod'
import { chartThousandsFromMinor, fmtInrFromMinor, parseMinorField } from '../command-center/commandCenterFormat'
import { PAYMENT_COMMAND_CENTER } from '../command-center/paymentCommandCopy'
import { usePaymentCommandDataSources } from '../command-center/usePaymentCommandDataSources'
import {
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_CENTERED,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { ClientChart, Glyph } from '../shared'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import { useDisbursementTrend } from '@/services/payout-command/prod-api/useDisbursementTrend'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { markSandboxSetupStep } from '@/services/payout-command/sandbox-setup-guide'
import { SandboxHomeCredentialsCard } from '../sandbox/SandboxHomeCredentialsCard'

const TENANT_KPI_EMPTY_CAROUSEL_INSIGHT =
  'No payment data in this period yet. Upload payment instructions or connect bank/settlement files to populate this view.'

function parseMinorStrict(value: string | number | undefined | null): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return parseMinorField(value)
}

export function HomeSurface({
  batchId,
  timeframe,
  onTimeframeChange,
}: {
  /** Optional URL `batch_id` — scopes patterns KPI only. */
  batchId?: string
  timeframe: HomeTimeframe
  onTimeframeChange: (timeframe: HomeTimeframe) => void
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [trendAnchorIdx, setTrendAnchorIdx] = useState(0)
  const [commandPeriod, setCommandPeriod] = useState<CommandCenterPeriod>('month')
  const [carouselPeriod, setCarouselPeriod] = useState<CarouselInsightPeriod>('weekly')
  const [heroMetric, setHeroMetric] = useState<'intended' | 'confirmed'>('intended')

  const { tenantId, tenantReady } = useSessionTenant()
  const { mode } = useEnvironment()
  const isSandbox = mode === 'sandbox'

  const intelligenceDateQuery = useMemo(
    () => commandPeriodToDateRange(commandPeriod),
    [commandPeriod],
  )
  const trendRange = commandPeriodToTrendRange(commandPeriod)
  const carouselTrendRange = carouselPeriodToTrendRange(carouselPeriod)

  // Sync the dropdown timeframe to the commandPeriod (which drives the chart/cards API)
  useEffect(() => {
    if (timeframe === 'Week') setCommandPeriod('week')
    else if (timeframe === 'Month') setCommandPeriod('month')
    else if (timeframe === 'Year') setCommandPeriod('year')
    // Quarter/Custom fallback to month for the command API since it only supports week/month/year
    else setCommandPeriod('month')
  }, [timeframe])

  const { data: trendSeries, loading: trendLoading } = useDisbursementTrend({ tenantReady, range: trendRange })
  const { data: carouselTrendSeries, loading: carouselTrendLoading } = useDisbursementTrend({
    tenantReady,
    range: carouselTrendRange,
  })

  const { leakage, ambiguity, defensibility, patterns, recommendations, loading } = useIntelligenceKpis({
    tenantReady,
    batchId,
    dateQuery: intelligenceDateQuery,
  })
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const ambData = isDataAvailable(ambiguity) ? ambiguity : null
  const defData = isDataAvailable(defensibility) ? defensibility : null
  const patternsData = isDataAvailable(patterns) ? patterns : null
  const recsData = isDataAvailable(recommendations) ? recommendations : null

  useEffect(() => {
    if (!isSandbox || !tenantReady || loading || trendLoading) return
    const hasSignals =
      Boolean(leakageData) ||
      Boolean(patternsData) ||
      Boolean(ambData) ||
      Boolean(recsData) ||
      Boolean(trendSeries?.data_available && (trendSeries.buckets?.length ?? 0) > 0)
    if (hasSignals) markSandboxSetupStep('home-signals')
  }, [
    isSandbox,
    tenantReady,
    loading,
    trendLoading,
    leakageData,
    patternsData,
    ambData,
    recsData,
    trendSeries,
  ])

  const trendTotalsMinor = useMemo(() => {
    if (!trendSeries?.data_available || !trendSeries.buckets?.length) return null
    let total = 0
    let intentCount = 0
    for (const b of trendSeries.buckets) {
      total += Number.isFinite(Number(b.total_amount)) ? Number(b.total_amount) : 0
      intentCount += Number.isFinite(Number(b.intent_count)) ? Number(b.intent_count) : 0
    }
    if (total <= 0 && intentCount <= 0) return null
    return { total, intentCount }
  }, [trendSeries])

  const liveTrendChart = useMemo(() => {
    if (!tenantReady || !trendSeries?.data_available || trendSeries.buckets.length < 1) return null
    const rows = trendSeries.buckets.map((b, i) => {
      const minorT = Number(b.total_amount)
      const minorC = Number(b.confirmed_amount)
      const minorR = Number(b.review_amount)
      if (!Number.isFinite(minorT) || !Number.isFinite(minorC) || !Number.isFinite(minorR) || !b.label) {
        return null
      }
      const hasSignal = minorT > 0 || minorC > 0 || minorR > 0 || b.intent_count > 0
      if (!hasSignal) return null
      return {
        point: i,
        barValue: Math.max(0.001, chartThousandsFromMinor(minorT)),
        lineValue: Math.max(0.001, chartThousandsFromMinor(minorC)),
        reviewLineValue: Math.max(0.001, chartThousandsFromMinor(minorR)),
        selected: false,
        isHoliday: false,
      }
    })
    const validRows = rows.filter((row): row is NonNullable<typeof row> => Boolean(row))
    if (!validRows.length) return null
    const maxV = Math.max(0.001, ...validRows.flatMap((r) => [r.barValue, r.lineValue, r.reviewLineValue]))
    const yMax = Math.max(5, Math.ceil((maxV * 1.15) / 5) * 5)
    const ticks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map((x) => Math.round(x * 1000) / 1000)
    return {
      chartData: validRows,
      axisLabels: trendSeries.buckets.map((b) => b.label || '—'),
      yMax,
      ticks,
    }
  }, [tenantReady, trendSeries])

  const chartData = useMemo(() => liveTrendChart?.chartData ?? [], [liveTrendChart])
  const axisLabelsForChart = liveTrendChart?.axisLabels ?? []
  const yDomainMax = liveTrendChart?.yMax ?? HOME_CHART_DOMAIN_MAX
  const yTicks = liveTrendChart?.ticks ?? [0, 50000, 100000, 150000]

  const trendChartReady = Boolean(liveTrendChart && chartData.length > 0)

  useEffect(() => {
    const n = trendSeries?.buckets?.length ?? 0
    if (!tenantReady || !trendSeries?.data_available || n < 1) return
    setTrendAnchorIdx(clamp(Math.floor(n / 2), 0, Math.max(0, n - 1)))
    setHoverIndex(null)
  }, [tenantReady, commandPeriod, trendSeries?.data_available, trendSeries?.buckets?.length])

  const displayPoint = hoverIndex ?? trendAnchorIdx
  const safePoint = clamp(displayPoint, 0, Math.max(0, chartData.length - 1))
  const selectedRange = trendChartReady
    ? ([0, Math.max(0, chartData.length - 1)] as const)
    : ([0, 0] as const)
  const [selectedRangeStart, selectedRangeEnd] = selectedRange
  const activeBucket = trendSeries?.buckets?.[safePoint]
  const totalChartBars = chartData.length
  const rangeLeftPercent = totalChartBars > 0 ? (selectedRangeStart / totalChartBars) * 100 : 0
  const rangeWidthPercent =
    totalChartBars > 0 ? ((selectedRangeEnd - selectedRangeStart + 1) / totalChartBars) * 100 : 100
  const tooltipLeftPercent =
    totalChartBars <= 1
      ? 50
      : clamp((safePoint / Math.max(totalChartBars - 1, 1)) * 100 - 8, 3, 74)
  const monthLabel =
    axisLabelsForChart[safePoint] ??
    axisLabelsForChart[Math.min(safePoint, axisLabelsForChart.length - 1)] ??
    '—'
  const tooltipIntended = activeBucket ? fmtInrFromMinor(activeBucket.total_amount) : '—'
  const tooltipConfirmed = activeBucket ? fmtInrFromMinor(activeBucket.confirmed_amount) : '—'
  const tooltipReview = activeBucket ? fmtInrFromMinor(activeBucket.review_amount) : '—'

  const chartTags = useMemo(() => {
    const data = chartData
    if (!data.length) return [] as Array<{ leftPct: number; label: string; key: string }>
    let maxBar = 0
    let maxBarI = 0
    let maxGap = 0
    let maxGapI = 0
    let maxReview = 0
    let maxReviewI = 0
    for (let i = 0; i < data.length; i++) {
      if (data[i].barValue > maxBar) {
        maxBar = data[i].barValue
        maxBarI = i
      }
      const gap = data[i].barValue - data[i].lineValue
      if (gap > maxGap) {
        maxGap = gap
        maxGapI = i
      }
      if (data[i].reviewLineValue > maxReview) {
        maxReview = data[i].reviewLineValue
        maxReviewI = i
      }
    }
    const denom = Math.max(data.length - 1, 1)
    const tags: Array<{ key: string; leftPct: number; label: string }> = [
      { key: 'high', leftPct: clamp((maxBarI / denom) * 100, 10, 86), label: PAYMENT_COMMAND_CENTER.chipHighValue },
      { key: 'spike', leftPct: clamp((maxGapI / denom) * 100, 10, 86), label: PAYMENT_COMMAND_CENTER.chipConfirmationGap },
    ]
    if (maxReview > 0) {
      tags.push({
        key: 'review',
        leftPct: clamp((maxReviewI / denom) * 100, 10, 86),
        label: PAYMENT_COMMAND_CENTER.chipReviewNeeded,
      })
    }
    return tags
  }, [chartData])

  const dataSources = usePaymentCommandDataSources({
    tenantReady,
    evidencePackRate: defData?.evidence_pack_rate ?? null,
    auditReadyPct: defData?.audit_ready_pct ?? null,
  })

  const intendedMinor = leakageData
    ? parseMinorField(leakageData.total_intended_amount_minor)
    : trendTotalsMinor && trendTotalsMinor.total > 0
      ? trendTotalsMinor.total
      : null
  const unmatchedMinor = parseMinorStrict(leakageData?.unmatched_amount_minor)
  const underSettlementMinor = parseMinorStrict(leakageData?.under_settlement_amount_minor)
  const orphanMinor = parseMinorStrict(leakageData?.orphan_amount_minor)
  const unlinkedSettlementMinor = orphanMinor
  const reversalMinor = parseMinorStrict(leakageData?.reversal_exposure_minor)
  const observedMinor = parseMinorStrict(leakageData?.total_observed_settled_amount_minor)

  const bankConfirmedMinor = observedMinor

  const reviewMinor = leakageData != null ? parseMinorField(leakageData.unmatched_amount_minor) : null

  const intentCountLabel =
    patternsData?.total_count != null && patternsData.total_count > 0
      ? patternsData.total_count
      : trendTotalsMinor?.intentCount ?? 0

  const trendInsight = useMemo(() => {
    if (patternsData?.total_count != null && patternsData.total_count > 0) {
      const success = patternsData.success_count ?? 0
      const share = Math.round((success / patternsData.total_count) * 100)
      return `${patternsData.total_count} payment instructions in view; ${success} bank-confirmed (${share}% by count) for the ${carouselPeriod} window.`
    }
    if (carouselTrendSeries?.data_available && carouselTrendSeries.buckets.length >= 2) {
      const intents = carouselTrendSeries.buckets.reduce((s, b) => s + b.intent_count, 0)
      const confirmed = carouselTrendSeries.buckets.reduce((s, b) => s + b.confirmed_count, 0)
      const share = intents > 0 ? Math.round((confirmed / intents) * 100) : 0
      return `${intents} payment instructions in view; ${confirmed} bank-confirmed (${share}% by count) for the ${carouselPeriod} window.`
    }
    if (leakageData && patternsData) {
      return `${patternsData.pending_count} payments still pending confirmation in the latest batch view.`
    }
    if (patternsData) {
      return `${patternsData.success_count} of ${patternsData.total_count} payments completed in the latest batch signal.`
    }
    return TENANT_KPI_EMPTY_CAROUSEL_INSIGHT
  }, [carouselTrendSeries, carouselPeriod, leakageData, patternsData])

  const reviewDisplay =
    reviewMinor !== null
      ? fmtInrFromMinor(reviewMinor)
      : loading
        ? '…'
        : '—'

  const insightCarouselCards = useMemo(
    () =>
      buildZordInsightCards({
        tenantReady,
        kpiLoading: loading || carouselTrendLoading,
        emptyInsightParagraph: TENANT_KPI_EMPTY_CAROUSEL_INSIGHT,
        mismatchHeadline: reviewDisplay,
        mismatchSubtext:
          leakageData != null
            ? 'Unmatched payment value from the leakage dashboard.'
            : 'No leakage data available for this period.',
        reviewValueMinor: reviewMinor,
        mismatchPendingCount: patternsData?.pending_count ?? ambData?.ambiguous_intent_count ?? 0,
        trendInsight,
        trendSeries: carouselTrendSeries,
        trendChartReady: Boolean(
          carouselTrendSeries?.data_available && (carouselTrendSeries.buckets?.length ?? 0) > 0,
        ),
        leakageData,
        patternsData,
      }),
    [
      tenantReady,
      loading,
      carouselTrendLoading,
      trendInsight,
      carouselTrendSeries,
      leakageData,
      patternsData,
      reviewDisplay,
      reviewMinor,
      leakageData,
      ambData?.ambiguous_intent_count,
    ],
  )

  const insightCarouselLoading = Boolean(
    tenantReady && insightCarouselCards.length === 0 && (loading || carouselTrendLoading),
  )

  const matchConfidencePct = ambData
    ? `${Math.round((ambData.avg_attachment_confidence ?? 0) * 100)}%`
    : loading
      ? '…'
      : '—'

  const proofCoveragePct = defData
    ? `${Math.round((defData.evidence_pack_rate ?? 0) * 100)}%`
    : loading
      ? '…'
      : '—'

  const nextActions = useMemo(() => {
    const actions: Array<{ title: string; description: string; href?: string; emphasis?: boolean }> = []
    if (dataSources.settlementStatus === 'missing') {
      actions.push({
        title: 'Upload bank confirmation file',
        description: 'Required to complete proof for this period.',
        href: '/payout-command-view/today?dock=settlement',
        emphasis: true,
      })
    }
    actions.push({
      title: 'Review payments needing attention',
      description:
        reviewMinor !== null
          ? `${reviewDisplay} currently marked for review.`
          : 'No review value data available for this period.',
      href: '/payout-command-view/today?dock=leakage',
    })
    actions.push({
      title: 'Export payment proof report',
      description: 'Download evidence summary for the selected period.',
      href: '/payout-command-view/today?dock=proof',
    })
    return actions
  }, [dataSources.settlementStatus, reviewMinor, reviewDisplay])

  const completionHint =
    dataSources.settlementStatus === 'missing'
      ? 'Upload a bank statement or settlement file for this period.'
      : null

  const lastUpdatedIso = leakageData?.computed_at ?? trendSeries?.buckets?.[0]?.key
  const lastUpdatedDisplay = lastUpdatedIso
    ? new Date(lastUpdatedIso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null

  const disbursementHeroInner = (
    <div className="flex flex-col items-center justify-center">
      <div className="mx-auto mb-6 flex w-fit rounded-full border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setHeroMetric('intended')}
          className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
            heroMetric === 'intended'
              ? 'bg-white text-[#000000] shadow-sm ring-1 ring-black/5'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Intended
        </button>
        <button
          type="button"
          onClick={() => setHeroMetric('confirmed')}
          className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
            heroMetric === 'confirmed'
              ? 'bg-white text-[#000000] shadow-sm ring-1 ring-black/5'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Bank-Confirmed
        </button>
      </div>

      <div className="text-center min-h-[110px]">
        {heroMetric === 'intended' ? (
          <>
            <div className={`text-[64px] font-extrabold leading-none tabular-nums sm:text-[72px] text-[#000000]`}>
              {intendedMinor !== null ? fmtInrFromMinor(intendedMinor) : loading || trendLoading ? '₹…' : '—'}
            </div>
            <div className={`mt-3 text-[18px] font-bold text-[#000000]`}>Intended Payment Value</div>
            {intentCountLabel > 0 ? (
              <p className={`mt-2 max-w-xs ${HOME_BODY_IMPERIAL_CENTERED}`}>
                {intentCountLabel} payment instructions received in this period.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className={`text-[64px] font-extrabold leading-none tabular-nums sm:text-[72px] text-[#000000]`}>
              {bankConfirmedMinor != null ? fmtInrFromMinor(bankConfirmedMinor) : '—'}
            </div>
            <div className={`mt-3 text-[18px] font-bold text-[#000000]`}>Bank-Confirmed Value</div>
            {bankConfirmedMinor != null ? (
              <p className={`mt-2 max-w-xs ${HOME_BODY_IMPERIAL_CENTERED}`}>
                Confirmed from bank/settlement records in this period.
              </p>
            ) : null}
          </>
        )}
        {lastUpdatedDisplay ? (
          <p className="mt-4 text-[13px] font-medium text-slate-500">
            Last updated: {lastUpdatedDisplay}
          </p>
        ) : null}
      </div>
    </div>
  )

  const trendPanelInner = (
    <>
        <div className="flex flex-wrap items-start justify-between gap-4 min-w-0">
          <div>
            <h2 className={`text-[20px] font-semibold leading-snug tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
              {PAYMENT_COMMAND_CENTER.chartTitle}
            </h2>
            <p className={`mt-1 ${HOME_BODY_IMPERIAL}`}>{PAYMENT_COMMAND_CENTER.chartSubtitle}</p>
            <p className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 ${HOME_BODY_IMPERIAL}`}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" /> {PAYMENT_COMMAND_CENTER.legendIntended}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#a78bfa]" /> {PAYMENT_COMMAND_CENTER.legendConfirmed}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#f59e0b]" /> {PAYMENT_COMMAND_CENTER.legendReview}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[14px] font-medium tracking-[0] ${HOME_TITLE_BLACK} mr-1`}>
                Timeframe
              </span>
              <select
                value={timeframe}
                onChange={(e) => onTimeframeChange(e.target.value as HomeTimeframe)}
                className="rounded-md border border-[#E5E5E5] bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-800 focus:border-[#39E07E] focus:outline-none focus:ring-1 focus:ring-[#39E07E]/40"
              >
                <option value="Week">Week</option>
                <option value="Month">Month</option>
                <option value="Year">Year</option>
              </select>
            </div>
            {trendLoading ? <span className="text-[12px] text-neutral-500">Updating…</span> : null}
          </div>
        </div>
        <div className="relative z-[1] mt-6 min-w-0" onMouseLeave={() => setHoverIndex(null)}>
          {trendChartReady ? (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 z-[8] bg-white/70"
              style={{
                left: `${rangeLeftPercent}%`,
                width: `${rangeWidthPercent}%`,
                opacity: 0.08,
              }}
              aria-hidden
            />
            <div
              className="pointer-events-auto absolute top-1/2 z-20 w-[15rem] max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-lg border-[0.5px] border-[#E0E0DE] bg-white px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:w-[16.5rem]"
              style={{ left: `clamp(0.5rem, ${tooltipLeftPercent}%, calc(100% - 17rem))` }}
            >
              <button
                type="button"
                className="absolute right-2 top-2 text-[15px] leading-none text-[#888888] hover:text-[#000000]"
                aria-label="Dismiss chart note"
              >
                ×
              </button>
              <div className="text-[11px] font-normal uppercase tracking-[0.06em] text-[#888888]">Date: {monthLabel}</div>
              <div className={`mt-2 space-y-1 ${HOME_BODY_IMPERIAL_SM}`}>
                <p>Intended payments: {tooltipIntended}</p>
                <p>Bank-confirmed: {tooltipConfirmed}</p>
                <p>Needs review: {tooltipReview}</p>
              </div>
              <p className={`mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
                Zord compares your payment instructions with bank/settlement records for this date.
              </p>
            </div>
          <ClientChart className="h-[21rem] w-full md:h-[23rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 28, left: 8, bottom: 0 }}
                barGap={2}
                onMouseMove={(state) => {
                  if (typeof state?.activeTooltipIndex === 'number') {
                    setHoverIndex(state.activeTooltipIndex)
                  }
                }}
              >
                <XAxis hide dataKey="point" />
                <Tooltip
                  shared={false}
                  isAnimationActive={false}
                  cursor={{ fill: 'rgba(15,23,42,0.07)' }}
                  wrapperStyle={{ outline: 'none' }}
                  content={() => null}
                />
                <YAxis
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={14}
                  domain={[0, yDomainMax]}
                  ticks={yTicks}
                  tickFormatter={(value: number) => (value === 0 ? '0' : `₹${value.toFixed(0)}k`)}
                  tick={{ fill: '#000000', fontSize: 11, fontWeight: 500 }}
                />
                <Bar dataKey="barValue" barSize={4} radius={[0, 0, 0, 0]} isAnimationActive>
                  {chartData.map((entry) => (
                    <Cell
                      key={`home-bar-${entry.point}`}
                      fill="#4ade80"
                      opacity={entry.point === safePoint ? 1 : 0.78}
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="lineValue"
                  stroke="#a78bfa"
                  strokeWidth={1.35}
                  dot={false}
                  activeDot={false}
                  strokeLinecap="round"
                  connectNulls
                  isAnimationActive
                />
                <Line
                  type="monotone"
                  dataKey="reviewLineValue"
                  stroke="#f59e0b"
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={false}
                  strokeLinecap="round"
                  connectNulls
                  isAnimationActive
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ClientChart>
          </>
          ) : tenantReady && trendLoading ? (
            <div className="h-[21rem] w-full animate-pulse rounded-lg bg-slate-100 md:h-[23rem]" aria-busy="true" />
          ) : (
            <div className="flex h-[21rem] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-white px-4 text-center md:h-[23rem]">
              <Glyph name="chart" className="h-10 w-10 shrink-0 text-[#4ade80]/90" aria-hidden />
              {tenantReady ? (
                <>
                  <span className={`font-semibold ${HOME_TITLE_BLACK}`}>No trend data in this range</span>
                  <span className={`max-w-md ${HOME_BODY_IMPERIAL}`}>
                    Try Week, Month, Quarter, or Year — or wait until intents exist in the selected window. The chart
                    will populate automatically once disbursements appear.
                  </span>
                </>
              ) : (
                <>
                  <span className={`font-semibold ${HOME_TITLE_BLACK}`}>Workspace required</span>
                  <span className={`max-w-md ${HOME_BODY_IMPERIAL}`}>
                    Sign in and select a tenant to plot disbursement and confirmation from the intent ledger. This
                    preview stays empty until a workspace is active.
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {trendChartReady ? (
          <>
        <div className="mt-3 h-[13px] rounded-[4px] bg-[#EBEBEA]">
          <div
            className="relative h-[13px] rounded-[4px] bg-[#C5C5C2]"
            style={{ marginLeft: `${rangeLeftPercent}%`, width: `${rangeWidthPercent}%` }}
          >
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#444444]" />
            <div className="absolute inset-y-0 right-0 w-[3px] bg-[#444444]" />
          </div>
        </div>

        <div
          className="mt-4 grid min-w-0 text-[14px] font-medium tracking-[0] text-[#000000]"
          style={{ gridTemplateColumns: `repeat(${axisLabelsForChart.length}, minmax(0, 1fr))` }}
        >
          {axisLabelsForChart.map((month, i) => (
            <div key={`trend-axis-${i}`} className="text-center">
              {month}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {chartTags.map((tag) => (
            <span
              key={tag.key}
              className={`rounded-full border border-black/10 bg-[#fafafa] px-3 py-1.5 text-[14px] font-medium tracking-[0] ${HOME_TITLE_BLACK}`}
            >
              {tag.label}
            </span>
          ))}
        </div>
          </>
        ) : null}
    </>
  )

  return (
    <div className="mt-0 w-full min-w-0">
        {isSandbox ? (
          <div className="px-4 pt-2 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
              <div className="min-w-0 flex-1 text-center">{disbursementHeroInner}</div>
              <div className="flex w-full shrink-0 justify-center lg:w-auto lg:justify-end lg:self-start lg:pt-1">
                <SandboxHomeCredentialsCard />
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 pt-2 text-center sm:px-6 lg:px-8">{disbursementHeroInner}</div>
        )}

        <div className="mt-6">
          {/* DataSourceStatusBar removed per user request */}
        </div>

        <div className="relative mt-6 w-full border-b border-[#e5e5e5] bg-white px-4 py-6 sm:px-6 lg:px-8">
          {trendPanelInner}
        </div>

        <section
          className="mt-8 space-y-3 bg-[#f4f4f1] px-2 pb-3 pt-1.5 sm:px-3 lg:px-4"
          aria-labelledby="home-today-command-center-title"
        >
          <PaymentCommandCenterBand
            carouselPeriod={carouselPeriod}
            onCarouselPeriodChange={setCarouselPeriod}
            cleanlyMatchedValue={observedMinor !== null ? fmtInrFromMinor(observedMinor) : loading ? '…' : '—'}
            cleanlyMatchedSub="Payment value matched between instruction and confirmation."
            awaitingConfirmation={bankConfirmedMinor == null}
            reviewValue={reviewDisplay}
            reviewSub={
              leakageData != null
                ? 'Unmatched payment value from bank/settlement matching.'
                : 'No leakage data available for this period.'
            }
            unmatchedDisplay={leakageData ? fmtInrFromMinor(unmatchedMinor) : '—'}
            shortSettledDisplay={leakageData ? fmtInrFromMinor(underSettlementMinor) : '—'}
            unlinkedDisplay={leakageData ? fmtInrFromMinor(unlinkedSettlementMinor) : '—'}
            reversalDisplay={leakageData ? fmtInrFromMinor(reversalMinor) : '—'}
            reviewHref="/payout-command-view/today?dock=leakage"
            matchConfidencePct={matchConfidencePct}
            matchConfidenceSub="Average match confidence"
            paymentsNeedingReview={
              ambData?.ambiguous_intent_count != null ? String(ambData.ambiguous_intent_count) : '—'
            }
            missingRefRate={
              ambData ? `${((ambData.provider_ref_missing_rate ?? 0) * 100).toFixed(1)}%` : '—'
            }
            refCompleteness={
              ambData
                ? `${Math.max(0, 100 - (ambData.provider_ref_missing_rate ?? 0) * 100).toFixed(0)}%`
                : '—'
            }
            multiMatchRate={
              ambData ? `${((ambData.ambiguity_rate ?? 0) * 100).toFixed(1)}%` : '—'
            }
            proofCoverageDisplay={proofCoveragePct}
            proofSub="Evidence coverage for audit or export"
            proofReadyRow={defData ? `${Math.round((defData.audit_ready_pct ?? 0) * 100)}% audit-ready` : '—'}
            incompleteProofRow={
              defData
                ? `${Math.max(0, 100 - Math.round((defData.evidence_pack_rate ?? 0) * 100))}% incomplete`
                : '—'
            }
            replayReadyRow={
              defData ? `${Math.round((defData.replayability_pct ?? 0) * 100)}% replay-ready` : '—'
            }
            proofHref="/payout-command-view/today?dock=proof"
            nextActions={{ actions: nextActions, completionHint }}
            insightCarousel={
              <ZordInsightCarousel
                key={`${tenantId || 'no-tenant'}-${carouselPeriod}`}
                tenantReady={tenantReady}
                autoplay
                interval={4000}
                loading={insightCarouselLoading}
                cards={insightCarouselCards}
              />
            }
          />
        </section>

    </div>
  )
}
