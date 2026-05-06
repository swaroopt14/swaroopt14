package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"slices"
	"strings"
	"time"
	"zord-evidence/kafka"
	"zord-evidence/models"
	"zord-evidence/repositories"
	"zord-evidence/storage"
	"zord-evidence/utils"

	"github.com/google/uuid"
)

// validModes are the three lifecycle operating modes defined in spec §3.2
var validModes = []string{"INTELLIGENCE_ATTACH", "SECONDARY_DISPATCH", "FULL_CONTROL"}

type EvidenceService struct {
	repo                *repositories.EvidenceRepository
	pendingLeafRepo     repositories.PendingLeafRepository
	s3                  storage.S3Store
	signer              *Signer
	archiveCrypto       *ArchiveCrypto
	archivePrefix       string
	replayCompareStrict bool
	publisher           kafka.EventPublisher
}

func NewEvidenceService(
	repo *repositories.EvidenceRepository,
	pendingLeafRepo repositories.PendingLeafRepository,
	s3 storage.S3Store,
	signer *Signer,
	archiveCrypto *ArchiveCrypto,
	archivePrefix string,
	strict bool,
	publisher kafka.EventPublisher,
) *EvidenceService {
	return &EvidenceService{
		repo:                repo,
		pendingLeafRepo:     pendingLeafRepo,
		s3:                  s3,
		signer:              signer,
		archiveCrypto:       archiveCrypto,
		archivePrefix:       archivePrefix,
		replayCompareStrict: strict,
		publisher:           publisher,
	}
}

// HandleLeafUpdate orchestrates the buffered leaf ingestion and pack generation.
func (s *EvidenceService) HandleLeafUpdate(ctx context.Context, tenantID, envelopeID, intentID, contractID string, newLeaves []models.PendingLeafCandidate) error {
	// 0. If intentID is missing but envelopeID is present, try to resolve it from existing leaves
	if intentID == "" && envelopeID != "" {
		resolved, err := s.pendingLeafRepo.ResolveIntentID(ctx, tenantID, envelopeID)
		if err != nil {
			log.Printf("evidence.service.resolve_intent_failed env=%s err=%v", envelopeID, err)
		} else if resolved != "" {
			intentID = resolved
			// Update the new leaves to have the resolved intentID
			for i := range newLeaves {
				newLeaves[i].IntentID = &intentID
			}
		}
	}

	// 1. Link envelope if intentID is present
	if intentID != "" && envelopeID != "" {
		if err := s.pendingLeafRepo.LinkEnvelopeToIntent(ctx, tenantID, envelopeID, intentID, contractID); err != nil {
			return err
		}
	}

	// 2. Upsert new leaves
	for i := range newLeaves {
		if err := s.pendingLeafRepo.UpsertLeaf(ctx, &newLeaves[i]); err != nil {
			return err
		}
	}

	// 3. Check readiness if we have an intentID
	if intentID == "" {
		return nil
	}

	leaves, err := s.pendingLeafRepo.GetLeavesForIntent(ctx, tenantID, intentID)
	if err != nil {
		return err
	}

	// 4. Map leaf types to items
	leafMap := make(map[string]models.PendingLeafCandidate)
	for _, l := range leaves {
		leafMap[l.LeafType] = l
	}

	// 5. Check if all 8 required external leaves are present
	allPresent := true
	var items []models.EvidenceItem
	var missing []string
	for _, requiredType := range models.RequiredLeafTypes {
		if l, ok := leafMap[requiredType]; ok {
			items = append(items, models.EvidenceItem{
				Type:          l.LeafType,
				Ref:           l.ItemRef,
				Hash:          l.Hash,
				SchemaVersion: l.SchemaVersion,
			})
		} else if requiredType == models.LeafTypeVarianceDecision {
			// Special case: VARIANCE_DECISION is required but can be synthesized if missing
			items = append(items, models.EvidenceItem{
				Type:          models.LeafTypeVarianceDecision,
				Ref:           intentID, // Fallback to intentID if missing
				Hash:          models.ZeroVarianceHash,
				SchemaVersion: "v1",
			})
			log.Printf("evidence.service.readiness_check intent=%s VARIANCE_DECISION missing — using ZeroVarianceHash", intentID)
		} else {
			allPresent = false
			missing = append(missing, requiredType)
		}
	}

	if !allPresent {
		log.Printf("evidence.service.readiness_check intent=%s missing_leaves=%v present_count=%d", intentID, missing, len(items))
		return nil // Not ready yet
	}

	// 5b. Resolve contractID from buffered leaves if missing in argument
	if contractID == "" {
		for _, l := range leaves {
			if l.ContractID != nil && *l.ContractID != "" {
				contractID = *l.ContractID
				break
			}
		}
	}

	log.Printf("evidence.service.readiness_check intent=%s ALL_LEAVES_PRESENT — triggering generation", intentID)

	// 6. Generate the pack!
	req := models.GenerateEvidenceRequest{
		TenantID:       tenantID,
		IntentID:       intentID,
		ContractID:     contractID,
		Mode:           "INTELLIGENCE_ATTACH",
		RulesetVersion: "v1",
		SchemaVersions: map[string]string{"v1": "v1"},
		Items:          items,
	}

	_, err = s.GeneratePack(ctx, req)
	if err != nil {
		return fmt.Errorf("generate pack from buffered leaves: %w", err)
	}

	// 7. Cleanup
	return s.pendingLeafRepo.DeleteForIntent(ctx, tenantID, intentID)
}

