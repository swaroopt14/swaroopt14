'use client'

import { useMemo } from 'react'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { commandPeriodToDateRange } from '../command-center/commandCenterPeriod'
import { fmtInrFromMinor, fmtInrFull, parseMinorField } from '../command-center/commandCenterFormat'
import { derivePaymentCommandDataState } from '../command-center/paymentCommandDataState'
import { usePaymentCommandDataSources } from '../command-center/usePaymentCommandDataSources'
import type { DataSourceBadgeStatus } from '../command-center/usePaymentCommandDataSources'
import {
  PAYMENT_OPERATIONS,
  SUMMARY_TILE_LABELS,
  WORKSPACE_HERO_COPY,
} from './paymentOperationsCopy'
import type {
  PaymentOperationsViewModel,
  ReviewBreakdownRow,
  SourceHealthRow,
} from './paymentOperationsTypes'

function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`
}

const STATUS_DISPLAY: Record<DataSourceBadgeStatus, string> = {
  received: 'Received',
  missing: 'Missing',
  partial: 'Partial',
  ready: 'Ready',
  processing: 'Processing',
}

function parseMinorStrict(value: string | number | undefined | null): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return parseMinorField(value)
}

function sourceIssue(status: DataSourceBadgeStatus): string {
  if (status === 'received' || status === 'ready') return 'None'
  if (status === 'partial') return 'Needs confirmation'
  if (status === 'processing') return 'Processing'
  return 'Upload required'
}

export function usePaymentOperationsView(batchId?: string): {
  viewModel: PaymentOperationsViewModel
  loading: boolean
} {
  const { tenantReady } = useSessionTenant()
  const dateQuery = useMemo(() => commandPeriodToDateRange('month'), [])

  const intelligence = useIntelligenceKpis({ tenantReady, batchId, dateQuery })
  const leakage = intelligence.leakage
  const ambiguity = intelligence.ambiguity
  const defensibility = intelligence.defensibility
  const patterns = intelligence.patterns
  const recommendations = intelligence.recommendations

  const leakageOk = isDataAvailable(leakage)
  const ambiguityOk = isDataAvailable(ambiguity)
  const defensibilityOk = isDataAvailable(defensibility)
  const patternsOk = isDataAvailable(patterns)
  const recommendationsOk = isDataAvailable(recommendations)

  const evidenceRate = defensibilityOk ? defensibility.evidence_pack_rate : null
  const auditReady = defensibilityOk ? defensibility.audit_ready_pct : null

  const dataSources = usePaymentCommandDataSources({
    tenantReady,
    evidencePackRate: evidenceRate,
    auditReadyPct: auditReady != null ? auditReady / 100 : null,
  })

  const viewModel = useMemo((): PaymentOperationsViewModel => {
    const intendedMinor = leakageOk ? parseMinorField(leakage.total_intended_amount_minor) : 0
    const settledMinor = leakageOk
      ? parseMinorField(leakage.total_observed_settled_amount_minor ?? 0)
      : 0
    const unmatched = leakageOk ? parseMinorField(leakage.unmatched_amount_minor) : 0
    const under = leakageOk ? parseMinorField(leakage.under_settlement_amount_minor) : 0
    const reversal = leakageOk ? parseMinorField(leakage.reversal_exposure_minor) : 0
    const orphan = leakageOk ? parseMinorField(leakage.orphan_amount_minor) : 0
    const unlinkedSettlement = orphan
    const reviewMinor = leakageOk ? unmatched : null

    const lifecycleState = derivePaymentCommandDataState({
      intendedMinor: leakageOk ? intendedMinor : null,
      confirmedMinor: leakageOk ? settledMinor : null,
      reviewMinor,
      hasAmbiguitySignal: ambiguityOk,
      hasPatternsSignal: patternsOk,
    })

    const intentMissing = intendedMinor <= 0 && settledMinor > 0
    const ingestIncomplete =
      dataSources.intentStatus === 'missing' && dataSources.settlementStatus === 'missing'

    let hero: (typeof WORKSPACE_HERO_COPY)[keyof typeof WORKSPACE_HERO_COPY] =
      WORKSPACE_HERO_COPY.empty
    if (intentMissing) hero = WORKSPACE_HERO_COPY.intentMissing
    else if (lifecycleState.lifecycle === 'settlement_only') hero = WORKSPACE_HERO_COPY.settlementOnly
    else if (lifecycleState.lifecycle === 'intent_only') hero = WORKSPACE_HERO_COPY.intentOnly
    else if (lifecycleState.lifecycle === 'full_lifecycle') hero = WORKSPACE_HERO_COPY.full

    const inScopeCount = patternsOk ? patterns.total_count : null

    const matchConf = ambiguityOk ? ambiguity.avg_attachment_confidence : null
    const refCompleteness = ambiguityOk
      ? ambiguity.carrier_completeness_rate ?? 1 - ambiguity.provider_ref_missing_rate
      : null

    const proofRate = defensibilityOk ? defensibility.evidence_pack_rate : null
    const governance = defensibilityOk ? defensibility.governance_coverage_pct : null
    const replay = defensibilityOk ? defensibility.replayability_pct : null
    const disputeReady = defensibilityOk ? defensibility.dispute_ready_pct : null

    const valueObservedMinor =
      intendedMinor > 0 ? intendedMinor : settledMinor > 0 ? settledMinor : null

    const lastUpdatedIso =
      (leakageOk && leakage.computed_at) ||
      (ambiguityOk && ambiguity.computed_at) ||
      (patternsOk && patterns.computed_at) ||
      intelligence.lastFetchedAt?.toISOString() ||
      null

    const sourceRows: SourceHealthRow[] = [
      {
        source: 'Intent file / API',
        type: 'Intent source',
        status: STATUS_DISPLAY[dataSources.intentStatus],
        lastReceived: dataSources.intentStatus === 'received' ? 'Received' : '—',
        issue: sourceIssue(dataSources.intentStatus),
      },
      {
        source: 'Settlement file',
        type: 'Settlement source',
        status: STATUS_DISPLAY[dataSources.settlementStatus],
        lastReceived: dataSources.settlementStatus === 'received' ? 'Received' : '—',
        issue: sourceIssue(dataSources.settlementStatus),
      },
      {
        source: 'Bank statement',
        type: 'Bank confirmation',
        status: STATUS_DISPLAY[dataSources.bankStatementStatus],
        lastReceived: dataSources.bankStatementStatus !== 'missing' ? 'Partial' : '—',
        issue: sourceIssue(dataSources.bankStatementStatus),
      },
      {
        source: 'Evidence packs',
        type: 'Proof',
        status: STATUS_DISPLAY[dataSources.evidenceStatus],
        lastReceived: dataSources.evidenceStatus !== 'missing' ? 'Available' : '—',
        issue: sourceIssue(dataSources.evidenceStatus),
      },
    ]

    const clarityState: PaymentOperationsViewModel['clarityState'] = intentMissing
      ? 'intent_missing'
      : !leakageOk && !ambiguityOk
        ? 'incomplete'
        : 'complete'

    const reviewBreakdown: ReviewBreakdownRow[] = []
    if (ambiguityOk) {
      reviewBreakdown.push({
        label: 'Missing references',
        value: formatPct(ambiguity.provider_ref_missing_rate),
      })
      const lowConf =
        ambiguity.low_confidence_rate ?? Math.max(0, 1 - ambiguity.avg_attachment_confidence)
      reviewBreakdown.push({ label: 'Low confidence matches', value: formatPct(lowConf) })
      if (ambiguity.candidate_collision_rate != null) {
        reviewBreakdown.push({
          label: 'Multiple possible matches',
          value: formatPct(ambiguity.candidate_collision_rate),
        })
      }
    }
    if (patternsOk && patterns.value_date_mismatch_count != null && patterns.value_date_mismatch_count > 0) {
      reviewBreakdown.push({
        label: 'Value-date mismatches',
        value: formatCount(patterns.value_date_mismatch_count),
      })
    }

    const itemsCount = recommendationsOk
      ? recommendations.total_actions
      : ambiguityOk
        ? ambiguity.ambiguous_intent_count
        : patternsOk
          ? patterns.pending_count
          : 0

    const hasLiveData =
      leakageOk || ambiguityOk || defensibilityOk || patternsOk || recommendationsOk

    return {
      summary: {
        inScope: hasLiveData && inScopeCount != null ? formatCount(inScopeCount) : '—',
        inScopeSub: patternsOk ? `${patterns.success_count} confirmed` : 'Upload data to populate',
        valueObserved: valueObservedMinor != null ? fmtInrFull(valueObservedMinor) : '—',
        valueObservedSub:
          intendedMinor > 0 ? 'From payment instructions' : settledMinor > 0 ? 'From settlement' : '—',
        needingReview: reviewMinor != null ? fmtInrFromMinor(reviewMinor) : '—',
        needingReviewSub:
          reviewMinor == null
            ? 'No review value data available'
            : reviewMinor <= 0
              ? PAYMENT_OPERATIONS.reviewZeroHint
              : 'Unmatched payment value from leakage dashboard',
        matchConfidence: matchConf != null ? formatPct(matchConf) : '—',
        matchConfidenceSub: ambiguityOk ? 'Average attachment confidence' : '—',
        proofReadiness: proofRate != null ? formatPct(proofRate) : '—',
        proofReadinessSub:
          defensibilityOk
            ? `Governance ${Math.round(governance ?? 0)}% · Replay ${Math.round(replay ?? 0)}%`
            : '—',
      },
      hero: {
        label: hero.label,
        value: hasLiveData && inScopeCount != null ? formatCount(inScopeCount) : '—',
        subtitle: hero.subtitle,
        showIntentMissing: intentMissing,
      },
      lifecycle: lifecycleState.lifecycle,
      sourceRows,
      clarityRows: leakageOk
        ? [
            { label: 'Intended value', value: fmtInrFromMinor(intendedMinor, { decimals: 0 }) },
            { label: 'Settled value observed', value: fmtInrFromMinor(settledMinor, { decimals: 0 }) },
            { label: 'Unmatched value', value: fmtInrFromMinor(unmatched, { decimals: 0 }) },
            { label: 'Short-settled value', value: fmtInrFull(under, { decimals: 0 }) },
            { label: 'Unlinked settlement', value: fmtInrFull(unlinkedSettlement, { decimals: 0 }) },
            { label: 'Reversal exposure', value: fmtInrFull(reversal, { decimals: 0 }) },
          ]
        : [],
      clarityHero: reviewMinor != null ? fmtInrFromMinor(reviewMinor, { decimals: 0 }) : '—',
      clarityState,
      healthBrief: {
        cleanCount: patternsOk ? formatCount(patterns.success_count) : '—',
        needsReview: ambiguityOk ? formatCount(ambiguity.ambiguous_intent_count) : '—',
        proofReady:
          disputeReady != null && patternsOk
            ? formatCount(Math.round(patterns.success_count * disputeReady))
            : disputeReady != null
              ? formatPct(disputeReady)
              : '—',
        metrics: [
          {
            label: 'Reference completeness',
            value: refCompleteness != null ? formatPct(refCompleteness) : '—',
            pct: refCompleteness != null ? refCompleteness * 100 : 0,
          },
          {
            label: 'Match confidence',
            value: matchConf != null ? formatPct(matchConf) : '—',
            pct: matchConf != null ? matchConf * 100 : 0,
          },
          {
            label: 'Evidence coverage',
            value: proofRate != null ? formatPct(proofRate) : '—',
            pct: proofRate != null ? proofRate * 100 : 0,
          },
        ],
      },
      itemsNeedingReview: hasLiveData ? formatCount(itemsCount) : '—',
      reviewBreakdown,
      showRoutingNotice: true,
      lastUpdatedIso,
      dataSources: {
        intentStatus: dataSources.intentStatus,
        settlementStatus: dataSources.settlementStatus,
        bankStatementStatus: dataSources.bankStatementStatus,
        evidenceStatus: dataSources.evidenceStatus,
      },
      hasLiveData,
      reviewMinor,
      ambiguousIntentCount: ambiguityOk ? ambiguity.ambiguous_intent_count : 0,
      matchConfidencePct: matchConf != null ? matchConf * 100 : null,
      refCompletenessPct: refCompleteness != null ? refCompleteness * 100 : null,
    }
  }, [
    leakage,
    ambiguity,
    defensibility,
    patterns,
    recommendations,
    dataSources,
    intelligence.lastFetchedAt,
    leakageOk,
    ambiguityOk,
    defensibilityOk,
    patternsOk,
    recommendationsOk,
  ])

  return {
    viewModel,
    loading: intelligence.loading || dataSources.loading,
  }
}
