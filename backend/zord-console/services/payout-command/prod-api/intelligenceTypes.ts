// Shape contracts for the 5 KPI dashboards + 2 batches endpoints on zord-intelligence (:8089).
// All endpoints return `data_available: false` with a `reason` when the tenant has no events
// yet — the frontend uses that to render empty-state cards instead of zeros.

export type RiskTier = 'CLEAN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type EmptyKpiResponse = {
  data_available: false
  reason?: string
}

type Resolved<T> = T & {
  data_available: true
  tenant_id: string
  snapshot_id?: string
  computed_at?: string
  window_start?: string
  window_end?: string
}

// ── KPIs 1–6: Leakage ──────────────────────────────────────────────────────
/** Minor amounts may arrive as JSON strings or numbers from zord-intelligence. */
export type MinorAmountField = string | number

export type LeakageKpiResolved = Resolved<{
  total_intended_amount_minor: MinorAmountField
  unmatched_amount_minor: MinorAmountField
  under_settlement_amount_minor: MinorAmountField
  orphan_amount_minor: MinorAmountField
  reversal_exposure_minor: MinorAmountField
  total_observed_settled_amount_minor?: MinorAmountField
  ambiguous_value_at_risk_minor?: MinorAmountField
  risk_adjusted_leakage_minor?: MinorAmountField
  leakage_percentage: number
  risk_tier: RiskTier
}>
export type LeakageKpiResponse = LeakageKpiResolved | EmptyKpiResponse

// ── KPIs 7–10: Ambiguity ──────────────────────────────────────────────────
export type AmbiguityKpiResolved = Resolved<{
  ambiguous_intent_count: number
  ambiguity_rate: number
  avg_attachment_confidence: number
  provider_ref_missing_rate: number
  value_at_risk_minor: string
  risk_tier: RiskTier
  /** Optional extended KPIs when zord-intelligence ships them. */
  low_confidence_rate?: number
  candidate_collision_rate?: number
  ambiguous_amount_rate?: number
}>
export type AmbiguityKpiResponse = AmbiguityKpiResolved | EmptyKpiResponse

// ── KPIs 11–13: Defensibility ─────────────────────────────────────────────
export type DefensibilityTier = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
export type DefensibilityKpiResolved = Resolved<{
  evidence_pack_rate: number
  governance_coverage_pct: number
  replayability_pct: number
  defensibility_score: number
  defensibility_tier: DefensibilityTier
  audit_ready_pct: number
  dispute_ready_pct: number
}>
export type DefensibilityKpiResponse = DefensibilityKpiResolved | EmptyKpiResponse

// ── KPI 14: Pattern / Batch anomaly ───────────────────────────────────────
export type AnomalyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type FinalityStatus =
  | 'PENDING'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REQUIRES_REVIEW'
export type PatternsKpiResolved = Resolved<{
  batch_id?: string
  batch_anomaly_score: number
  anomaly_level: AnomalyLevel
  anomaly_type?: string
  batch_risk_score: number
  risk_tier: RiskTier
  finality_status: FinalityStatus
  total_count: number
  success_count: number
  failed_count: number
  pending_count: number
}>
export type PatternsKpiResponse = PatternsKpiResolved | EmptyKpiResponse

// ── KPIs 15–16: Recommendations ───────────────────────────────────────────
export type RecommendationsKpiResolved = Resolved<{
  action_acceptance_rate: number
  action_resolution_rate: number
  total_actions: number
  accepted_actions: number
  resolved_actions: number
}>
export type RecommendationsKpiResponse = RecommendationsKpiResolved | EmptyKpiResponse

// ── Batches list ──────────────────────────────────────────────────────────
export type IntelligenceBatchRow = {
  batch_id: string
  tenant_id: string
  finality_status: FinalityStatus
  total_count: number
  success_count: number
  failed_count: number
  pending_count: number
}
export type BatchesListResponse = {
  tenant_id: string
  intelligence_mode: string
  status_filter: string
  batches: IntelligenceBatchRow[]
}

// ── Single batch detail (row + projection) ────────────────────────────────
export type BatchHealth = {
  total_intended_amount_minor: string
  total_confirmed_amount_minor: string
  total_variance_minor: string
  ambiguity_score: number
  finality_status: FinalityStatus
}
export type BatchDetailResponse = {
  tenant_id: string
  intelligence_mode: string
  batch: IntelligenceBatchRow
  batch_health: BatchHealth | null
}

export function isDataAvailable<T extends EmptyKpiResponse | { data_available: true }>(
  res: T | null | undefined,
): res is Exclude<T, EmptyKpiResponse> {
  return Boolean(res && (res as { data_available?: boolean }).data_available === true)
}
