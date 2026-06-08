import type { CommandCenterPayload, ConnectorHealthItem, OutcomeInsightCard } from './types'
import { getMockCommandCenterPayload } from './mockOpsCommandCenter'

type ZordOverview = {
  kpis?: {
    success_rate_pct?: number
    money_at_risk_inr?: number
    amount_in_flight_inr?: number
    evidence_ready_pct?: number
    sla_breach_rate_pct?: number
  }
  alert_feed?: Array<{ title?: string; description?: string; severity?: string }>
  psp_status?: Array<{ name?: string; status?: string; status_text?: string }>
}

function inrCompact(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)}Cr`
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(2)}L`
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

export function mapZordOverviewToCommandCenter(
  overview: ZordOverview | null,
  fallbackSeed = 0,
): CommandCenterPayload {
  const base = getMockCommandCenterPayload(fallbackSeed)
  if (!overview?.kpis) {
    return base
  }

  const k = overview.kpis
  const success = k.success_rate_pct ?? 0
  const atRisk = k.money_at_risk_inr ?? 0
  const inFlight = k.amount_in_flight_inr ?? 0

  const outcomeInsightCards: OutcomeInsightCard[] = [
    {
      id: 'out-live-1',
      variant: 'success',
      title: 'Success rate',
      value: `${success.toFixed(1)}%`,
      subtext: 'Confirmed intents in selected window',
      aiInsight: 'From session-scoped zord metrics overview BFF.',
    },
    {
      id: 'out-live-2',
      variant: 'risk',
      title: 'Value at risk',
      value: inrCompact(atRisk),
      subtext: 'Money at risk in window',
      aiInsight: 'Synthetic BFF until upstream metrics swap.',
    },
    {
      id: 'out-live-3',
      variant: 'progress',
      title: 'In flight',
      value: inrCompact(inFlight),
      subtext: 'Pending or dispatched value',
      aiInsight: 'Use Intent Journal for row-level drilldown.',
    },
    ...base.outcomeInsightCards.slice(3),
  ]

  const connectorItems: ConnectorHealthItem[] =
    overview.psp_status?.map((psp) => ({
      name: psp.name || 'PSP',
      status:
        psp.status === 'RED' ? 'attention' : psp.status === 'AMBER' ? 'delayed' : 'healthy',
      metric: psp.status_text || 'Live probe',
    })) ?? base.connectorHealth.items

  const firstAlert = overview.alert_feed?.[0]
  const alert = firstAlert
    ? {
        status: (firstAlert.severity === 'CRITICAL' ? 'RED' : firstAlert.severity === 'WARN' ? 'AMBER' : 'GREEN') as
          | 'GREEN'
          | 'AMBER'
          | 'RED',
        message: firstAlert.title || firstAlert.description || 'Alert',
        timestamp: new Date().toISOString(),
      }
    : base.alert

  return {
    ...base,
    fetchedAt: new Date().toISOString(),
    outcomeInsightCards,
    connectorHealth: { ...base.connectorHealth, items: connectorItems },
    alert,
    dataNotice: undefined,
  }
}
