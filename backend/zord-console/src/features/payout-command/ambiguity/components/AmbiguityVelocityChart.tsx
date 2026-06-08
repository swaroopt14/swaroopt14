'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { getAmbiguityVelocityScatter } from '@/services/payout-command/prod-api/getAmbiguityVelocityScatter'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { formatAmbiguityInr } from '../utils/formatAmbiguityInr'
import { getValueAtRiskDelta } from '../utils/ambiguityApiMappers'
import {
  AMBIGUITY_BUBBLE_LEGEND,
  buildAmbiguityVelocityMock,
  getWindowMeta,
  mapAmbiguityVelocityScatter,
  MOCK_PREVIEW_BATCH_COUNT,
  scatterDensitySummary,
  scatterTimeAxisTicks,
  type AmbiguityScatterPoint,
} from '../utils/mapAmbiguityVelocityScatter'

const WINDOW_DAYS = 7

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: AmbiguityScatterPoint & { x: number; y: number; z: number } }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (!p) return null

  return (
    <div className="min-w-[260px] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Batch</p>
      <p className="mt-0.5 font-mono text-[13px] font-semibold text-slate-900">{p.batchId}</p>
      <p className="mt-1 text-[11px] text-slate-500">{p.timeLabel}</p>
      <dl className="mt-2.5 space-y-2 border-t border-slate-100 pt-2.5 text-[12px]">
        <div className="flex justify-between gap-6">
          <dt className="text-slate-500">Ambiguous amount</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {formatAmbiguityInr(p.ambiguousAmountMinor)}
          </dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-slate-500">Total amount</dt>
          <dd className="font-semibold tabular-nums text-slate-900">
            {formatAmbiguityInr(p.totalAmountMinor)}
          </dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-slate-500">Ambiguity level</dt>
          <dd
            className="font-semibold tabular-nums"
            style={{ color: p.bubbleColor }}
          >
            {p.ambiguityLevelPct.toFixed(1)}%
          </dd>
        </div>
      </dl>
    </div>
  )
}

type Props = {
  amb: AmbiguityKpiResolved | null
  batchId?: string
}

