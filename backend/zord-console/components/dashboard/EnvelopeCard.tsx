'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type IngestionDatum = {
  source: string
  envelopes: number
  tenant: string
  fill: string
}

const ingestionData: IngestionDatum[] = [
  { source: 'API', envelopes: 364, tenant: 'merchant_A', fill: '#6366F1' },
  { source: 'CSV', envelopes: 251, tenant: 'merchant_B', fill: '#94A3B8' },
  { source: 'Webhook', envelopes: 412, tenant: 'merchant_A', fill: '#8B5CF6' },
  { source: 'File', envelopes: 176, tenant: 'merchant_C', fill: '#CBD5E1' },
]

function IngestionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: IngestionDatum }> }) {
  if (!active || !payload || payload.length === 0) return null
  const datum = payload[0].payload
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-[0_12px_24px_rgba(15,23,42,0.14)]">
      <p className="font-semibold text-slate-800">{datum.source} Source</p>
      <p className="mt-1 text-slate-600">{datum.envelopes} envelopes</p>
      <p className="mt-0.5 text-slate-500">Tenant: {datum.tenant}</p>
    </div>
  )
}

export function EnvelopeCard() {
  const [chartReady, setChartReady] = useState(false)

  useEffect(() => {
    setChartReady(true)
  }, [])

  return (
    <article className="rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
      <p className="text-sm font-medium text-slate-500">Envelope ingestion</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">28,953</p>
      <p className="mt-1 text-sm text-slate-600">Raw Envelopes Received</p>
      <p className="mt-2 text-xs font-medium text-[#22C55E]">+10% vs last hour</p>

      <div className="mt-5 h-44">
        {chartReady ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ingestionData}>
              <XAxis dataKey="source" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip cursor={{ fill: 'rgba(139,92,246,0.08)' }} content={<IngestionTooltip />} />
              <Bar dataKey="envelopes" radius={[8, 8, 0, 0]}>
                {ingestionData.map((entry) => (
                  <Cell key={entry.source} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full animate-pulse rounded-xl bg-slate-100" />
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] text-slate-500">Hourly Avg</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">1,203 envelopes/hr</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] text-slate-500">Processing Latency</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">242 ms</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] text-slate-500">DLQ Events</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">11</p>
        </div>
      </div>
    </article>
  )
}
