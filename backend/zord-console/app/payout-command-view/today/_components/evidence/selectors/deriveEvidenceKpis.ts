import { evidenceCopy } from '../copy/evidenceCopy'
import type { EvidenceKpiCard } from '../types/evidenceViewModels'
import { EXPECTED_PROOF_ITEMS } from '../types/evidenceViewModels'
import type {
  DefensibilityKpiResolved,
  LeakageKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { isExportReadyStatus, mapProofStatusFromPack } from '../mappers/mapProofStatus'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'

function formatMinorInrLabel(minor: string | number | undefined | null): string {
  const s = apiTrimmedString(minor)
  if (!s) return '—'
  const n = Number(s.replace(/\D/g, '') || '0')
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

type PackRowInput = { summary: EvidencePackSummaryRow; itemCount?: number }

export function deriveEvidenceKpis(input: {
  defensibility: DefensibilityKpiResolved | null
  leakage: LeakageKpiResolved | null
  packRows: PackRowInput[]
}): EvidenceKpiCard[] {
  const { defensibility, leakage, packRows } = input
  const packCount = packRows.length

  let readyCount = 0
  let incompleteCount = 0
  let reviewCount = 0
  let missingItems = 0

  for (const row of packRows) {
    const st = mapProofStatusFromPack(row.summary, row.itemCount)
    if (isExportReadyStatus(st.key)) readyCount += 1
    else if (st.key === 'needsReview') reviewCount += 1
    else incompleteCount += 1
    const missing = row.summary.missing_artifact_count
    if (typeof missing === 'number') missingItems += missing
    else if (row.itemCount !== undefined) {
      missingItems += Math.max(0, EXPECTED_PROOF_ITEMS - row.itemCount)
    }
  }

  const defScore = defensibility ? `${defensibility.defensibility_score.toFixed(0)}%` : '—'
  const evidencePct = defensibility ? `${(defensibility.evidence_pack_rate * 100).toFixed(0)}%` : '—'
  const govPct = defensibility ? `${(defensibility.governance_coverage_pct * 100).toFixed(0)}%` : '—'
  const replayPct = defensibility ? `${(defensibility.replayability_pct * 100).toFixed(0)}%` : '—'

  let readinessSub = defensibility
    ? `Evidence packs: ${evidencePct} · Replay-ready: ${replayPct}`
    : '—'

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
    : '—'

  let exposureSub = evidenceCopy.valueReviewHelper
  if (leakage) {
    exposureSub = `Unmatched value · tier ${leakage.risk_tier}`
  }

  const packsSub =
    packCount > 0
      ? `${packCount} packs loaded for this batch`
      : 'Select a batch with evidence packs'

  const disputeValue = readyCount > 0 ? String(readyCount) : packCount > 0 ? '0' : '—'
  const disputeSub =
    packCount > 0
      ? `${readyCount} ready to export · ${incompleteCount} incomplete · ${reviewCount} need review`
      : '—'

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
      value: packCount > 0 ? String(packCount) : '—',
      sub: packsSub,
    },
    {
      id: 'governance',
      label: evidenceCopy.kpi.governanceChecks,
      value: govPct,
      sub: defensibility ? 'Governance checks completed for batch' : '—',
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
      value: packCount > 0 ? missingItems.toLocaleString('en-IN') : '—',
      sub: packCount > 0 ? 'Critical proof artifacts still missing' : '—',
    },
    {
      id: 'dispute',
      label:
        readyCount > 0 || incompleteCount > 0
          ? evidenceCopy.kpi.disputePacksReady
          : evidenceCopy.kpi.exportReadiness,
      value: disputeValue,
      sub: disputeSub,
    },
  ]
}