// GeneratePack is the core of Service 6 (spec §13 steps 1–11).
// evidence_pack_id is generated only here. All other IDs come from upstream.
func (s *EvidenceService) GeneratePack(ctx context.Context, req models.GenerateEvidenceRequest) (*models.EvidencePack, error) {
	// --- Step 2: validate scope ---
	if strings.TrimSpace(req.TenantID) == "" || strings.TrimSpace(req.IntentID) == "" {
		return nil, fmt.Errorf("tenant_id and intent_id are required")
	}
	if !slices.Contains(validModes, req.Mode) {
		return nil, fmt.Errorf("mode must be one of: %s", strings.Join(validModes, ", "))
	}
	if len(req.Items) == 0 {
		return nil, fmt.Errorf("at least one evidence item is required")
	}

	now := time.Now().UTC()

	// --- Step (uuid): generate evidence_pack_id exclusively in this service ---
	packID := "ep_" + uuid.NewString()

	// --- Steps 5–6: compute typed leaf hashes, sort deterministically ---
	items := req.Items
	leaves := make([]utils.MerkleLeaf, 0, len(items)+1)
	for i := range items {
		// Spec §11.1: leaf_hash = SHA256(type || stable_ref || item_hash || version)
		stableHash := strings.TrimSpace(items[i].Hash)
		leafInput := strings.Join([]string{items[i].Type, items[i].Ref, stableHash, items[i].SchemaVersion}, "||")
		items[i].LeafHash = utils.SHA256Hex(leafInput)
		leaves = append(leaves, utils.MerkleLeaf{Index: i, LeafHash: items[i].LeafHash})
	}

	// --- Step 7: build Interim Merkle tree ---
	interimMerkleRoot := utils.BuildMerkleRoot(leaves)

	// --- Step 7.5: Auto-append FINAL_EVIDENCE_VIEW ---
	// Hash = SHA256(evidence_pack_id | interim_merkle_root)
	leafAutoInput := packID + "|" + interimMerkleRoot
	leafAutoHash := utils.SHA256Hex(leafAutoInput)
	
	leafAuto := models.EvidenceItem{
		Type:          models.LeafTypeFinalEvidenceView,
		Ref:           packID,
		Hash:          leafAutoHash,
		SchemaVersion: "v1",
	}
	
	// Final leaf hash for auto-added leaf
	leafAutoFinalInput := strings.Join([]string{leafAuto.Type, leafAuto.Ref, leafAuto.Hash, leafAuto.SchemaVersion}, "||")
	leafAuto.LeafHash = utils.SHA256Hex(leafAutoFinalInput)
	
	items = append(items, leafAuto)
	leaves = append(leaves, utils.MerkleLeaf{Index: len(items) - 1, LeafHash: leafAuto.LeafHash})

	// --- Step 8: build Final Merkle tree ---
	merkleRoot := utils.BuildMerkleRoot(leaves)

	// --- Step 9: sign the pack commitment ---
	// Spec §9.10: signature binds evidence_pack_id, merkle_root, intent_id, contract_id, created_at, ruleset_version
	signPayload := strings.Join([]string{
		packID, merkleRoot, req.IntentID, req.ContractID, now.Format(time.RFC3339Nano), req.RulesetVersion,
	}, "|")
	sig := s.signer.Sign(signPayload)

	pack := &models.EvidencePack{
		EvidencePackID:   packID,
		TenantID:         req.TenantID,
		IntentID:         req.IntentID,
		ContractID:       req.ContractID,
		Mode:             req.Mode,
		PackStatus:       "ACTIVE",
		Items:            items,
		MerkleRoot:       merkleRoot,
		RulesetVersion:   req.RulesetVersion,
		SchemaVersions:   req.SchemaVersions,
		SupersedesPackID: req.SupersedesPackID,
		Signatures: []models.Signature{{
			Signer:   "zord_evidence",
			Alg:      "ed25519",
			Sig:      sig,
			SignedAt: now,
		}},
		CreatedAt: now,
	}

	// --- Step 10a: encrypt and store archive body (§14.3 / §15.2) ---
	archive, err := json.Marshal(pack)
	if err != nil {
		return nil, fmt.Errorf("marshal evidence pack: %w", err)
	}
	encryptedArchive, err := s.archiveCrypto.Encrypt(archive)
	if err != nil {
		return nil, fmt.Errorf("encrypt evidence archive: %w", err)
	}

	// Object key uses intent_id as primary path anchor (contract_id may be absent in pivot mode)
	anchorID := req.IntentID
	if req.ContractID != "" {
		anchorID = req.ContractID
	}
	objectKey := fmt.Sprintf("%s/%s/%s/%s.json.enc", s.archivePrefix, req.TenantID, anchorID, packID)
	objectRef, err := s.s3.PutObject(ctx, objectKey, encryptedArchive)
	if err != nil {
		return nil, fmt.Errorf("store archive: %w", err)
	}

	// --- Step 10b: persist metadata to Postgres ---
	log.Printf("evidence.service.generate_pack saving metadata pack=%s intent=%s items=%d", packID, req.IntentID, len(items))
	if err := s.repo.SavePack(ctx, pack, objectRef); err != nil {
		log.Printf("evidence.service.generate_pack save_failed pack=%s err=%v", packID, err)
		return nil, fmt.Errorf("save pack metadata: %w", err)
	}
	log.Printf("evidence.service.generate_pack save_ok pack=%s", packID)

	// --- Persist §14.3 archive metadata row ---
	archiveHash := sha256Hex(encryptedArchive)
	archiveRecord := &models.EvidenceArchive{
		ArchiveID:      "arc_" + uuid.NewString(),
		EvidencePackID: packID,
		TenantID:       req.TenantID,
		ObjectRef:      objectRef,
		ArchiveHash:    archiveHash,
		ArchiveVersion: "v1",
		CreatedAt:      now,
	}
	if err := s.repo.SaveArchive(ctx, archiveRecord); err != nil {
		// Non-fatal: metadata only, pack is already committed
		fmt.Printf("warn: save archive record failed: %v\n", err)
	}

	// --- Persist §14.4 inclusion proofs ---
	proofPaths := utils.BuildInclusionProofs(leaves)
	inclusionProofs := make([]models.InclusionProof, 0, len(leaves))
	for _, leaf := range leaves {
		inclusionProofs = append(inclusionProofs, models.InclusionProof{
			EvidencePackID: packID,
			LeafHash:       leaf.LeafHash,
			ProofPath:      proofPaths[leaf.LeafHash],
			CreatedAt:      now,
		})
	}
	if err := s.repo.SaveInclusionProofs(ctx, packID, inclusionProofs); err != nil {
		fmt.Printf("warn: save inclusion proofs failed: %v\n", err)
	}

	// --- Mark old pack superseded if this is a lifecycle version update (§23 Phase 5) ---
	if req.SupersedesPackID != "" {
		if err := s.repo.MarkPackSuperseded(ctx, req.SupersedesPackID, packID); err != nil {
			fmt.Printf("warn: mark superseded pack failed: %v\n", err)
		}
	}

	// --- Step 11: publish evidence.pack.created event ---
	eventType := kafka.EventPackCreated
	if req.SupersedesPackID != "" {
		eventType = kafka.EventPackReversalSupersed
	}
	_ = s.publisher.Publish(ctx, kafka.PackEvent{
		EventType:      eventType,
		EvidencePackID: packID,
		TenantID:       req.TenantID,
		IntentID:       req.IntentID,
		ContractID:     req.ContractID,
		Mode:           req.Mode,
		MerkleRoot:     merkleRoot,
		RulesetVersion: req.RulesetVersion,
		OccurredAt:     now,
	})

	return pack, nil
}

