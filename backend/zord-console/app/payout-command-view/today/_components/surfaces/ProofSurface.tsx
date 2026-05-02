'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { chartTooltipStyle } from '@/services/payout-command/model'
import { ClientChart, LightCard, SurfaceEyebrow } from '../shared'

const failureReasonData = [
  { reason: 'PSP downtime', count: 44, atRisk: 9.8 },
  { reason: 'Invalid beneficiary', count: 36, atRisk: 6.4 },
  { reason: 'Bank rejects', count: 29, atRisk: 5.9 },
  { reason: 'Governance blocks', count: 21, atRisk: 4.2 },
] as const

const queueTabs = ['Needs client fix', 'Needs PSP fix', 'Needs bank follow-up'] as const
type QueueTab = (typeof queueTabs)[number]

const queueByOwner: Record<
  QueueTab,
  ReadonlyArray<{
    paymentId: string
    category: string
    status: string
    age: string
    amount: string
    owner: string
  }>
> = {
  'Needs client fix': [
    { paymentId: 'PAY-24188', category: 'Invalid beneficiary details', status: 'Waiting client correction', age: '3h 22m', amount: '₹1.8L', owner: 'Client ops' },
    { paymentId: 'PAY-24174', category: 'Missing account metadata', status: 'Re-submit required', age: '2h 14m', amount: '₹1.2L', owner: 'Client ops' },
    { paymentId: 'PAY-24151', category: 'Compliance document gap', status: 'Awaiting upload', age: '1h 43m', amount: '₹0.9L', owner: 'Client compliance' },
  ],
  'Needs PSP fix': [
    { paymentId: 'PAY-24193', category: 'PSP callback timeout', status: 'Escalated to PSP', age: '4h 08m', amount: '₹2.4L', owner: 'PSP partner' },
    { paymentId: 'PAY-24166', category: 'PSP retry exhaustion', status: 'PSP investigating', age: '2h 57m', amount: '₹1.7L', owner: 'PSP partner' },
    { paymentId: 'PAY-24138', category: 'Webhook ordering issue', status: 'Patch in progress', age: '1h 29m', amount: '₹1.1L', owner: 'PSP engineering' },
  ],
  'Needs bank follow-up': [
    { paymentId: 'PAY-24199', category: 'Bank-side reject (R03)', status: 'Bank follow-up open', age: '5h 02m', amount: '₹3.1L', owner: 'Bank ops' },
    { paymentId: 'PAY-24183', category: 'Statement delay', status: 'Awaiting bank file', age: '3h 31m', amount: '₹2.0L', owner: 'Bank ops' },
    { paymentId: 'PAY-24157', category: 'Beneficiary account freeze', status: 'Issuer review', age: '2h 06m', amount: '₹1.4L', owner: 'Bank risk' },
  ],
}

const queueDepthSeries = [
  { slot: '08:00', open: 112 },
  { slot: '10:00', open: 128 },
  { slot: '12:00', open: 137 },
  { slot: '14:00', open: 131 },
  { slot: '16:00', open: 121 },
  { slot: '18:00', open: 109 },
] as const

