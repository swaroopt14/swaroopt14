'use client'

import { useEffect, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type FusionDatum = {
  bucket: string
  provisional: number
  confirmed: number
}

const fusionSeries: FusionDatum[] = [
  { bucket: '09:00', provisional: 65, confirmed: 74 },
  { bucket: '10:00', provisional: 70, confirmed: 79 },
  { bucket: '11:00', provisional: 69, confirmed: 82 },
  { bucket: '12:00', provisional: 74, confirmed: 84 },
  { bucket: '13:00', provisional: 72, confirmed: 86 },
  { bucket: '14:00', provisional: 76, confirmed: 88 },
]

function FusionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: FusionDatum }> }) {
  if (!active || !payload || payload.length === 0) return null
  const datum = payload[0].payload
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-[0_12px_24px_rgba(15,23,42,0.14)]">
      <p className="font-semibold text-slate-800">{datum.bucket}</p>
      <p className="mt-1 text-slate-600">Provisional: {datum.provisional}%</p>
      <p className="text-slate-600">Confirmed: {datum.confirmed}%</p>
    </div>
  )
}

export function FusionCard() {
  const [chartReady, setChartReady] = useState(false)

  useEffect(() => {
    setChartReady(true)
  }, [])

  return (
    <article className="rounded-[20px] border border-gray-200 bg-white p-6 shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
      <h3 className="text-base font-semibold text-slate-900">Outcome fusion</h3>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">85.3%</p>
      <p className="text-sm text-slate-600">Finalized Payments</p>

      <div className="mt-5 h-44">
        {chartReady ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fusionSeries}>
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<FusionTooltip />} />
              <Line type="monotone" dataKey="provisional" stroke="#A5B4FC" strokeWidth={2.5} dot={false} name="Provisional Success" />
              <Line type="monotone" dataKey="confirmed" stroke="#6366F1" strokeWidth={2.8} dot={{ r: 3, fill: '#6366F1' }} name="Confirmed Success" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full animate-pulse rounded-xl bg-slate-100" />
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <p className="text-[11px] text-slate-500">Provisional</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">72 events</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <p className="text-[11px] text-slate-500">Confirmed</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">112 events</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <p className="text-[11px] text-slate-500">Conflicts</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">4 events</p>
        </div>
      </div>
    </article>
  )
}
