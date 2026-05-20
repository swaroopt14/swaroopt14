import { apiTrimmedString } from './coerceApiField'
import type { EvidencePackFull, EvidencePackSummaryRow, ListPacksResponse } from './evidenceTypes'

/** Default batch when intelligence has not projected a batch yet (aligns with graph samples). */
export const DEFAULT_EVIDENCE_BATCH_ID = 'BATCH-001'

const MOCK_TENANT_PLACEHOLDER = ''

const MOCK_SUMMARIES: Omit<EvidencePackSummaryRow, 'batch_id' | 'tenant_id'>[] = [
  {
    evidence_pack_id: 'bep_a2041f08-cb1f-4720-8589-75582d057d41',
    intent_id: 'INT-1023',
    contract_id: 'CTR-7781',
    mode: 'INTELLIGENCE_ATTACH',
    pack_status: 'ACTIVE',
    merkle_root: 'sha256:9f2c4a6b8e1d3f7a5c9b2e4d6f8a1c3e5b7d9f2a4c6e8b1d3f5a7c9e2b4d6f8',
    ruleset_version: 'attach_v1.0',
    created_at: '2026-05-08T10:14:00.000Z',
  },
  {
    evidence_pack_id: 'bep_b2042f08-cb1f-4720-8589-75582d057d42',
    intent_id: 'INT-1024',
    contract_id: 'CTR-7782',
    mode: 'INTELLIGENCE_ATTACH',
    pack_status: 'ACTIVE',
    merkle_root: 'sha256:5d2a8c7e1f9b4d6a3c8e5f2b9d7a4c1e6b8f3d5a2c9e7b4d1f6a8c3e5b2d9f7a',
    ruleset_version: 'attach_v1.0',
    created_at: '2026-05-08T10:18:00.000Z',
  },
  {
    evidence_pack_id: 'bep_c2043f08-cb1f-4720-8589-75582d057d43',
    intent_id: 'INT-1025',
    contract_id: 'CTR-7783',
    mode: 'SECONDARY_DISPATCH',
    pack_status: 'ACTIVE',
    merkle_root: 'sha256:7c4e2b9a8d1f5c3e6b9a4d7f2c8e5b1a9f6d3c8e4b7a2f5d1c9e6b3a8f4d7c2e',
    ruleset_version: 'attach_v1.0',
    created_at: '2026-05-08T10:21:00.000Z',
  },
  {
    evidence_pack_id: 'bep_d2039f08-cb1f-4720-8589-75582d057d39',
    intent_id: 'INT-1019',
    contract_id: 'CTR-7790',
    mode: 'FULL_CONTROL',
    pack_status: 'ACTIVE',
    merkle_root: 'sha256:3e7b1a4d8c2f5e9b6d1a4f7c2e8b5d9a3f6c1e4b8d7a2f5c9e3b6d1a4f7c2e8b',
    ruleset_version: 'fusion_v1.0',
    created_at: '2026-05-08T09:42:00.000Z',
  },
]

const MOCK_PACK_IDS = new Set(MOCK_SUMMARIES.map((s) => s.evidence_pack_id))