export function ProofSurface() {
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>('Needs client fix')
  const activeRows = useMemo(() => queueByOwner[activeQueueTab], [activeQueueTab])

  return (
    <div className="mt-8 space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LightCard className="border-[#E5E5E5] shadow-[0_8px_22px_rgba(0,0,0,0.04)]">
          <SurfaceEyebrow>Exception queue depth</SurfaceEyebrow>
          <div className="mt-3 text-[2.35rem] font-light tracking-[-0.04em] text-[#111111]">184</div>
          <div className="mt-1 text-[12px] text-[#6f716d]">Open exceptions in active queue</div>
          <button type="button" className="mt-3 rounded-[0.8rem] border border-[#E5E5E5] bg-[#f7f7f4] px-3 py-2 text-[12px] text-[#111111]">
            Open exception list
          </button>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_8px_22px_rgba(0,0,0,0.04)]">
          <SurfaceEyebrow>Aging &gt; 24h</SurfaceEyebrow>
          <div className="mt-3 text-[2.35rem] font-light tracking-[-0.04em] text-[#111111]">37</div>
          <div className="mt-1 text-[12px] text-[#6f716d]">Needs priority owner routing today</div>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_8px_22px_rgba(0,0,0,0.04)]">
          <SurfaceEyebrow>Median owner response</SurfaceEyebrow>
          <div className="mt-3 text-[2.35rem] font-light tracking-[-0.04em] text-[#111111]">28m</div>
          <div className="mt-1 text-[12px] text-[#6f716d]">From queue assignment to first action</div>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_8px_22px_rgba(0,0,0,0.04)]">
          <SurfaceEyebrow>Auto-resolved today</SurfaceEyebrow>
          <div className="mt-3 text-[2.35rem] font-light tracking-[-0.04em] text-[#111111]">61</div>
          <div className="mt-1 text-[12px] text-[#6f716d]">Cleared without manual queue intervention</div>
        </LightCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.02fr_1.18fr]">
        <LightCard className="border-[#E5E5E5] shadow-[0_8px_22px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Top failure reasons today</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Actionable categories, not low-level codes</div>
            </div>
          </div>

          <ClientChart className="mt-5 h-[15rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={170}>
              <BarChart data={failureReasonData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#efefec" />
                <XAxis dataKey="reason" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number, name: string) => {
                  if (name === 'atRisk') return [`₹${value.toFixed(1)}L`, 'Amount at risk']
                  return [value, 'Exceptions']
                }} />
                <Bar dataKey="count" name="Exceptions" fill="#111111" barSize={30} radius={[8, 8, 0, 0]} />
                <Bar dataKey="atRisk" name="atRisk" fill="#4ADE80" barSize={18} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ClientChart>

          <div className="mt-4 rounded-[1rem] border border-[#E5E5E5] bg-[#f8f8f6] p-3 text-[12px] leading-5 text-[#6f716d]">
            Friendly routing only: client data issue, PSP issue, bank-side issue, or policy block. Internal status enums and taxonomy internals stay hidden.
          </div>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_8px_22px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Ops queues</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Route each issue to the right team quickly</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {queueTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveQueueTab(tab)}
                className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
                  tab === activeQueueTab
                    ? 'border-[#111111] bg-[#111111] text-white'
                    : 'border-[#E5E5E5] bg-[#f7f7f4] text-[#6f716d] hover:text-[#111111]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-[1rem] border border-[#E5E5E5]">
            <div className="grid grid-cols-[0.9fr_1.1fr_0.8fr_0.55fr_0.6fr] bg-[#f8f8f6] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a8a86]">
              <span>Payment</span>
              <span>Category</span>
              <span>Status</span>
              <span className="text-right">Age</span>
              <span className="text-right">Trace</span>
            </div>
            <div className="divide-y divide-[#ececea]">
              {activeRows.map((row) => (
                <div key={row.paymentId} className="px-3 py-3">
                  <div className="grid grid-cols-[0.9fr_1.1fr_0.8fr_0.55fr_0.6fr] items-center gap-2 text-[12px]">
                    <span className="font-medium text-[#111111]">{row.paymentId}</span>
                    <span className="text-[#6f716d]">{row.category}</span>
                    <span className="text-[#6f716d]">{row.status}</span>
                    <span className="text-right text-[#8a8a86]">{row.age}</span>
                    <span className="text-right">
                      <button type="button" className="rounded-[0.6rem] border border-[#E5E5E5] bg-white px-2 py-1 text-[11px] text-[#111111]">
                        Open
                      </button>
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-[#7c7d78]">Recommended owner: {row.owner}</div>
                </div>
              ))}
            </div>
          </div>
        </LightCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
        <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Exception queue depth trend</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Queue pressure over the working day</div>
            </div>
          </div>
          <ClientChart className="mt-4 h-[10rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
              <BarChart data={queueDepthSeries} margin={{ top: 2, right: 8, left: -8, bottom: 0 }}>
                <XAxis dataKey="slot" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [value, 'Open exceptions']} />
                <Bar dataKey="open" fill="#111111" barSize={20} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ClientChart>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
          <SurfaceEyebrow>Failure intelligence note</SurfaceEyebrow>
          <p className="mt-3 text-[13px] leading-7 text-[#6f716d]">
            Zord classifies failures into business-actionable buckets and routes them to the right owner: client fix, PSP fix, or bank follow-up. This reduces blind spots and helps risk and compliance teams close incidents faster with clear accountability.
          </p>
          <div className="mt-4 rounded-[1rem] border border-[#E5E5E5] bg-[#f7f7f4] p-3 text-[12px] leading-5 text-[#6f716d]">
            Ask Zord prompt responses stay in business language only, such as “PSP delayed webhook” or “bank statement pending”, without exposing internal storage fields or engine internals.
          </div>
        </LightCard>
      </div>
    </div>
  )
}
