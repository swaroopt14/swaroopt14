'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  clamp,
  dockItems,
  formatPercentBadge,
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
import { HomeCommandCenterKpiCard } from '../command-center/HomeCommandCenterKpiCard'
import { HomeHeroInsightCard } from '../command-center/OutcomeInsightCardGroup'
import { ClientChart, Glyph, LiveDataHint, SurfaceEyebrow, usePromptAutoContrast } from '../shared'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { DisbursementTrendRange } from '@/services/payout-command/prod-api/disbursementTrendTypes'
import { useDisbursementTrend } from '@/services/payout-command/prod-api/useDisbursementTrend'

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
  onOpenProblemWorkspace,
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
  onOpenProblemWorkspace?: () => void
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

  const tenantId = useSessionTenantId()
  const tenantReady = tenantId.trim().length > 0
  const [trendRange, setTrendRange] = useState<DisbursementTrendRange>('month')
  const { data: trendSeries, loading: trendLoading } = useDisbursementTrend(tenantId, trendRange)

  const { leakage, ambiguity, defensibility, patterns, recommendations, loading } = useIntelligenceKpis(tenantId)
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
    : snapshot.range
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
  const activeDelta = formatPercentBadge(deltaFromTrend)

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
    exposureMinor !== null && Number.isFinite(exposureMinor) ? fmtInrCompact(exposureMinor) : fmtInrCompact(0)
  const actionSub =
    patternsData != null
      ? `${patternsData.pending_count} intents pending · ${patternsData.finality_status.replace(/_/g, ' ').toLowerCase()}`
      : leakageData
        ? `${leakageData.risk_tier} leakage posture · review unmatched + under-settlement`
        : 'Awaiting intelligence snapshot for this workspace'

  const heroTotalDisbursementDisplay =
    observedMinor !== null && Number.isFinite(observedMinor) ? fmtInrCompact(observedMinor) : fmtInrCompact(0)

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
    return 'Confirmation values are increasing steadily while pending amounts are reducing, indicating normal settlement flow.'
  }, [trendSeries, trendRange, leakageData, patternsData])

  /** 2×2 grid: row1 Leakage | Batch anomaly · row2 Defensibility | Action contracts — each tile is its own Insight-style card. */
  const commandCenterKpiCards = useMemo(
    () => [
      {
        key: 'leakage',
        title: 'Leakage',
        value: leakageData ? `${(leakageData.leakage_percentage * 100).toFixed(1)}%` : loading ? '…' : '—',
        detail: leakageData ? `${leakageData.risk_tier} risk tier` : 'Open the Leakage dock for full rupee view and drivers.',
        dockHref: '/payout-command-view/today?dock=leakage',
        dockEyebrow: 'Leakage',
        dockLine: 'Open Leakage dock for full ₹ view',
      },
      {
        key: 'batch',
        title: 'Batch anomaly',
        value: patternsData ? `${(patternsData.batch_anomaly_score * 100).toFixed(0)}%` : loading ? '…' : '—',
        detail: patternsData
          ? `${patternsData.anomaly_level} · ${patternsData.finality_status.replace(/_/g, ' ')}`
          : 'Patterns and latest batch health from intelligence.',
        dockHref: '/payout-command-view/today?dock=grid',
        dockEyebrow: 'Intent journal',
        dockLine: 'Patterns / latest batch',
      },
      {
        key: 'defensibility',
        title: 'Defensibility',
        value: defData ? defData.defensibility_score.toFixed(1) : loading ? '…' : '—',
        detail: defData ? `${defData.defensibility_tier} tier · proof posture` : 'Open Evidence for defensibility and packs.',
        dockHref: '/payout-command-view/today?dock=proof',
        dockEyebrow: 'Evidence',
        dockLine: 'Open Evidence dock for proof posture',
      },
      {
        key: 'actions',
        title: 'Action contracts',
        value: recsData ? `${(recsData.action_acceptance_rate * 100).toFixed(1)}%` : loading ? '…' : '—',
        detail: recsData
          ? `${recsData.accepted_actions} accepted · ${recsData.total_actions} total`
          : 'Recommendation acceptance from intelligence.',
        dockHref: '/payout-command-view/today?dock=grid',
        dockEyebrow: 'Intent journal',
        dockLine: 'Recommendations & batch',
      },
    ],
    [leakageData, defData, patternsData, recsData, loading],
  )

  return (
    <div className="mt-0 w-full min-w-0 text-[18px]">
        {/* Primary metric */}
        <div className="px-4 pt-2 text-center sm:px-6 lg:px-8">
          <div className="text-[4.51rem] font-light tracking-[-0.03em] text-[#111111] md:text-[5.59rem] lg:text-[5.91rem]">
            {heroTotalDisbursementDisplay}
          </div>
          <div className="mt-2 text-[1.45rem] font-normal text-[#111111]">Total Disbursement Value</div>
          <p className="mx-auto mt-2 max-w-2xl text-[18px] leading-7 text-[#6f716d]">
            {intendedMinor !== null
              ? `of ${fmtInrCompact(intendedMinor)} intended this period · settled cleanly`
              : loading
                ? 'Loading workspace disbursement snapshot…'
                : 'No disbursement volume for this workspace yet — totals appear once intelligence has batch data.'}
          </p>
        </div>

        <div className="mt-6 flex w-full min-h-[48px] items-stretch border-y border-[#e8e8e5] bg-white">
          <div className="flex w-1/2 min-w-0 items-center border-r border-[#ecece9] px-4 py-3 text-left text-[16px] font-medium text-[#6f716d] sm:px-6 lg:px-8">
            <span className="truncate">{snapshot.timeframeLabel}</span>
          </div>
          <div className="flex w-1/2 min-w-0 items-center justify-end gap-2 px-4 py-3 sm:px-6 lg:px-8">
            {HOME_YEAR_OPTIONS.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => onYearChange(year)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[15px] font-medium transition ${
                  snapshot.selectedYear === year ? 'bg-[#111111] text-white' : 'border border-[#E5E5E5] bg-white text-[#6f716d] hover:bg-[#f5f5f5]'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {timeframe === 'Week' && snapshot.holidayLabels.length > 0 ? (
          <div className="mt-3 px-4 sm:px-6 lg:px-8">
            <div className="rounded-[0.95rem] border border-[#E5E5E5] bg-white px-3 py-2 text-[15px] text-[#6f716d]">
              Holidays included: {snapshot.holidayLabels.join(' • ')}
            </div>
          </div>
        ) : null}

        {timeframe === 'Custom' ? (
          <div className="mt-3 px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[1rem] border border-[#E5E5E5] bg-white text-[15px] text-[#6f716d]">
          <div className="grid grid-cols-[1.1fr_2fr_0.8fr] bg-[#f8f8f7] px-3 py-2 font-medium text-[#5f605b]">
            <div>Range</div>
            <div>Months included</div>
            <div>Total</div>
          </div>
          {HOME_QUARTERS.map((quarter, index) => (
            <button
              key={quarter.name}
              type="button"
              onClick={() => onQuarterChange(index)}
              className={`grid w-full grid-cols-[1.1fr_2fr_0.8fr] px-3 py-2 text-left transition ${
                quarter.name === snapshot.quarterName ? 'bg-[#eef2f7] text-[#111111]' : 'hover:bg-[#fafafa]'
              }`}
            >
              <span>{quarter.name}</span>
              <span>{quarter.months.join(', ')}</span>
              <span>3</span>
            </button>
          ))}
        </div>
          </div>
        ) : null}

        {/* Trend chart — full width directly under period controls */}
      <div className="relative mt-0 w-full border-b border-[#e5e5e5] bg-white px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <SurfaceEyebrow>Trend</SurfaceEyebrow>
            <h2 className="mt-1 text-[1.45rem] font-medium tracking-[-0.03em] text-[#111111]">Disbursement &amp; confirmation trend</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {TREND_RANGE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTrendRange(f.id)}
                  className={`rounded-full px-3 py-1 text-[14px] font-semibold transition ${
                    trendRange === f.id ? 'bg-[#111111] text-white' : 'border border-[#e5e5e5] bg-white text-[#64748b] hover:bg-[#fafafa]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <LiveDataHint
                isLive={trendChartReady}
                source={tenantReady ? 'intents · trend' : 'workspace'}
              />
              {trendLoading ? <span className="text-[13px] text-[#94a3b8]">Updating…</span> : null}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-[#6f716d]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#888888]" /> Total disbursement
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#111111]" /> Bank-confirmed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#d0d0d0]" /> Lower bound
              </span>
            </p>
          </div>
          <p className="max-w-md shrink-0 rounded-xl border border-[#eef2f7] bg-[#f8fafc] px-3 py-2 text-[15px] leading-snug text-[#475569]">
            <span className="font-semibold text-[#111111]">Insight: </span>
            {trendInsight}
          </p>
        </div>
        {trendChartReady ? (
        <div
          className="pointer-events-none absolute bottom-[5.25rem] top-[7.5rem] z-0 bg-white/70 md:bottom-[5.5rem] md:top-[8rem]"
          style={{ left: `${rangeLeftPercent}%`, width: `${rangeWidthPercent}%`, opacity: 0.08 }}
        />
        ) : null}

        {trendChartReady ? (
        <div
          className="pointer-events-auto absolute top-[min(52%,18rem)] z-20 w-[15rem] max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-lg border-[0.5px] border-[#E0E0DE] bg-white px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:w-[16.5rem]"
          style={{ left: `clamp(0.5rem, ${tooltipLeftPercent}%, calc(100% - 17rem))` }}
        >
          <button
            type="button"
            className="absolute right-2 top-2 text-[15px] leading-none text-[#999999] hover:text-[#111111]"
            aria-label="Dismiss chart note"
          >
            ×
          </button>
          <div className="text-[13px] font-medium uppercase tracking-[0.12em] text-[#8b8a86]">{monthLabel}</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-[19px] font-semibold text-[#111111]">
              {fmtTrendTooltipInr(activeChartDatum.barValue)}
            </div>
            <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-[#4ADE80] px-2.5 text-[13px] font-semibold text-[#111111] shadow-[0_2px_10px_rgba(74,222,128,0.45)]">
              {activeDelta}
            </span>
          </div>
          <div className="mt-2 text-[14px] font-normal leading-4 text-[#8b8a86]">{liveTooltipNote}</div>
        </div>
        ) : null}

        <div className="relative z-[1] mt-6 min-w-0" onMouseLeave={() => setHoverIndex(null)}>
          {trendChartReady ? (
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
                  tick={{ fill: '#999999', fontSize: 13, fontWeight: 400 }}
                />
                <Bar dataKey="barValue" barSize={4} radius={[0, 0, 0, 0]} isAnimationActive>
                  {chartData.map((entry) => (
                    <Cell
                      key={`home-bar-${entry.point}`}
                      fill={entry.selected ? '#1A1A1A' : entry.isHoliday ? '#9fa2a7' : '#888888'}
                      opacity={entry.point === activeChartDatum.point ? 1 : 0.84}
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="lowerLineValue"
                  stroke="#D0D0D0"
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
                  stroke="#111111"
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
          ) : tenantReady && trendLoading ? (
            <div className="h-[21rem] w-full animate-pulse rounded-lg bg-slate-100 md:h-[23rem]" aria-busy="true" />
          ) : (
            <div className="flex h-[21rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center text-[16px] leading-snug text-slate-600 md:h-[23rem]">
              {tenantReady ? (
                <>
                  <span className="font-medium text-slate-800">No trend data in this range</span>
                  <span className="max-w-md text-[15px] text-slate-500">Try Week / Month / Quarter / Year, or wait until intents exist in the selected window.</span>
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-800">Workspace required</span>
                  <span className="max-w-md text-[15px] text-slate-500">Sign in and select a tenant to plot disbursement and confirmation from the intent ledger.</span>
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
          className="mt-4 grid min-w-0 text-[14px] text-[#999999]"
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
              className="rounded-full border border-black/10 bg-[#fafafa] px-3 py-1.5 text-[14px] font-semibold text-[#111111]"
            >
              {tag.label}
            </span>
          ))}
        </div>
          </>
        ) : null}
      </div>

        <section
          className="mt-8 space-y-3 bg-[#f4f4f1] px-2 pb-3 pt-1.5 sm:px-3 lg:px-4"
          aria-labelledby="home-today-command-center-title"
        >
          <div className="w-full max-w-none space-y-3">
            <div className="rounded-[12px] border border-slate-200/90 bg-white/95 px-3 py-2.5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:px-3.5 sm:py-2.5">
              <h2 id="home-today-command-center-title" className="text-[16px] font-bold tracking-[-0.02em] text-[#0f172a]">
                Today · command center
              </h2>
              <p className="mt-0.5 text-[14px] leading-snug text-slate-600">{homePageSummary}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <LiveDataHint
                  isLive={Boolean(loading || leakageData || defData || patternsData || recsData || ambData)}
                  source="intelligence"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
              {commandCenterKpiCards.map((card) => (
                <HomeCommandCenterKpiCard
                  key={card.key}
                  title={card.title}
                  value={card.value}
                  detail={card.detail}
                  dockHref={card.dockHref}
                  dockEyebrow={card.dockEyebrow}
                  dockLine={card.dockLine}
                />
              ))}
            </div>
          </div>

          <div className="w-full max-w-none pt-0.5">
            <HomeHeroInsightCard fullWidth />
          </div>
        </section>

        {/* Action Required — glass on deep red */}
        <article
          id="home-action-panel"
          className="scroll-mt-28 group relative mx-4 mt-8 overflow-hidden rounded-[22px] border border-red-400/25 shadow-[0_16px_48px_rgba(127,29,29,0.45)] ring-1 ring-red-950/30 sm:mx-6 lg:mx-8"
          aria-labelledby="home-action-required-title"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-red-950 via-[#7f1d1d] to-[#b91c1c]" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.22) 1.5px, transparent 0)`,
              backgroundSize: '12px 12px',
            }}
            aria-hidden
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-red-950/20 backdrop-blur-[1px]" aria-hidden />
          <div className="relative z-[1] p-6 text-white sm:p-7">
            <div className="relative mb-4 h-1 w-12 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.5)]" />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <h2 id="home-action-required-title" className="text-[18px] font-bold tracking-[-0.02em] text-white drop-shadow-sm">
                  Action Required
                </h2>
                <p className="mt-2 text-[32px] font-bold tracking-[-0.04em] text-white drop-shadow-sm sm:text-[36px]">
                  {actionHeadline}
                </p>
                <p className="mt-2 text-[16px] leading-relaxed text-white/90">{actionSub}</p>
                <p className="mt-3 text-[18px] font-semibold text-white">
                  {ambData
                    ? `${ambData.ambiguous_intent_count} ambiguous intents · ambiguity ${(ambData.ambiguity_rate * 100).toFixed(1)}%`
                    : patternsData
                      ? `${patternsData.failed_count} failed · ${patternsData.success_count} succeeded (latest batch signal)`
                      : 'Open Recovery or Leakage docks to triage'}
                </p>
              </div>
              {onOpenProblemWorkspace ? (
                <button
                  type="button"
                  onClick={onOpenProblemWorkspace}
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/35 bg-white/15 px-4 py-3 text-[16px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] backdrop-blur-md transition hover:bg-white/25 hover:border-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
                >
                  Open problem workspace
                  <Glyph name="arrow-up-right" className="h-4 w-4 opacity-90" />
                </button>
              ) : (
                <Link
                  href="/payout-command-view/today?dock=leakage"
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/35 bg-white/15 px-4 py-3 text-[16px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] backdrop-blur-md transition hover:bg-white/25 sm:w-auto"
                >
                  Open problem workspace
                  <Glyph name="arrow-up-right" className="h-4 w-4 opacity-90" />
                </Link>
              )}
            </div>
            <div className="mt-6 rounded-[20px] border border-white/30 bg-white/15 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md">
              <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-white/85">Recommended Action:</span>
              <p className="mt-2 text-[16px] font-medium leading-snug text-white/95">
                Follow up on delayed confirmations — this is the primary reason for pending value
              </p>
            </div>
          </div>
        </article>

        <div className="relative z-10 mt-10 w-full px-4 sm:px-6 lg:px-8">
        {commandResponse ? (
          <div className="mx-auto mb-3 w-full max-w-[30rem] rounded-[1.2rem] border border-black/10 bg-white px-4 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-medium uppercase tracking-[0.14em] text-[#179a4c]">
                  {commandStatus === 'loading' ? 'Analyzing snapshot' : commandStatus === 'typing' ? 'Drafting response' : 'Simulation response'}
                </div>
                <div className="mt-1 text-[18px] font-medium text-[#111111]">{commandResponse.title}</div>
                <div className="mt-2 min-h-[3.25rem] text-[16px] leading-6 text-[#6f716d]">
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
            <span className="flex h-9 w-9 items-center justify-center rounded-[0.7rem] bg-[#4ADE80] text-[#111111]">
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
              <div className={`flex h-14 w-14 items-center justify-center rounded-[0.85rem] bg-[#4ADE80] text-[#111111] ${commandStatus === 'loading' || commandStatus === 'typing' ? 'animate-pulse' : ''}`}>
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
                      : 'Simulation only — answers summarize the numbers on this screen.'}
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
