'use client'

import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import { chartTooltipStyle } from '../model'
import { ClientChart, LightCard, SurfaceEyebrow } from '../shared'

const intelligenceTrendData = [
  { month: 'Jan', baseCleared: 72, reroutedLift: 9, quality: 88.4, drift: 2.6 },
  { month: 'Feb', baseCleared: 74, reroutedLift: 11, quality: 89.2, drift: 2.4 },
  { month: 'Mar', baseCleared: 78, reroutedLift: 15, quality: 90.8, drift: 2.2 },
  { month: 'Apr', baseCleared: 81, reroutedLift: 18, quality: 92.6, drift: 1.9 },
  { month: 'May', baseCleared: 79, reroutedLift: 16, quality: 91.7, drift: 2.1 },
  { month: 'Jun', baseCleared: 85, reroutedLift: 20, quality: 94.1, drift: 1.7 },
  { month: 'Jul', baseCleared: 84, reroutedLift: 19, quality: 93.4, drift: 1.8 },
  { month: 'Aug', baseCleared: 86, reroutedLift: 21, quality: 94.7, drift: 1.5 },
  { month: 'Sep', baseCleared: 88, reroutedLift: 23, quality: 95.2, drift: 1.4 },
  { month: 'Oct', baseCleared: 87, reroutedLift: 22, quality: 95.1, drift: 1.5 },
  { month: 'Nov', baseCleared: 89, reroutedLift: 24, quality: 96.1, drift: 1.2 },
  { month: 'Dec', baseCleared: 92, reroutedLift: 26, quality: 96.8, drift: 1.1 },
] as const

const processorRateData = [
  { month: 'Jan', razorpay: 90, stripe: 86, cashfree: 84, payu: 82, neftHub: 88 },
  { month: 'Feb', razorpay: 91, stripe: 87, cashfree: 83, payu: 81, neftHub: 89 },
  { month: 'Mar', razorpay: 89, stripe: 85, cashfree: 82, payu: 83, neftHub: 88 },
  { month: 'Apr', razorpay: 92, stripe: 88, cashfree: 84, payu: 82, neftHub: 90 },
  { month: 'May', razorpay: 93, stripe: 89, cashfree: 85, payu: 83, neftHub: 91 },
  { month: 'Jun', razorpay: 91, stripe: 86, cashfree: 82, payu: 81, neftHub: 90 },
  { month: 'Jul', razorpay: 92, stripe: 87, cashfree: 84, payu: 82, neftHub: 91 },
  { month: 'Aug', razorpay: 94, stripe: 90, cashfree: 86, payu: 84, neftHub: 93 },
  { month: 'Sep', razorpay: 95, stripe: 91, cashfree: 87, payu: 85, neftHub: 94 },
  { month: 'Oct', razorpay: 94, stripe: 90, cashfree: 86, payu: 84, neftHub: 93 },
  { month: 'Nov', razorpay: 96, stripe: 92, cashfree: 88, payu: 86, neftHub: 95 },
  { month: 'Dec', razorpay: 97, stripe: 93, cashfree: 89, payu: 87, neftHub: 96 },
] as const

const riskCauseData = [
  { name: 'PSP degradation', value: 38 },
  { name: 'Bank callback lag', value: 27 },
  { name: 'Data-quality rules', value: 19 },
  { name: 'Governance hold', value: 16 },
] as const

const ticketHistogram = [
  { band: '<₹10k', count: 44 },
  { band: '₹10k-25k', count: 66 },
  { band: '₹25k-50k', count: 84 },
  { band: '₹50k-1L', count: 92 },
  { band: '₹1L-2L', count: 78 },
  { band: '₹2L-5L', count: 53 },
  { band: '>₹5L', count: 29 },
] as const

