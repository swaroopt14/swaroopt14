import { evidenceCopy } from '../copy/evidenceCopy'
import type { EvidenceKpiCard } from '../types/evidenceViewModels'
import type {
  DefensibilityKpiResolved,
  BatchHealth,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { isExportReadyStatus, mapProofStatusFromPack } from '../mappers/mapProofStatus'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { formatPercentLabel } from '../utils/evidencePercent'

type PackRowInput = { summary: EvidencePackSummaryRow; itemCount?: number }

export function deriveEvidenceKpis(input: {
  defensibility: DefensibilityKpiResolved | null
  packRows: PackRowInput[]
  batchHealth?: BatchHealth | null
  batchId?: string
}): EvidenceKpiCard[] {
  const { defensibility, packRows } = input
  const packCount = packRows.length

  let readyCount = 0
  let incompleteCount = 0
  let reviewCount = 0

  for (const row of packRows) {
    const st = mapProofStatusFromPack(row.summary, row.itemCount)
    if (isExportReadyStatus(st.key)) readyCount += 1
    else if (st.key === 'needsReview') reviewCount += 1
    else incompleteCount += 1
  }

  const govPct = defensibility ? formatPercentLabel(defensibility.governance_coverage_pct) : '—'
  const disputePct = defensibility ? formatPercentLabel(defensibility.dispute_ready_pct) : '—'

  const packsSub =
    packCount > 0
      ? `${packCount} packs loaded for this batch`
      : 'Select a batch with evidence packs'

  const disputeSub =
    packCount > 0
      ? `${readyCount} ready to export · ${incompleteCount} incomplete · ${reviewCount} need review`
      : '—'

  return [
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
      sub: defensibility
        ? `Settlement coverage ${formatPercentLabel(defensibility.settlement_evidence_coverage)} · Attachment ${formatPercentLabel(defensibility.attachment_evidence_coverage)}`
        : '—',
    },
    {
      id: 'dispute',
      label:
        readyCount > 0 || incompleteCount > 0
          ? evidenceCopy.kpi.disputePacksReady
          : evidenceCopy.kpi.exportReadiness,
      value:
        readyCount > 0 || defensibility
          ? defensibility
            ? disputePct
            : String(readyCount)
          : packCount > 0
            ? '0'
            : '—',
      sub:
        defensibility && packCount > 0
          ? `${readyCount} export-ready · ${disputePct} dispute-ready per defensibility KPI`
          : disputeSub,
    },
  ]
}
