package models

import "time"

// EvidenceItem is one proof artifact that becomes a typed leaf in the Merkle tree.
// leaf_hash = SHA256(type || ref || hash || schema_version)
type EvidenceItem struct {
	Type          string `json:"type"`
	Ref           string `json:"ref"`
	Hash          string `json:"hash,omitempty"`
	SchemaVersion string `json:"schema_version"`
	LeafHash      string `json:"leaf_hash,omitempty"`
}

type Signature struct {
	Signer   string    `json:"signer"`
	Alg      string    `json:"alg"`
	Sig      string    `json:"sig"`
	SignedAt time.Time `json:"signed_at"`
}

// EvidencePack is the canonical committed proof bundle for one lifecycle.
// Mode: INTELLIGENCE_ATTACH | SECONDARY_DISPATCH | FULL_CONTROL
type EvidencePack struct {
	EvidencePackID   string            `json:"evidence_pack_id"`
	TenantID         string            `json:"tenant_id"`
	IntentID         string            `json:"intent_id"`
	ContractID       string            `json:"contract_id"`
	Mode             string            `json:"mode"`
	PackStatus       string            `json:"pack_status"`
	Items            []EvidenceItem    `json:"items"`
	MerkleRoot       string            `json:"merkle_root"`
	RulesetVersion   string            `json:"ruleset_version"`
	SchemaVersions   map[string]string `json:"schema_versions"`
	Signatures       []Signature       `json:"signatures"`
	SupersedesPackID string            `json:"supersedes_pack_id,omitempty"`
	CreatedAt        time.Time         `json:"created_at"`
}

// GenerateEvidenceRequest: upstream services supply all proof artifact items.
// evidence_pack_id is generated exclusively inside Service 6.
// All other IDs (intent_id, contract_id, item refs) come from upstream.
type GenerateEvidenceRequest struct {
	TenantID         string            `json:"tenant_id" binding:"required"`
	IntentID         string            `json:"intent_id" binding:"required"`
	ContractID       string            `json:"contract_id"`
	Mode             string            `json:"mode" binding:"required"`
	RulesetVersion   string            `json:"ruleset_version" binding:"required"`
	SchemaVersions   map[string]string `json:"schema_versions" binding:"required"`
	SupersedesPackID string            `json:"supersedes_pack_id"`
	Items            []EvidenceItem    `json:"items" binding:"required"`
}

// ReplayRequest instructs Service 6 to rebuild the pack from the same inputs
// with pinned ruleset/mapping/schema versions and compare the Merkle root.
type ReplayRequest struct {
	TenantID        string            `json:"tenant_id" binding:"required"`
	IntentID        string            `json:"intent_id" binding:"required"`
	ContractID      string            `json:"contract_id"`
	Mode            string            `json:"mode" binding:"required"`
	RulesetVersion  string            `json:"ruleset_version" binding:"required"`
	MappingVersions map[string]string `json:"mapping_versions" binding:"required"`
	SchemaVersions  map[string]string `json:"schema_versions" binding:"required"`
	OriginalPackID  string            `json:"original_pack_id" binding:"required"`
	RequestedBy     string            `json:"requested_by"`
	Items           []EvidenceItem    `json:"items" binding:"required"`
}

type ReplayResponse struct {
	ReplayJobID      string `json:"replay_job_id"`
	NewPackID        string `json:"new_pack_id"`
	Equivalent       bool   `json:"equivalent"`
	OldMerkleRoot    string `json:"old_merkle_root"`
	NewMerkleRoot    string `json:"new_merkle_root"`
	Explanation      string `json:"explanation"`
	RulesetVersion   string `json:"ruleset_version"`
	ReplayComparison string `json:"replay_comparison"`
}

type EvidenceViewResponse struct {
	ViewType       string         `json:"view_type"`
	EvidencePackID string         `json:"evidence_pack_id"`
	TenantID       string         `json:"tenant_id"`
	IntentID       string         `json:"intent_id"`
	ContractID     string         `json:"contract_id"`
	Mode           string         `json:"mode"`
	MerkleRoot     string         `json:"merkle_root"`
	RulesetVersion string         `json:"ruleset_version"`
	CreatedAt      time.Time      `json:"created_at"`
	Highlights     map[string]any `json:"highlights"`
}

// ListPacksResponse returned from GET /v1/evidence/packs?intent_id=...
type ListPacksResponse struct {
	Packs []EvidencePackSummary `json:"packs"`
	Total int                   `json:"total"`
}

type EvidencePackSummary struct {
	EvidencePackID   string    `json:"evidence_pack_id"`
	TenantID         string    `json:"tenant_id"`
	IntentID         string    `json:"intent_id"`
	ContractID       string    `json:"contract_id"`
	Mode             string    `json:"mode"`
	PackStatus       string    `json:"pack_status"`
	MerkleRoot       string    `json:"merkle_root"`
	RulesetVersion   string    `json:"ruleset_version"`
	SupersedesPackID string    `json:"supersedes_pack_id,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

// ReplayJob is the §14.5 evidence_replay_jobs row.
type ReplayJob struct {
	ReplayJobID          string            `json:"replay_job_id"`
	TenantID             string            `json:"tenant_id"`
	SourceEvidencePackID string            `json:"source_evidence_pack_id"`
	IntentID             string            `json:"intent_id"`
	ContractID           string            `json:"contract_id"`
	RulesetVersion       string            `json:"ruleset_version"`
	MappingVersions      map[string]string `json:"mapping_versions"`
	RequestedBy          string            `json:"requested_by"`
	Status               string            `json:"status"`
	NewEvidencePackID    string            `json:"new_evidence_pack_id,omitempty"`
	EquivalenceResult    string            `json:"equivalence_result,omitempty"`
	DifferenceSummary    map[string]any    `json:"difference_summary,omitempty"`
	CreatedAt            time.Time         `json:"created_at"`
	CompletedAt          *time.Time        `json:"completed_at,omitempty"`
}

// InclusionProof is the §14.4 merkle_inclusion_proofs row for selective disclosure.
type InclusionProof struct {
	EvidencePackID string    `json:"evidence_pack_id"`
	LeafHash       string    `json:"leaf_hash"`
	ProofPath      []string  `json:"proof_path"` // sibling hashes from leaf to root
	CreatedAt      time.Time `json:"created_at"`
}

// EvidenceArchive is the §14.3 evidence_archives row.
type EvidenceArchive struct {
	ArchiveID       string    `json:"archive_id"`
	EvidencePackID  string    `json:"evidence_pack_id"`
	TenantID        string    `json:"tenant_id"`
	ObjectRef       string    `json:"object_ref"`
	EncryptionKeyID string    `json:"encryption_key_id,omitempty"`
	ArchiveHash     string    `json:"archive_hash"`
	ArchiveVersion  string    `json:"archive_version"`
	CreatedAt       time.Time `json:"created_at"`
}