const issuingBankRows = [
  { bank: 'JPMorgan India', payouts: 12904, authRate: 98 },
  { bank: 'Wells Fargo APAC', payouts: 12398, authRate: 93 },
  { bank: 'Barclays Mumbai', payouts: 11983, authRate: 91 },
  { bank: 'Revolut Lane', payouts: 10837, authRate: 89 },
  { bank: 'Lloyds Bank Rail', payouts: 10522, authRate: 85 },
  { bank: 'Capital One Desk', payouts: 9633, authRate: 83 },
] as const

const exposureRows = [
  { label: 'IMPS corridor', value: '₹19.4L', note: 'High throughput • stable callbacks' },
  { label: 'NEFT corridor', value: '₹11.2L', note: 'Delay pockets in one branch cluster' },
  { label: 'RTGS corridor', value: '₹8.8L', note: 'Low volume • high-value clears' },
  { label: 'UPI push', value: '₹14.6L', note: 'Fast confirmation • low exception drift' },
] as const

type NetworkNode = {
  id: string
  label: string
  x: number
  y: number
  r: number
  tone: 'hub' | 'warning' | 'stable'
}

const networkNodes: NetworkNode[] = [
  { id: 'ops-hub', label: 'Ops Hub', x: 332, y: 214, r: 40, tone: 'hub' },
  { id: 'risk-hub', label: 'Risk Hub', x: 236, y: 168, r: 34, tone: 'warning' },
  { id: 'proof-hub', label: 'Proof Hub', x: 425, y: 152, r: 32, tone: 'warning' },
  { id: 'rail-imps', label: 'IMPS', x: 170, y: 274, r: 18, tone: 'stable' },
  { id: 'rail-neft', label: 'NEFT', x: 280, y: 292, r: 20, tone: 'warning' },
  { id: 'rail-rtgs', label: 'RTGS', x: 434, y: 282, r: 18, tone: 'stable' },
  { id: 'psp-rzp', label: 'Razorpay', x: 122, y: 176, r: 18, tone: 'stable' },
  { id: 'psp-cf', label: 'Cashfree', x: 204, y: 92, r: 16, tone: 'stable' },
  { id: 'psp-st', label: 'Stripe', x: 410, y: 84, r: 16, tone: 'stable' },
  { id: 'bank-icici', label: 'ICICI', x: 508, y: 232, r: 17, tone: 'warning' },
  { id: 'bank-axis', label: 'Axis', x: 474, y: 332, r: 15, tone: 'stable' },
  { id: 'bank-hdfc', label: 'HDFC', x: 266, y: 354, r: 16, tone: 'stable' },
] as const

const networkEdges: Array<[string, string]> = [
  ['ops-hub', 'risk-hub'],
  ['ops-hub', 'proof-hub'],
  ['ops-hub', 'rail-imps'],
  ['ops-hub', 'rail-neft'],
  ['ops-hub', 'rail-rtgs'],
  ['risk-hub', 'psp-rzp'],
  ['risk-hub', 'psp-cf'],
  ['proof-hub', 'psp-st'],
  ['proof-hub', 'bank-icici'],
  ['rail-neft', 'bank-icici'],
  ['rail-neft', 'bank-axis'],
  ['rail-rtgs', 'bank-axis'],
  ['rail-imps', 'bank-hdfc'],
  ['risk-hub', 'bank-hdfc'],
  ['proof-hub', 'bank-axis'],
] as const

const heatmapRows = ['North', 'West', 'South', 'East'] as const
const heatmapCols = ['PSP', 'Bank', 'Rail', 'Risk', 'Proof', 'SLA'] as const
const heatmapData = [
  [74, 52, 86, 41, 92, 88],
  [83, 58, 79, 47, 90, 86],
  [68, 63, 88, 39, 94, 89],
  [77, 56, 81, 43, 91, 87],
] as const

const pieColors = ['#111111', '#4ADE80', '#8A8A86', '#D0D0CB']
const riskCauseSeries = riskCauseData.map((item, index) => ({
  ...item,
  fill: pieColors[index % pieColors.length],
}))