export function AmbiguityVelocityChart({ amb, batchId }: Props) {
  const [livePoints, setLivePoints] = useState<AmbiguityScatterPoint[] | null>(null)
  const [seriesLive, setSeriesLive] = useState(false)

  const mockPoints = useMemo(
    () => buildAmbiguityVelocityMock(WINDOW_DAYS, MOCK_PREVIEW_BATCH_COUNT, batchId),
    [batchId],
  )

  useEffect(() => {
    let cancelled = false
    void getAmbiguityVelocityScatter({ batchId, days: WINDOW_DAYS }).then((body) => {
      if (cancelled) return
      const mapped = mapAmbiguityVelocityScatter(body)
      if (mapped.live && mapped.points.length > 0) {
        setLivePoints(mapped.points)
        setSeriesLive(true)
      } else {
        setLivePoints(null)
        setSeriesLive(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [batchId])

  const points = seriesLive && livePoints?.length ? livePoints : mockPoints
  const isPreview = !seriesLive
  const { totalHours } = getWindowMeta(WINDOW_DAYS)
  const timeTicks = scatterTimeAxisTicks(WINDOW_DAYS)
  const density = useMemo(() => scatterDensitySummary(points), [points])
  const chartData = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        x: p.timeHours,
        y: p.ambiguityLevelPct,
        z: p.ambiguousAmountMinor,
      })),
    [points],
  )

  const yDomain = useMemo((): [number, number] => {
    const vals = points.map((p) => p.ambiguityLevelPct)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = Math.max(4, (max - min) * 0.1)
    return [Math.max(0, min - pad), Math.min(100, max + pad)]
  }, [points])

  const totalAtRisk = formatAmbiguityInr(amb?.value_at_risk_minor)
  const confidencePct =
    amb?.avg_attachment_confidence != null
      ? `${(amb.avg_attachment_confidence * 100).toFixed(1)}%`
      : '—'
  const varDelta = getValueAtRiskDelta(amb)

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full" style={{ background: '#3dff82' }} />
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#000000]">
            Ambiguity Velocity
          </span>
          <span className="rounded-full bg-[#e8eef5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#103a9e]">
            {WINDOW_DAYS} days
          </span>
          {isPreview ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Preview · {batchId ? 'batch mock' : `${MOCK_PREVIEW_BATCH_COUNT} batches`}
            </span>
          ) : null}
        </div>
        <p className="text-[11px] font-medium text-[#00239C]">
          X = time · Y = ambiguity % · size = ambiguous amount · red = high · green = low
        </p>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-[12px] font-medium text-[#00239C]">Total Value at Risk</p>
          <p className="mt-1 text-[2rem] font-bold tabular-nums leading-none text-[#000000]">
            {totalAtRisk}
            {varDelta ? (
              <span
                className="ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#000000]"
                style={{ background: '#3dff82' }}
              >
                {varDelta.startsWith('-') ? '▼' : '▲'} {varDelta.replace(/^[+-]/, '')}
              </span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="text-[12px] font-medium text-[#00239C]">Avg Match Confidence</p>
          <p className="mt-1 text-[2rem] font-bold tabular-nums leading-none text-[#000000]">
            {confidencePct}
          </p>
        </div>
      </div>

      <div className="relative mt-6 h-[320px] w-full min-h-[320px]">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 16, right: 20, left: 4, bottom: 28 }}>
              <CartesianGrid
                vertical
                horizontal
                stroke="#e2e8f0"
                strokeOpacity={0.5}
                strokeWidth={1}
              />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0, totalHours]}
                ticks={timeTicks.map((t) => t.hours)}
                tickFormatter={(h) => timeTicks.find((t) => t.hours === h)?.label ?? ''}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 10 }}
                label={{
                  value: 'Time (7 days)',
                  position: 'insideBottom',
                  offset: -18,
                  fill: '#94a3b8',
                  fontSize: 10,
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={yDomain}
                unit="%"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                width={44}
                label={{
                  value: 'Ambiguity level',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#94a3b8',
                  fontSize: 10,
                }}
              />
              <ZAxis type="number" dataKey="z" range={[80, 3200]} name="Ambiguous amount" />
              <Tooltip
                content={<ScatterTooltip />}
                cursor={{ strokeDasharray: '4 4', stroke: '#94a3b8' }}
              />
              <Scatter
                name="Batches"
                data={chartData}
                fill="#4a6fe6"
                fillOpacity={0.45}
                stroke="transparent"
                strokeWidth={0}
                isAnimationActive={false}
              >
                {chartData.map((p) => (
                  <Cell
                    key={`${p.batchId}-${p.observedAt}`}
                    fill={p.bubbleColor}
                    stroke={p.bubbleColor}
                    fillOpacity={0.45}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
            <p className="text-[13px] font-medium text-[#00239C]">No points to display.</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-6 border-t border-slate-100 pt-3">
        {AMBIGUITY_BUBBLE_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="inline-block rounded-full border border-white shadow-sm"
              style={{
                width: item.label === 'Low ambiguity' ? 10 : item.label === 'High ambiguity' ? 18 : 14,
                height: item.label === 'Low ambiguity' ? 10 : item.label === 'High ambiguity' ? 18 : 14,
                background: item.color,
              }}
            />
            <span className="text-[11px] font-medium text-slate-600">
              {item.label}
              {item.hint ? <span className="text-slate-400"> · {item.hint}</span> : null}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-slate-600">
          <span className="font-semibold text-slate-900">{density.batchCount}</span> batches ·{' '}
          <span className="font-semibold text-slate-900">{density.pointCount}</span> points
        </p>
        <div className="flex flex-wrap gap-2">
          {density.perDay.map((d) => (
            <span
              key={`${d.label}-${d.count}`}
              className="rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600"
            >
              {d.label} · {d.count}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}
