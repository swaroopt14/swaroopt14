import type { MinorAmountField } from './intelligenceTypes'
import type {
  PatternActionCard,
  PatternCategoryTable,
  PatternDetailResponse,
  PatternHistoryResponse,
  PatternHistoryRow,
  PatternIntelligenceView,
  PatternKpiBucket,
  PatternSnapshotData,
  ProviderQualityPattern,
  SourceQualityPattern,
} from './intelligencePatternTypes'
import { patternDataFrom } from './getPatternIntelligence'

function readMinor(value: MinorAmountField | undefined | null): number {
  if (value == null || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function pct(value: number | undefined | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

function score(value: number | undefined | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

function formatInrCompact(minor: number): string {
  const rupees = minor / 100
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(1)} Cr`
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(1)} L`
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatIso(value: string | undefined | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d.toLocaleString('en-IN') : value
}

function pushAction(
  actions: PatternActionCard[],
  card: Omit<PatternActionCard, 'id'> & { id?: string },
) {
  actions.push({ ...card, id: card.id ?? card.code.toLowerCase() })
}

function buildActionCatalog(data: PatternSnapshotData): PatternActionCard[] {
  const actions: PatternActionCard[] = []
  const source = data.source_quality_patterns?.[0]
  const provider = data.provider_quality_patterns?.find(
    (item) => (item.severity || '').toUpperCase() !== 'LOW',
  ) ?? data.provider_quality_patterns?.[0]

  if (
    (source?.manual_review_rate ?? 0) > 0.2 ||
    (source?.missing_client_ref_rate ?? 0) > 0.25 ||
    (data.tenant_manual_review_rate ?? 0) > 0.2
  ) {
    pushAction(actions, {
      code: 'ESCALATE',
      title: 'Escalate source quality issues',
      impactLabel: `${pct(source?.manual_review_rate ?? data.tenant_manual_review_rate)} manual review`,
      priority: 1,
    })
  }

  if (source?.source_system && (source.missing_client_ref_rate ?? 0) > 0.1) {
    pushAction(actions, {
      code: 'REQUEST_SOURCE_PATCH',
      title: `Request source patch · ${source.source_system}`,
      impactLabel: `${pct(source.missing_client_ref_rate)} missing client refs`,
      priority: 2,
    })
  }

  if (
    data.prepare_and_sign_recommended ||
    (data.evidence_pack_coverage ?? 1) < 0.85 ||
    (data.weak_evidence_rate ?? 0) > 0.1
  ) {
    pushAction(actions, {
      code: 'PREPARE_AND_SIGN_RECOMMENDED',
      title: 'Prepare and sign recommended',
      impactLabel: `${pct(data.evidence_pack_coverage)} evidence coverage`,
      priority: 3,
    })
  }

  if (
    (data.ambiguity_score ?? 0) > 0.15 ||
    (data.ambiguous_count ?? 0) > 0 ||
    (data.unresolved_count ?? 0) > 0 ||
    (data.conflicted_count ?? 0) > 0 ||
    (data.duplicate_risk_rate ?? 0) > 0.05
  ) {
    pushAction(actions, {
      code: 'REVIEW_AMBIGUOUS_BATCH',
      title: 'Review ambiguous batch',
      impactLabel: `${data.ambiguous_count ?? 0} ambiguous · ${pct(data.ambiguity_score)} score`,
      priority: 4,
    })
  }

  if (
    (data.ambiguity_score ?? 0) > 0.2 ||
    (data.batch_risk_score ?? 0) > 0.5 ||
    readMinor(data.duplicate_risk_exposure_minor) > 0
  ) {
    pushAction(actions, {
      code: 'DISPATCH_MODE_RECOMMENDED',
      title: 'Dispatch mode recommended',
      impactLabel: `Risk ${score(data.batch_risk_score)} · ${formatInrCompact(readMinor(data.duplicate_risk_exposure_minor))} exposure`,
      priority: 5,
    })
  }

  if (
    readMinor(data.whitelisted_deduction_amount_minor) > 0 ||
    readMinor(data.unexplained_variance_amount_minor) > 0
  ) {
    pushAction(actions, {
      code: 'ADVISORY_RECOMMENDATION',
      title: 'Advisory · variance review',
      impactLabel: `${formatInrCompact(readMinor(data.unexplained_variance_amount_minor))} unexplained`,
      priority: 6,
    })
  }

  if (
    (data.evidence_pack_coverage ?? 1) < 0.9 ||
    (data.missing_leaf_rate ?? 0) > 0.05 ||
    (data.weak_evidence_rate ?? 0) > 0.08
  ) {
    pushAction(actions, {
      code: 'REGENERATE_EVIDENCE',
      title: 'Regenerate evidence pack',
      impactLabel: `${pct(data.missing_leaf_rate)} missing leaf · ${pct(data.weak_evidence_rate)} weak`,
      priority: 7,
    })
  }

  if (
    provider &&
    ((provider.avg_parse_confidence ?? 1) < 0.75 ||
      (provider.avg_carrier_richness ?? 1) < 0.5 ||
      (provider.orphan_rate ?? 0) > 0.1)
  ) {
    pushAction(actions, {
      code: 'REQUEST_STRONGER_CARRIER_CONTRACT',
      title: `Request stronger carrier contract · ${provider.provider_id ?? 'provider'}`,
      impactLabel: `${pct(provider.orphan_rate)} orphan · ${pct(provider.avg_parse_confidence)} parse confidence`,
      priority: 8,
    })
  }

  if (
    readMinor(data.over_settlement_amount_minor) > 0 ||
    readMinor(data.duplicate_risk_exposure_minor) > 0 ||
    readMinor(data.unexplained_variance_amount_minor) > 0
  ) {
    pushAction(actions, {
      code: 'ESCALATE_LEAKAGE',
      title: 'Escalate leakage exposure',
      impactLabel: `${formatInrCompact(readMinor(data.duplicate_risk_exposure_minor))} duplicate risk`,
      priority: 9,
    })
  }

  if ((data.settlement_delay_p95_days ?? 0) > 1 || (data.settlement_delay_p50_days ?? 0) > 0.5) {
    pushAction(actions, {
      code: 'ADVISORY_SLA',
      title: 'Advisory · settlement SLA',
      impactLabel: `P50 ${score(data.settlement_delay_p50_days, 1)}d · P95 ${score(data.settlement_delay_p95_days, 1)}d`,
      priority: 10,
    })
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 10)
}

function mapSourceQualityTable(patterns: SourceQualityPattern[] = []): PatternCategoryTable {
  return {
    id: 'source-quality',
    title: 'A · Source quality',
    columns: [
      { key: 'source_system', label: 'Source' },
      { key: 'manual_review_rate', label: 'Manual review' },
      { key: 'missing_client_ref_rate', label: 'Missing refs' },
      { key: 'low_matchability_rate', label: 'Low matchability' },
      { key: 'duplicate_risk_rate', label: 'Duplicate risk' },
    ],
    rows: patterns.map((row) => ({
      source_system: row.source_system ?? '—',
      manual_review_rate: pct(row.manual_review_rate),
      missing_client_ref_rate: pct(row.missing_client_ref_rate),
      low_matchability_rate: pct(row.low_matchability_rate),
      duplicate_risk_rate: pct(row.duplicate_risk_rate),
    })),
  }
}

function mapProviderQualityTable(patterns: ProviderQualityPattern[] = []): PatternCategoryTable {
  return {
    id: 'provider-quality',
    title: 'B · Provider / bank quality',
    columns: [
      { key: 'provider_id', label: 'Provider' },
      { key: 'avg_parse_confidence', label: 'Parse confidence' },
      { key: 'avg_carrier_richness', label: 'Carrier richness' },
      { key: 'orphan_rate', label: 'Orphan rate' },
      { key: 'settlement_delay_p95_days', label: 'Delay P95 (d)' },
    ],
    rows: patterns.map((row) => ({
      provider_id: row.provider_id ?? '—',
      avg_parse_confidence: pct(row.avg_parse_confidence),
      avg_carrier_richness: pct(row.avg_carrier_richness),
      orphan_rate: pct(row.orphan_rate),
      settlement_delay_p95_days: score(row.settlement_delay_p95_days, 1),
    })),
  }
}

function buildCategories(data: PatternSnapshotData): PatternCategoryTable[] {
  const categories: PatternCategoryTable[] = [
    mapSourceQualityTable(data.source_quality_patterns),
    mapProviderQualityTable(data.provider_quality_patterns),
    {
      id: 'ambiguity-by-source',
      title: 'C · Ambiguity by source',
      columns: [
        { key: 'source_system', label: 'Weakest source' },
        { key: 'missing_ref_rate', label: 'Missing ref rate' },
        { key: 'manual_review_rate', label: 'Manual review rate' },
      ],
      rows: data.weakest_source_system
        ? [{
            source_system: data.weakest_source_system,
            missing_ref_rate: pct(data.weakest_source_missing_ref_rate),
            manual_review_rate: pct(data.weakest_source_manual_review_rate),
          }]
        : [],
    },
    {
      id: 'variance-patterns',
      title: 'D · Variance patterns',
      columns: [
        { key: 'total_variance', label: 'Total variance' },
        { key: 'whitelisted', label: 'Whitelisted deductions' },
        { key: 'unexplained', label: 'Unexplained variance' },
      ],
      rows: [{
        total_variance: formatInrCompact(readMinor(data.total_variance_minor)),
        whitelisted: formatInrCompact(readMinor(data.whitelisted_deduction_amount_minor)),
        unexplained: formatInrCompact(readMinor(data.unexplained_variance_amount_minor)),
      }],
    },
    {
      id: 'duplicate-risk',
      title: 'E · Duplicate risk',
      columns: [
        { key: 'duplicate_risk_rate', label: 'Duplicate risk rate' },
        { key: 'duplicate_exposure', label: 'Exposure' },
      ],
      rows: [{
        duplicate_risk_rate: pct(data.duplicate_risk_rate),
        duplicate_exposure: formatInrCompact(readMinor(data.duplicate_risk_exposure_minor)),
      }],
    },
    {
      id: 'manual-review',
      title: 'F · Manual review',
      columns: [
        { key: 'reason_code', label: 'Reason' },
        { key: 'count', label: 'Count' },
        { key: 'rate', label: 'Rate' },
      ],
      rows: (data.top_manual_review_reasons ?? []).map((reason) => ({
        reason_code: reason.reason_code ?? '—',
        count: reason.count ?? 0,
        rate: pct(reason.rate),
      })),
    },
    {
      id: 'evidence-weakness',
      title: 'G · Evidence weakness',
      columns: [
        { key: 'missing_leaf_rate', label: 'Missing leaf rate' },
        { key: 'weak_evidence_rate', label: 'Weak evidence rate' },
        { key: 'evidence_pack_coverage', label: 'Pack coverage' },
      ],
      rows: [{
        missing_leaf_rate: pct(data.missing_leaf_rate),
        weak_evidence_rate: pct(data.weak_evidence_rate),
        evidence_pack_coverage: pct(data.evidence_pack_coverage),
      }],
    },
    {
      id: 'settlement-timing',
      title: 'H · Settlement timing',
      columns: [
        { key: 'settlement_delay_p50_days', label: 'Delay P50 (d)' },
        { key: 'settlement_delay_p95_days', label: 'Delay P95 (d)' },
      ],
      rows: [{
        settlement_delay_p50_days: score(data.settlement_delay_p50_days, 1),
        settlement_delay_p95_days: score(data.settlement_delay_p95_days, 1),
      }],
    },
  ]

  return categories.filter((table) => table.rows.length > 0)
}

function mapHistoryRows(history: PatternHistoryResponse | null): PatternHistoryRow[] {
  return (history?.snapshots ?? []).map((snapshot, index) => {
    const json = snapshot.snapshot_json ?? null
    return {
      id: snapshot.snapshot_id ?? `history-${index}`,
      createdAt: snapshot.created_at ?? '',
      scopeType: snapshot.scope_type ?? '—',
      scopeRef: snapshot.scope_ref ?? '—',
      batchId: json?.batch_id ?? '—',
      riskTier: json?.risk_tier ?? '—',
      anomalyLevel: json?.anomaly_level ?? '—',
      snapshot: json,
    }
  })
}

export function mapPatternToConnectorView(
  detail: PatternDetailResponse | null,
  history: PatternHistoryResponse | null,
): PatternIntelligenceView | null {
  const data = patternDataFrom(detail, history)
  if (!data && detail?.data_available !== true) return null

  const envelope = detail?.data_available === true ? detail : null
  const meta = {
    tenantId: envelope?.tenant_id ?? history?.tenant_id ?? '—',
    snapshotType: envelope?.snapshot_type ?? history?.snapshot_type ?? 'PATTERN',
    snapshotId: envelope?.snapshot_id ?? '—',
    scopeType: envelope?.scope_type ?? '—',
    scopeRef: envelope?.scope_ref ?? '—',
    windowStart: formatIso(envelope?.window_start),
    windowEnd: formatIso(envelope?.window_end),
    computedAt: formatIso(envelope?.computed_at ?? data?.computed_at),
    modelVersion: envelope?.model_version ?? 'deterministic',
    intelligenceMode: envelope?.intelligence_mode ?? history?.intelligence_mode ?? '—',
  }

  const snapshot = data ?? ({} as PatternSnapshotData)

  const scoreKpis: PatternKpiBucket[] = [
    { label: 'Batch anomaly score', value: score(snapshot.batch_anomaly_score), sub: snapshot.anomaly_level ?? '—' },
    { label: 'Batch quality score', value: score(snapshot.batch_quality_score), sub: 'Attachment quality' },
    { label: 'Batch risk score', value: score(snapshot.batch_risk_score), sub: snapshot.risk_tier ?? '—' },
  ]

  const volumeKpis: PatternKpiBucket[] = [
    { label: 'Total count', value: String(snapshot.total_count ?? '—'), sub: 'Batch volume' },
    { label: 'Success', value: String(snapshot.success_count ?? '—'), sub: 'Settled / matched' },
    { label: 'Failed', value: String(snapshot.failed_count ?? '—'), sub: 'Terminal failures' },
    { label: 'Pending', value: String(snapshot.pending_count ?? '—'), sub: 'Awaiting finality' },
  ]

  const ambiguitySummary: PatternKpiBucket[] = [
    { label: 'Ambiguity score', value: score(snapshot.ambiguity_score), sub: 'Batch ambiguity index' },
    { label: 'Ambiguous', value: String(snapshot.ambiguous_count ?? '—'), sub: 'Needs review' },
    { label: 'Unresolved', value: String(snapshot.unresolved_count ?? '—'), sub: 'Open matches' },
    { label: 'Exact / high confidence', value: `${snapshot.exact_match_count ?? 0} / ${snapshot.high_confidence_count ?? 0}`, sub: 'Strong matches' },
  ]

  return {
    hasLiveData: Boolean(data),
    meta,
    statusBadges: {
      batchId: snapshot.batch_id ?? '—',
      riskTier: snapshot.risk_tier ?? '—',
      anomalyLevel: snapshot.anomaly_level ?? '—',
      finalityStatus: snapshot.finality_status ?? '—',
      prepareAndSignRecommended: Boolean(snapshot.prepare_and_sign_recommended),
    },
    scoreKpis,
    volumeKpis,
    ambiguitySummary,
    riskSignals: snapshot.risk_signals ?? [],
    recommendedAction: snapshot.recommended_action?.trim() || null,
    actionCatalog: data ? buildActionCatalog(snapshot) : [],
    categories: data ? buildCategories(snapshot) : [],
    history: mapHistoryRows(history),
  }
}

export function patternInsightsFromView(view: PatternIntelligenceView | null) {
  if (!view?.hasLiveData) return []
  const insights: Array<{ id: string; text: string }> = []
  for (const signal of view.riskSignals.slice(0, 3)) {
    if (!signal.signal) continue
    insights.push({
      id: `risk-${signal.signal}`,
      text: `${signal.signal} (${signal.severity ?? 'INFO'}) — value ${score(signal.value)} vs threshold ${score(signal.threshold)}`,
    })
  }
  if (view.statusBadges.batchId !== '—') {
    insights.push({
      id: 'pattern-batch',
      text: `Latest pattern snapshot for batch ${view.statusBadges.batchId} · risk ${view.statusBadges.riskTier}.`,
    })
  }
  return insights
}

export function patternActionsFromView(view: PatternIntelligenceView | null) {
  if (!view?.actionCatalog.length) return []
  return view.actionCatalog.map((card) => ({
    id: card.id,
    title: card.title,
    impactMinor: 0,
    impactLabel: card.impactLabel,
  }))
}
