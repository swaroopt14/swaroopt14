'use client'

import { useRef, useState } from 'react'
import { Bar, Cell, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import {
  clamp,
  formatPercentBadge,
  formatUsdCompactK,
  HOME_CHART_DOMAIN_MAX,
  HOME_QUARTERS,
  HOME_YEAR_OPTIONS,
  homeSimulationScenarios,
  homeTimeframes,
  type HomeCommandResponse,
  type HomeCommandStatus,
  type HomeOverviewSnapshot,
  type HomeSimulation,
  type HomeTimeframe,
} from '@/services/payout-command/model'
import { ClientChart, Glyph, LightCard, SurfaceEyebrow, usePromptAutoContrast } from '../shared'

export function HomeSurface({
  scenario,
  snapshot,
  timeframe,
  onTimeframeChange,
  onYearChange,
  onQuarterChange,
  activeChartPoint,
  onActiveChartPointChange,
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
  const promptRowRef = useRef<HTMLDivElement | null>(null)
  const promptTone = usePromptAutoContrast(promptRowRef)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [isPromptExpanded, setIsPromptExpanded] = useState(false)
  const displayPoint = hoverIndex ?? activeChartPoint
  const [selectedRangeStart, selectedRangeEnd] = snapshot.range
  const activeChartDatum = snapshot.chartData[clamp(displayPoint, 0, snapshot.chartData.length - 1)]
  const totalChartBars = snapshot.chartData.length
  const rangeLeftPercent = (selectedRangeStart / totalChartBars) * 100
  const rangeWidthPercent = ((selectedRangeEnd - selectedRangeStart + 1) / totalChartBars) * 100
  const tooltipLeftPercent = clamp((activeChartDatum.point / totalChartBars) * 100 - 8, 3, 74)
  const labelIndex = Math.min(snapshot.axisLabels.length - 1, Math.floor((activeChartDatum.point / totalChartBars) * snapshot.axisLabels.length))
  const monthLabel = snapshot.axisLabels[labelIndex]
  const deltaFromTrend = ((activeChartDatum.barValue - activeChartDatum.lineValue) / Math.max(activeChartDatum.lineValue, 1)) * 100
  const activeDelta = formatPercentBadge(deltaFromTrend)
  const hoverLift = clamp(activeChartDatum.barValue / HOME_CHART_DOMAIN_MAX - 0.5, -0.32, 0.42)
  const liveSalesValue = formatUsdCompactK(snapshot.salesBaseValue * (1 + hoverLift * 0.025))
  const liveExpensesValue = formatUsdCompactK(snapshot.expensesBaseValue * (1 - hoverLift * 0.02))
  const liveBudgetValue = formatUsdCompactK(snapshot.budgetBaseValue * (1 + hoverLift * 0.022))
  const liveInsightValue = formatUsdCompactK(snapshot.insightBaseValue * (1 + hoverLift * 0.024))
  const pendingAwaitingConfirmation = formatUsdCompactK(snapshot.salesBaseValue * (0.39 + clamp(hoverLift * 0.09, -0.06, 0.08)))
  const verificationAffectedPct = `${Math.round(clamp(11 + hoverLift * 10, 6, 24))}%`
  const confirmationRateFrom = `${Math.round(clamp(82 + hoverLift * 4, 78, 89))}%`
  const confirmationRateTo = `${Math.round(clamp(91 + hoverLift * 6, 86, 98))}%`
  const affectedTransactions = Math.round(clamp(148 + hoverLift * 62, 84, 236))
  const confirmationMiniBars = snapshot.chartData
    .slice(selectedRangeStart, selectedRangeEnd + 1)
    .filter((_, index) => index % 2 === 0)
    .slice(0, 16)
    .map((entry) => entry.barValue / HOME_CHART_DOMAIN_MAX)

  // Card visual derivations — all respond to chart hover via hoverLift
  const recoveryTrendUp = hoverLift >= -0.04
  const recoveryTrendLabel = `${recoveryTrendUp ? '+' : ''}${Math.round(hoverLift * 44 + 8)}%`
  const upliftPct = `+${Math.round(clamp(hoverLift * 48 + 24, 10, 42))}%`
  const burnBreakdown: Array<[string, string, number]> = [
    ['Manual verification', '#111111', clamp(34 + Math.round(hoverLift * 6), 26, 42)],
    ['Bank confirmation pending', '#4ADE80', clamp(28 - Math.round(hoverLift * 4), 20, 36)],
    ['Payment partner issue', '#b7b7b7', clamp(24 + Math.round(hoverLift * 2), 18, 30)],
    ['Other issues', '#D4D4D2', clamp(14 - Math.round(hoverLift * 4), 8, 20)],
  ]
  const burnTotal = burnBreakdown.reduce((s, [, , v]) => s + v, 0)

  const liveTooltipNote =
    timeframe === 'Week'
      ? `Value of disbursements successfully completed around ${monthLabel}. Includes holiday impact in this week window.`
      : timeframe === 'Quarter'
        ? `Value of disbursements successfully completed during ${snapshot.quarterName} (${snapshot.quarterMonths.join(', ')}).`
        : timeframe === 'Year'
          ? `Value of disbursements successfully completed during ${snapshot.selectedYear}.`
          : `Value of disbursements successfully completed around ${monthLabel} in the active month window.`

  return (
    <div className="mt-8 text-[15px]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#8b8a86]">
            Half-year disbursement statement
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[14px] text-[#6f716d]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#d4d4d4]" />
              <span>Without route optimization</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#111111]" />
              <span>Confirmed after route optimization</span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 text-sm text-[#6f716d] sm:grid-cols-4">
          {homeTimeframes.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onTimeframeChange(label)}
              className={`rounded-full px-3 py-2 text-center transition ${
                label === timeframe ? 'border border-[#E5E5E5] bg-white text-[#111111]' : 'text-[#8b8a86] hover:bg-white/70 hover:text-[#111111]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 text-[13px] text-[#7e7f79] sm:flex-row sm:items-center sm:justify-between">
        <div>{snapshot.timeframeLabel}</div>
        {timeframe === 'Year' ? (
          <div className="flex flex-wrap items-center gap-2">
            {HOME_YEAR_OPTIONS.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => onYearChange(year)}
                className={`rounded-full px-3 py-1.5 transition ${snapshot.selectedYear === year ? 'bg-[#111111] text-white' : 'bg-white text-[#6f716d] hover:bg-[#f5f5f5]'}`}
              >
                {year}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {timeframe === 'Week' && snapshot.holidayLabels.length > 0 ? (
        <div className="mt-3 rounded-[0.95rem] border border-[#E5E5E5] bg-white px-3 py-2 text-[12px] text-[#6f716d]">
          Holidays included: {snapshot.holidayLabels.join(' • ')}
        </div>
      ) : null}

      {timeframe === 'Quarter' ? (
        <div className="mt-3 overflow-hidden rounded-[1rem] border border-[#E5E5E5] bg-white text-[12px] text-[#6f716d]">
          <div className="grid grid-cols-[1.1fr_2fr_0.8fr] bg-[#f8f8f7] px-3 py-2 font-medium text-[#5f605b]">
            <div>Quarter</div>
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
      ) : null}

      <div className="mt-10 text-center">
        <div className="text-[4.8rem] font-light tracking-[-0.03em] text-[#111111] md:text-[6rem] lg:text-[6rem]">
          {snapshot.metricValue}
        </div>
        <div className="mt-2 text-[1.35rem] font-normal text-[#111111]">{snapshot.title}</div>
        <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-7 text-[#6f716d]">
          {snapshot.summary}
        </p>
      </div>

      <div className="relative mt-10 rounded-[2rem] border border-[#E5E5E5] bg-white px-4 py-6 shadow-[0_14px_32px_rgba(0,0,0,0.04)] sm:px-5 lg:px-6">
        <div
          className="pointer-events-none absolute bottom-[4.9rem] top-6 z-0 bg-white/70"
          style={{ left: `${rangeLeftPercent}%`, width: `${rangeWidthPercent}%`, opacity: 0.08 }}
        />

        <div className="absolute top-[54%] z-10 w-[15rem] -translate-y-1/2 rounded-lg border-[0.5px] border-[#E0E0DE] bg-white px-3.5 py-3 sm:w-[16.5rem]" style={{ left: `${tooltipLeftPercent}%` }}>
          <button
            type="button"
            className="absolute right-2 top-2 text-[10px] leading-none text-[#999999]"
            aria-label="Dismiss chart note"
          >
            ×
          </button>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#8b8a86]">{monthLabel}</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-[16px] font-semibold text-[#111111]">{formatUsdCompactK(activeChartDatum.barValue)}</div>
            <span className="inline-flex h-6 items-center rounded-full bg-[#22C55E] px-2.5 text-[10px] font-medium text-[#166534]">
              {activeDelta}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-normal leading-4 text-[#8b8a86]">{liveTooltipNote}</div>
        </div>

        <div
          className="relative z-[1]"
          onMouseLeave={() => setHoverIndex(null)}
        >
        <ClientChart className="h-[21rem] md:h-[23rem]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
            <ComposedChart
              data={snapshot.chartData}
              margin={{ top: 10, right: 26, left: 0, bottom: 0 }}
              barGap={2}
              onMouseMove={(state) => {
                if (typeof state?.activeTooltipIndex === 'number') {
                  setHoverIndex(state.activeTooltipIndex)
                  onActiveChartPointChange(state.activeTooltipIndex)
                }
              }}
            >
              <XAxis hide dataKey="point" />
              <YAxis
                orientation="right"
                axisLine={false}
                tickLine={false}
                tickMargin={14}
                domain={[0, HOME_CHART_DOMAIN_MAX]}
                ticks={[0, 50000, 100000, 150000]}
                tickFormatter={(value: number) => (value === 0 ? '0' : `${value / 1000}k`)}
                tick={{ fill: '#999999', fontSize: 11, fontWeight: 400 }}
              />
              <Bar dataKey="barValue" barSize={4} radius={[0, 0, 0, 0]} isAnimationActive>
                {snapshot.chartData.map((entry) => (
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
        </div>

        <div className="mt-3 h-[13px] rounded-[4px] bg-[#EBEBEA]">
          <div
            className="relative h-[13px] rounded-[4px] bg-[#C5C5C2]"
            style={{ marginLeft: `${rangeLeftPercent}%`, width: `${rangeWidthPercent}%` }}
          >
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#444444]" />
            <div className="absolute inset-y-0 right-0 w-[3px] bg-[#444444]" />
          </div>
        </div>

        <div className="mt-4 grid text-[11px] text-[#999999]" style={{ gridTemplateColumns: `repeat(${snapshot.axisLabels.length}, minmax(0, 1fr))` }}>
          {snapshot.axisLabels.map((month) => (
            <div key={month} className="text-center">
              {timeframe === 'Week' && (month === 'Thu' || month === 'Sun') ? `${month}*` : month}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-7 grid gap-5 xl:grid-cols-2">

        {/* ── Card 1: Overnight Recovery Outlook ───────────────────────────── */}
        <LightCard className="flex min-h-[20.5rem] flex-col border-[#E5E5E5] bg-gradient-to-b from-white to-[#fcfcfb] p-6 shadow-[0_10px_26px_rgba(17,17,17,0.08)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4ADE80]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4ADE80]">Live</span>
            </div>
            <Glyph name="menu-dots" className="h-4 w-4 text-[#9a9a95]" />
          </div>

          <SurfaceEyebrow>Expected disbursement confirmation</SurfaceEyebrow>

          <div className="mt-2 flex items-end gap-2">
            <div className="text-[2.7rem] font-light leading-none tracking-[-0.04em] text-[#111111]">{liveSalesValue}</div>
            <span className={`mb-0.5 inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold ${recoveryTrendUp ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEE2E2] text-[#991B1B]'}`}>
              {recoveryTrendLabel}
            </span>
          </div>
          <div className="mt-1 text-[14px] text-[#6f716d]">Value expected to be confirmed in the next cycle</div>
          <div className="mt-1 text-[12px] text-[#8a8a86]">
            Pending awaiting confirmation: <span className="font-medium text-[#111111]">{pendingAwaitingConfirmation}</span>
          </div>

          <div className="mt-4 flex items-center gap-1.5 text-[12px]">
            {homeTimeframes.map((label) => (
              <button
                key={`sales-tf-${label}`}
                type="button"
                onClick={() => onTimeframeChange(label)}
                aria-pressed={label === timeframe}
                className={label === timeframe
                  ? 'rounded-full bg-[#111111] px-2.5 py-0.5 text-white'
                  : 'rounded-full px-2.5 py-0.5 text-[#9a9a95] hover:bg-[#f3f3f2] hover:text-[#111111]'}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex h-36 items-end gap-0.5">
            {confirmationMiniBars.map((bar, i) => (
              <div
                key={`fc-${i}`}
                className="flex-1 rounded-t-[6px] transition-all duration-300"
                style={{
                  height: `${Math.max(bar, 0.12) * 100}%`,
                  background: i >= confirmationMiniBars.length - 4 ? '#111111' : '#d9dfe9',
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-[#9a9a95]">
            Live tracking window: {timeframe === 'Week' ? monthLabel : timeframe === 'Quarter' ? snapshot.quarterName : timeframe === 'Year' ? `${snapshot.selectedYear}` : monthLabel}
          </div>

          <p className="mt-4 text-[12px] leading-[1.7] text-[#6f716d]">
            Estimated value of pending disbursements expected to be confirmed in the next cycle.
          </p>
        </LightCard>

        {/* ── Card 2: Exception Burn Rate ───────────────────────────────────── */}
        <LightCard className="flex min-h-[20.5rem] flex-col border-[#E5E5E5] bg-gradient-to-b from-white to-[#fcfcfb] p-6 shadow-[0_16px_36px_rgba(17,17,17,0.14)]">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full border border-[#E5E5E5] bg-[#f8f8f6] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[#8a8a86]">
              Verification queue
            </span>
            <Glyph name="menu-dots" className="h-4 w-4 text-[#9a9a95]" />
          </div>

          <SurfaceEyebrow>Disbursements requiring attention</SurfaceEyebrow>

          <div className="mt-2 text-[2.7rem] font-light leading-none tracking-[-0.04em] text-[#111111]">{liveExpensesValue}</div>
          <div className="mt-1 text-[14px] text-[#6f716d]">Disbursements that require follow-up before confirmation</div>

          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full">
            {burnBreakdown.map(([label, color, width]) => (
              <div
                key={label}
                className="transition-all duration-500"
                style={{ width: `${(width / burnTotal) * 100}%`, background: color }}
              />
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            {burnBreakdown.map(([label, color, width]) => (
              <div key={label} className="flex items-center gap-1.5 text-[13px] text-[#6f716d]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate">{label}</span>
                <span className="ml-auto shrink-0 tabular-nums text-[#9a9a95]">
                  {Math.round((width / burnTotal) * 100)}%
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[12px] text-[#8a8a86]">
            % of total disbursements affected: <span className="font-medium text-[#111111]">{verificationAffectedPct}</span>
          </div>

          <p className="mt-4 text-[12px] leading-[1.7] text-[#6f716d]">
            Breakdown of disbursements that need verification or follow-up before confirmation.
          </p>
        </LightCard>

        {/* ── Card 3: Net Recovery Uplift ───────────────────────────────────── */}
        <LightCard className="flex min-h-[20.5rem] flex-col border-[#E5E5E5] bg-gradient-to-b from-white to-[#fcfcfb] p-6 shadow-[0_10px_26px_rgba(17,17,17,0.08)]">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-[#111111] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-white">
              Proof layer
            </span>
            <Glyph name="menu-dots" className="h-4 w-4 text-[#9a9a95]" />
          </div>

          <SurfaceEyebrow>Confirmed disbursement value</SurfaceEyebrow>

          <div className="mt-2 flex items-end gap-2">
            <div className="text-[2.7rem] font-light leading-none tracking-[-0.04em] text-[#111111]">{liveBudgetValue}</div>
            <span className="mb-0.5 inline-flex h-5 items-center rounded-full bg-[#DCFCE7] px-2 text-[10px] font-semibold text-[#166534]">
              {upliftPct}
            </span>
          </div>
          <div className="mt-1 text-[14px] text-[#6f716d]">Disbursements confirmed after resolving delays</div>

          <div className="mt-4 space-y-2.5">
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[#C0C0BE]">Baseline</div>
              <div className="flex h-8 items-end gap-0">
                {snapshot.budgetBars.slice(0, 8).map((bar, i) => (
                  <div
                    key={`bl-${i}`}
                    className="flex-1 rounded-t-[2px] bg-[#E5E5E4] transition-all duration-300"
                    style={{ height: `${Math.max(bar, 0.12) * 100}%` }}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[#111111]">Rerouted</div>
              <div className="flex h-8 items-end gap-0">
                {snapshot.budgetBars.slice(0, 8).map((bar, i) => (
                  <div
                    key={`rr-${i}`}
                    className="flex-1 rounded-t-[2px] bg-[#111111] transition-all duration-300"
                    style={{ height: `${Math.min(Math.max(bar * 1.28 + 0.1, 0.24), 1) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[12px] text-[#8a8a86]">
            Confirmation rate improved from <span className="font-medium text-[#111111]">{confirmationRateFrom}</span> →{' '}
            <span className="font-medium text-[#111111]">{confirmationRateTo}</span>
          </div>

          <p className="mt-4 text-[12px] leading-[1.7] text-[#6f716d]">
            Additional disbursement value confirmed after resolving pending or delayed transactions.
          </p>
        </LightCard>

        {/* ── Card 4: Morning Action Brief ─────────────────────────────────── */}
        <LightCard className="flex min-h-[20.5rem] flex-col border-[#E5E5E5] bg-gradient-to-b from-white to-[#fcfcfb] p-6 shadow-[0_12px_28px_rgba(17,17,17,0.1)]">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full border border-[#E5E5E5] bg-[#f8f8f6] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[#8a8a86]">
              Intelligence
            </span>
            <Glyph name="arrow-up-right" className="h-4 w-4 text-[#9a9a95]" />
          </div>

          <SurfaceEyebrow>Action required</SurfaceEyebrow>

          <p className="mt-2 max-w-[22rem] text-[16px] font-medium leading-[1.55] text-[#111111]">
            Primary issue: delays from one bank exceeding expected confirmation time.
          </p>
          <p className="mt-2 max-w-[22rem] text-[14px] leading-[1.65] text-[#6f716d]">
            Next step: review and follow up on delayed confirmations.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-[0.8rem] border border-[#E5E5E5] bg-[#f8f8f7] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[#8b8a86]">Primary Issue</div>
              <div className="mt-1 text-[12px] font-medium text-[#111111]">Bank confirmation delay</div>
            </div>
            <div className="rounded-[0.8rem] border border-[#E5E5E5] bg-[#f8f8f7] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[#8b8a86]">Next Action</div>
              <div className="mt-1 text-[12px] font-medium text-[#111111]">Follow-up review required</div>
            </div>
          </div>

          <div className="mt-auto pt-5 flex items-end justify-between gap-3">
            <div>
              <div className="text-[2.6rem] font-light leading-none tracking-[-0.04em] text-[#111111]">{liveInsightValue}</div>
              <div className="mt-1.5 text-[13px] leading-5 text-[#6f716d]">in disbursements pending confirmation</div>
              <div className="mt-1 text-[13px] leading-5 text-[#6f716d]">
                Number of affected transactions: <span className="font-medium text-[#111111]">{affectedTransactions}</span>
              </div>
            </div>
            <div className="relative h-[4.5rem] w-[4.5rem] shrink-0">
              <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden="true">
                <path d="M12 60a48 48 0 0 1 96 0" fill="none" stroke="#E5E5E4" strokeWidth="10" strokeLinecap="round" />
                <path
                  d="M12 60a48 48 0 0 1 96 0"
                  fill="none"
                  stroke="#111111"
                  strokeWidth="10"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={`${snapshot.insightGaugeProgress} 1`}
                />
              </svg>
              <div className="absolute inset-0 flex items-end justify-center pb-1">
                <span className="text-[11px] font-semibold tabular-nums text-[#111111]">
                  {Math.round(snapshot.insightGaugeProgress * 100)}%
                </span>
              </div>
            </div>
          </div>
        </LightCard>

      </div>

      <div className="relative z-10 mx-auto -mt-10 w-full max-w-[62rem] px-4">
        {commandResponse ? (
          <div className="mx-auto mb-3 w-full max-w-[30rem] rounded-[1.2rem] border border-black/10 bg-white px-4 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#179a4c]">
                  {commandStatus === 'loading' ? 'Analyzing snapshot' : commandStatus === 'typing' ? 'Drafting response' : 'Simulation response'}
                </div>
                <div className="mt-1 text-[15px] font-medium text-[#111111]">{commandResponse.title}</div>
                <div className="mt-2 min-h-[3.25rem] text-[13px] leading-6 text-[#6f716d]">
                  {commandResponse.body}
                  {commandStatus === 'typing' ? <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-[#179a4c] align-middle" /> : null}
                </div>
              </div>
              <button type="button" onClick={onDismissCommandResponse} className="text-[14px] text-[#8b8a86]">
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
            <span className="text-[14px] font-medium">Ask Zord</span>
            <span className="ml-auto text-white/70">
              <Glyph name="arrow-up-right" className="h-4 w-4" />
            </span>
          </button>
        ) : (
          <div className="rounded-[1.35rem] bg-[#1F1F1F] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.10)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.1em] text-white/60">Ask Zord</div>
              <button
                type="button"
                onClick={() => setIsPromptExpanded(false)}
                className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] text-white/75 hover:text-white"
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
                  className={`rounded-[0.9rem] px-3 py-2 text-[12px] transition ${
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
                  className={`w-full bg-transparent text-center text-[15px] !text-white placeholder:text-white/48 caret-[#4ADE80] outline-none ${promptTone.inputToneClass}`}
                />
                <div className={`mt-1 text-center text-[11px] tracking-[0.04em] ${promptTone.captionToneClass}`}>
                  {commandStatus === 'loading'
                    ? 'Reading route posture, recovery lift, and proof movement...'
                    : commandStatus === 'typing'
                      ? 'Composing a simulated operator answer...'
                      : 'Simulation-ready prompt layer on top of Zord evidence graph - no runtime dependency on payment partners or banks.'}
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
