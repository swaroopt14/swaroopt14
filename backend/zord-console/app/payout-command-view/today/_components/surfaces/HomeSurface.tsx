'use client'

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
} from '../model'
import { ClientChart, Glyph, LightCard, SurfaceEyebrow } from '../shared'

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
  const [selectedRangeStart, selectedRangeEnd] = snapshot.range
  const activeChartDatum = snapshot.chartData[clamp(activeChartPoint, 0, snapshot.chartData.length - 1)]
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
  const liveTooltipNote =
    timeframe === 'Week'
      ? `Income change around ${monthLabel}. Includes holiday impact in this week window.`
      : timeframe === 'Quarter'
        ? `Income growth during ${snapshot.quarterName} (${snapshot.quarterMonths.join(', ')}).`
        : timeframe === 'Year'
          ? `Income growth trend in ${snapshot.selectedYear}.`
          : `Income growth around ${monthLabel} in the active month window.`

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#8b8a86]">
            Half-year payout statement
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-[#6f716d]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#d4d4d4]" />
              <span>Without reroute</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#111111]" />
              <span>Recovered after reroute</span>
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

      <div className="mt-4 flex flex-col gap-3 text-[12px] text-[#7e7f79] sm:flex-row sm:items-center sm:justify-between">
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
        <div className="mt-2 text-lg font-normal text-[#111111]">{snapshot.title}</div>
        <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-6 text-[#6f716d]">
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

        <ClientChart className="relative z-[1] h-[21rem] md:h-[23rem]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={240}>
            <ComposedChart
              data={snapshot.chartData}
              margin={{ top: 10, right: 26, left: 0, bottom: 0 }}
              barGap={2}
              onMouseMove={(state) => {
                if (typeof state?.activeTooltipIndex === 'number') {
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

      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        <LightCard className="border-[#E5E5E5] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <SurfaceEyebrow>Overnight recovery outlook</SurfaceEyebrow>
            <Glyph name="menu-dots" className="h-4 w-4 text-[#9a9a95]" />
          </div>
          <div className="mt-4 text-[2.5rem] font-light tracking-[-0.04em] text-[#111111]">{liveSalesValue}</div>
          <div className="mt-1 text-sm text-[#6f716d]">Expected cleared value</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-[#9a9a95]">Live window: {monthLabel}</div>
          <div className="mt-5 flex items-center gap-3 text-[12px] text-[#8b8a86]">
            {homeTimeframes.map((label) => (
              <span key={`sales-range-${label}`} className={label === timeframe ? 'border-b border-[#111111] pb-0.5 text-[#111111]' : ''}>
                {label}
              </span>
            ))}
          </div>
          <div className="mt-5 flex items-end gap-2">
            {snapshot.forecastBars.map((bar, index) => (
              <span
                key={`forecast-${index}`}
                className="w-[5px] rounded-full bg-[#111111]"
                style={{ height: `${Math.max(bar, 0.24) * 6.1}rem`, opacity: 0.24 + index * 0.12 }}
              />
            ))}
          </div>
          <div className="mt-5 text-[12px] leading-5 text-[#6f716d]">
            Opening projection of cleared payout value after overnight rerouting from degraded lanes into healthier PSP and rail corridors.
          </div>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <SurfaceEyebrow>Exception burn rate</SurfaceEyebrow>
            <Glyph name="menu-dots" className="h-4 w-4 text-[#9a9a95]" />
          </div>
          <div className="mt-4 text-[2.5rem] font-light tracking-[-0.04em] text-[#111111]">{liveExpensesValue}</div>
          <div className="mt-1 text-sm text-[#6f716d]">Run-rate ops spend</div>
          <div className="mt-5 flex flex-wrap gap-3 text-[12px] text-[#6f716d]">
            {[
              ['Manual ops', '#111111'],
              ['Bank follow-ups', '#4ADE80'],
              ['PSP tickets', '#b7b7b7'],
              ['Other', '#e0e0e0'],
            ].map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 h-20 rounded-[1rem] bg-[linear-gradient(135deg,#f6f6f6_0_14%,#ffffff_14%_28%,#f1f4f8_28%_42%,#ffffff_42%_56%,#f6f6f6_56%_70%,#ffffff_70%_84%,#f1f4f8_84%_100%)]" />
          <div className="mt-4 text-[12px] leading-5 text-[#6f716d]">
            Estimated spend tied to stuck payouts, bank escalations, and PSP tickets that still require manual touch.
          </div>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <SurfaceEyebrow>Net recovery uplift</SurfaceEyebrow>
            <Glyph name="menu-dots" className="h-4 w-4 text-[#9a9a95]" />
          </div>
          <div className="mt-4 text-[2.5rem] font-light tracking-[-0.04em] text-[#111111]">{liveBudgetValue}</div>
          <div className="mt-1 text-sm text-[#6f716d]">Recovered over baseline</div>
          <div className="mt-5 flex items-center gap-5 text-[12px] text-[#6f716d]">
            {[
              ['Baseline', '#dedede'],
              ['Rerouted', '#111111'],
            ].map(([label, color]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-end gap-2">
            {snapshot.budgetBars.map((bar, index) => (
              <span
                key={`budget-${index}`}
                className="w-full rounded-full bg-[#111111]"
                style={{ height: `${Math.max(bar, 0.16) * 4.8}rem`, opacity: 0.18 + (index % 4) * 0.16 }}
              />
            ))}
          </div>
          <div className="mt-4 text-[12px] leading-5 text-[#6f716d]">
            Incremental value cleared after reroute versus the pre-reroute baseline for the same cohort and period.
          </div>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <SurfaceEyebrow>Morning action brief</SurfaceEyebrow>
            <Glyph name="arrow-up-right" className="h-4 w-4 text-[#9a9a95]" />
          </div>
          <div className="mt-4 max-w-[14rem] text-lg leading-7 text-[#111111]">
            {snapshot.insightText}
          </div>
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <div className="text-[2rem] font-light tracking-[-0.04em] text-[#111111]">{liveInsightValue}</div>
              <div className="text-sm text-[#6f716d]">high-value payouts in active review</div>
            </div>
            <div className="relative h-24 w-24">
              <svg viewBox="0 0 120 72" className="h-full w-full" aria-hidden="true">
                <path d="M12 60a48 48 0 0 1 96 0" fill="none" stroke="#d9d9d9" strokeWidth="8" strokeLinecap="round" />
                <path
                  d="M12 60a48 48 0 0 1 96 0"
                  fill="none"
                  stroke="#111111"
                  strokeWidth="8"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={`${snapshot.insightGaugeProgress} 1`}
                />
              </svg>
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
        <div className="rounded-[1.35rem] bg-[#1F1F1F] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.10)]">
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

          <div className="flex items-center gap-3 rounded-[1rem] border border-white/8 bg-[#232323] p-3">
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
                placeholder="Ask anything about payouts, risk, or proof readiness"
                className="w-full bg-transparent text-center text-[15px] text-white/90 outline-none placeholder:text-white/42"
              />
              <div className="mt-1 text-center text-[11px] tracking-[0.04em] text-white/38">
                {commandStatus === 'loading'
                  ? 'Reading route posture, recovery lift, and proof movement...'
                  : commandStatus === 'typing'
                    ? 'Composing a simulated operator answer...'
                    : "Simulation-ready prompt layer on top of Zord's evidence graph - no runtime dependency on PSPs or banks."}
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
      </div>
    </div>
  )
}