const MOCK_ITEMS: EvidencePackFull['items'] = [
  {
    type: 'RAW_INGRESS_ENVELOPE',
    ref: 'env_8a21f',
    hash: 'sha256:a1f3d2c4e5b8f0a9d6c2e1b4f7a8d3c5e9b2f1a4d7c8e3b6f9a2d5',
    schema_version: 'v1',
    leaf_hash: 'sha256:9c3e1b2a4f8d7e6c5b4a39281706152433435261728394',
  },
  {
    type: 'CANONICAL_INTENT',
    ref: 'INT-1023',
    hash: 'sha256:7b9e2c4a8f1d3b6e5a9c2f4d7b8e1a3c6f9d2b5e8a1c4f7d3b6e9a2c',
    schema_version: 'intent_schema_v1',
    leaf_hash: 'sha256:2d8a4f1b6c9e3a5d8f2b7d4e1a9c6f3b8d5e2a7f4c1b9e6d3a8f5b2',
  },
  {
    type: 'GOVERNANCE_DECISION_AT_CANONICAL',
    ref: 'gov_dec_4421',
    hash: 'sha256:c2e8a4f1b6d9e3c5a8f2b7d4e1a9c6f3b8d5e2a7f4c1b9e6d3a8f5b2',
    schema_version: 'rs-2026.05.1',
    leaf_hash: 'sha256:5b1f7c3e9a2d8f4b6c1e7a3f9d2b8e5c4a1f7d3b6e9a2c8f5b1e4d7',
  },
  {
    type: 'RAW_SETTLEMENT_ENVELOPE',
    ref: 'env_set_771',
    hash: 'sha256:f4d7c1b8e3a6f2d5b9e1c4a7f8d2e6b3c9a5f1d8e4b7c2a6f9d3e5b1',
    schema_version: 'v1',
    leaf_hash: 'sha256:8e4c2a1f9b3d6e5c8a2f4b7d1e9c3a6f5b8d2e4a7c1f3b6e9d5a2c8',
  },
  {
    type: 'CANONICAL_SETTLEMENT_OBSERVATION',
    ref: 'set_obs_991',
    hash: 'sha256:c9d1e4a7f2b8d5c3e6a1f9b4d7c2e8a5f3b6d9c1e4a7f2b5d8c3e6a9',
    schema_version: 'outcome_schema_v1',
    leaf_hash: 'sha256:3a7d9b2e5c8f1a4d7b3e6c9a2f8d5b1e4a7c3f6d9b2e5a8c4f1d7b3',
  },
  {
    type: 'ATTACHMENT_DECISION',
    ref: 'att_dec_5512',
    hash: 'sha256:b6e2f8a4c1d7b3e9a5f2c8d4b1e7a3f9c5d2b8e4a1f7c3d9b5e2a8f4',
    schema_version: 'attach_v1.0',
    leaf_hash: 'sha256:6c2e8a4f1b7d3e9a5c2f8d4b1e7a3f9c5d2b8e4a1f7c3d9b5e2a8f4b1',
  },
  {
    type: 'FINAL_CONTRACT',
    ref: 'CTR-7781',
    hash: 'sha256:d3a8c5e2b9f4d1a7c6e3b8f5a2d9c4e1b6f3a8d5c2e9b4f1a7d6c3e8',
    schema_version: 'contract_schema_v1',
    leaf_hash: 'sha256:1f9b4d7a3c8e5f2b9d6a1c4e7b3f8a5d2c9e6b4f1a7d3c8e5b2a9f6',
  },
  {
    type: 'FINAL_EVIDENCE_VIEW',
    ref: 'CTR-7781',
    hash: 'sha256:e2b9f4d1a7c6e3b8f5a2d9c4e1b6f3a8d5c2e9b4f1a7d6c3e8b5f2a1',
    schema_version: 'contract_schema_v1',
    leaf_hash: 'sha256:4e8a1c7f3b6d2e9a5c1f8b4d7e2a9f6c3b8d5e1a4f7c2b9e6d3a8f5b1',
  },
]

function summaryForBatch(
  row: (typeof MOCK_SUMMARIES)[number],
  batchId: string,
  tenantId: string,
): EvidencePackSummaryRow {
  return { ...row, batch_id: batchId, tenant_id: tenantId }
}

export function isMockEvidencePackId(packId: string): boolean {
  return MOCK_PACK_IDS.has(apiTrimmedString(packId))
}

/** True when fallback packs should fill in for empty or failed evidence API responses. */
export function evidenceMockFallbackEnabled(): boolean {
  if (typeof process === 'undefined') return true
  const flag = process.env.NEXT_PUBLIC_EVIDENCE_MOCK?.trim().toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'off') return false
  return true
}

export function getMockEvidencePackList(
  batchId?: string,
  tenantId?: string,
): ListPacksResponse {
  const bid = apiTrimmedString(batchId) || DEFAULT_EVIDENCE_BATCH_ID
  const tid = apiTrimmedString(tenantId) || MOCK_TENANT_PLACEHOLDER
  const packs = MOCK_SUMMARIES.map((row) => summaryForBatch(row, bid, tid))
  return { packs, total: packs.length }
}

export function getMockEvidencePackFull(
  packId: string,
  batchId?: string,
  tenantId?: string,
): EvidencePackFull | null {
  const pid = apiTrimmedString(packId)
  if (!isMockEvidencePackId(pid)) return null
  const summary = MOCK_SUMMARIES.find((s) => s.evidence_pack_id === pid)
  if (!summary) return null
  const bid = apiTrimmedString(batchId) || DEFAULT_EVIDENCE_BATCH_ID
  const tid = apiTrimmedString(tenantId) || MOCK_TENANT_PLACEHOLDER
  return {
    evidence_pack_id: summary.evidence_pack_id,
    tenant_id: tid,
    intent_id: summary.intent_id ?? '',
    contract_id: summary.contract_id ?? '',
    mode: summary.mode,
    pack_status: summary.pack_status,
    items: MOCK_ITEMS,
    merkle_root: summary.merkle_root,
    ruleset_version: summary.ruleset_version,
    schema_versions: { intent: 'v1', outcome: 'v1', contract: 'v1', attachment: 'v1' },
    created_at: summary.created_at,
  }
}
