package services

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"
	"zord-evidence/models"
	"zord-evidence/repositories"
	"zord-evidence/storage"
	"zord-evidence/utils"

	"github.com/google/uuid"
)

type EvidenceService struct {
	repo                *repositories.EvidenceRepository
	s3                  storage.S3Store
	signer              *Signer
	archiveCrypto       *ArchiveCrypto
	archivePrefix       string
	replayCompareStrict bool
}

func NewEvidenceService(repo *repositories.EvidenceRepository, s3 storage.S3Store, signer *Signer, archiveCrypto *ArchiveCrypto, archivePrefix string, strict bool) *EvidenceService {
	return &EvidenceService{
		repo:                repo,
		s3:                  s3,
		signer:              signer,
		archiveCrypto:       archiveCrypto,
		archivePrefix:       archivePrefix,
		replayCompareStrict: strict,
	}
}

func (s *EvidenceService) GeneratePack(ctx context.Context, req models.GenerateEvidenceRequest) (*models.EvidencePack, error) {
	if strings.TrimSpace(req.TenantID) == "" || strings.TrimSpace(req.IntentID) == "" || strings.TrimSpace(req.ContractID) == "" {
		return nil, fmt.Errorf("tenant_id, intent_id, and contract_id are required")
	}
	if strings.TrimSpace(req.SchemaVersions["intent_schema"]) == "" || strings.TrimSpace(req.SchemaVersions["outcome_schema"]) == "" || strings.TrimSpace(req.SchemaVersions["contract_schema"]) == "" {
		return nil, fmt.Errorf("schema_versions.intent_schema, outcome_schema and contract_schema are required")
	}

	now := time.Now().UTC()
	packID := uuid.NewString()

	items := make([]models.EvidenceItem, 0, 16)
	items = append(items, models.EvidenceItem{Type: "RAW_INGRESS_ENVELOPE_REF", Ref: req.Inputs.RawIngressEnvelopeRef, SchemaVersion: "v1"})
	items = append(items, models.EvidenceItem{Type: "CANONICAL_INTENT_SNAPSHOT", Ref: req.Inputs.CanonicalIntentSnapshot.Ref, Hash: req.Inputs.CanonicalIntentSnapshot.Hash, SchemaVersion: req.SchemaVersions["intent_schema"]})

	for _, ref := range req.Inputs.RawOutcomeEnvelopeRefs {
		items = append(items, models.EvidenceItem{Type: "RAW_OUTCOME_ENVELOPE_REF", Ref: ref, SchemaVersion: "v1"})
	}
	for _, evt := range req.Inputs.OutcomeEvents {
		items = append(items, models.EvidenceItem{Type: "OUTCOME_EVENT", Ref: evt.Ref, Hash: evt.Hash, SchemaVersion: req.SchemaVersions["outcome_schema"]})
	}

	items = append(items,
		models.EvidenceItem{Type: "FUSION_DECISION", Ref: req.Inputs.FusionDecision.Ref, Hash: req.Inputs.FusionDecision.Hash, SchemaVersion: "v1"},
		models.EvidenceItem{Type: "FINALITY_CERTIFICATE", Ref: req.Inputs.FinalityCertificate.Ref, Hash: req.Inputs.FinalityCertificate.Hash, SchemaVersion: "v1"},
		models.EvidenceItem{Type: "FINAL_CONTRACT", Ref: req.Inputs.FinalContract.Ref, Hash: req.Inputs.FinalContract.Hash, SchemaVersion: req.SchemaVersions["contract_schema"]},
	)
	if req.Inputs.CanonicalOutputCheck != nil {
		items = append(items, models.EvidenceItem{Type: "CANONICAL_OUTPUT_CHECK", Ref: req.Inputs.CanonicalOutputCheck.Ref, Hash: req.Inputs.CanonicalOutputCheck.Hash, SchemaVersion: "v1"})
	}
	for _, ref := range req.Inputs.PolicyDecisionRefs {
		items = append(items, models.EvidenceItem{Type: "POLICY_DECISION_REF", Ref: ref, SchemaVersion: "v1"})
	}
	for _, it := range req.Inputs.AdditionalItems {
		items = append(items, models.EvidenceItem{Type: it.Type, Ref: it.Ref, Hash: it.Hash, SchemaVersion: "v1"})
	}

	leaves := make([]utils.MerkleLeaf, 0, len(items))
	for i := range items {
		stableHash := strings.TrimSpace(items[i].Hash)
		leafInput := strings.Join([]string{items[i].Type, items[i].Ref, stableHash, items[i].SchemaVersion}, "||")
		items[i].LeafHash = utils.SHA256Hex(leafInput)
		leaves = append(leaves, utils.MerkleLeaf{Index: i, LeafHash: items[i].LeafHash})
	}
	merkleRoot := utils.BuildMerkleRoot(leaves)

	signPayload := strings.Join([]string{packID, merkleRoot, req.IntentID, req.ContractID, now.Format(time.RFC3339Nano), req.RulesetVersion}, "|")
	sig := s.signer.Sign(signPayload)

	pack := &models.EvidencePack{
		EvidencePackID: packID,
		TenantID:       req.TenantID,
		IntentID:       req.IntentID,
		ContractID:     req.ContractID,
		Items:          items,
		MerkleRoot:     merkleRoot,
		RulesetVersion: req.RulesetVersion,
		SchemaVersions: req.SchemaVersions,
		Signatures: []models.Signature{{
			Signer:   "zord_evidence",
			Alg:      "ed25519",
			Sig:      sig,
			SignedAt: now,
		}},
		CreatedAt: now,
	}

	archive, err := json.Marshal(pack)
	if err != nil {
		return nil, fmt.Errorf("marshal evidence pack: %w", err)
	}
	encryptedArchive, err := s.archiveCrypto.Encrypt(archive)
	if err != nil {
		return nil, fmt.Errorf("encrypt evidence archive: %w", err)
	}
	objectKey := fmt.Sprintf("%s/%s/%s/%s.json", s.archivePrefix, req.TenantID, req.ContractID, packID)
	objectRef, err := s.s3.PutObject(ctx, objectKey, encryptedArchive)
	if err != nil {
		return nil, fmt.Errorf("store archive: %w", err)
	}

	if err := s.repo.SavePack(ctx, pack, objectRef); err != nil {
		return nil, fmt.Errorf("save pack metadata: %w", err)
	}
	return pack, nil
}

