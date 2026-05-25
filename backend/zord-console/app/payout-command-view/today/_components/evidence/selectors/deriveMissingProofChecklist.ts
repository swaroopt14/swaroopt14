import { evidenceCopy } from '../copy/evidenceCopy'
import type { MissingProofItem } from '../types/evidenceViewModels'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'

const CHECKS: { types: string[]; label: string }[] = [
  {
    types: ['RAW_SETTLEMENT_ENVELOPE', 'CANONICAL_SETTLEMENT_OBSERVATION'],
    label: 'Upload bank/settlement confirmation file',
  },
  { types: ['ATTACHMENT_DECISION'], label: 'Confirm match decision' },
  { types: ['GOVERNANCE_DECISION_AT_CANONICAL'], label: 'Complete governance check' },
  { types: ['FINAL_EVIDENCE_VIEW', 'FINAL_CONTRACT'], label: 'Re-run evidence generation' },
]

export function deriveMissingProofChecklist(pack: EvidencePackFull | null): MissingProofItem[] {
  if (!pack) return []

  const items = pack.items ?? []
  const hasType = (types: string[]) =>
    items.some((it) => types.includes((it.type || '').toUpperCase()) && (it.hash || it.leaf_hash))

  const list: MissingProofItem[] = [
    {
      id: 'settlement',
      label: 'Upload bank/settlement confirmation file',
      done: hasType(['RAW_SETTLEMENT_ENVELOPE', 'CANONICAL_SETTLEMENT_OBSERVATION']),
    },
    {
      id: 'bank-ref',
      label: 'Resolve missing bank reference',
      done: hasType(['ATTACHMENT_DECISION']),
    },
    {
      id: 'match',
      label: 'Confirm match decision',
      done: hasType(['ATTACHMENT_DECISION']),
    },
    {
      id: 'governance',
      label: 'Complete governance check',
      done: hasType(['GOVERNANCE_DECISION_AT_CANONICAL', 'GOVERNANCE_DECISION']),
    },
    {
      id: 'regen',
      label: 'Re-run evidence generation',
      done: Boolean(pack.merkle_root) && items.length >= 5,
    },
  ]

  return list.filter((c) => !c.done)
}

export function checklistSectionTitle(): string {
  return evidenceCopy.packDetail.checklistTitle
}
