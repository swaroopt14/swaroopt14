import type { MinorAmountField } from './intelligenceTypes'

export type PatternSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string

export type BatchRiskSignal = {
  signal?: string
  severity?: PatternSeverity
  value?: number
  threshold?: number
  contribution?: number
}

export type SourceQualityPattern = {
  severity?: PatternSeverity
  source_system?: string
  manual_review_rate?: number
  total_intent_count?: number
  duplicate_risk_rate?: number
  low_matchability_rate?: number
  missing_client_ref_rate?: number
  manual_review_amount_minor?: MinorAmountField
}

export type ProviderQualityPattern = {
  severity?: PatternSeverity
  provider_id?: string
  orphan_rate?: number
  ambiguity_rate?: number
  avg_carrier_richness?: number
  avg_parse_confidence?: number
  settlement_delay_p95_days?: number
}

export type ManualReviewReason = {
  reason_code?: string
  count?: number
  rate?: number
  amount_minor?: MinorAmountField
}

export type PatternSnapshotData = {
  batch_id?: string
  risk_tier?: string
  computed_at?: string
  total_count?: number
  success_count?: number
  failed_count?: number
  pending_count?: number
  reversed_count?: number
  partial_recon_count?: number
  total_variance_minor?: MinorAmountField
  anomaly_type?: string
  risk_signals?: BatchRiskSignal[] | null
  anomaly_level?: string
  batch_risk_score?: number
  recommended_action?: string
  batch_anomaly_score?: number
  batch_quality_score?: number
  ambiguity_score?: number
  finality_status?: string
  exact_match_count?: number
  high_confidence_count?: number
  ambiguous_count?: number
  unresolved_count?: number
  conflicted_count?: number
  prepare_and_sign_recommended?: boolean
  duplicate_risk_rate?: number
  duplicate_risk_exposure_minor?: MinorAmountField
  missing_leaf_rate?: number
  weak_evidence_rate?: number
  evidence_pack_coverage?: number
  source_quality_patterns?: SourceQualityPattern[]
  provider_quality_patterns?: ProviderQualityPattern[]
  tenant_manual_review_rate?: number
  top_manual_review_reasons?: ManualReviewReason[]
  settlement_delay_p50_days?: number
  settlement_delay_p95_days?: number
  whitelisted_deduction_amount_minor?: MinorAmountField
  unexplained_variance_amount_minor?: MinorAmountField
  over_settlement_amount_minor?: MinorAmountField
  weakest_source_system?: string
  weakest_source_missing_ref_rate?: number
  weakest_source_manual_review_rate?: number
  weakest_provider_id?: string
}

export type PatternDetailResponse = {
  tenant_id?: string
  intelligence_mode?: string
  snapshot_type?: string
  snapshot_id?: string
  scope_type?: string
  scope_ref?: string | null
  window_start?: string
  window_end?: string
  computed_at?: string
  model_version?: string | null
  data?: PatternSnapshotData | null
  data_available?: boolean
  reason?: string
}

export type PatternHistorySnapshot = {
  snapshot_id?: string
  tenant_id?: string
  snapshot_type?: string
  scope_type?: string
  scope_ref?: string | null
  window_start?: string
  window_end?: string
  projection_refs_json?: unknown
  snapshot_json?: PatternSnapshotData
  model_version?: string | null
  created_at?: string
}

export type PatternHistoryResponse = {
  tenant_id?: string
  intelligence_mode?: string
  snapshot_type?: string
  count?: number
  snapshots?: PatternHistorySnapshot[]
}

export type PatternActionCode =
  | 'ESCALATE'
  | 'REQUEST_SOURCE_PATCH'
  | 'PREPARE_AND_SIGN_RECOMMENDED'
  | 'REVIEW_AMBIGUOUS_BATCH'
  | 'DISPATCH_MODE_RECOMMENDED'
  | 'ADVISORY_RECOMMENDATION'
  | 'REGENERATE_EVIDENCE'
  | 'REQUEST_STRONGER_CARRIER_CONTRACT'
  | 'ESCALATE_LEAKAGE'
  | 'ADVISORY_SLA'

export type PatternActionCard = {
  id: string
  code: PatternActionCode
  title: string
  impactLabel: string
  priority: number
}

export type PatternKpiBucket = {
  label: string
  value: string
  sub: string
}

export type PatternCategoryRow = Record<string, string | number>

export type PatternCategoryTable = {
  id: string
  title: string
  columns: Array<{ key: string; label: string }>
  rows: PatternCategoryRow[]
}

export type PatternHistoryRow = {
  id: string
  createdAt: string
  scopeType: string
  scopeRef: string
  batchId: string
  riskTier: string
  anomalyLevel: string
  snapshot: PatternSnapshotData | null
}

export type PatternIntelligenceView = {
  hasLiveData: boolean
  meta: {
    tenantId: string
    snapshotType: string
    snapshotId: string
    scopeType: string
    scopeRef: string
    windowStart: string
    windowEnd: string
    computedAt: string
    modelVersion: string
    intelligenceMode: string
  }
  statusBadges: {
    batchId: string
    riskTier: string
    anomalyLevel: string
    finalityStatus: string
    prepareAndSignRecommended: boolean
  }
  scoreKpis: PatternKpiBucket[]
  volumeKpis: PatternKpiBucket[]
  ambiguitySummary: PatternKpiBucket[]
  riskSignals: BatchRiskSignal[]
  recommendedAction: string | null
  actionCatalog: PatternActionCard[]
  categories: PatternCategoryTable[]
  history: PatternHistoryRow[]
}