// GetPack fetches an evidence pack by ID.
func (s *EvidenceService) GetPack(ctx context.Context, packID string) (*models.EvidencePack, error) {
	pack, _, err := s.repo.GetPackByID(ctx, packID)
	if err != nil {
		return nil, err
	}
	return pack, nil
}

// ListPacksByIntentID returns all packs for a given intent (spec §17).
func (s *EvidenceService) ListPacksByIntentID(ctx context.Context, tenantID, intentID string) (*models.ListPacksResponse, error) {
	packs, err := s.repo.ListByIntentID(ctx, tenantID, intentID)
	if err != nil {
		return nil, err
	}
	return &models.ListPacksResponse{Packs: packs, Total: len(packs)}, nil
}

// GetInclusionProofs returns all Merkle inclusion proofs for a pack (§14.4).
func (s *EvidenceService) GetInclusionProofs(ctx context.Context, packID string) ([]models.InclusionProof, error) {
	return s.repo.GetInclusionProofs(ctx, packID)
}

// ReplayPack implements §17 replay: rebuild the pack and compare Merkle roots.
// A §14.5 replay job is created and tracked through PENDING → COMPLETED.
func (s *EvidenceService) ReplayPack(ctx context.Context, req models.ReplayRequest) (*models.ReplayResponse, error) {
	now := time.Now().UTC()
	jobID := "rj_" + uuid.NewString()

	// --- Create replay job in PENDING state ---
	job := &models.ReplayJob{
		ReplayJobID:          jobID,
		TenantID:             req.TenantID,
		SourceEvidencePackID: req.OriginalPackID,
		IntentID:             req.IntentID,
		ContractID:           req.ContractID,
		RulesetVersion:       req.RulesetVersion,
		MappingVersions:      req.MappingVersions,
		RequestedBy:          req.RequestedBy,
		Status:               "PENDING",
		CreatedAt:            now,
	}
	if err := s.repo.CreateReplayJob(ctx, job); err != nil {
		return nil, fmt.Errorf("create replay job: %w", err)
	}

	oldPack, err := s.GetPack(ctx, req.OriginalPackID)
	if err != nil {
		return nil, fmt.Errorf("fetch original pack: %w", err)
	}

	newPack, err := s.GeneratePack(ctx, models.GenerateEvidenceRequest{
		TenantID:       req.TenantID,
		IntentID:       req.IntentID,
		ContractID:     req.ContractID,
		Mode:           req.Mode,
		RulesetVersion: req.RulesetVersion,
		SchemaVersions: req.SchemaVersions,
		Items:          req.Items,
	})
	if err != nil {
		return nil, err
	}

	equivalent := oldPack.MerkleRoot == newPack.MerkleRoot
	explanation := "same-root: Merkle root reproduced exactly"
	comparison := "strict-root-match"
	diffSummary := map[string]any{}

	if !equivalent {
		explanation = "merkle-root-different: inputs, version pins, or artifact hashes have changed"
		diffSummary["old_root"] = oldPack.MerkleRoot
		diffSummary["new_root"] = newPack.MerkleRoot
		diffSummary["old_leaf_count"] = len(oldPack.Items)
		diffSummary["new_leaf_count"] = len(newPack.Items)
		if !s.replayCompareStrict {
			comparison = "loose-mode-enabled"
		}
	}

	equivalenceResult := "EQUIVALENT"
	if !equivalent {
		equivalenceResult = "DIFFERENT"
	}

	// --- Complete the replay job ---
	_ = s.repo.CompleteReplayJob(ctx, jobID, newPack.EvidencePackID, equivalenceResult, diffSummary)

	// --- Publish evidence.pack.replayed event ---
	_ = s.publisher.Publish(ctx, kafka.PackEvent{
		EventType:      kafka.EventPackReplayed,
		EvidencePackID: newPack.EvidencePackID,
		TenantID:       req.TenantID,
		IntentID:       req.IntentID,
		ContractID:     req.ContractID,
		Mode:           req.Mode,
		MerkleRoot:     newPack.MerkleRoot,
		RulesetVersion: req.RulesetVersion,
		OccurredAt:     time.Now().UTC(),
		Extra: map[string]any{
			"replay_job_id":     jobID,
			"equivalence_result": equivalenceResult,
			"original_pack_id":  req.OriginalPackID,
		},
	})

	return &models.ReplayResponse{
		ReplayJobID:      jobID,
		NewPackID:        newPack.EvidencePackID,
		Equivalent:       equivalent,
		OldMerkleRoot:    oldPack.MerkleRoot,
		NewMerkleRoot:    newPack.MerkleRoot,
		Explanation:      explanation,
		RulesetVersion:   req.RulesetVersion,
		ReplayComparison: comparison,
	}, nil
}

