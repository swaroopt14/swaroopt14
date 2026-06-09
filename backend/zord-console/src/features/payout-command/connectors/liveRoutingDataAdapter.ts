import {
  getAmbiguityHeatmap,
  getAmbiguityKpis,
  getLeakageKpis,
  getPatternsKpis,
  getRcaKpis,
  getRecommendationsKpis,
  type IntelligenceDateQuery,
} from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { getPatternDetail, getPatternHistory, patternDataFrom } from '@/services/payout-command/prod-api/getPatternIntelligence'
import type { PatternSnapshotData } from '@/services/payout-command/prod-api/intelligencePatternTypes'
import {
  mapPatternToConnectorView,
  patternActionsFromView,
  patternInsightsFromView,
} from '@/services/payout-command/prod-api/mapPatternToConnectorView'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type {
  AmbiguityHeatmapResponse,
  AmbiguityKpiResponse,
  LeakageKpiResponse,
  MinorAmountField,
  RcaKpiResponse,
  RecommendationsKpiResponse,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import type {
  ActionRecommendation,
  ConnectorHealthRow,
  ConnectorStatus,
  CorrelationInsight,
  LeakageCompositionSlice,
  RoutingKpiSnapshot,
  RoutingTimeWindow,
} from './types'

const STALE_AFTER_MINUTES = 15

type PatternSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string

type SourceQualityPattern = NonNullable<PatternSnapshotData['source_quality_patterns']>[number]
type ProviderQualityPattern = NonNullable<PatternSnapshotData['provider_quality_patterns']>[number]

function readMinor(value: MinorAmountField | undefined | null): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function pct(value: number | undefined | null): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return clamp(value * 100, 0, 100)
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function windowToDateQuery(window: RoutingTimeWindow): IntelligenceDateQuery {
  const now = new Date()
  const start = new Date(now)
  start.setUTCDate(now.getUTCDate() - (window === '24h' ? 1 : window === '7d' ? 7 : 30))
  return { from_date: dateOnly(start), to_date: dateOnly(now) }
}

function severityToStatus(severity?: PatternSeverity): ConnectorStatus {
  const normalized = (severity || '').toUpperCase()
  if (normalized === 'CRITICAL') return 'Risk'
  if (normalized === 'HIGH') return 'Degraded'
  if (normalized === 'MEDIUM') return 'Stable'
  return 'Healthy'
}

function connectorKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function providerLabel(providerId: string): string {
  return providerId
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function generatedAtFrom(inputs: Array<string | undefined | null>): string {
  const times = inputs
    .map((input) => (input ? new Date(input).getTime() : NaN))
    .filter((time) => Number.isFinite(time))
  if (!times.length) return new Date().toISOString()
  return new Date(Math.max(...times)).toISOString()
}

function exposureWeight(connector: ConnectorHealthRow): number {
  return Math.max(connector.failurePct, 1)
}

function applyLiveExposure(
  connectors: ConnectorHealthRow[],
  leakage: LeakageKpiResponse | null,
  ambiguity: AmbiguityKpiResponse | null,
  recommendations: RecommendationsKpiResponse | null,
): ConnectorHealthRow[] {
  if (!connectors.length) return []
  if (!isDataAvailable(leakage) && !isDataAvailable(ambiguity) && !isDataAvailable(recommendations)) {
    return connectors
  }

  const totalWeight = connectors.reduce((sum, connector) => sum + exposureWeight(connector), 0)
  const liveVolume = isDataAvailable(leakage) ? readMinor(leakage.total_intended_amount_minor) : 0
  const valueAtRisk = isDataAvailable(leakage)
    ? readMinor(leakage.unmatched_amount_minor)
    : isDataAvailable(ambiguity)
      ? readMinor(ambiguity.value_at_risk_minor)
      : 0
  const recommendationImpact = isDataAvailable(recommendations)
    ? readMinor(recommendations.recommendation_impact_estimate_minor)
    : 0
  const preventable = recommendationImpact || Math.round(valueAtRisk * 0.65)

  return connectors.map((connector) => {
    const share = totalWeight > 0 ? exposureWeight(connector) / totalWeight : 1 / connectors.length
    return {
      ...connector,
      volumeMinor: liveVolume > 0 ? Math.max(1, Math.round(liveVolume * share)) : connector.volumeMinor,
      moneyAtRiskMinor: valueAtRisk > 0 ? Math.round(valueAtRisk * share) : connector.moneyAtRiskMinor,
      preventableLeakageMinor: preventable > 0 ? Math.round(preventable * share) : connector.preventableLeakageMinor,
    }
  })
}

function applyProviderPatterns(connectors: ConnectorHealthRow[], providers: ProviderQualityPattern[] = []): ConnectorHealthRow[] {
  if (!providers.length) return connectors
  const providerByKey = new Map(
    providers
      .filter((provider) => provider.provider_id)
      .map((provider) => [connectorKey(provider.provider_id || ''), provider]),
  )
  const existingKeys = new Set(connectors.map((connector) => connectorKey(connector.connector)))

  const updated = connectors.map((connector) => {
    const provider = providerByKey.get(connectorKey(connector.connector))
    if (!provider) return connector
    const successPct = pct(provider.avg_parse_confidence) ?? connector.successPct
    const failurePct = pct(Math.max(provider.orphan_rate ?? 0, provider.ambiguity_rate ?? 0)) ?? connector.failurePct
    return {
      ...connector,
      successPct,
      failurePct,
      status: severityToStatus(provider.severity),
      trend: failurePct > connector.failurePct ? 'down' as const : successPct >= connector.successPct ? 'up' as const : 'flat' as const,
      recommendedAction:
        (provider.severity || '').toUpperCase() === 'CRITICAL'
          ? 'Strengthen provider contract'
          : (provider.orphan_rate ?? 0) > 0.15
            ? 'Request stronger carrier refs'
            : connector.recommendedAction,
    }
  })

  const additions = providers
    .filter((provider) => provider.provider_id && !existingKeys.has(connectorKey(provider.provider_id)))
    .map((provider): ConnectorHealthRow => {
      const failurePct = pct(Math.max(provider.orphan_rate ?? 0, provider.ambiguity_rate ?? 0)) ?? 0
      const successPct = pct(provider.avg_parse_confidence) ?? clamp(100 - failurePct, 0, 100)
      return {
        id: connectorKey(provider.provider_id || 'provider'),
        connector: providerLabel(provider.provider_id || 'Provider'),
        type: 'PSP',
        successPct,
        avgTimeSec: provider.settlement_delay_p95_days ?? 0,
        failurePct,
        status: severityToStatus(provider.severity),
        trend: failurePct > 10 ? 'down' : 'flat',
        recommendedAction:
          (provider.severity || '').toUpperCase() === 'CRITICAL'
            ? 'Strengthen provider contract'
            : failurePct > 15
              ? 'Request stronger carrier refs'
              : 'Monitor provider quality',
        volumeMinor: 0,
        moneyAtRiskMinor: 0,
        preventableLeakageMinor: 0,
      }
    })

  return [...updated, ...additions]
}

function buildLeakageComposition(leakage: LeakageKpiResponse | null): LeakageCompositionSlice[] {
  if (!isDataAvailable(leakage)) return []
  return [
    { key: 'unmatched', label: 'Unmatched', amountMinor: readMinor(leakage.unmatched_amount_minor) },
    { key: 'short_settled', label: 'Short settled', amountMinor: readMinor(leakage.under_settlement_amount_minor) },
    { key: 'unlinked', label: 'Unlinked', amountMinor: readMinor(leakage.orphan_amount_minor) },
    { key: 'reversal', label: 'Reversal', amountMinor: readMinor(leakage.reversal_exposure_minor) },
  ].filter((slice) => slice.amountMinor > 0)
}

function buildInsights(
  pattern: PatternSnapshotData | null,
  patternViewInsights: CorrelationInsight[],
  leakage: LeakageKpiResponse | null,
  ambiguity: AmbiguityKpiResponse | null,
  rca: RcaKpiResponse | null,
): CorrelationInsight[] {
  const insights: CorrelationInsight[] = [...patternViewInsights]
  const weakestSource = pattern?.weakest_source_system
  const missingRefRate = pct(pattern?.weakest_source_missing_ref_rate)
  if (weakestSource && missingRefRate != null && !insights.some((item) => item.id === 'pattern-weakest-source')) {
    insights.push({
      id: 'pattern-weakest-source',
      text: `${weakestSource} has ${missingRefRate.toFixed(1)}% missing references.`,
    })
  }

  const weakestProvider = pattern?.weakest_provider_id
  if (weakestProvider && !insights.some((item) => item.id === 'pattern-weakest-provider')) {
    insights.push({
      id: 'pattern-weakest-provider',
      text: `${providerLabel(weakestProvider)} is the weakest provider signal in the latest pattern snapshot.`,
    })
  }

  const delayP95 = pattern?.settlement_delay_p95_days
  if (delayP95 && delayP95 > 1 && !insights.some((item) => item.id === 'pattern-settlement-delay')) {
    insights.push({
      id: 'pattern-settlement-delay',
      text: `Settlement delay P95 is ${delayP95.toFixed(1)} days.`,
    })
  }

  if (isDataAvailable(leakage) && leakage.leakage_percentage > 0) {
    insights.push({
      id: 'leakage-rate',
      text: `Leakage is ${(leakage.leakage_percentage * 100).toFixed(1)}% for the selected window.`,
    })
  }

  if (isDataAvailable(ambiguity) && ambiguity.provider_ref_missing_rate > 0) {
    insights.push({
      id: 'provider-ref-missing',
      text: `Provider reference missing rate is ${(ambiguity.provider_ref_missing_rate * 100).toFixed(1)}%.`,
    })
  }

  if (isDataAvailable(rca) && rca.rca_concentration > 0) {
    insights.push({
      id: 'rca-concentration',
      text: `RCA concentration is ${(rca.rca_concentration * 100).toFixed(1)}% across source defects.`,
    })
  }

  return insights.slice(0, 8)
}

function buildActions(
  pattern: PatternSnapshotData | null,
  patternViewActions: ActionRecommendation[],
  recommendations: RecommendationsKpiResponse | null,
): ActionRecommendation[] {
  const actions: ActionRecommendation[] = [...patternViewActions]
  const source = pattern?.source_quality_patterns?.[0] as SourceQualityPattern | undefined

  if (!actions.length && source?.source_system) {
    actions.push({
      id: 'action-source-patch',
      title: `Patch ${source.source_system} references`,
      impactMinor: readMinor(source.manual_review_amount_minor),
      impactLabel: `${((source.missing_client_ref_rate ?? 0) * 100).toFixed(1)}% refs missing`,
    })
  }

  if (pattern?.recommended_action?.trim()) {
    actions.unshift({
      id: 'action-api-recommended',
      title: pattern.recommended_action.trim(),
      impactMinor: readMinor(pattern.unexplained_variance_amount_minor),
      impactLabel: pattern.risk_tier ? `Risk tier ${pattern.risk_tier}` : 'API recommended action',
    })
  }

  if (isDataAvailable(recommendations) && recommendations.total_actions > 0) {
    actions.push({
      id: 'action-live-recommendations',
      title: 'Resolve intelligence recommendations',
      impactMinor: readMinor(recommendations.recommendation_impact_estimate_minor),
      impactLabel: `${recommendations.total_actions} open actions`,
    })
  }

  return actions.filter((action) => action.title).slice(0, 8)
}

function buildTrend(heatmap: AmbiguityHeatmapResponse | null): RoutingKpiSnapshot['networkHealthTrend'] {
  if (!isDataAvailable(heatmap) || !heatmap.batches?.length) return []
  return heatmap.batches.slice(-7).map((batch, index) => {
    const total = Math.max(1, batch.total_count || 1)
    const successPct = clamp(((batch.exact_match_count + batch.high_confidence_count) / total) * 100, 0, 100)
    const latencyIndex = clamp(80 - (batch.unresolved_count + batch.conflicted_count + batch.ambiguous_count) * 3, 40, 90)
    return {
      label: batch.batch_id?.slice(-6) || `B-${index + 1}`,
      successPct,
      latencyIndex,
    }
  })
}

export async function getLiveRoutingSnapshot(window: RoutingTimeWindow): Promise<RoutingKpiSnapshot | null> {
  const dateQuery = windowToDateQuery(window)

  const [leakage, ambiguity, patterns, recommendations, rca, heatmap, patternDetail, patternHistory] = await Promise.all([
    getLeakageKpis(dateQuery),
    getAmbiguityKpis(dateQuery),
    getPatternsKpis(),
    getRecommendationsKpis(dateQuery),
    getRcaKpis(dateQuery),
    getAmbiguityHeatmap(),
    getPatternDetail(dateQuery),
    getPatternHistory(dateQuery, 5),
  ])

  const pattern = patternDataFrom(patternDetail, patternHistory)
  const patternIntelligence = mapPatternToConnectorView(patternDetail, patternHistory)
  const hasLiveSignal =
    isDataAvailable(leakage) ||
    isDataAvailable(ambiguity) ||
    isDataAvailable(patterns) ||
    isDataAvailable(recommendations) ||
    isDataAvailable(rca) ||
    isDataAvailable(heatmap) ||
    Boolean(pattern) ||
    Boolean(patternIntelligence?.hasLiveData)
  if (!hasLiveSignal) return null

  const providerPatterns = pattern?.provider_quality_patterns ?? []
  const connectors = applyLiveExposure(
    applyProviderPatterns([], providerPatterns),
    leakage,
    ambiguity,
    recommendations,
  )
  const leakageComposition = buildLeakageComposition(leakage)
  const patternInsights = patternInsightsFromView(patternIntelligence).map((item) => ({
    id: item.id,
    text: item.text,
  }))
  const patternActions = patternActionsFromView(patternIntelligence)

  return {
    generatedAtIso: generatedAtFrom([
      isDataAvailable(leakage) ? leakage.computed_at : null,
      isDataAvailable(ambiguity) ? ambiguity.computed_at : null,
      isDataAvailable(patterns) ? patterns.computed_at : null,
      isDataAvailable(recommendations) ? recommendations.computed_at : null,
      isDataAvailable(rca) ? rca.computed_at : null,
      patternDetail?.computed_at,
      pattern?.computed_at,
      patternHistory?.snapshots?.[0]?.created_at,
    ]),
    staleAfterMinutes: STALE_AFTER_MINUTES,
    connectors,
    routeCandidates: [],
    correlationInsights: buildInsights(pattern, patternInsights, leakage, ambiguity, rca),
    actionRecommendations: buildActions(pattern, patternActions, recommendations),
    leakageComposition,
    networkHealthTrend: buildTrend(heatmap),
    drilldowns: [],
    patternIntelligence,
  }
}