func (s *EvidenceService) GetPack(ctx context.Context, packID string) (*models.EvidencePack, error) {
	pack, _, err := s.repo.GetPackByID(ctx, packID)
	if err != nil {
		return nil, err
	}
	return pack, nil
}

func (s *EvidenceService) ReplayPack(ctx context.Context, req models.ReplayRequest) (*models.ReplayResponse, error) {
	oldPack, err := s.GetPack(ctx, req.OriginalPackID)
	if err != nil {
		return nil, fmt.Errorf("fetch original pack: %w", err)
	}

	newPack, err := s.GeneratePack(ctx, models.GenerateEvidenceRequest{
		TenantID:       req.TenantID,
		IntentID:       req.IntentID,
		ContractID:     req.ContractID,
		RulesetVersion: req.RulesetVersion,
		SchemaVersions: req.SchemaVersions,
		Inputs:         req.DeterministicRef,
	})
	if err != nil {
		return nil, err
	}

	equivalent := oldPack.MerkleRoot == newPack.MerkleRoot
	explanation := "same-root"
	comparison := "strict-root-match"
	if !equivalent {
		explanation = "merkle-root-different: either inputs changed or version pins changed"
		if !s.replayCompareStrict {
			comparison = "loose-mode-enabled"
		}
	}

	return &models.ReplayResponse{
		NewPackID:        newPack.EvidencePackID,
		Equivalent:       equivalent,
		OldMerkleRoot:    oldPack.MerkleRoot,
		NewMerkleRoot:    newPack.MerkleRoot,
		Explanation:      explanation,
		RulesetVersion:   req.RulesetVersion,
		ReplayComparison: comparison,
	}, nil
}

func (s *EvidenceService) GetPackView(ctx context.Context, packID, viewType string) (*models.EvidenceViewResponse, error) {
	pack, err := s.GetPack(ctx, packID)
	if err != nil {
		return nil, err
	}

	view := strings.ToLower(strings.TrimSpace(viewType))
	supported := []string{"merchant", "psp", "bank", "nbfc"}
	if !slices.Contains(supported, view) {
		return nil, fmt.Errorf("unsupported view_type %q", viewType)
	}

	itemRefs := make([]string, 0, len(pack.Items))
	outcomeCount := 0
	for _, it := range pack.Items {
		itemRefs = append(itemRefs, fmt.Sprintf("%s:%s", it.Type, it.Ref))
		if it.Type == "OUTCOME_EVENT" {
			outcomeCount++
		}
	}

	highlights := map[string]any{
		"outcome_event_count": outcomeCount,
		"signature_alg":       pack.Signatures[0].Alg,
		"item_refs":           itemRefs,
	}
	switch view {
	case "merchant":
		highlights["focus"] = "final status, reasons, and downloadable evidence artifacts"
	case "psp":
		highlights["focus"] = "full event timeline and webhook/connector correlation traces"
	case "bank":
		highlights["focus"] = "finality proof, merkle root, and signature verification"
	case "nbfc":
		highlights["focus"] = "ledger-truth projection and contract-linked event timeline"
	}

	return &models.EvidenceViewResponse{
		ViewType:       view,
		EvidencePackID: pack.EvidencePackID,
		TenantID:       pack.TenantID,
		IntentID:       pack.IntentID,
		ContractID:     pack.ContractID,
		MerkleRoot:     pack.MerkleRoot,
		RulesetVersion: pack.RulesetVersion,
		CreatedAt:      pack.CreatedAt,
		Highlights:     highlights,
	}, nil
}
