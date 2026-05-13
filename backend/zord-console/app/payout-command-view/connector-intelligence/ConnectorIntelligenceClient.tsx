'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NavyMetricHero } from '../today/_components/command-center/NavyMetricHero'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'

function formatINR(minorStr: string | number | undefined): string {
  if (!minorStr) return '—'
  const minor = typeof minorStr === 'number' ? minorStr : Number(minorStr)
  if (!Number.isFinite(minor) || minor === 0) return '₹0'
  const rupees = minor / 100
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)} Cr`
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(2)} L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)} K`
  return `₹${rupees.toFixed(0)}`
}

type ConnectorStatus = 'Healthy' | 'Monitoring' | 'Degraded' | 'Critical'
type SortDir = 'asc' | 'desc'

type ConnectorCard = {
  name: string
  rails: string[]
  status: ConnectorStatus
  volume: string
  signalRate: string
  ambiguity: string
  avgSignal: string
  govReject: string
  defensibility: number
  exposure: string
  insight: string
  action: string
  ambiguity14d: number[]
  delta24h: string
  delta24hKind: 'up' | 'down' | 'flat'
}

/** Table matches spec: Connector | Volume | Signal Rate | Ambiguity % | Avg Signal Time | Defensibility Score */
type ComparisonRow = {
  connector: string
  volume: number
  signalRate: number
  ambiguity: number
  avgSignal: number
  defensibility: number
}

const CONNECTORS: ConnectorCard[] = [
  {
    name: 'RazorpayX',
    rails: ['NACH', 'LSM'],
    status: 'Degraded',
    volume: '₹84.2L',
    signalRate: '87.1%',
    ambiguity: '3.2%',
    avgSignal: '11.2s',
    govReject: '0.25%',
    defensibility: 72,
    exposure: '₹2.4L/mo',
    insight:
      'Webhook latency on NACH runs ~2.1× the 14-day baseline. 3.2% ambiguity on this connector maps to ~₹2.4L/mo in defensibility exposure — usable in a PSP QBR.',
    action: 'Open NACH lane ticket',
    ambiguity14d: [2.6, 2.7, 2.8, 2.7, 2.9, 3.0, 3.1, 3.0, 3.2, 3.4, 3.3, 3.5, 3.3, 3.2],
    delta24h: '+0.3pp',
    delta24hKind: 'up',
  },
  {
    name: 'Cashfree',
    rails: ['UPI', 'Bank Transfer'],
    status: 'Healthy',
    volume: '₹96.1L',
    signalRate: '92.7%',
    ambiguity: '1.8%',
    avgSignal: '8.1s',
    govReject: '0.1%',
    defensibility: 84,
    exposure: '₹0.4L/mo',
    insight: 'Lowest ambiguity in the cohort; strong candidate for overflow when a degraded lane needs relief.',
    action: 'Promote as primary IMPS lane',
    ambiguity14d: [2.0, 2.1, 1.9, 2.0, 1.9, 1.8, 1.9, 1.8, 1.7, 1.8, 1.7, 1.8, 1.7, 1.8],
    delta24h: '-0.1pp',
    delta24hKind: 'down',
  },
  {
    name: 'PayU',
    rails: ['Card', 'NACH'],
    status: 'Critical',
    volume: '₹61.8L',
    signalRate: '80.4%',
    ambiguity: '6.0%',
    avgSignal: '14.3s',
    govReject: '0.42%',
    defensibility: 58,
    exposure: '₹4.8L/mo',
    insight:
      '6.0% ambiguity on Card + settlement drift. ~₹4.8L/mo exposure — largest negotiation lever: which PSP is creating the most ambiguity, and what is that costing in undefensible intents.',
    action: 'Schedule QBR with PayU',
    ambiguity14d: [4.8, 5.1, 5.0, 5.4, 5.6, 5.9, 5.7, 6.2, 6.4, 6.1, 6.3, 6.5, 6.2, 6.0],
    delta24h: '+0.4pp',
    delta24hKind: 'up',
  },
  {
    name: 'Stripe',
    rails: ['Card', 'Bank Transfer'],
    status: 'Monitoring',
    volume: '₹101.3L',
    signalRate: '89.5%',
    ambiguity: '2.4%',
    avgSignal: '9.7s',
    govReject: '0.18%',
    defensibility: 78,
    exposure: '₹1.1L/mo',
    insight: 'Weekend signal arrival creeping above 11s; watch for ambiguity spike if the trend holds.',
    action: 'Set 11s latency alert',
    ambiguity14d: [2.2, 2.3, 2.1, 2.2, 2.5, 2.7, 2.4, 2.3, 2.2, 2.5, 2.8, 2.6, 2.5, 2.4],
    delta24h: '−0.1pp',
    delta24hKind: 'flat',
  },
]

