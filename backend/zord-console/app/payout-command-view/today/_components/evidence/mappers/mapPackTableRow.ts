import { humanizePackMode } from '../copy/evidenceCopy'
import type { PackTableRowVm } from '../types/evidenceViewModels'
import { EXPECTED_PROOF_ITEMS } from '../types/evidenceViewModels'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { mapProofStatusFromPack } from './mapProofStatus'

export function computePackProofScore(itemCount: number | undefined, total = EXPECTED_PROOF_ITEMS): number | null {
  if (itemCount === undefined) return null
  return Math.min(100, Math.round((itemCount / total) * 100))
}

function summaryLabel(s: EvidencePackSummaryRow): string {
  const parts = [humanizePackMode(s.mode), s.contract_id, s.intent_id].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Evidence pack'
}

export function mapPackTableRow(
  summary: EvidencePackSummaryRow,
  itemCount?: number,
  batchScoreEstimate?: number | null,
): PackTableRowVm {
  const status = mapProofStatusFromPack(summary, itemCount)
  const perPackScore =
    summary.proof_score != null
      ? Math.round(Number(summary.proof_score))
      : computePackProofScore(itemCount ?? summary.artifact_count)

  return {
    packId: summary.evidence_pack_id,
    intentId: apiTrimmedString(summary.intent_id) || '—',
    proofRoot: summary.merkle_root || '—',
    proofScore: perPackScore ?? batchScoreEstimate ?? null,
    proofScoreIsEstimate: perPackScore == null && batchScoreEstimate != null,
    itemCount: itemCount ?? summary.artifact_count ?? null,
    totalItems: EXPECTED_PROOF_ITEMS,
    proofStatus: status.label,
    proofStatusKey: status.key,
    generatedAt: summary.created_at,
    modeLabel: humanizePackMode(summary.mode),
    summaryLine: summaryLabel(summary),
  }
}
