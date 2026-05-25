import { evidenceCopy } from '../copy/evidenceCopy'
import type { EvidenceKpiCard } from '../types/evidenceViewModels'
import { EXPECTED_PROOF_ITEMS } from '../types/evidenceViewModels'
import type {
  AmbiguityKpiResolved,
  DefensibilityKpiResolved,
  LeakageKpiResolved,
  PatternsKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { isExportReadyStatus, mapProofStatusFromPack } from '../mappers/mapProofStatus'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'

function formatMinorInrLabel(minor: string | number | undefined | null): string {
  const s = apiTrimmedString(minor)
  if (!s) return '—'
  const n = BigInt(s.replace(/\D/g, '') || '0')
  const rupees = Number(n) / 100
  if (!Number.isFinite(rupees)) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    rupees,
  )
}

type PackRowInput = { summary: EvidencePackSummaryRow; itemCount?: number }

export function deriveEvidenceKpis(input: {
  defensibility: DefensibilityKpiResolved | null
  leakage: LeakageKpiResolved | null
  ambiguity: AmbiguityKpiResolved | null
  patterns: PatternsKpiResolved | null
  packRows: PackRowInput[]
}): EvidenceKpiCard[] {
  const { defensibility, leakage, ambiguity, patterns, packRows } = input

  const packCount = packRows.length
  const inScope = patterns?.total_count ?? (packCount > 0 ? packCount : null)

  let missingItems = 0
  let readyCount = 0
  let incompleteCount = 0
  let reviewCount = 0

  for (const row of packRows) {
    const st = mapProofStatusFromPack(row.summary, row.itemCount)
    if (isExportReadyStatus(st.key)) readyCount += 1
    else if (st.key === 'needsReview') reviewCount += 1
    else incompleteCount += 1
    const count = row.itemCount ?? row.summary.artifact_count
    if (count !== undefined) missingItems += Math.max(0, EXPECTED_PROOF_ITEMS - count)
  }

  if (missingItems === 0 && defensibility && patterns?.total_count) {
    const base = patterns.total_count
    const evidenced = Math.round(base * defensibility.evidence_pack_rate)
    const replayGap = Math.round(base * Math.max(0, 1 - defensibility.replayability_pct))
    const govGap = Math.round(
      base * Math.max(0, defensibility.governance_coverage_pct - defensibility.evidence_pack_rate),
    )
    missingItems = Math.max(0, base - evidenced) + replayGap + govGap
  }

  const defScore = defensibility ? `${defensibility.defensibility_score.toFixed(0)}%` : '—'
  const evidencePct = defensibility ? `${(defensibility.evidence_pack_rate * 100).toFixed(0)}%` : '—'
  const govPct = defensibility ? `${(defensibility.governance_coverage_pct * 100).toFixed(0)}%` : '—'
  const replayPct = defensibility ? `${(defensibility.replayability_pct * 100).toFixed(0)}%` : '—'

  let readinessSub = defensibility
    ? `Evidence packs: ${evidencePct} · Governance checks: ${govPct} · Replay-ready records: ${replayPct}`
    : 'Ingest intelligence so proof readiness KPIs can populate this tile.'

  let readinessExplanation: string | undefined
  if (
    defensibility &&
    defensibility.evidence_pack_rate >= 0.99 &&
    defensibility.defensibility_score < 50
  ) {
    readinessExplanation = evidenceCopy.scoreLowExplanation
  }

  const exposureValue = leakage
    ? formatMinorInrLabel(leakage.unmatched_amount_minor)
    : ambiguity
      ? formatMinorInrLabel(ambiguity.value_at_risk_minor)
      : '—'

  let exposureSub = evidenceCopy.valueReviewHelper
  if (leakage) {
    exposureSub = `Unmatched value · tier ${leakage.risk_tier}`
    if (ambiguity) exposureSub += ` · ambiguous exposure also tracked`
  } else if (ambiguity) {
    exposureSub = `Ambiguous value at risk · tier ${ambiguity.risk_tier}`
  }

  const packsValue = inScope != null ? String(packCount) : String(packCount)
  const packsSub =
    inScope != null
      ? `${packCount} of ${inScope.toLocaleString('en-IN')} records in scope have packs`
      : packCount > 0
        ? `${packCount} packs loaded for this batch`
        : 'Select a batch with evidence packs'

  const disputeLabel =
    readyCount > 0 || incompleteCount > 0
      ? evidenceCopy.kpi.disputePacksReady
      : evidenceCopy.kpi.exportReadiness

  const disputeValue = readyCount > 0 ? String(readyCount) : packCount > 0 ? String(packCount) : '—'
  const disputeSub =
    packCount > 0
      ? `${readyCount} packs ready to export · ${incompleteCount} incomplete · ${reviewCount} need operator review`
      : 'Load evidence packs to see export readiness'

  return [
    {
      id: 'readiness',
      label: evidenceCopy.kpi.proofReadinessScore,
      value: defScore,
      sub: readinessSub,
      accent: true,
      explanation: readinessExplanation,
    },
    {
      id: 'packs',
      label: evidenceCopy.kpi.evidencePacksGenerated,
      value: packsValue,
      sub: packsSub,
    },
    {
      id: 'exposure',
      label: evidenceCopy.kpi.valueNeedingReview,
      value: exposureValue,
      sub: exposureSub,
    },
    {
      id: 'missing',
      label: evidenceCopy.kpi.missingProofItems,
      value: missingItems > 0 ? missingItems.toLocaleString('en-IN') : packCount > 0 ? '0' : '—',
      sub: 'Critical proof artifacts still missing across loaded packs',
    },
    {
      id: 'dispute',
      label: disputeLabel,
      value: disputeValue,
      sub: disputeSub,
    },
  ]
}