const COMPARISON_ROWS: ComparisonRow[] = [
  { connector: 'RazorpayX', volume: 84.2, signalRate: 87.1, ambiguity: 3.2, avgSignal: 11.2, defensibility: 72 },
  { connector: 'Cashfree', volume: 96.1, signalRate: 92.7, ambiguity: 1.8, avgSignal: 8.1, defensibility: 84 },
  { connector: 'PayU', volume: 61.8, signalRate: 80.4, ambiguity: 6.0, avgSignal: 14.3, defensibility: 58 },
  { connector: 'Stripe', volume: 101.3, signalRate: 89.5, ambiguity: 2.4, avgSignal: 9.7, defensibility: 78 },
]

// `firePrompt` used to depend on a window.sendPrompt hook that no caller
// registers, so the buttons were dead. We now route every connector-page
// action to a real destination (the Ambiguity surface for triage), and log the
// intent for analytics / debugging. Once the AskZord prompt receiver lands,
// the navigation can be replaced with a prompt-send.
function makeFirePrompt(navigate: (path: string) => void) {
  return (prompt: string) => {
    console.info('[ConnectorIntelligence] action:', prompt)
    navigate('/payout-command-view/today?dock=ambiguity')
  }
}

/** Soft tinted pills; status carried by background + dot. */
function statusBadge(status: ConnectorStatus) {
  if (status === 'Healthy')
    return {
      wrap: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
      strip: 'from-emerald-400/60 via-emerald-300/30 to-transparent',
      cardTint: 'bg-gradient-to-br from-emerald-50/60 via-white to-white',
    }
  if (status === 'Monitoring')
    return {
      wrap: 'border-sky-200/70 bg-sky-50 text-sky-700',
      dot: 'bg-sky-500',
      strip: 'from-sky-400/55 via-sky-300/25 to-transparent',
      cardTint: 'bg-gradient-to-br from-sky-50/60 via-white to-white',
    }
  if (status === 'Degraded')
    return {
      wrap: 'border-amber-200/70 bg-amber-50 text-amber-700',
      dot: 'bg-amber-500',
      strip: 'from-amber-400/60 via-amber-300/30 to-transparent',
      cardTint: 'bg-gradient-to-br from-amber-50/60 via-white to-white',
    }
  return {
    wrap: 'border-rose-200/70 bg-rose-50 text-rose-700',
    dot: 'bg-rose-600',
    strip: 'from-rose-500/60 via-rose-300/30 to-transparent',
    cardTint: 'bg-gradient-to-br from-rose-50/60 via-white to-white',
  }
}

function defensibilityGray(score: number): string {
  if (score >= 80) return '#10b981' // emerald-500
  if (score >= 70) return '#0ea5e9' // sky-500
  if (score >= 60) return '#f59e0b' // amber-500
  return '#e11d48' // rose-600
}

type DayStatus = 'g' | 'a' | 'r' | 'm'

