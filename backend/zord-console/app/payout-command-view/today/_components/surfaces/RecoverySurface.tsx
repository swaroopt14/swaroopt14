'use client'

import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartTooltipStyle } from '../model'
import { ClientChart, LightCard, SurfaceEyebrow } from '../shared'

const reconciliationTrend = [
  { month: 'Jan', reconciled: 72, pending: 16, mismatch: 8 },
  { month: 'Feb', reconciled: 74, pending: 15, mismatch: 7 },
  { month: 'Mar', reconciled: 78, pending: 13, mismatch: 6 },
  { month: 'Apr', reconciled: 81, pending: 12, mismatch: 6 },
  { month: 'May', reconciled: 80, pending: 12, mismatch: 5 },
  { month: 'Jun', reconciled: 84, pending: 10, mismatch: 5 },
  { month: 'Jul', reconciled: 85, pending: 9, mismatch: 4 },
  { month: 'Aug', reconciled: 86, pending: 8, mismatch: 4 },
  { month: 'Sep', reconciled: 88, pending: 7, mismatch: 4 },
] as const

const signalCoverageTrend = [
  { month: 'Jan', pspPush: 88, pspPoll: 81, bankStatement: 76, multiSource: 71 },
  { month: 'Feb', pspPush: 89, pspPoll: 83, bankStatement: 78, multiSource: 73 },
  { month: 'Mar', pspPush: 91, pspPoll: 85, bankStatement: 81, multiSource: 77 },
  { month: 'Apr', pspPush: 92, pspPoll: 86, bankStatement: 82, multiSource: 79 },
  { month: 'May', pspPush: 92, pspPoll: 87, bankStatement: 83, multiSource: 81 },
  { month: 'Jun', pspPush: 93, pspPoll: 89, bankStatement: 85, multiSource: 84 },
  { month: 'Jul', pspPush: 94, pspPoll: 90, bankStatement: 87, multiSource: 87 },
  { month: 'Aug', pspPush: 95, pspPoll: 91, bankStatement: 88, multiSource: 90 },
  { month: 'Sep', pspPush: 96, pspPoll: 92, bankStatement: 90, multiSource: 91.8 },
] as const

const mismatchByCause = [
  { cause: 'Timing mismatch', value: 4.3 },
  { cause: 'Amount mismatch', value: 3.2 },
  { cause: 'Ref mismatch', value: 2.1 },
  { cause: 'Policy hold', value: 1.7 },
  { cause: 'Manual review', value: 1.1 },
] as const

const mismatchQueue = [
  { contract: 'ACQ-24118', cause: 'Amount mismatch', amount: '₹2.8L', age: '3h 14m', owner: 'Finance review' },
  { contract: 'ACQ-24109', cause: 'Statement delay', amount: '₹1.9L', age: '2h 28m', owner: 'Bank follow-up' },
  { contract: 'ACQ-24097', cause: 'Callback drift', amount: '₹2.2L', age: '1h 46m', owner: 'Ops watch' },
  { contract: 'ACQ-24084', cause: 'Ref mismatch', amount: '₹1.6L', age: '1h 12m', owner: 'Client confirm' },
  { contract: 'ACQ-24071', cause: 'Policy hold', amount: '₹3.9L', age: '54m', owner: 'Risk review' },
] as const

