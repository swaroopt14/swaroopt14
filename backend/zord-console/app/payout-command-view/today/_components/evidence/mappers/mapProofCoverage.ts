import { evidenceCopy } from '../copy/evidenceCopy'
import type { ProofCoverageTile } from '../types/evidenceViewModels'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import type { DefensibilityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'

const ITEM_TYPES = {
  intent: ['CANONICAL_INTENT', 'CANONICAL_INTENT_HASH'],
  settlement: ['CANONICAL_SETTLEMENT_OBSERVATION', 'RAW_SETTLEMENT_ENVELOPE', 'RAW_SETTLEMENT_FILE'],
  match: ['ATTACHMENT_DECISION'],
  governance: ['GOVERNANCE_DECISION_AT_CANONICAL', 'GOVERNANCE_DECISION'],
} as const

function hasItemType(items: EvidencePackFull['items'], types: readonly string[]): boolean {
  return (items ?? []).some((it) => types.includes((it.type || '').toUpperCase()))
}

function itemHasHash(items: EvidencePackFull['items'], types: readonly string[]): boolean {
  return (items ?? []).some((it) => {
    if (!types.includes((it.type || '').toUpperCase())) return false
    return Boolean(it.hash || it.leaf_hash)
  })
}

export function mapProofCoverageFromPack(pack: EvidencePackFull | null): ProofCoverageTile[] {
  const items = pack?.items ?? []
  const hasPack = Boolean(pack?.merkle_root && pack.evidence_pack_id)

  return [
    {
      id: 'instruction',
      label: evidenceCopy.coverage.paymentInstruction,
      status: itemHasHash(items, ITEM_TYPES.intent) ? 'available' : 'missing',
    },
    {
      id: 'settlement',
      label: evidenceCopy.coverage.settlementRecord,
      status: itemHasHash(items, ITEM_TYPES.settlement) ? 'available' : 'missing',
    },
    {
      id: 'match',
      label: evidenceCopy.coverage.matchDecision,
      status: hasItemType(items, ITEM_TYPES.match) ? 'available' : 'missing',
    },
    {
      id: 'governance',
      label: evidenceCopy.coverage.governanceCheck,
      status: hasItemType(items, ITEM_TYPES.governance) ? 'available' : 'missing',
    },
    {
      id: 'pack',
      label: evidenceCopy.coverage.evidencePack,
      status: hasPack ? 'generated' : 'not_generated',
    },
  ]
}

export function mapProofCoverageFromDefensibility(def: DefensibilityKpiResolved | null): ProofCoverageTile[] {
  if (!def) {
    return [
      { id: 'instruction', label: evidenceCopy.coverage.paymentInstruction, status: 'unknown' },
      { id: 'settlement', label: evidenceCopy.coverage.settlementRecord, status: 'unknown' },
      { id: 'match', label: evidenceCopy.coverage.matchDecision, status: 'unknown' },
      { id: 'governance', label: evidenceCopy.coverage.governanceCheck, status: 'unknown' },
      { id: 'pack', label: evidenceCopy.coverage.evidencePack, status: 'unknown' },
    ]
  }

  const packRate = def.evidence_pack_rate
  const govRate = def.governance_coverage_pct
  const replayRate = def.replayability_pct

  const tile = (id: string, label: string, rate: number): ProofCoverageTile => ({
    id,
    label,
    status: rate >= 0.99 ? 'available' : rate > 0 ? 'available' : 'missing',
    isBatchEstimate: true,
  })

  return [
    tile('instruction', evidenceCopy.coverage.paymentInstruction, packRate),
    tile('settlement', evidenceCopy.coverage.settlementRecord, packRate),
    tile('match', evidenceCopy.coverage.matchDecision, packRate * 0.9),
    tile('governance', evidenceCopy.coverage.governanceCheck, govRate),
    {
      id: 'pack',
      label: evidenceCopy.coverage.evidencePack,
      status: packRate >= 0.99 ? 'generated' : packRate > 0 ? 'generated' : 'not_generated',
      isBatchEstimate: true,
    },
  ]
}