const TIMELINE_30D: Array<{ name: string; days: DayStatus[]; anomalyAt: number | null }> = [
  {
    name: 'RazorpayX',
    days: ['g', 'g', 'g', 'g', 'a', 'a', 'g', 'g', 'g', 'g', 'a', 'a', 'a', 'g', 'g', 'g', 'a', 'a', 'a', 'a', 'a', 'r', 'r', 'a', 'a', 'g', 'g', 'a', 'a', 'a'],
    anomalyAt: 21,
  },
  {
    name: 'Cashfree',
    days: ['g', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'a', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'a', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'g', 'a', 'g', 'g'],
    anomalyAt: null,
  },
  {
    name: 'PayU',
    days: ['a', 'a', 'a', 'r', 'r', 'r', 'a', 'a', 'a', 'r', 'r', 'r', 'r', 'a', 'a', 'r', 'r', 'r', 'r', 'a', 'a', 'a', 'r', 'r', 'r', 'a', 'a', 'r', 'r', 'r'],
    anomalyAt: 11,
  },
  {
    name: 'Stripe',
    days: ['g', 'g', 'g', 'g', 'g', 'a', 'a', 'g', 'g', 'g', 'g', 'g', 'g', 'a', 'a', 'g', 'g', 'g', 'g', 'g', 'g', 'a', 'a', 'g', 'g', 'g', 'g', 'g', 'a', 'a'],
    anomalyAt: 22,
  },
]

function dayBg(s: DayStatus) {
  if (s === 'g') return 'bg-emerald-400'
  if (s === 'a') return 'bg-amber-400'
  if (s === 'r') return 'bg-rose-500'
  return 'bg-sky-400'
}

function Sparkline({ values, ariaLabel }: { values: number[]; ariaLabel: string }) {
  const color = '#525252'
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const w = 100
  const h = 28
  const pad = 2
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2)
      const y = pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  const areaPath = `M ${points.split(' ')[0]} L ${points} L ${w - pad},${h - pad} L ${pad},${h - pad} Z`
  const last = values[values.length - 1]
  const lastX = w - pad
  const lastY = pad + (h - pad * 2) - ((last - min) / range) * (h - pad * 2)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
      <path d={areaPath} fill={color} fillOpacity="0.08" />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="1.6" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const STATUS_ORDER: Record<ConnectorStatus, number> = { Critical: 0, Degraded: 1, Monitoring: 2, Healthy: 3 }

