'use client'

import { useCallback, useEffect, useState, useRef } from 'react'

import type { CommandCenterPayload } from './types'
import { AlertStrip } from './AlertStrip'
import { AlertsInbox } from './AlertsInbox'
import { AnomalyInsightPanel } from './AnomalyPanel'
import { ConnectivityGraph } from './ConnectivityGraph'
import { ConnectorHealthStrip } from './ConnectorHealthStrip'
import { GlobalFilterBar } from './GlobalFilterBar'
import { ImprovementMetrics } from './ImprovementMetrics'
import { InsightChips } from './InsightChips'
import { OutcomeInsightCardGroup } from './OutcomeInsightCardGroup'
import { getMockCommandCenterPayload } from './mockOpsCommandCenter'
import { mapZordOverviewToCommandCenter } from './mapZordMetricsToCommandCenter'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { fetchZordOverview } from '@/services/backend/zord-analytics'

const POLL_MS = 30_000

function DataNoticeBanner({ kind }: { kind: 'delayed' | 'mismatch' }) {
  const copy =
    kind === 'delayed'
      ? 'Data is being updated. Some values may be delayed.'
      : 'Data from different systems may update at different times.'
  return (
    <div
      className="border-b border-amber-300/60 bg-amber-50 px-4 py-2.5 text-center text-[14px] font-medium text-amber-950 shadow-[0_0_20px_rgba(251,191,36,0.22)] ring-1 ring-amber-200/40 sm:px-6"
      role="status"
    >
      {copy}
    </div>
  )
}

export function CommandCenterPage() {
  const { tenantId, tenantReady } = useSessionTenant()
  const [data, setData] = useState<CommandCenterPayload>(() => getMockCommandCenterPayload(0))
  const [metricsLive, setMetricsLive] = useState(false)
  const tick = useRef(0)

  const refresh = useCallback(async () => {
    if (!tenantReady || !tenantId) {
      setData(getMockCommandCenterPayload(tick.current))
      setMetricsLive(false)
      return
    }
    try {
      const overview = await fetchZordOverview(tenantId, '24h')
      setData(mapZordOverviewToCommandCenter(overview, tick.current))
      setMetricsLive(true)
    } catch {
      setData(getMockCommandCenterPayload(tick.current))
      setMetricsLive(false)
    }
  }, [tenantId, tenantReady])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      tick.current += 1
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  return (
    <div className="relative min-h-0 w-full bg-[#f4f4f1]">
      <AlertStrip status={data.alert.status} message={data.alert.message} timestamp={data.alert.timestamp} />

      {data.dataNotice ? <DataNoticeBanner kind={data.dataNotice} /> : null}

      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl text-[13px] leading-relaxed text-[#64748b]">
            {metricsLive
              ? `KPI cards refresh from GET /api/prod/zord/metrics/overview every ${POLL_MS / 1000}s. Connectivity graph remains illustrative until ops graph API ships.`
              : `Connect a tenant session to load metrics overview. Graph sections use illustrative layout until upstream ops APIs ship.`}
          </p>
          <div className="flex shrink-0 items-start">
            <AlertsInbox alerts={data.insightAlerts} />
          </div>
        </div>

        <GlobalFilterBar />

        <OutcomeInsightCardGroup cards={data.outcomeInsightCards} />

        <ConnectorHealthStrip sectionInsight={data.connectorHealth.sectionInsight} items={data.connectorHealth.items} />

        <ImprovementMetrics items={data.improvementMetrics} />

        <InsightChips items={data.insightChips} />

        <AnomalyInsightPanel anomalies={data.anomalies} />

        <section aria-label="System connectivity">
          <h2 className="mb-3 text-[14px] font-semibold uppercase tracking-wide text-[#6b7280]">Connectivity graph</h2>
          <ConnectivityGraph nodes={data.nodes} edges={data.edges} fetchedAt={data.fetchedAt} staleThresholdMs={120_000} />
        </section>
      </div>
    </div>
  )
}
