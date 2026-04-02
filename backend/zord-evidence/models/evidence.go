package models

import "time"

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

type EvidencePack struct {
	EvidencePackID string            `json:"evidence_pack_id"`
	TenantID       string            `json:"tenant_id"`
	IntentID       string            `json:"intent_id"`
	ContractID     string            `json:"contract_id"`
	Items          []EvidenceItem    `json:"items"`
	MerkleRoot     string            `json:"merkle_root"`
	RulesetVersion string            `json:"ruleset_version"`
	SchemaVersions map[string]string `json:"schema_versions"`
	Signatures     []Signature       `json:"signatures"`
	CreatedAt      time.Time         `json:"created_at"`
}

type GenerateEvidenceRequest struct {
	TenantID       string            `json:"tenant_id" binding:"required"`
	IntentID       string            `json:"intent_id" binding:"required"`
	ContractID     string            `json:"contract_id" binding:"required"`
	RulesetVersion string            `json:"ruleset_version" binding:"required"`
	SchemaVersions map[string]string `json:"schema_versions" binding:"required"`
	Inputs         GenerateInputs    `json:"inputs" binding:"required"`
}

type GenerateInputs struct {
	RawIngressEnvelopeRef   string              `json:"raw_ingress_envelope_ref" binding:"required"`
	CanonicalIntentSnapshot RefWithHash         `json:"canonical_intent_snapshot" binding:"required"`
	RawOutcomeEnvelopeRefs  []string            `json:"raw_outcome_envelope_refs"`
	OutcomeEvents           []RefWithHash       `json:"outcome_events"`
	FusionDecision          RefWithHash         `json:"fusion_decision" binding:"required"`
	FinalityCertificate     RefWithHash         `json:"finality_certificate" binding:"required"`
	FinalContract           RefWithHash         `json:"final_contract" binding:"required"`
	CanonicalOutputCheck    *RefWithHash        `json:"canonical_output_check,omitempty"`
	PolicyDecisionRefs      []string            `json:"policy_decision_refs,omitempty"`
	AdditionalItems         []AdditionalItemRef `json:"additional_items,omitempty"`
}

type RefWithHash struct {
	Ref  string `json:"ref" binding:"required"`
	Hash string `json:"hash" binding:"required"`
}

type AdditionalItemRef struct {
	Type string `json:"type" binding:"required"`
	Ref  string `json:"ref" binding:"required"`
	Hash string `json:"hash,omitempty"`
}

type ReplayRequest struct {
	TenantID         string            `json:"tenant_id" binding:"required"`
	IntentID         string            `json:"intent_id" binding:"required"`
	ContractID       string            `json:"contract_id" binding:"required"`
	RulesetVersion   string            `json:"ruleset_version" binding:"required"`
	MappingVersions  map[string]string `json:"mapping_versions" binding:"required"`
	SchemaVersions   map[string]string `json:"schema_versions" binding:"required"`
	OriginalPackID   string            `json:"original_pack_id" binding:"required"`
	DeterministicRef GenerateInputs    `json:"deterministic_ref" binding:"required"`
}

type ReplayResponse struct {
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
	MerkleRoot     string         `json:"merkle_root"`
	RulesetVersion string         `json:"ruleset_version"`
	CreatedAt      time.Time      `json:"created_at"`
	Highlights     map[string]any `json:"highlights"`
}