// GetPackView returns a role-specific projection of the canonical pack (spec §18).
// One canonical pack → many projections. Same underlying truth, different highlights.
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

	// Summarize leaf types for the view
	itemRefs := make([]string, 0, len(pack.Items))
	typeCount := map[string]int{}
	for _, it := range pack.Items {
		itemRefs = append(itemRefs, fmt.Sprintf("%s:%s", it.Type, it.Ref))
		typeCount[it.Type]++
	}

	highlights := map[string]any{
		"leaf_count":     len(pack.Items),
		"leaf_types":     typeCount,
		"signature_alg":  pack.Signatures[0].Alg,
		"mode":           pack.Mode,
		"pack_status":    pack.PackStatus,
		"item_refs":      itemRefs,
	}

	// §18 view-specific focus
	switch view {
	case "merchant":
		// §18.1: final status, settlement refs, failure reasons
		highlights["focus"] = "final status, attachment status, settlement refs, downloadable evidence artifacts"
		highlights["show"] = []string{"FINAL_EVIDENCE_VIEW", "ATTACHMENT_DECISION", "VARIANCE_DECISION", "CANONICAL_SETTLEMENT_OBSERVATION"}
	case "psp":
		// §18.2: event timeline, webhook correlation, mapping versions
		highlights["focus"] = "full event timeline, webhook/connector correlation traces, retry history, mapping profile versions"
		highlights["show"] = []string{"RAW_SETTLEMENT_ENVELOPE", "OUTCOME_SIGNAL", "CANONICAL_SETTLEMENT_OBSERVATION"}
	case "bank":
		// §18.3: finality proof, signature chain, PII tokenization proof
		highlights["focus"] = "finality proof, merkle root, signature verification, PII tokenized proof, deterministic replay"
		highlights["show"] = []string{"FINALITY_CERT", "FINAL_CONTRACT", "GOVERNANCE_DECISION_AT_CANONICAL"}
	case "nbfc":
		// §18.4: contract graph, ledger-truth projection
		highlights["focus"] = "contract graph, ledger-truth projection, disbursal-repayment-reversal chain"
		highlights["show"] = []string{"FINAL_CONTRACT", "CANONICAL_INTENT", "ATTACHMENT_DECISION"}
	}

	return &models.EvidenceViewResponse{
		ViewType:       view,
		EvidencePackID: pack.EvidencePackID,
		TenantID:       pack.TenantID,
		IntentID:       pack.IntentID,
		ContractID:     pack.ContractID,
		Mode:           pack.Mode,
		MerkleRoot:     pack.MerkleRoot,
		RulesetVersion: pack.RulesetVersion,
		CreatedAt:      pack.CreatedAt,
		Highlights:     highlights,
	}, nil
}

// sha256Hex is a local helper for non-text bytes (archive body hash).
func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}
