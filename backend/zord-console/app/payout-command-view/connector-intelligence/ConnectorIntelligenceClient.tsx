'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NavyMetricHero } from '../today/_components/command-center/NavyMetricHero'
import { CommandCenterCardGlow } from '../today/_components/command-center/CommandCenterCardGlow'
import { LiveDataHint } from '../today/_components/shared'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../today/_components/command-center/homeCommandCenterTokens'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
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
  const { tenantId, tenantReady } = useSessionTenant()
  const { leakage, defensibility, patterns, ambiguity, lastFetchedAt } = useIntelligenceKpis({ tenantReady })
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const defData = isDataAvailable(defensibility) ? defensibility : null
  const patternsData = isDataAvailable(patterns) ? patterns : null
  const ambiguityData = isDataAvailable(ambiguity) ? ambiguity : null

  const defScore = defData?.defensibility_score ?? null
  const intendedMinor = leakageData?.total_intended_amount_minor
  const exposureFromLeakage =
    intendedMinor && defScore !== null
      ? Math.round((Number(intendedMinor) * (100 - defScore)) / 100)
      : null
  const exposureFromAmbiguity = ambiguityData?.value_at_risk_minor
    ? Number(ambiguityData.value_at_risk_minor)
    : null
  const exposureMinor =
    exposureFromLeakage != null && Number.isFinite(exposureFromLeakage) && exposureFromLeakage > 0
      ? exposureFromLeakage
      : exposureFromAmbiguity != null && Number.isFinite(exposureFromAmbiguity) && exposureFromAmbiguity > 0
        ? exposureFromAmbiguity
        : null

  const hasLiveExposure = exposureMinor !== null
  const hasAnyKpi = Boolean(defData || leakageData || patternsData || ambiguityData)
  const heroValue = hasLiveExposure ? formatINR(exposureMinor) : hasAnyKpi ? 'Pending' : '—'
  const heroSuffix = hasLiveExposure ? '/mo est.' : undefined
  const heroDelta = patternsData
    ? `${patternsData.anomaly_level} anomaly · ${patternsData.risk_tier} risk`
    : defData
      ? `Tier ${defData.defensibility_tier} · ${defData.defensibility_score.toFixed(1)}% defensibility`
      : tenantReady
        ? 'Ingest a batch in Batch Command Center to populate intelligence KPIs for this tenant.'
        : 'Sign in to load tenant-scoped connector metrics.'
  const syncLabel = lastFetchedAt
    ? `Sync ${Math.max(0, Math.round((Date.now() - lastFetchedAt.getTime()) / 1000))}s ago`
    : tenantReady
      ? 'Awaiting intelligence sync'
      : 'Sign in for live KPIs'
  const hasLiveHero = hasLiveExposure

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
    <div className="space-y-5 pb-6 text-[15px] leading-[1.55]">
      <div className={`${COMMAND_CENTER_KPI_CARD} flex flex-wrap items-center justify-between gap-2 !p-4`}>
        <CommandCenterCardGlow />
        <LiveDataHint isLive={hasLiveHero} source="intelligence" />
        <span className={`relative text-[12px] ${HOME_BODY_IMPERIAL_SM}`}>{syncLabel}</span>
      </div>

      {hasLiveExposure ? (
        <NavyMetricHero
          className="mb-2"
          eyebrow="Total defensibility exposure · this period"
          value={heroValue}
          valueSuffix={heroSuffix}
          deltaPill={heroDelta}
          subcopy="Estimated from leakage-weighted intended volume and defensibility score (or ambiguity value at risk when leakage is empty). Per-PSP attribution arrives when the connector breakdown API ships."
          footer={
            <>
              <button
                type="button"
                onClick={() => firePrompt('Summarize connector exposure for executive PSP review')}
                className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0f172a] transition hover:bg-white/90"
              >
                Executive brief
              </button>
              <Link
                href="/payout-command-view/today?dock=ambiguity"
                className="rounded-lg border border-white/30 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/10"
              >
                Ambiguity analysis
              </Link>
            </>
          }
          buckets={[
            {
              label: 'Defensibility score',
              value: defScore !== null ? `${defScore.toFixed(1)}%` : '—',
              sub: defData?.defensibility_tier ? `Tier ${defData.defensibility_tier}` : 'Tenant-wide intelligence',
            },
            {
              label: 'Leakage rate',
              value: leakageData ? `${((leakageData.leakage_percentage ?? 0) * 100).toFixed(2)}%` : '—',
              sub: leakageData?.risk_tier ? `Risk ${leakageData.risk_tier}` : 'Leakage KPI 1–6',
            },
            {
              label: 'Patterns',
              value: patternsData?.anomaly_level ?? '—',
              sub: patternsData?.risk_tier
                ? `Risk ${patternsData.risk_tier}`
                : 'Set ?batch_id= on Today for batch-scoped patterns',
            },
          ]}
        />
      ) : (
        <section className={`relative mb-2 overflow-hidden ${COMMAND_CENTER_KPI_CARD}`}>
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Connector intelligence</p>
          <p className={`relative mt-2 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>
            {tenantReady ? 'Exposure will appear after batch ingest' : 'Sign in to load connector KPIs'}
          </p>
          <p className={`relative mt-2 max-w-2xl ${HOME_BODY_IMPERIAL_SM}`}>{heroDelta}</p>
          <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: 'Defensibility score',
                value: defScore !== null ? `${defScore.toFixed(1)}%` : '—',
                sub: defData?.defensibility_tier ? `Tier ${defData.defensibility_tier}` : 'KPI 11–13',
              },
              {
                label: 'Leakage rate',
                value: leakageData ? `${((leakageData.leakage_percentage ?? 0) * 100).toFixed(2)}%` : '—',
                sub: leakageData?.risk_tier ? `Risk ${leakageData.risk_tier}` : 'KPI 1–6',
              },
              {
                label: 'Ambiguity VaR',
                value: ambiguityData ? formatINR(ambiguityData.value_at_risk_minor) : '—',
                sub: ambiguityData
                  ? `${(ambiguityData.ambiguity_rate * 100).toFixed(2)}% ambiguity rate`
                  : 'KPI 7–10',
              },
            ].map((b) => (
              <div
                key={b.label}
                className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 ring-1 ring-black/[0.03]"
              >
                <p className={COMMAND_CENTER_LABEL_GREEN}>{b.label}</p>
                <p className={`mt-2 text-[1.65rem] font-extrabold tabular-nums leading-none ${HOME_TITLE_BLACK}`}>
                  {b.value}
                </p>
                <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>{b.sub}</p>
              </div>
            ))}
          </div>
          <div className="relative mt-4 flex flex-wrap gap-2">
            <Link
              href="/payout-command-view/batch-command-center"
              className="inline-flex h-9 items-center rounded-xl bg-[#111111] px-4 text-[13px] font-semibold text-white transition hover:bg-black"
            >
              Batch Command Center
            </Link>
            <Link
              href="/payout-command-view/today?dock=home"
              className={`inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold ${HOME_TITLE_BLACK} transition hover:bg-slate-50`}
            >
              Today overview
            </Link>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <article className={COMMAND_CENTER_KPI_CARD}>
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Per-connector breakdown</p>
          <p className={`relative mt-2 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>Not available yet</p>
          <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
            Tenant-wide defensibility exposure is shown in the hero above. When upstream exposes per-PSP connector metrics,
            cards and the comparison table will populate from the BFF — static demo connectors are not shown in live mode.
          </p>
          <Link
            href="/payout-command-view/today?dock=ambiguity"
            className={`relative mt-4 inline-flex text-[13px] font-semibold underline decoration-[#d0d0cc] underline-offset-4 hover:decoration-[#000000] ${HOME_TITLE_BLACK}`}
          >
            Open ambiguity analysis →
          </Link>
        </article>
      </section>

    </div>
  )
}
