'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchProdJsonGet } from '@/services/payout-command/prod-api/fetchProdJsonGet'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { leakageCopy } from '../../leakage/copy/leakageCopy'
import type { PortfolioLeakageViewModel } from '../normalizeLeakagePayload'
import { formatMinorInr } from '../utils/formatMinorInr'
import {
  CHART_MOCK_SERIES,
  CHART_TIMEFRAMES,
  CHART_TOOLTIP_HIGHLIGHT,
  type ChartTimeframe,
} from '../constants/chartMockSeries'

type RiskAdjustedLeakageCardProps = {
  data: PortfolioLeakageViewModel
  loading?: boolean
}

function tierBadgeClass(tier: string): string {
  const upper = tier.toUpperCase()
  if (upper === 'CLEAN' || upper === 'LOW') {
    return 'border-emerald-300/60 bg-emerald-500/20 text-emerald-50'
  }
  if (upper === 'MEDIUM') return 'border-amber-300/60 bg-amber-500/20 text-amber-50'
  return 'border-red-300/60 bg-red-500/20 text-red-50'
}

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: { month: string; value: number; label?: string } }>
}) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point?.label) return null

  const isMay = point.label === CHART_TOOLTIP_HIGHLIGHT.start.label
  const highlight = isMay ? CHART_TOOLTIP_HIGHLIGHT.start : CHART_TOOLTIP_HIGHLIGHT.end

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/95 px-4 py-3 text-white shadow-xl">
      <p className="text-[12px] text-slate-300">{highlight.label}</p>
      <p className="mt-1 text-[1.1rem] font-semibold tabular-nums">
        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
          highlight.value,
        )}
      </p>
      {isMay ? (
        <span className="mt-2 inline-flex rounded-full bg-slate-700 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
          +{CHART_TOOLTIP_HIGHLIGHT.start.changePct}%
        </span>
      ) : null}
    </div>
  )
}

type LeakageSeriesPoint = { month: string; value: number; label?: string }

export function RiskAdjustedLeakageCard({ data, loading }: RiskAdjustedLeakageCardProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('1Y')
  const [liveSeries, setLiveSeries] = useState<LeakageSeriesPoint[] | null>(null)
  const [seriesLive, setSeriesLive] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchProdJsonGet<{ data_available?: boolean; series?: LeakageSeriesPoint[] }>(
      '/api/prod/intelligence/timeseries/leakage?granularity=day',
    ).then((body) => {
      if (cancelled) return
      if (body?.data_available === true && Array.isArray(body.series) && body.series.length > 0) {
        setLiveSeries(body.series)
        setSeriesLive(true)
      } else {
        setLiveSeries(null)
        setSeriesLive(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const chartData = useMemo(
    () => (liveSeries && liveSeries.length > 0 ? liveSeries : CHART_MOCK_SERIES),
    [liveSeries],
  )

  if (loading) {
    return <div className="min-h-[420px] animate-pulse rounded-3xl bg-gradient-to-br from-orange-300 to-rose-400" />
  }

  return (
    <article className="flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-orange-200/40 bg-gradient-to-br from-orange-400 via-orange-500 to-rose-500 p-6 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-orange-50/90">{leakageCopy.chart.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-[2.5rem] font-bold tabular-nums tracking-tight text-white">
              {formatMinorInr(data.valueNeedingReviewMinor || data.riskAdjustedMinor)}
            </p>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${tierBadgeClass(data.riskTier)}`}
            >
              {data.riskTier || 'N/A'}
            </span>
          </div>
          {data.riskAdjustedMinor > 0 ? (
            <p className="mt-2 text-[12px] text-orange-50/90">
              {leakageCopy.chart.riskAdjustedTitle}: {formatMinorInr(data.riskAdjustedMinor)}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 text-[12px] font-medium text-orange-50/80" role="tablist" aria-label="Chart timeframe">
          {CHART_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              role="tab"
              aria-selected={timeframe === tf}
              onClick={() => setTimeframe(tf)}
              className={`transition ${timeframe === tf ? 'border-b-2 border-white text-white' : 'hover:text-white'}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-6 min-h-[240px] flex-1">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 11 }}
            />
            <YAxis hide domain={['dataMin - 5000', 'dataMax + 5000']} />
            <Tooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#ffffff"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: '#fff', stroke: '#1e293b', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>

        <p className="mt-2 text-[11px] leading-relaxed text-orange-50/80">{leakageCopy.chart.helper}</p>
        {!seriesLive ? (
          <p className="mt-1 text-[10px] text-orange-50/50">{leakageCopy.chart.trendPending}</p>
        ) : (
          <p className="mt-1 text-[10px] text-orange-50/70">Live leakage time-series from intelligence BFF.</p>
        )}
      </div>
    </article>
  )
}