function exportComparisonCsv(rows: ComparisonRow[]) {
  const header = ['Connector', 'Volume (₹L)', 'Signal closure rate (%)', 'Ambiguity (%)', 'Avg signal time (s)', 'Defensibility score']
  const lines = rows.map(
    (r) =>
      `${r.connector},${r.volume},${r.signalRate},${r.ambiguity},${r.avgSignal},${r.defensibility}`,
  )
  const blob = new Blob([header.join(',') + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'connector-intelligence-comparison.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function ConnectorIntelligenceClient() {
  const router = useRouter()
  const firePrompt = makeFirePrompt((path) => router.push(path))
  const tenantId = useSessionTenantId()
  const { leakage, defensibility, patterns, lastFetchedAt } = useIntelligenceKpis(tenantId)
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const defData = isDataAvailable(defensibility) ? defensibility : null
  const patternsData = isDataAvailable(patterns) ? patterns : null

  // Live "Total defensibility exposure" hero. Until per-connector endpoint (H)
  // ships, we use the tenant-wide exposure = (100 - defensibility) × intended.
  const intendedMinor = leakageData?.total_intended_amount_minor
  const defScore = defData?.defensibility_score ?? null
  const exposureMinor =
    intendedMinor && defScore !== null
      ? Math.round((Number(intendedMinor) * (100 - defScore)) / 100)
      : null
  const heroValue = exposureMinor !== null ? formatINR(exposureMinor) : '₹8.7L'
  const heroDelta = patternsData
    ? `${patternsData.anomaly_level} anomaly · ${patternsData.risk_tier} risk`
    : '↓ 1.6pp vs prior period'
  const syncLabel = lastFetchedAt
    ? `Sync ${Math.max(0, Math.round((Date.now() - lastFetchedAt.getTime()) / 1000))}s ago`
    : 'Sync 38s ago'

  const [activeConnector, setActiveConnector] = useState('PayU')
  const [sortBy, setSortBy] = useState<keyof ComparisonRow>('ambiguity')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sortedRows = useMemo(() => {
    const rows = [...COMPARISON_ROWS]
    rows.sort((a, b) => {
      const av = a[sortBy]
      const bv = b[sortBy]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
    })
    return rows
  }, [sortBy, sortDir])

  const sortedConnectors = useMemo(
    () => [...CONNECTORS].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
    [],
  )

  const toggleSort = (k: keyof ComparisonRow) => {
    if (sortBy !== k) {
      setSortBy(k)
      setSortDir('desc')
      return
    }
    setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
  }

  return (
    <div className="payout-command-console -mx-3 -my-4 mt-2 rounded-[20px] bg-gradient-to-b from-[#fafaf9] via-white to-[#fafaf9] px-3 py-4 text-[15px] leading-[1.55] text-neutral-950 sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5">
      {/* 24h delta strip — monochrome */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Last 24h · ambiguity delta</span>
        {sortedConnectors.map((c) => {
          const dot =
            c.delta24hKind === 'up' ? 'bg-rose-500' : c.delta24hKind === 'down' ? 'bg-emerald-500' : 'bg-sky-400'
          const arrow = c.delta24hKind === 'up' ? '↑' : c.delta24hKind === 'down' ? '↓' : '→'
          return (
            <span
              key={c.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[12px] font-medium text-neutral-600"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
              <span aria-hidden>{arrow}</span>
              <span className="font-semibold text-neutral-900">{c.name}</span>
              <span className="tabular-nums">{c.delta24h}</span>
            </span>
          )
        })}
        <span className="ml-auto text-[12px] text-neutral-500">{syncLabel}</span>
      </div>

      {/* Summary — dark navy hero (matches Leakage page) for fintech weight */}
      <NavyMetricHero
        className="mb-6"
        eyebrow="Total defensibility exposure · this period"
        value={heroValue}
        valueSuffix="/mo"
        deltaPill={heroDelta}
        subcopy="Aggregated across connectors where signals were late or conflicting. Use the per-connector cards and comparison table below to attribute exposure before a PSP conversation."
        footer={
          <>
            <button
              type="button"
              onClick={() => firePrompt('Summarize connector exposure for executive PSP review')}
              className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0f172a] transition hover:bg-white/90"
            >
              Executive brief
            </button>
            <button
              type="button"
              onClick={() => firePrompt('Schedule QBR with PayU connector negotiation pack')}
              className="rounded-lg border border-white/30 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/10"
            >
              Schedule PayU QBR
            </button>
          </>
        }
        buckets={[
          { label: 'Highest-exposure connector', value: 'PayU', sub: '₹4.8L/mo · 6.0% ambiguity — primary negotiation lever' },
          { label: 'Network ambiguity rate', value: '3.2%', sub: 'Conflicting or late signals on attributed connector' },
          { label: 'Recovered this period', value: '₹11.2L', sub: 'Retry + manual closure · 82.4% recovery rate' },
        ]}
      />

      {/* Per-connector cards */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Per-connector performance</h2>
            <p className="mt-1 text-[13px] text-neutral-600">One card per PSP / rail cluster · cost and risk, not a generic health score</p>
          </div>
          <p className="text-[12px] text-neutral-500">Sorted: worst posture first</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedConnectors.map((c) => {
            const badge = statusBadge(c.status)
            const isActive = activeConnector === c.name
            const barColor = defensibilityGray(c.defensibility)
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => {
                  setActiveConnector(c.name)
                  firePrompt(`Drill down ${c.name}: ambiguity, signal latency, and defensibility exposure`)
                }}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border border-neutral-200 p-5 text-left shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-[0_10px_30px_-8px_rgba(15,23,42,0.1),0_2px_4px_rgba(15,23,42,0.04)] ${badge.cardTint} ${
                  isActive ? 'ring-1 ring-neutral-950' : 'hover:border-neutral-300'
                }`}
              >
                {/* Top status accent strip */}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${badge.strip}`}
                />

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[16px] font-semibold text-neutral-950">{c.name}</p>
                      <span className="rounded-full border border-neutral-200 bg-neutral-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                        PSP
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-neutral-500">{c.rails.join(' · ')}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.wrap}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden />
                    {c.status}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-3 rounded-lg border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white px-3 py-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">Exposure attributed</p>
                    <p className="mt-0.5 text-[19px] font-semibold tabular-nums tracking-[-0.02em] text-neutral-950">{c.exposure}</p>
                  </div>
                  <span className="text-[11px] text-neutral-500">{c.volume} routed</span>
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">Defensibility contribution</span>
                    <span className="text-[21px] font-semibold tabular-nums text-neutral-950">{c.defensibility}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full transition-all" style={{ width: `${c.defensibility}%`, background: barColor }} />
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-500">How strongly this connector strengthens or weakens the evidence chain</p>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[12px] sm:grid-cols-3">
                  <div>
                    <dt className="text-neutral-500">Volume (period)</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-neutral-950">{c.volume}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Signal closure rate</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-neutral-950">{c.signalRate}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Ambiguity rate</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-neutral-950">{c.ambiguity}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Avg signal arrival</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-neutral-950">{c.avgSignal}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500">Governance rejection</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-neutral-950">{c.govReject}</dd>
                  </div>
                </dl>

                <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2">
                  <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                    <span>Ambiguity · 14d</span>
                    <span className="tabular-nums text-neutral-700">
                      {c.delta24hKind === 'up' ? '↑' : c.delta24hKind === 'down' ? '↓' : '→'} {c.delta24h}
                    </span>
                  </div>
                  <Sparkline values={c.ambiguity14d} ariaLabel={`${c.name} ambiguity trend, last 14 days`} />
                </div>

                <p className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-[12px] leading-relaxed text-neutral-600">
                  {c.insight}
                </p>

                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-[12px] font-medium text-neutral-800">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="text-neutral-500">Next</span>
                    <span className="truncate">{c.action}</span>
                  </span>
                  <span className="text-neutral-400" aria-hidden>
                    →
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* PSP comparison — spec columns only */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-[14px] font-semibold text-neutral-950">PSP comparison</h2>
            <p className="mt-0.5 text-[12px] text-neutral-600">
              Sortable. Exportable. Connector · Volume · Signal closure rate · Ambiguity % · Avg signal time · Defensibility score.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportComparisonCsv(sortedRows)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-800 transition hover:bg-neutral-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => firePrompt('Reroute advice from connector comparison table')}
              className="rounded-lg border border-neutral-900 bg-neutral-950 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-black"
            >
              Reroute advice
            </button>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              <tr>
                {(
                  [
                    ['connector', 'Connector', 'left'],
                    ['volume', 'Volume (₹L)', 'right'],
                    ['signalRate', 'Signal closure rate', 'right'],
                    ['ambiguity', 'Ambiguity %', 'right'],
                    ['avgSignal', 'Avg signal time', 'right'],
                    ['defensibility', 'Defensibility score', 'right'],
                  ] as const
                ).map(([k, label, align]) => (
                  <th
                    key={k}
                    scope="col"
                    className={`cursor-pointer select-none px-3 py-3 transition hover:text-neutral-900 sm:px-4 ${
                      align === 'right' ? 'text-right' : 'text-left'
                    }`}
                    onClick={() => toggleSort(k as keyof ComparisonRow)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {sortBy === k ? <span aria-hidden>{sortDir === 'desc' ? '↓' : '↑'}</span> : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-neutral-900">
              {sortedRows.map((r) => {
                const ambPct = Math.min(100, (r.ambiguity / 8) * 100)
                const ambBar = r.ambiguity <= 2 ? '#10b981' : r.ambiguity <= 4 ? '#f59e0b' : '#e11d48'
                const defBar = defensibilityGray(r.defensibility)
                return (
                  <tr key={r.connector} className="border-t border-neutral-100 transition hover:bg-neutral-50/80">
                    <td className="px-3 py-2.5 font-semibold sm:px-4">{r.connector}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">₹{r.volume.toFixed(1)}L</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums sm:px-4">{r.signalRate.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 sm:px-4">
                      <div className="flex items-center justify-end gap-2">
                        <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-neutral-100 sm:block">
                          <span className="block h-full rounded-full" style={{ width: `${ambPct}%`, background: ambBar }} />
                        </span>
                        <span className="min-w-[3rem] text-right font-semibold tabular-nums">{r.ambiguity.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums sm:px-4">{r.avgSignal.toFixed(1)}s</td>
                    <td className="px-3 py-2.5 sm:px-4">
                      <div className="flex items-center justify-end gap-2">
                        <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-neutral-100 sm:block">
                          <span className="block h-full rounded-full" style={{ width: `${r.defensibility}%`, background: defBar }} />
                        </span>
                        <span className="min-w-[2.5rem] text-right font-semibold tabular-nums">{r.defensibility}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Gantt-style health timeline — 30d, grayscale */}
      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="mb-4">
          <h2 className="text-[14px] font-semibold text-neutral-950">Connector health timeline</h2>
          <p className="mt-0.5 text-[12px] text-neutral-600">
            Last 30 days · one column per day · darker segments = worse posture · vertical bar = anomaly event
          </p>
        </div>
        <div className="space-y-2.5">
          {TIMELINE_30D.map(({ name, days, anomalyAt }) => (
            <div key={name} className="flex items-center gap-3">
              <span className="w-[5.5rem] shrink-0 text-[12px] font-medium text-neutral-600 sm:w-28">{name}</span>
              <div className="relative flex flex-1 gap-px rounded-sm bg-neutral-100 p-px">
                {days.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => firePrompt(`${name} health · day ${idx + 1} of 30`)}
                    title={`${name} · day ${idx + 1} · ${s === 'g' ? 'Nominal' : s === 'a' ? 'Degraded' : s === 'r' ? 'Critical' : 'Monitoring'}`}
                    className={`h-7 min-w-0 flex-1 rounded-[1px] transition hover:opacity-80 ${dayBg(s)}`}
                  />
                ))}
                {anomalyAt != null ? (
                  <span
                    aria-label={`Anomaly · day ${anomalyAt + 1}`}
                    className="pointer-events-none absolute -top-0.5 h-8 w-px bg-neutral-950"
                    style={{ left: `calc(${(anomalyAt / days.length) * 100}% )` }}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="w-[5.5rem] shrink-0 sm:w-28" aria-hidden />
          <div className="flex flex-1 justify-between text-[11px] text-neutral-500">
            <span>30d ago</span>
            <span>21d</span>
            <span>14d</span>
            <span>7d</span>
            <span>Today</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-200 pt-4 text-[12px] text-neutral-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[1px] bg-emerald-400" aria-hidden />
            Nominal
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[1px] bg-amber-400" aria-hidden />
            Degraded
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[1px] bg-sky-400" aria-hidden />
            Monitoring
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[1px] bg-rose-500" aria-hidden />
            Critical
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-px bg-neutral-950" aria-hidden />
            Anomaly marker
          </span>
        </div>
      </section>
    </div>
  )
}