export function RecoverySurface() {
  return (
    <div className="mt-8 space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Recon closure rate', value: '96.1%', delta: '+1.4 pts', note: 'Fully matched and closed payouts.' },
          { label: 'Full 3-signal coverage', value: '91.8%', delta: '+2.2 pts', note: 'PSP push + poll + bank agreement.' },
          { label: 'Amount variance', value: '₹12.4L', delta: '-18.0%', note: 'Still in mismatch / manual review.' },
          { label: 'Auto-close recon rate', value: '87.3%', delta: '+3.1 pts', note: 'Closed without manual operator touch.' },
        ].map((item) => (
          <LightCard key={item.label} className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.04)]">
            <SurfaceEyebrow>{item.label}</SurfaceEyebrow>
            <div className="mt-3 text-[2.3rem] font-light tracking-[-0.04em] text-[#111111]">{item.value}</div>
            <div className="mt-2 inline-flex rounded-full border border-[#4ADE80]/35 bg-[#effcf3] px-2.5 py-1 text-[11px] font-medium text-[#166534]">
              {item.delta}
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[#6f716d]">{item.note}</p>
          </LightCard>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.44fr_0.96fr]">
        <LightCard className="border-[#E5E5E5] shadow-[0_8px_22px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Reconciliation progress vs pending pressure</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Business view of fully reconciled, pending finality, and mismatched payouts</div>
            </div>
            <span className="rounded-full border border-[#E5E5E5] bg-[#f7f7f4] px-3 py-1.5 text-[12px] text-[#111111]">CFO / auditor view</span>
          </div>

          <ClientChart className="mt-5 h-[21rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <ComposedChart data={reconciliationTrend} margin={{ top: 8, right: 10, left: -4, bottom: 0 }} barCategoryGap="28%">
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} />
                <YAxis yAxisId="amount" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12, color: '#6f716d' }} />
                <Bar yAxisId="amount" dataKey="reconciled" name="Fully reconciled" stackId="recon" fill="#111111" barSize={24} radius={[0, 0, 0, 0]} />
                <Bar yAxisId="amount" dataKey="pending" name="Pending finality" stackId="recon" fill="#d4d4cf" barSize={24} radius={[0, 0, 0, 0]} />
                <Bar yAxisId="amount" dataKey="mismatch" name="Mismatch" stackId="recon" fill="#b8b8b3" barSize={24} radius={[8, 8, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </ClientChart>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_8px_22px_rgba(0,0,0,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Residual mismatch queue</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Remaining gaps requiring owner follow-up</div>
            </div>
            <button type="button" className="rounded-[0.8rem] border border-[#E5E5E5] bg-[#f7f7f4] px-3 py-2 text-[12px] text-[#111111]">
              Open queue
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-[1rem] border border-[#E5E5E5]">
            <div className="grid grid-cols-[0.95fr_1fr_0.7fr_0.6fr] bg-[#f8f8f6] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a8a86]">
              <span>Contract</span>
              <span>Cause</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Age</span>
            </div>
            <div className="divide-y divide-[#ececea]">
              {mismatchQueue.map((row) => (
                <div key={row.contract} className="px-3 py-3">
                  <div className="grid grid-cols-[0.95fr_1fr_0.7fr_0.6fr] items-center text-[12px]">
                    <span className="font-medium text-[#111111]">{row.contract}</span>
                    <span className="text-[#6f716d]">{row.cause}</span>
                    <span className="text-right font-medium text-[#111111]">{row.amount}</span>
                    <span className="text-right text-[#8a8a86]">{row.age}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-[#7c7d78]">Owner: {row.owner}</div>
                </div>
              ))}
            </div>
          </div>
        </LightCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Multi-source confirmation coverage</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Agreement across PSP push, PSP poll, and bank statement confirmation lanes</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[#6f716d]">
            {[
              ['PSP push', '#111111'],
              ['PSP poll', '#8a8a86'],
              ['Bank statement', '#bdbdb8'],
              ['3-signal agreement', '#4ADE80'],
            ].map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-2 rounded-full border border-[#E5E5E5] bg-[#f8f8f6] px-2.5 py-1">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
          <ClientChart className="mt-5 h-[16rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={170}>
              <AreaChart data={signalCoverageTrend} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} />
                <YAxis domain={[60, 100]} axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} tickFormatter={(value: number) => `${value}%`} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="pspPush" name="PSP push" stroke="#111111" fill="none" strokeWidth={2.1} />
                <Area type="monotone" dataKey="pspPoll" name="PSP poll" stroke="#8a8a86" fill="none" strokeWidth={2.0} />
                <Area type="monotone" dataKey="bankStatement" name="Bank statement" stroke="#bdbdb8" fill="none" strokeWidth={1.9} />
                <Area type="monotone" dataKey="multiSource" name="3-signal agreement" stroke="#4ADE80" fill="rgba(74,222,128,0.12)" strokeWidth={2.2} />
              </AreaChart>
            </ResponsiveContainer>
          </ClientChart>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Amount variance by mismatch type</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Residual variance pool that still needs manual attention</div>
            </div>
          </div>
          <ClientChart className="mt-5 h-[11rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
              <ComposedChart data={mismatchByCause} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                <XAxis dataKey="cause" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 11 }} tickFormatter={(value: number) => `₹${value}L`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [`₹${value.toFixed(1)}L`, 'Variance']} />
                <Bar dataKey="value" name="Variance" fill="#111111" barSize={28} radius={[7, 7, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </ClientChart>

          <div className="mt-3 rounded-[1rem] border border-[#E5E5E5] bg-[#f8f8f6] p-3 text-[12px] leading-5 text-[#6f716d]">
            This screen intentionally surfaces outcomes in business language. Matching logic and fusion rules stay inside Zord’s engine while finance and audit teams see closure quality, variance size, and pending residual risk.
          </div>
        </LightCard>
      </div>
    </div>
  )
}