function heatColor(value: number) {
  if (value >= 90) return '#4ADE80'
  if (value >= 80) return '#b7f1cb'
  if (value >= 70) return '#dce8dc'
  if (value >= 60) return '#e9ede7'
  if (value >= 50) return '#efefeb'
  return '#f5f5f2'
}

function SyncTooltipContent({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div style={chartTooltipStyle} className="min-w-[12rem] p-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-[#8a8a86]">{label}</div>
      <div className="mt-1.5 space-y-1 text-[12px] text-[#111111]">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span>{entry.name}</span>
            <span className="font-medium">
              {typeof entry.value === 'number' && entry.name?.toString().toLowerCase().includes('rate')
                ? `${entry.value.toFixed(1)}%`
                : `${entry.value}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function nodeById(id: string) {
  return networkNodes.find((node) => node.id === id)
}

function nodeToneStyle(tone: NetworkNode['tone']) {
  if (tone === 'hub') {
    return { fill: '#111111', stroke: '#111111', label: '#ffffff' as const }
  }
  if (tone === 'warning') {
    return { fill: '#f2f2ef', stroke: '#111111', label: '#111111' as const }
  }
  return { fill: '#e9f9ee', stroke: '#4ADE80', label: '#14532d' as const }
}

export function LiveSyncSurface() {
  return (
    <div className="mt-8 space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Success rate trend', value: '98.4%', delta: '+1.2 pts', note: 'Cleared payouts across routed intents.' },
          { label: 'SLA breach rate', value: '1.1%', delta: '-0.6 pts', note: 'Breach pressure is dropping cycle over cycle.' },
          { label: 'Recon closure rate', value: '94.2%', delta: '+2.4 pts', note: 'Faster closure on statement-linked records.' },
          { label: 'Evidence completeness', value: '97.6%', delta: '+1.8 pts', note: 'More intents are export-ready without manual joins.' },
        ].map((item) => (
          <LightCard key={item.label} className="border-[#E5E5E5] shadow-[0_4px_18px_rgba(0,0,0,0.04)]">
            <SurfaceEyebrow>{item.label}</SurfaceEyebrow>
            <div className="mt-3 text-[2.35rem] font-light tracking-[-0.04em] text-[#111111]">{item.value}</div>
            <div className="mt-2 inline-flex rounded-full border border-[#4ADE80]/35 bg-[#effcf3] px-2.5 py-1 text-[11px] font-medium text-[#166534]">
              {item.delta}
            </div>
            <p className="mt-3 text-[12px] leading-5 text-[#6f716d]">{item.note}</p>
          </LightCard>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.48fr_0.92fr]">
        <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Stacked outcome trend</SurfaceEyebrow>
              <div className="mt-2 text-[15px] font-medium text-[#111111]">
                Cleared base volume + rerouted lift with a line view for quality rate
              </div>
            </div>
            <div className="text-[12px] text-[#8a8a86]">Jan-Dec intelligence window</div>
          </div>

          <ClientChart className="mt-6 h-[19rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <ComposedChart data={intelligenceTrendData} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} />
                <YAxis yAxisId="value" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} />
                <YAxis
                  yAxisId="percent"
                  orientation="right"
                  domain={[80, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#8a8a86', fontSize: 12 }}
                  tickFormatter={(value: number) => `${value}%`}
                />
                <Tooltip content={<SyncTooltipContent />} cursor={{ fill: 'rgba(17,17,17,0.03)' }} />
                <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12, color: '#6f716d' }} />
                <Bar yAxisId="value" dataKey="baseCleared" name="Base cleared (₹L)" stackId="trend" fill="#d7ddd9" barSize={18} radius={[5, 5, 0, 0]} />
                <Bar yAxisId="value" dataKey="reroutedLift" name="Rerouted lift (₹L)" stackId="trend" fill="#111111" barSize={18} radius={[5, 5, 0, 0]} />
                <Line yAxisId="percent" type="monotone" dataKey="quality" name="Quality rate" stroke="#4ADE80" strokeWidth={2.4} dot={false} activeDot={{ r: 4, fill: '#4ADE80' }} />
                <Line yAxisId="percent" type="monotone" dataKey="drift" name="Drift risk" stroke="#8a8a86" strokeWidth={1.6} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ClientChart>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Money at risk by cause</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Aggregated and anonymized exposure split</div>
            </div>
          </div>

          <ClientChart className="mt-3 h-[14rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={170}>
              <PieChart>
                <Pie data={riskCauseSeries} dataKey="value" nameKey="name" innerRadius={42} outerRadius={78} paddingAngle={2} cornerRadius={4} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [`₹${value.toFixed(1)}L`, 'At risk']} />
              </PieChart>
            </ResponsiveContainer>
          </ClientChart>

          <div className="mt-2 space-y-2.5">
            {riskCauseSeries.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-[12px] text-[#111111]">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.fill }} />
                  <span>{item.name}</span>
                </div>
                <span className="font-medium">₹{item.value.toFixed(1)}L</span>
              </div>
            ))}
          </div>
        </LightCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Processor quality line graph</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Auth rate by processor and bank rail partner</div>
            </div>
            <button type="button" className="rounded-full border border-[#E5E5E5] bg-[#f8f8f6] px-3 py-1.5 text-[12px] text-[#111111]">
              View all data
            </button>
          </div>

          <ClientChart className="mt-5 h-[17rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
              <AreaChart data={processorRateData} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 12 }} />
                <YAxis
                  domain={[70, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#8a8a86', fontSize: 12 }}
                  tickFormatter={(value: number) => `${value}%`}
                />
                <Tooltip content={<SyncTooltipContent />} />
                <Legend verticalAlign="bottom" height={26} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="razorpay" name="Razorpay" stroke="#111111" fill="none" strokeWidth={2.1} />
                <Area type="monotone" dataKey="stripe" name="Stripe" stroke="#4ADE80" fill="none" strokeWidth={2.1} />
                <Area type="monotone" dataKey="cashfree" name="Cashfree" stroke="#8a8a86" fill="none" strokeWidth={1.9} />
                <Area type="monotone" dataKey="payu" name="PayU" stroke="#d0d0cb" fill="none" strokeWidth={1.9} />
                <Area type="monotone" dataKey="neftHub" name="NEFT hub" stroke="#6b7280" fill="none" strokeWidth={1.9} strokeDasharray="5 4" />
              </AreaChart>
            </ResponsiveContainer>
          </ClientChart>
        </LightCard>

        <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Risk network graph</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Node connectivity across ops hubs, PSP lanes, and bank clusters</div>
            </div>
          </div>

          <div className="mt-5 rounded-[1.15rem] border border-[#E5E5E5] bg-[#fafaf8] p-3">
            <svg viewBox="0 0 620 430" className="h-[20rem] w-full">
              {networkEdges.map(([from, to]) => {
                const source = nodeById(from)
                const target = nodeById(to)
                if (!source || !target) return null
                return (
                  <line
                    key={`${from}-${to}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="#c9c9c2"
                    strokeWidth="2"
                    opacity="0.9"
                  />
                )
              })}
              {networkNodes.map((node) => {
                const style = nodeToneStyle(node.tone)
                return (
                  <g key={node.id}>
                    <circle cx={node.x} cy={node.y} r={node.r} fill={style.fill} stroke={style.stroke} strokeWidth="2" />
                    <text
                      x={node.x}
                      y={node.y + 4}
                      textAnchor="middle"
                      fontSize={node.r > 30 ? 14 : 12}
                      fontWeight={600}
                      fill={style.label}
                    >
                      {node.label}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </LightCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SurfaceEyebrow>Auth rate and payouts by issuing bank</SurfaceEyebrow>
              <div className="mt-2 text-[14px] text-[#6f716d]">Institutional quality surface for bank-wise payout confidence</div>
            </div>
            <button type="button" className="rounded-[0.8rem] border border-[#E5E5E5] bg-[#f7f7f4] px-3 py-2 text-[12px] text-[#111111]">
              View all data
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-[1rem] border border-[#E5E5E5]">
            <div className="grid grid-cols-[1.2fr_0.8fr_1fr] bg-[#f8f8f6] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8a86]">
              <span>Issuing bank</span>
              <span className="text-right">No. of payouts</span>
              <span className="text-right">Auth rate</span>
            </div>
            <div className="divide-y divide-[#ececea]">
              {issuingBankRows.map((row) => (
                <div key={row.bank} className="grid grid-cols-[1.2fr_0.8fr_1fr] items-center gap-3 px-4 py-3 text-[13px]">
                  <span className="truncate text-[#111111]">{row.bank}</span>
                  <span className="text-right text-[#6f716d]">{formatCompactNumber(row.payouts)}</span>
                  <span className="text-right">
                    <span className="inline-flex min-w-[3.1rem] justify-center rounded-md bg-[#ece7f8] px-2 py-1 font-medium text-[#3c3550]">
                      {row.authRate}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </LightCard>

        <div className="grid gap-4">
          <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SurfaceEyebrow>Ticket risk histogram</SurfaceEyebrow>
                <div className="mt-2 text-[14px] text-[#6f716d]">Risk-weighted payout profile by ticket-size bands</div>
              </div>
            </div>
            <ClientChart className="mt-4 h-[13rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={140}>
                <ComposedChart data={ticketHistogram} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <XAxis dataKey="band" axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8a8a86', fontSize: 11 }} />
                  <Tooltip content={<SyncTooltipContent />} />
                  <Bar dataKey="count" name="Intent count" fill="#111111" radius={[7, 7, 0, 0]} />
                  <Line type="monotone" dataKey="count" name="Distribution line" stroke="#4ADE80" strokeWidth={2} dot={{ r: 2.4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ClientChart>
          </LightCard>

          <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SurfaceEyebrow>Regional exposure heat map</SurfaceEyebrow>
                <div className="mt-2 text-[14px] text-[#6f716d]">Risk concentration by region and operating lens</div>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-[1rem] border border-[#E5E5E5]">
              <div className="grid grid-cols-[0.9fr_repeat(6,minmax(0,1fr))] bg-[#f8f8f6] px-2 py-2 text-[11px] font-medium text-[#8a8a86]">
                <div />
                {heatmapCols.map((col) => (
                  <div key={col} className="text-center">{col}</div>
                ))}
              </div>
              {heatmapRows.map((rowLabel, rowIndex) => (
                <div key={rowLabel} className="grid grid-cols-[0.9fr_repeat(6,minmax(0,1fr))] gap-2 px-2 py-2">
                  <div className="flex items-center px-1 text-[12px] font-medium text-[#6f716d]">{rowLabel}</div>
                  {heatmapData[rowIndex].map((value, cellIndex) => (
                    <div
                      key={`${rowLabel}-${heatmapCols[cellIndex]}`}
                      className="rounded-[0.55rem] border border-white px-1.5 py-1 text-center text-[11px] font-medium text-[#31443a]"
                      style={{ background: heatColor(value) }}
                    >
                      {value}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </LightCard>
        </div>
      </div>

      <LightCard className="border-[#E5E5E5] shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <SurfaceEyebrow>Safe exposure view</SurfaceEyebrow>
            <div className="mt-2 text-[14px] leading-6 text-[#6f716d]">
              All values are aggregated and anonymized at business level. No internal service boundaries are shown.
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {exposureRows.map((row) => (
            <div key={row.label} className="rounded-[1rem] border border-[#E5E5E5] bg-[#fafaf8] p-4">
              <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8a8a86]">{row.label}</div>
              <div className="mt-2 text-[1.6rem] font-light tracking-[-0.03em] text-[#111111]">{row.value}</div>
              <div className="mt-2 text-[12px] leading-5 text-[#6f716d]">{row.note}</div>
            </div>
          ))}
        </div>
      </LightCard>
    </div>
  )
}
