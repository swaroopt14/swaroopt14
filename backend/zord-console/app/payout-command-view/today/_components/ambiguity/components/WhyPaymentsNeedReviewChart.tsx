'use client'

import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ClientChart } from '../../shared'
import { ambiguityCopy } from '../copy/ambiguityCopy'

type WhyPaymentsNeedReviewChartProps = {
  amb: AmbiguityKpiResolved | null
}

export function WhyPaymentsNeedReviewChart({ amb }: WhyPaymentsNeedReviewChartProps) {
  const data = useMemo(() => {
    const lowConf = amb?.low_confidence_rate ?? (amb ? Math.max(0, 1 - amb.avg_attachment_confidence) : 0)
    const collision = amb?.candidate_collision_rate
    return [
      { label: ambiguityCopy.chart.reviewRate, pct: amb ? amb.ambiguity_rate * 100 : 0, color: '#f97316', pending: false },
      { label: ambiguityCopy.chart.lowConfidence, pct: lowConf * 100, color: '#a855f7', pending: false },
      { label: ambiguityCopy.chart.missingRefs, pct: amb ? amb.provider_ref_missing_rate * 100 : 0, color: '#dc2626', pending: false },
      {
        label: ambiguityCopy.chart.multipleMatches,
        pct: collision != null ? collision * 100 : 0,
        color: '#0ea5e9',
        pending: collision == null,
      },
    ]
  }, [amb])

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold text-slate-900">{ambiguityCopy.chart.title}</h2>
      <p className="mt-1 text-[12px] text-slate-500">{ambiguityCopy.chart.subtitle}</p>
      <ClientChart className="mt-4 min-h-[12rem]">
        <ResponsiveContainer width="100%" height={200} minWidth={0}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10 }} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              cursor={{ fill: 'rgba(248,250,252,0.85)' }}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
              formatter={(v: number, _name: string, item: { payload?: { pending?: boolean } }) => [
                item?.payload?.pending ? ambiguityCopy.chart.collisionPending : `${Number(v).toFixed(1)}%`,
                '',
              ]}
            />
            <Bar dataKey="pct" radius={[10, 10, 0, 0]} barSize={36}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.color} opacity={d.pending ? 0.25 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ClientChart>
    </article>
  )
}
