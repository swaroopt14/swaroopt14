'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CommandCenterCardGlow } from '../today/_components/command-center/CommandCenterCardGlow'
import { COMMAND_CENTER_KPI_CARD, COMMAND_CENTER_LABEL_GREEN } from '../today/_components/command-center/homeCommandCenterTokens'
import { JournalIntelligenceKpiHero } from '../today/_components/command-center/JournalIntelligenceKpiHero'
import { EntityLogo } from '../today/_components/entity-logo'
import { getRoutingIntelligenceAdapter } from './routingDataAdapter'
import { rankRoutes } from './scoring'
import type {
  ConnectorHealthRow,
  RecommendationConfidence,
  RoutingKpiSnapshot,
  RoutingTimeWindow,
  TrendDirection,
} from './types'

const TYPE_FILTERS = ['All', 'PSP', 'Bank', 'Rail'] as const
type TypeFilter = (typeof TYPE_FILTERS)[number]

const TIME_WINDOWS: Array<{ value: RoutingTimeWindow; label: string }> = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const LEAKAGE_COLORS = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa']

function formatInr(minor: number): string {
  const rupees = minor / 100
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function formatCompactInr(minor: number): string {
  const rupees = minor / 100
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(1)} Cr`
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1)} L`
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function trendArrow(trend: TrendDirection): string {
  if (trend === 'up') return '↑ Stable'
  if (trend === 'down') return '↓ Drop'
  return '→ Flat'
}

function statusTone(status: ConnectorHealthRow['status']): string {
  if (status === 'Healthy' || status === 'Reliable') return 'text-emerald-700'
  if (status === 'Degraded' || status === 'Risk' || status === 'Load') return 'text-amber-700'
  return 'text-slate-700'
}

function confidenceTone(confidence: RecommendationConfidence): string {
  if (confidence === 'High') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (confidence === 'Medium') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-rose-200 bg-rose-50 text-rose-700'
}

function buildKpis(snapshot: RoutingKpiSnapshot) {
  const totalVolumeMinor = snapshot.connectors.reduce((sum, row) => sum + row.volumeMinor, 0)
  const weightedSuccessSum = snapshot.connectors.reduce((sum, row) => sum + row.successPct * row.volumeMinor, 0)
  const successRate = totalVolumeMinor > 0 ? weightedSuccessSum / totalVolumeMinor : 0
  const moneyAtRiskMinor = snapshot.connectors.reduce((sum, row) => sum + row.moneyAtRiskMinor, 0)
  const preventableLeakageMinor = snapshot.connectors.reduce((sum, row) => sum + row.preventableLeakageMinor, 0)
  const preventablePct = moneyAtRiskMinor > 0 ? (preventableLeakageMinor / moneyAtRiskMinor) * 100 : 0
  const degradedRoutes = snapshot.connectors.filter((row) =>
    row.status === 'Degraded' || row.status === 'Risk' || row.status === 'Load',
  ).length

  return {
    totalVolumeMinor,
    successRate,
    moneyAtRiskMinor,
    preventableLeakageMinor,
    preventablePct,
    activeConnectors: snapshot.connectors.length,
    degradedRoutes,
  }
}

function buildImpactSeries(snapshot: RoutingKpiSnapshot) {
  return snapshot.actionRecommendations.map((action) => ({
    id: action.id,
    action: action.title.length > 26 ? `${action.title.slice(0, 26)}…` : action.title,
    currentMinor: Math.round(action.impactMinor * 1.45),
    preventableMinor: action.impactMinor,
  }))
}

function ConnectorIdentity({ row }: { row: ConnectorHealthRow }) {
  const isLogoType = row.type === 'PSP' || row.type === 'Bank'
  return (
    <div className="flex items-center gap-2.5">
      {isLogoType ? (
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <EntityLogo
            name={row.connector}
            kind={row.type === 'PSP' ? 'psp' : 'bank'}
            size={24}
            className="pointer-events-none"
          />
        </div>
      ) : (
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
          Rail
        </span>
      )}
      <span className="font-semibold text-slate-900">{row.connector}</span>
    </div>
  )
}

export default function ConnectorIntelligenceClient() {
  const adapter = useMemo(() => getRoutingIntelligenceAdapter(), [])
  const [window, setWindow] = useState<RoutingTimeWindow>('24h')
  const [filter, setFilter] = useState<TypeFilter>('All')
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<RoutingKpiSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void adapter.getSnapshot(window).then((data) => {
      if (cancelled) return
      setSnapshot(data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [adapter, window])

  if (loading || !snapshot) {
    return <div className="h-[360px] animate-pulse rounded-2xl bg-slate-100" />
  }

  const rankedRoutes = rankRoutes(snapshot.routeCandidates)
  const topRoutes = rankedRoutes.slice(0, 3)
  const lowConfidenceExists = topRoutes.some((route) => route.confidence === 'Low')
  const kpis = buildKpis(snapshot)
  const windowLabel = TIME_WINDOWS.find((item) => item.value === window)?.label ?? 'Last 24h'
  const routingBuckets = [
    {
      label: 'Total volume routed',
      value: formatCompactInr(kpis.totalVolumeMinor),
      sub: 'Across active connector network',
    },
    {
      label: 'Success rate',
      value: `${kpis.successRate.toFixed(1)}%`,
      sub: 'Weighted by routed volume',
    },
    {
      label: 'Money at risk',
      value: formatCompactInr(kpis.moneyAtRiskMinor),
      sub: 'Current unresolved exposure',
    },
    {
      label: 'Preventable leakage',
      value: formatCompactInr(kpis.preventableLeakageMinor),
      sub: `${kpis.preventablePct.toFixed(0)}% preventable share`,
    },
    {
      label: 'Active connectors',
      value: String(kpis.activeConnectors),
      sub: 'PSP, bank, and rail endpoints',
    },
    {
      label: 'Degraded routes',
      value: String(kpis.degradedRoutes),
      sub: 'Needs immediate routing attention',
    },
  ] as const
  const isStale = Date.now() - new Date(snapshot.generatedAtIso).getTime() > snapshot.staleAfterMinutes * 60 * 1000
  const impactSeries = buildImpactSeries(snapshot)

  const connectors = filter === 'All'
    ? snapshot.connectors
    : snapshot.connectors.filter((row) => row.type === filter)

  const selectedConnector = selectedConnectorId
    ? snapshot.connectors.find((row) => row.id === selectedConnectorId) ?? null
    : null
  const selectedDrilldown = selectedConnector
    ? snapshot.drilldowns.find((row) => row.connectorId === selectedConnector.id) ?? null
    : null

  return (
    <div className="space-y-5 pb-6 text-[15px] leading-[1.55]">
      {isStale ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900" data-testid="routing-stale-banner">
          Metrics are stale. Refresh connector telemetry before making routing decisions.
        </section>
      ) : null}

      <section
        data-testid="routing-kpi-bar"
      >
        <JournalIntelligenceKpiHero
          eyebrow="Routing intelligence overview"
          value={formatCompactInr(kpis.totalVolumeMinor)}
          deltaPill={`Success ${kpis.successRate.toFixed(1)}%`}
          subcopy={`Window: ${windowLabel} · Money at risk ${formatCompactInr(kpis.moneyAtRiskMinor)}`}
          buckets={routingBuckets}
          testId="routing-kpi-bar"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={COMMAND_CENTER_KPI_CARD} data-testid="network-health-chart">
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Network Health Trend</p>
          <div className="relative mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={snapshot.networkHealthTrend}>
                <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis yAxisId="left" domain={[94, 99]} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" domain={[60, 80]} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip formatter={(value: number, name: string) => (name === 'successPct' ? `${value.toFixed(1)}%` : String(value))} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="successPct" stroke="#1d4ed8" strokeWidth={2.5} name="Success %" />
                <Line yAxisId="right" type="monotone" dataKey="latencyIndex" stroke="#0f172a" strokeWidth={2.2} name="Latency index" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={COMMAND_CENTER_KPI_CARD} data-testid="leakage-composition-chart">
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Leakage Composition</p>
          <div className="relative mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={snapshot.leakageComposition}
                    dataKey="amountMinor"
                    nameKey="label"
                    innerRadius={62}
                    outerRadius={96}
                    paddingAngle={2}
                  >
                    {snapshot.leakageComposition.map((slice, index) => (
                      <Cell key={slice.key} fill={LEAKAGE_COLORS[index % LEAKAGE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatInr(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {snapshot.leakageComposition.map((slice, index) => (
                <div key={slice.key} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[13px]">
                  <p className="font-semibold text-slate-700">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LEAKAGE_COLORS[index % LEAKAGE_COLORS.length] }} />
                    {slice.label}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums text-slate-900">{formatCompactInr(slice.amountMinor)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className={COMMAND_CENTER_KPI_CARD} data-testid="recommended-routes">
        <CommandCenterCardGlow />
        <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Recommended Routes (Top 3)</p>
        <div className="relative mt-4 grid gap-3 lg:grid-cols-3">
          {topRoutes.map((route, index) => (
            <article key={route.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[13px] font-semibold text-slate-500">#{index + 1}</p>
              <p className="mt-1 text-[16px] font-bold text-slate-900">
                {route.psp} → {route.rail} → {route.bank}
              </p>
              <p className="mt-2 text-[13px] text-slate-700">
                Success: {route.successRatePct.toFixed(1)}% | Time: {route.avgTimeSec.toFixed(1)}s | Risk: {route.risk}
              </p>
              <p className="mt-2 text-[13px] font-semibold text-slate-900">
                {route.bestForHighValue ? 'Best for high-value transactions' : `Saves: ${formatCompactInr(route.leakageSavingsMinor)} leakage`}
              </p>
              <span className={`mt-3 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidenceTone(route.confidence)}`}>
                Confidence: {route.confidence}
              </span>
            </article>
          ))}
        </div>
        {lowConfidenceExists ? (
          <p className="relative mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900" data-testid="low-confidence-note">
            Some recommendations are low-confidence due to sample size or missing signals. Validate with fresh telemetry before auto-routing changes.
          </p>
        ) : null}
      </section>

      <section className={COMMAND_CENTER_KPI_CARD} data-testid="connector-grid">
        <CommandCenterCardGlow />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <p className={COMMAND_CENTER_LABEL_GREEN}>Connector Grid</p>
          <div className="flex flex-wrap items-center gap-2">
            {TYPE_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${filter === item ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
              >
                {item === 'PSP' ? 'PSPs' : item === 'Bank' ? 'Banks' : item === 'Rail' ? 'Rails' : item}
              </button>
            ))}
            <select
              value={window}
              onChange={(event) => setWindow(event.target.value as RoutingTimeWindow)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-semibold text-slate-700"
              aria-label="Time window"
            >
              {TIME_WINDOWS.map((item) => (
                <option key={item.value} value={item.value}>
                  Time: {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-[14px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                <th className="px-3 py-2">Connector</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Success %</th>
                <th className="px-3 py-2">Avg Time</th>
                <th className="px-3 py-2">Failure %</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Trend</th>
                <th className="px-3 py-2">Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  onClick={() => setSelectedConnectorId(row.id)}
                >
                  <td className="px-3 py-2">
                    <ConnectorIdentity row={row} />
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.type}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-900">{row.successPct.toFixed(1)}%</td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">{row.avgTimeSec.toFixed(1)}s</td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">{row.failurePct.toFixed(1)}%</td>
                  <td className={`px-3 py-2 font-semibold ${statusTone(row.status)}`}>{row.status}</td>
                  <td className="px-3 py-2 text-slate-700">{trendArrow(row.trend)}</td>
                  <td className="px-3 py-2 text-slate-700">{row.recommendedAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={COMMAND_CENTER_KPI_CARD} data-testid="correlation-insights">
        <CommandCenterCardGlow />
        <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Detected Patterns</p>
        <ul className="relative mt-3 list-disc space-y-2 pl-5 text-[14px] text-slate-800">
          {snapshot.correlationInsights.map((insight) => (
            <li key={insight.id}>{insight.text}</li>
          ))}
        </ul>
      </section>

      <section className={COMMAND_CENTER_KPI_CARD} data-testid="preventable-leakage-impact">
        <CommandCenterCardGlow />
        <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Preventable Leakage Impact</p>
        <div className="relative mt-3 h-[270px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={impactSeries}>
              <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
              <XAxis dataKey="action" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 100000)}L`} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip formatter={(value: number) => formatCompactInr(value)} />
              <Legend />
              <Bar dataKey="currentMinor" fill="#94a3b8" name="Current leakage exposure" radius={[4, 4, 0, 0]} />
              <Bar dataKey="preventableMinor" fill="#0f172a" name="Preventable leakage" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={COMMAND_CENTER_KPI_CARD} data-testid="action-engine">
        <CommandCenterCardGlow />
        <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Recommended Actions</p>
        <ol className="relative mt-3 space-y-2">
          {snapshot.actionRecommendations.map((action, index) => (
            <li key={action.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[14px]">
              <p className="font-semibold text-slate-900">
                {index + 1}. {action.title}
              </p>
              <p className="mt-1 text-[13px] text-slate-700">→ {action.impactLabel}</p>
            </li>
          ))}
        </ol>
      </section>

      {selectedConnector && selectedDrilldown ? (
        <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-slate-200 bg-white shadow-2xl" data-testid="connector-drawer">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Connector</p>
              <p className="text-[18px] font-bold text-slate-900">{selectedConnector.connector}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedConnectorId(null)}
              className="rounded-md border border-slate-200 px-2 py-1 text-[12px] font-semibold text-slate-700"
            >
              Close
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto p-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Success trend (7 days)</p>
              <div className="mt-2 h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedDrilldown.successTrend7d}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis domain={[90, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                    <Line type="monotone" dataKey="successPct" stroke="#1d4ed8" strokeWidth={2.4} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Top failures</p>
              <ul className="mt-2 space-y-1 text-[14px] text-slate-800">
                {selectedDrilldown.topFailures.map((failure) => (
                  <li key={failure.reason} className="flex items-center justify-between">
                    <span>{failure.reason}</span>
                    <span className="font-semibold tabular-nums">{failure.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Best pairings</p>
              <p className="mt-1 text-[14px] text-slate-800">{selectedDrilldown.bestPairings.join(' · ')}</p>
              <p className="mt-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Weak pairings</p>
              <p className="mt-1 text-[14px] text-slate-800">{selectedDrilldown.weakPairings.join(' · ')}</p>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[14px]">
              <p className="font-semibold text-slate-900">Suggested</p>
              <p className="mt-1 text-slate-700">→ {selectedDrilldown.suggested}</p>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  )
}
