/** zord-evidence HTTP JSON shapes (list + full pack). Optional fields match extended deployments. */

export type ApiEvidenceItem = {
  type: string
  ref: string
  hash?: string
  schema_version: string
  leaf_hash?: string
}

export type EvidencePackSummaryRow = {
  evidence_pack_id: string
  tenant_id: string
  intent_id?: string
  contract_id?: string
  /** Present when the service lists packs scoped to a batch (extension / migration). */
  batch_id?: string
  mode: string
  pack_status: string
  merkle_root: string
  ruleset_version: string
  supersedes_pack_id?: string
  created_at: string
}

export type ListPacksResponse = {
  packs: EvidencePackSummaryRow[]
  total: number
}

export type EvidencePackFull = {
  evidence_pack_id: string
  tenant_id: string
  intent_id: string
  contract_id: string
  mode: string
  pack_status: string
  items: ApiEvidenceItem[]
  merkle_root: string
  ruleset_version: string
  schema_versions?: Record<string, string>
  signatures?: { signer: string; alg: string; sig: string; signed_at: string }[]
  supersedes_pack_id?: string
  created_at: string
}
