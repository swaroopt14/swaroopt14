import type { ProofStatusKey } from '../copy/evidenceCopy'

export type ProofCoverageStatus = 'available' | 'missing' | 'generated' | 'not_generated' | 'unknown'

export type ProofCoverageTile = {
  id: string
  label: string
  status: ProofCoverageStatus
  isBatchEstimate?: boolean
}

export type EvidenceKpiCard = {
  id: string
  label: string
  value: string
  sub: string
  accent?: boolean
  explanation?: string
}

export type ProofBreakdownRow = {
  id: string
  label: string
  completed: number
  total: number
  note?: string
}

export type PackTableRowVm = {
  packId: string
  intentId: string
  proofRoot: string
  proofScore: number | null
  proofScoreIsEstimate: boolean
  itemCount: number | null
  totalItems: number
  proofStatus: string
  proofStatusKey: ProofStatusKey | 'partialProof'
  generatedAt: string
  modeLabel: string
  summaryLine: string
}

export type TimelineEventVm = {
  time: string
  label: string
  detail?: string
}

export type MissingProofItem = {
  id: string
  label: string
  done: boolean
}

export type EvidencePageTab = 'workspace' | 'export'

export const EXPECTED_PROOF_ITEMS = 9
