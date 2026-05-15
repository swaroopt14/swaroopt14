'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  clamp,
  dockItems,
  HOME_CHART_DOMAIN_MAX,
  HOME_QUARTERS,
  HOME_YEAR_OPTIONS,
  homeSimulationScenarios,
  type HomeCommandResponse,
  type HomeCommandStatus,
  type HomeOverviewSnapshot,
  type HomeSimulation,
  type HomeTimeframe,
} from '@/services/payout-command/model'
import { buildZordInsightCards } from '../insights/buildZordInsightCards'
import { ZordInsightCarousel } from '../insights/ZordInsightCarousel'
import { HomeCommandCenterLightBand } from '../command-center/HomeCommandCenterLightBand'
import {
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_CENTERED,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { DashboardDeltaPercent } from '../homeDashboardTypography'
import { ClientChart, Glyph, LiveDataHint, SurfaceEyebrow, usePromptAutoContrast } from '../shared'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { DisbursementTrendRange } from '@/services/payout-command/prod-api/disbursementTrendTypes'
import { useDisbursementTrend } from '@/services/payout-command/prod-api/useDisbursementTrend'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { SandboxHomeCredentialsCard } from '../sandbox/SandboxHomeCredentialsCard'

const TENANT_KPI_EMPTY_CAROUSEL_INSIGHT =
  'No live trend or intelligence KPI payload yet for this tenant — numbers above appear when leakage, patterns, or disbursement-trend APIs return data.'

export function HomeSurface({
  scenario,
  snapshot,
  timeframe,
  onTimeframeChange,
  onYearChange,
  onQuarterChange,
  activeChartPoint: _activeChartPoint,
  onActiveChartPointChange: _onActiveChartPointChange,
  promptInput,
  onPromptInputChange,
  onPromptSubmit,
  onQuickPrompt,
  commandResponse,
  commandStatus,
  onDismissCommandResponse,
}: {
  scenario: HomeSimulation
  snapshot: HomeOverviewSnapshot
  timeframe: HomeTimeframe
  onTimeframeChange: (timeframe: HomeTimeframe) => void
  onYearChange: (year: 2026 | 2027 | 2028) => void
  onQuarterChange: (quarterIndex: number) => void
  activeChartPoint: number
  onActiveChartPointChange: (point: number) => void
  promptInput: string
  onPromptInputChange: (value: string) => void
  onPromptSubmit: () => void
  onQuickPrompt: (prompt: string) => void
  commandResponse: HomeCommandResponse | null
  commandStatus: HomeCommandStatus
  onDismissCommandResponse: () => void
}) {
  const TREND_RANGE_FILTERS: readonly { id: DisbursementTrendRange; label: string }[] = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'year', label: 'Year' },
  ]

  const promptRowRef = useRef<HTMLDivElement | null>(null)
  const promptTone = usePromptAutoContrast(promptRowRef)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [trendAnchorIdx, setTrendAnchorIdx] = useState(0)
  const [isPromptExpanded, setIsPromptExpanded] = useState(false)

  const { tenantId, tenantReady } = useSessionTenant()
  const { mode } = useEnvironment()
  const isSandbox = mode === 'sandbox'
  const [trendRange, setTrendRange] = useState<DisbursementTrendRange>('month')
  const { data: trendSeries, loading: trendLoading } = useDisbursementTrend({ tenantReady, range: trendRange })

  const { leakage, ambiguity, defensibility, patterns, recommendations, loading } = useIntelligenceKpis({
    tenantReady,
  })
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const ambData = isDataAvailable(ambiguity) ? ambiguity : null
  const defData = isDataAvailable(defensibility) ? defensibility : null
  const patternsData = isDataAvailable(patterns) ? patterns : null
  const recsData = isDataAvailable(recommendations) ? recommendations : null

  const liveTrendChart = useMemo(() => {
    if (!tenantReady || !trendSeries?.data_available || trendSeries.buckets.length < 1) return null
    const rows = trendSeries.buckets.map((b, i) => {
      const rupeesT = b.total_amount / 100
      const rupeesC = b.confirmed_amount / 100
      return {
        point: i,
        barValue: Math.max(0.001, rupeesT / 1000),
        lineValue: Math.max(0.001, rupeesC / 1000),
        lowerLineValue: Math.max(0.001, (rupeesC * 0.62) / 1000),
        selected: false,
        isHoliday: false,
      }
    })
    const maxV = Math.max(0.001, ...rows.flatMap((r) => [r.barValue, r.lineValue, r.lowerLineValue]))
    const yMax = Math.max(5, Math.ceil((maxV * 1.15) / 5) * 5)
    const ticks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map((x) => Math.round(x * 1000) / 1000)
    return {
      chartData: rows,
      axisLabels: trendSeries.buckets.map((b) => b.label),
      yMax,
      ticks,
    }
  }, [tenantReady, trendSeries])

  const chartData = liveTrendChart?.chartData ?? []
  const axisLabelsForChart = liveTrendChart?.axisLabels ?? []
  const yDomainMax = liveTrendChart?.yMax ?? HOME_CHART_DOMAIN_MAX
  const yTicks = liveTrendChart?.ticks ?? [0, 50000, 100000, 150000]

  const trendChartReady = Boolean(liveTrendChart && chartData.length > 0)

  useEffect(() => {
    const n = trendSeries?.buckets?.length ?? 0
    if (!tenantReady || !trendSeries?.data_available || n < 1) return
    setTrendAnchorIdx(clamp(Math.floor(n / 2), 0, Math.max(0, n - 1)))
    setHoverIndex(null)
  }, [tenantReady, trendRange, trendSeries?.data_available, trendSeries?.buckets?.length])

  const displayPoint = hoverIndex ?? trendAnchorIdx
  const safePoint = clamp(displayPoint, 0, Math.max(0, chartData.length - 1))
  const selectedRange = trendChartReady
    ? ([0, Math.max(0, chartData.length - 1)] as const)
    : ([0, 0] as const)
  const [selectedRangeStart, selectedRangeEnd] = selectedRange
  const activeChartDatum = chartData[safePoint] ?? {
    point: 0,
    barValue: 0,
    lineValue: 0,
    lowerLineValue: 0,
    selected: false,
    isHoliday: false,
  }
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
  const deltaFromTrend =
    activeChartDatum.lineValue > 0.002
      ? ((activeChartDatum.barValue - activeChartDatum.lineValue) / activeChartDatum.lineValue) * 100
      : 0

  const fmtInrCompact = (minor: number | null): string => {
    if (minor === null || !Number.isFinite(minor)) return '—'
    if (minor === 0) return '₹0'
    const rupees = minor / 100
    if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)} Cr`
    if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(2)} L`
    if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)} K`
    return `₹${rupees.toFixed(0)}`
  }

  const fmtTrendTooltipInr = (valueThousands: number) =>
    fmtInrCompact(Math.round(valueThousands * 1000 * 100))

  const liveTooltipNote = `Disbursement and confirmation movement around ${monthLabel}. Bars: total intent volume; line: bank-confirmed / settled subset (${trendRange} window).`

  const chartTags = useMemo(() => {
    const data = chartData
    if (!data.length) return [] as Array<{ leftPct: number; label: string; key: string }>
    let maxBar = 0
    let maxBarI = 0
    let maxGap = 0
    let maxGapI = 0
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
    }
    const delayI = Math.floor(data.length * 0.68)
    const denom = Math.max(data.length - 1, 1)
    return [
      { key: 'high', leftPct: clamp((maxBarI / denom) * 100, 10, 86), label: 'High disbursement' },
      { key: 'spike', leftPct: clamp((maxGapI / denom) * 100, 10, 86), label: 'Gap vs confirmed' },
      { key: 'delay', leftPct: clamp((delayI / denom) * 100, 10, 86), label: 'Watch window' },
    ]
  }, [chartData])

  const homePageSummary = dockItems.find((d) => d.id === 'home')?.summary ?? ''

  // Live KPI strip: leakage % · defensibility · batch anomaly · acceptance.

  // KPI 2 (total_observed_settled_volume) — derived from §8.1 leakage components:
  // observed ≈ intended − unmatched − under_settlement. Approximate but correct
  // direction-of-truth (reflects "money that actually settled cleanly").
  const intendedMinor = leakageData?.total_intended_amount_minor
    ? Number(leakageData.total_intended_amount_minor)
    : null
  const unmatchedMinor = leakageData?.unmatched_amount_minor
    ? Number(leakageData.unmatched_amount_minor)
    : 0
  const underSettlementMinor = leakageData?.under_settlement_amount_minor
    ? Number(leakageData.under_settlement_amount_minor)
    : 0
  const observedMinor = intendedMinor !== null
    ? Math.max(0, intendedMinor - unmatchedMinor - underSettlementMinor)
    : null

  const reversalMinor = leakageData?.reversal_exposure_minor
    ? Number(leakageData.reversal_exposure_minor)
    : 0
  const exposureMinor =
    intendedMinor !== null
      ? Math.max(0, unmatchedMinor + underSettlementMinor + reversalMinor)
      : null

  const actionHeadline =
    exposureMinor !== null && Number.isFinite(exposureMinor) ? fmtInrCompact(exposureMinor) : loading ? '…' : '—'

  const heroTotalDisbursementDisplay =
    observedMinor !== null && Number.isFinite(observedMinor)
      ? fmtInrCompact(observedMinor)
      : loading
        ? '…'
        : '₹'

  const trendInsight = useMemo(() => {
    if (trendSeries?.data_available && trendSeries.buckets.length >= 2) {
      const intents = trendSeries.buckets.reduce((s, b) => s + b.intent_count, 0)
      const confirmed = trendSeries.buckets.reduce((s, b) => s + b.confirmed_count, 0)
      const share = intents > 0 ? Math.round((confirmed / intents) * 100) : 0
      const capNote = trendSeries.note ? ` ${trendSeries.note}` : ''
      return `Live trend (${trendRange}): ${intents} intents, ${confirmed} bank-confirmed (${share}% by count).${capNote}`
    }
    if (leakageData && patternsData) {
      return `Leakage ${(leakageData.leakage_percentage * 100).toFixed(1)}% with ${patternsData.pending_count} intents still pending in the latest batch view (${patternsData.finality_status.replace(/_/g, ' ').toLowerCase()}).`
    }
    if (leakageData) {
      return `Leakage ${(leakageData.leakage_percentage * 100).toFixed(1)}% · ${leakageData.risk_tier} tier — monitor unmatched and under-settlement against intended volume.`
    }
    if (patternsData) {
      return `Latest batch anomaly ${(patternsData.batch_anomaly_score * 100).toFixed(0)}% (${patternsData.anomaly_level}) with ${patternsData.success_count}/${patternsData.total_count} successes.`
    }
    return TENANT_KPI_EMPTY_CAROUSEL_INSIGHT
  }, [trendSeries, trendRange, leakageData, patternsData])

  const exposureInsightMetric =
    leakageData != null
      ? fmtInrCompact(unmatchedMinor + underSettlementMinor)
      : heroTotalDisbursementDisplay
  const exposureInsightMetricSub =
    patternsData != null
      ? `${patternsData.pending_count} intents pending in latest batch signal`
      : 'Value in active mismatch / settlement review'

  const insightCarouselCards = useMemo(
    () =>
      buildZordInsightCards({
        tenantReady,
        kpiLoading: loading || trendLoading,
        emptyInsightParagraph: TENANT_KPI_EMPTY_CAROUSEL_INSIGHT,
        mismatchHeadline: exposureInsightMetric,
        mismatchSubtext: exposureInsightMetricSub,
        mismatchPendingCount: patternsData?.pending_count ?? 0,
        trendInsight,
        trendSeries,
        trendChartReady,
        leakageData,
        patternsData,
        unmatchedMinor,
        underSettlementMinor,
      }),
    [
      tenantReady,
      loading,
      trendLoading,
      trendInsight,
      trendSeries,
      trendChartReady,
      leakageData,
      patternsData,
      unmatchedMinor,
      underSettlementMinor,
      exposureInsightMetric,
      exposureInsightMetricSub,
    ],
  )

  const insightCarouselLoading = Boolean(
    tenantReady && insightCarouselCards.length === 0 && (loading || trendLoading),
  )

  const sparkBarsForCommandCenter = useMemo(() => {
    if (!trendSeries?.buckets?.length) return [] as number[]
    const vals = trendSeries.buckets.map((b) => Math.max(0, Number(b.total_amount) || 0))
    const tail = vals.length > 14 ? vals.slice(-14) : vals
    return tail
  }, [trendSeries])

  const liveWindowBandLabel = useMemo(() => {
    const tail = axisLabelsForChart[axisLabelsForChart.length - 1]
    if (tail) return `LIVE WINDOW: ${String(tail).toUpperCase()}`
    return `LIVE WINDOW: ${trendRange.toUpperCase()}`
  }, [axisLabelsForChart, trendRange])

  const liftRupeesMinor =
    intendedMinor !== null && exposureMinor !== null ? Math.max(0, intendedMinor - exposureMinor) : null
  const liftIntensity =
    intendedMinor !== null && intendedMinor > 0 && liftRupeesMinor !== null
      ? Math.min(1, liftRupeesMinor / intendedMinor)
      : 0.45

  const insightRingPct = useMemo(() => {
    if (trendSeries?.data_available && trendSeries.buckets.length) {
      const intents = trendSeries.buckets.reduce((s, b) => s + b.intent_count, 0)
      const confirmed = trendSeries.buckets.reduce((s, b) => s + b.confirmed_count, 0)
      if (intents > 0) return Math.round((confirmed / intents) * 100)
    }
    if (patternsData?.total_count && patternsData.total_count > 0) {
      return Math.round(((patternsData.success_count ?? 0) / patternsData.total_count) * 100)
    }
    return leakageData ? Math.round((1 - leakageData.leakage_percentage) * 100) : 0
  }, [trendSeries, patternsData, leakageData])

  const recoveryProgressPct = useMemo(() => {
    if (intendedMinor === null || observedMinor === null || intendedMinor <= 0) return 0
    return Math.min(100, (observedMinor / intendedMinor) * 100)
  }, [intendedMinor, observedMinor])

  const recoveryStatPair = useMemo(() => {
    const peak =
      sparkBarsForCommandCenter.length > 0 ? Math.max(...sparkBarsForCommandCenter) : null
    return {
      leftValue: peak !== null ? fmtInrCompact(peak) : '—',
      leftLabel: 'Peak bucket (this range)',
      rightValue: patternsData != null ? String(patternsData.pending_count) : '—',
      rightLabel: 'Pending check',
    }
  }, [sparkBarsForCommandCenter, patternsData])

  const exceptionSharePct = useMemo(() => {
    if (leakageData === null || intendedMinor === null || intendedMinor <= 0 || exposureMinor === null) return null
    return Math.min(100, (exposureMinor / intendedMinor) * 100)
  }, [leakageData, intendedMinor, exposureMinor])

  const exceptionRiskPct = exceptionSharePct ?? 0
  const exceptionHeroPct = exceptionSharePct

  const exceptionStatPair = useMemo(
    () => ({
      leftValue: leakageData != null ? fmtInrCompact(unmatchedMinor) : '—',
      leftLabel: 'Unmatched',
      rightValue: leakageData != null ? fmtInrCompact(underSettlementMinor) : '—',
      rightLabel: 'Under settlement',
    }),
    [leakageData, unmatchedMinor, underSettlementMinor],
  )

  const liftStatPair = useMemo(
    () => ({
      leftValue: intendedMinor !== null ? fmtInrCompact(intendedMinor) : '—',
      leftLabel: 'Intended (baseline)',
      rightValue: observedMinor !== null ? fmtInrCompact(observedMinor) : '—',
      rightLabel: 'Observed (clean)',
    }),
    [intendedMinor, observedMinor],
  )

  const liftPct = useMemo(() => {
    if (liftRupeesMinor === null || intendedMinor === null || intendedMinor <= 0) return null
    return Math.min(100, (liftRupeesMinor / intendedMinor) * 100)
  }, [liftRupeesMinor, intendedMinor])

  const exceptionLegendRows: Array<{ dot: string; label: string }> = [
    { dot: '#4ade80', label: 'Unmatched' },
    { dot: '#a78bfa', label: 'Under settlement' },
    { dot: '#94a3b8', label: 'Reversal exposure' },
  ]

  const exceptionFooterText =
    leakageData != null
      ? `Roughly ${fmtInrCompact(unmatchedMinor + underSettlementMinor + reversalMinor)} sits in unmatched, under-settlement, and reversal exposure for this workspace — triage in Leakage.`
      : 'When leakage KPIs load, unmatched and under-settlement drivers appear here with rupee context.'

  const recoveryFooterText =
    'Recovered value is the portion of intended disbursement that clears without unmatched or under-settlement drag — use Leakage for the full rupee breakdown.'

  const liftFooterText =
    liftRupeesMinor !== null && intendedMinor !== null
      ? 'Incremental value retained versus the at-risk exposure implied by unmatched and under-settlement balances on the same intended base.'
      : 'When intelligence leakage and intended totals are available, lift compares cleared value to the at-risk pool.'

  const disbursementHeroInner = (
    <>
      <div className={`text-[42px] font-extrabold leading-none tracking-[-0.03em] tabular-nums sm:text-[42px] ${HOME_TITLE_BLACK}`}>
        {heroTotalDisbursementDisplay}
      </div>
      <div className={`mt-2 text-[18px] font-bold leading-snug tracking-[-0.02em] sm:text-[20px] ${HOME_TITLE_BLACK}`}>
        Total Disbursement Value
      </div>
      <p className={`mt-2 text-center ${HOME_BODY_IMPERIAL_CENTERED}`}>
        {intendedMinor !== null
          ? `of ${fmtInrCompact(intendedMinor)} intended this period · settled cleanly`
          : loading
            ? 'Loading workspace disbursement snapshot…'
            : 'No disbursement activity detected yet. Totals will appear after the first processed payout batch.'}
      </p>
    </>
  )

  const trendPanelInner = (
    <>
        <div className="min-w-0">
          <SurfaceEyebrow variant="stripe">Trend</SurfaceEyebrow>
          <h2 className={`mt-1 text-[20px] font-semibold leading-snug tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
            Disbursement &amp; confirmation trend
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {TREND_RANGE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTrendRange(f.id)}
                className={`rounded-full px-3 py-1 text-[14px] font-medium tracking-[0] transition ${
                  trendRange === f.id
                    ? 'bg-[#39E07E] text-[#000000] shadow-sm ring-1 ring-[#39E07E]/40'
                    : `border border-[#e5e5e5] bg-white hover:bg-[#fafafa] ${HOME_TITLE_BLACK}`
                }`}
              >
                {f.label}
              </button>
            ))}
            <LiveDataHint
              isLive={trendChartReady}
              source={tenantReady ? 'intents · trend' : 'workspace'}
            />
            {trendLoading ? <span className="text-[11px] font-normal text-[#888888]">Updating…</span> : null}
          </div>
          <p className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 ${HOME_BODY_IMPERIAL}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" /> Total disbursement
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#a78bfa]" /> Bank-confirmed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#94a3b8]" /> Lower bound
            </span>
          </p>
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
              <div className="text-[11px] font-normal uppercase tracking-[0.06em] text-[#888888]">{monthLabel}</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className={`text-[16px] font-semibold tabular-nums tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
                  {fmtTrendTooltipInr(activeChartDatum.barValue)}
                </div>
                <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-[#39E07E] px-2.5 font-semibold text-[#000000] shadow-[0_2px_10px_rgba(57,224,126,0.35)]">
                  <DashboardDeltaPercent value={deltaFromTrend} />
                </span>
              </div>
              <div className={`mt-2 ${HOME_BODY_IMPERIAL_SM}`}>{liveTooltipNote}</div>
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
                      fill={entry.selected ? '#16a34a' : entry.isHoliday ? '#94a3b8' : '#4ade80'}
                      opacity={entry.point === activeChartDatum.point ? 1 : 0.78}
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="lowerLineValue"
                  stroke="#94a3b8"
                  strokeWidth={1.1}
                  dot={false}
                  activeDot={false}
                  strokeLinecap="round"
                  connectNulls
                  isAnimationActive
                />
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

        <div className="mt-6 flex w-full min-h-[48px] items-stretch border-y border-[#e8e8e5] bg-white">
          <div className={`flex w-1/2 min-w-0 items-center border-r border-[#ecece9] px-4 py-3 text-left text-[14px] font-medium tracking-[0] sm:px-6 lg:px-8 ${HOME_TITLE_BLACK}`}>
            <span className="truncate">{snapshot.timeframeLabel}</span>
          </div>
          <div className="flex w-1/2 min-w-0 items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-8">
            {HOME_YEAR_OPTIONS.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => onYearChange(year)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium tracking-[0] transition ${
                  snapshot.selectedYear === year
                    ? 'bg-[#39E07E] text-[#000000] shadow-sm ring-1 ring-[#39E07E]/35'
                    : `border border-[#E5E5E5] bg-white hover:bg-[#f5f5f5] ${HOME_TITLE_BLACK}`
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {timeframe === 'Week' && snapshot.holidayLabels.length > 0 ? (
          <div className="mt-3 px-4 sm:px-6 lg:px-8">
            <div className={`rounded-[0.95rem] border border-[#E5E5E5] bg-white px-3 py-2 ${HOME_BODY_IMPERIAL}`}>
              Holidays included: {snapshot.holidayLabels.join(' • ')}
            </div>
          </div>
        ) : null}

        {timeframe === 'Custom' ? (
          <div className="mt-3 px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[1rem] border border-[#E5E5E5] bg-white text-[13px] font-normal tracking-[0]">
          <div className={`grid grid-cols-[1.1fr_2fr_0.8fr] bg-[#f8f8f7] px-3 py-2 text-[14px] font-medium ${HOME_TITLE_BLACK}`}>
            <div>Range</div>
            <div className={HOME_BODY_IMPERIAL_SM}>Months included</div>
            <div>Total</div>
          </div>
          {HOME_QUARTERS.map((quarter, index) => (
            <button
              key={quarter.name}
              type="button"
              onClick={() => onQuarterChange(index)}
              className={`grid w-full grid-cols-[1.1fr_2fr_0.8fr] px-3 py-2 text-left text-[13px] transition ${
                quarter.name === snapshot.quarterName ? `bg-[#eef2f7]` : 'hover:bg-[#fafafa]'
              }`}
            >
              <span className={HOME_TITLE_BLACK}>{quarter.name}</span>
              <span className={HOME_BODY_IMPERIAL_SM}>{quarter.months.join(', ')}</span>
              <span className={HOME_TITLE_BLACK}>3</span>
            </button>
          ))}
        </div>
          </div>
        ) : null}

        <div className="relative mt-0 w-full border-b border-[#e5e5e5] bg-white px-4 py-6 sm:px-6 lg:px-8">
          {trendPanelInner}
        </div>

        <section
          className="mt-8 space-y-3 bg-[#f4f4f1] px-2 pb-3 pt-1.5 sm:px-3 lg:px-4"
          aria-labelledby="home-today-command-center-title"
        >
          <div className="w-full max-w-none space-y-3">
            <div className="rounded-[12px] border border-slate-200/90 bg-white/95 px-3 py-2.5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:px-3.5 sm:py-2.5">
              <h2
                id="home-today-command-center-title"
                className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full bg-[#39E07E] px-3.5 py-1.5 text-[14px] font-medium tracking-[0] text-[#000000] shadow-sm ring-1 ring-[#39E07E]/30"
              >
                Today · command center
              </h2>
              <p className={`mt-0.5 max-w-2xl ${HOME_BODY_IMPERIAL}`}>{homePageSummary}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <LiveDataHint
                  isLive={Boolean(loading || leakageData || defData || patternsData || recsData || ambData)}
                  source="intelligence"
                />
              </div>
            </div>

            <HomeCommandCenterLightBand
              recoveryValue={heroTotalDisbursementDisplay}
              recoverySub="Recovered value (settled cleanly)"
              liveWindowLabel={liveWindowBandLabel}
              sparkBars={sparkBarsForCommandCenter}
              recoveryFooter={recoveryFooterText}
              trendRange={trendRange}
              onTrendRangeChange={setTrendRange}
              recoveryStatPair={recoveryStatPair}
              recoveryProgressPct={recoveryProgressPct}
              exceptionValue={actionHeadline}
              exceptionSub="At-risk & exception exposure"
              exceptionLegend={exceptionLegendRows}
              exceptionFooter={exceptionFooterText}
              exceptionStatPair={exceptionStatPair}
              exceptionRiskPct={exceptionRiskPct}
              exceptionHeroPct={exceptionHeroPct}
              liftValue={liftRupeesMinor !== null ? fmtInrCompact(liftRupeesMinor) : loading ? '…' : '—'}
              liftSub="Lift over at-risk exposure"
              liftIntensity={liftIntensity}
              liftFooter={liftFooterText}
              liftStatPair={liftStatPair}
              liftPct={liftPct}
              insightBody={trendInsight}
              insightMetric={
                leakageData != null
                  ? fmtInrCompact(unmatchedMinor + underSettlementMinor)
                  : heroTotalDisbursementDisplay
              }
              insightMetricSub={
                patternsData != null
                  ? `${patternsData.pending_count} intents pending in latest batch signal`
                  : 'Value in active mismatch / settlement review'
              }
              insightRingPct={insightRingPct}
              insightCarousel={
                <ZordInsightCarousel
                  key={tenantId || 'no-tenant'}
                  tenantReady={tenantReady}
                  autoplay
                  interval={4000}
                  loading={insightCarouselLoading}
                  cards={insightCarouselCards}
                />
              }
            />
          </div>
        </section>

        <div className="relative z-10 mt-8 w-full px-4 sm:px-6 lg:px-8">
        {commandResponse ? (
          <div className="mx-auto mb-3 w-full max-w-[30rem] rounded-[1.2rem] border border-black/10 bg-white px-4 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-normal uppercase tracking-[0.06em] text-[#888888]">
                  {commandStatus === 'loading' ? 'Analyzing prompt' : commandStatus === 'typing' ? 'Drafting response' : 'Scope summary'}
                </div>
                <div className={`mt-1 text-[20px] font-semibold leading-snug tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>{commandResponse.title}</div>
                <div className={`mt-2 min-h-[3.25rem] ${HOME_BODY_IMPERIAL_SM}`}>
                  {commandResponse.body}
                  {commandStatus === 'typing' ? <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-[#179a4c] align-middle" /> : null}
                </div>
              </div>
              <button type="button" onClick={onDismissCommandResponse} className="text-[17px] text-[#8b8a86]">
                ×
              </button>
            </div>
          </div>
        ) : null}
        {!isPromptExpanded ? (
          <button
            type="button"
            onClick={() => setIsPromptExpanded(true)}
            className="mx-auto flex w-full max-w-[24rem] items-center gap-3 rounded-[1rem] bg-[#1F1F1F] px-4 py-3 text-left text-white shadow-[0_8px_32px_rgba(0,0,0,0.10)]"
            aria-label="Open Ask Zord prompt"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[0.7rem] bg-[#4ADE80] text-[#000000]">
              <Glyph name="zap" className="h-4 w-4" />
            </span>
            <span className="text-[17px] font-medium">Ask Zord</span>
            <span className="ml-auto text-white/70">
              <Glyph name="arrow-up-right" className="h-4 w-4" />
            </span>
          </button>
        ) : (
          <div className="rounded-[1.35rem] bg-[#1F1F1F] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.10)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[14px] uppercase tracking-[0.1em] text-white/60">Ask Zord</div>
              <button
                type="button"
                onClick={() => setIsPromptExpanded(false)}
                className="rounded-full border border-white/20 px-2.5 py-1 text-[14px] text-white/75 hover:text-white"
              >
                Minimize
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {homeSimulationScenarios.map((item) => (
                <button
                  key={`home-command-${item.prompt}`}
                  type="button"
                  onClick={() => onQuickPrompt(item.prompt)}
                  className={`rounded-[0.9rem] px-3 py-2 text-[15px] transition ${
                    scenario.prompt === item.prompt ? 'bg-white/16 text-white' : 'bg-white/10 text-white/74 hover:bg-white/14 hover:text-white'
                  } ${commandStatus === 'loading' || commandStatus === 'typing' ? 'opacity-70' : ''}`}
                >
                  {item.prompt}
                </button>
              ))}
            </div>

            <div ref={promptRowRef} className="flex items-center gap-3 rounded-[1rem] border border-white/8 bg-[#232323] p-3">
              <div className={`flex h-14 w-14 items-center justify-center rounded-[0.85rem] bg-[#4ADE80] text-[#000000] ${commandStatus === 'loading' || commandStatus === 'typing' ? 'animate-pulse' : ''}`}>
                <Glyph name="zap" className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <input
                  value={promptInput}
                  onChange={(event) => onPromptInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onPromptSubmit()
                  }}
                  placeholder="Ask about disbursement status, delays, or confirmations"
                  className={`w-full bg-transparent text-center text-[18px] !text-white placeholder:text-white/48 caret-[#4ADE80] outline-none ${promptTone.inputToneClass}`}
                />
                <div className={`mt-1 text-center text-[14px] tracking-[0.04em] ${promptTone.captionToneClass}`}>
                  {commandStatus === 'loading'
                    ? 'Reading disbursement snapshot and confirmation signals…'
                    : commandStatus === 'typing'
                      ? 'Drafting a short operator-style answer…'
                      : 'Prompt adjusts scope labels only — disbursement chart and KPIs load from `/api/prod` intelligence and trend routes.'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onPromptSubmit}
                  className="flex h-12 w-12 items-center justify-center rounded-[0.85rem] border border-white/8 bg-transparent text-white"
                  aria-label="Home overview help"
                >
                  <Glyph name="arrow-up-right" className="h-[18px] w-[18px]" />
                </button>
                <button
                  type="button"
                  className="flex h-12 w-12 items-center justify-center rounded-[0.85rem] border border-white/8 bg-transparent text-white"
                  aria-label="Home overview tools"
                >
                  <Glyph name="grid" className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
