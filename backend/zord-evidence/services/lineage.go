package services

import (
	"fmt"
	"sort"
	"time"
	"zord-evidence/models"
)

// BuildTimeline converts the internal EvidencePack leaf set into the ordered
// human-readable operational milestones required by spec §5 Engine A.
// The timeline is derived entirely from pack.Items and pack.CreatedAt —
// no additional DB queries required.
func BuildTimeline(pack *models.EvidencePack) []models.TimelineEvent {
	events := make([]models.TimelineEvent, 0, len(pack.Items)+2)

	// Map leaf types to human-readable milestone descriptions.
	// We use pack.CreatedAt as anchor; each leaf gets a deterministic offset
	// so that the timeline is stable across repeated calls.
	baseTime := pack.CreatedAt

	leafEvents := map[string]string{
		models.LeafTypeRawSettlementFile:              "Bank settlement file received and fingerprint recorded",
		models.LeafTypeRawSettlementLine:              "Payment instruction received from ERP / originating system",
		models.LeafTypeCanonicalSettlementObservation: "Structured settlement record schema verified",
		models.LeafTypeCanonicalIntentHash:            "Canonical payment intent hash computed and anchored",
		models.LeafTypeEnvelopeHash:                   "File payload envelope securely hashed and recorded",
		models.LeafTypeAttachmentDecision:             "UTR reference auto-matched via reconciliation engine (Service 5)",
		models.LeafTypeVarianceDecision:               "Financial variance analysis completed",
		models.LeafTypeGovernanceDecision:             "Policy and compliance governance check passed (Service 2)",
		models.LeafTypeBatchAttachmentSummary:         "Batch attachment summary computed",
		models.LeafTypeBatchVarianceSummary:           "Batch variance summary computed",
		models.LeafTypeCanonicalBatch:                 "Canonical batch record anchored",
		models.LeafTypeFileContentHash:                "Raw file content hash verified",
		models.LeafTypeFinalEvidenceView:              "Immutable evidence pack successfully compiled and sealed",
	}

	// Determine a stable display order.
	leafOrder := map[string]int{
		models.LeafTypeRawSettlementFile:              0,
		models.LeafTypeRawSettlementLine:              1,
		models.LeafTypeEnvelopeHash:                   2,
		models.LeafTypeCanonicalSettlementObservation: 3,
		models.LeafTypeCanonicalIntentHash:            4,
		models.LeafTypeGovernanceDecision:             5,
		models.LeafTypeAttachmentDecision:             6,
		models.LeafTypeVarianceDecision:               7,
		models.LeafTypeBatchAttachmentSummary:         8,
		models.LeafTypeBatchVarianceSummary:           9,
		models.LeafTypeCanonicalBatch:                 10,
		models.LeafTypeFileContentHash:                11,
		models.LeafTypeFinalEvidenceView:              99,
	}

	type orderedItem struct {
		order int
		item  models.EvidenceItem
	}
	ordered := make([]orderedItem, 0, len(pack.Items))
	for _, item := range pack.Items {
		o := 50 // unknown leaf types land in the middle
		if v, ok := leafOrder[item.Type]; ok {
			o = v
		}
		ordered = append(ordered, orderedItem{order: o, item: item})
	}
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].order < ordered[j].order
	})

	// Assign a 1-second offset per position so timestamps are distinct and ordered.
	for i, oi := range ordered {
		label, ok := leafEvents[oi.item.Type]
		if !ok {
			label = fmt.Sprintf("Artifact recorded: %s", oi.item.Type)
		}
		events = append(events, models.TimelineEvent{
			Timestamp: baseTime.Add(-time.Duration(len(ordered)-i) * time.Second),
			Event:     label,
			NodeID:    oi.item.LeafHash,
		})
	}

	return events
}

// BuildLineageGraph constructs the auditor-facing Merkle DAG (spec §5 Engine B).
// Nodes represent pipeline stages; edges show data provenance direction.
func BuildLineageGraph(pack *models.EvidencePack) models.LineageGraph {
	nodes := make([]models.LineageNode, 0, len(pack.Items)+4)
	edges := make([]models.LineageEdge, 0, len(pack.Items)+4)

	// Node type labels — covers both single-intent and batch pack leaf types
	labelOf := map[string]string{
		models.LeafTypeRawSettlementLine:              "Original Payment File",
		models.LeafTypeCanonicalSettlementObservation: "Structured Payment Intent",
		models.LeafTypeGovernanceDecision:             "Governance Check",
		models.LeafTypeRawSettlementFile:              "Original Settlement File",
		models.LeafTypeAttachmentDecision:             "Match Decision",
		models.LeafTypeVarianceDecision:               "Variance Decision",
		models.LeafTypeCanonicalIntentHash:            "Canonical Intent",
		models.LeafTypeEnvelopeHash:                   "Envelope Hash",
		models.LeafTypeFinalEvidenceView:              "Evidence Summary",
		models.LeafTypeBatchAttachmentSummary:         "Batch Attachment Summary",
		models.LeafTypeBatchVarianceSummary:           "Batch Variance Summary",
		models.LeafTypeCanonicalBatch:                 "Canonical Batch",
		models.LeafTypeFileContentHash:                "File Content Hash",
	}

	nodeTypeOf := map[string]string{
		models.LeafTypeRawSettlementLine:              "SOURCE",
		models.LeafTypeRawSettlementFile:              "SOURCE",
		models.LeafTypeEnvelopeHash:                   "SOURCE",
		models.LeafTypeFileContentHash:                "SOURCE",
		models.LeafTypeCanonicalSettlementObservation: "TRANSFORM",
		models.LeafTypeCanonicalIntentHash:            "TRANSFORM",
		models.LeafTypeCanonicalBatch:                 "TRANSFORM",
		models.LeafTypeGovernanceDecision:             "DECISION",
		models.LeafTypeAttachmentDecision:             "DECISION",
		models.LeafTypeVarianceDecision:               "DECISION",
		models.LeafTypeBatchAttachmentSummary:         "DECISION",
		models.LeafTypeBatchVarianceSummary:           "DECISION",
		models.LeafTypeFinalEvidenceView:              "SEAL",
	}

	// Build one node per leaf.
	leafIDByType := make(map[string]string)
	for _, item := range pack.Items {
		nodeID := item.LeafHash
		leafIDByType[item.Type] = nodeID

		label, ok := labelOf[item.Type]
		if !ok {
			label = item.Type
		}
		nType, ok := nodeTypeOf[item.Type]
		if !ok {
			nType = "TRANSFORM"
		}

		nodes = append(nodes, models.LineageNode{
			ID:            nodeID,
			Label:         label,
			NodeType:      nType,
			LeafHash:      item.LeafHash,
			ItemRef:       item.Ref,
			SchemaVersion: item.SchemaVersion,
		})
	}

	// Proof root node (the Merkle root itself)
	rootNodeID := "merkle_root"
	nodes = append(nodes, models.LineageNode{
		ID:       rootNodeID,
		Label:    "Proof Root",
		NodeType: "SEAL",
		LeafHash: pack.MerkleRoot,
	})

	// Wire edges per the DAG spec §5 Engine B:
	// RAW_SETTLEMENT_LINE → CANONICAL_SETTLEMENT_OBSERVATION → GOVERNANCE_CHECK
	// RAW_SETTLEMENT_FILE  → MATCH_DECISION
	// CANONICAL_SETTLEMENT_OBSERVATION → MATCH_DECISION
	// GOVERNANCE_CHECK     → FINAL_EVIDENCE_VIEW
	// MATCH_DECISION       → FINAL_EVIDENCE_VIEW
	// FINAL_EVIDENCE_VIEW  → PROOF_ROOT

	maybeEdge := func(fromType, toType, label string) {
		from, fok := leafIDByType[fromType]
		to, tok := leafIDByType[toType]
		if fok && tok {
			edges = append(edges, models.LineageEdge{From: from, To: to, Label: label})
		}
	}

	// Single-intent pack edges
	maybeEdge(models.LeafTypeRawSettlementLine, models.LeafTypeCanonicalSettlementObservation, "canonicalise")
	maybeEdge(models.LeafTypeEnvelopeHash, models.LeafTypeCanonicalIntentHash, "hash intent")
	maybeEdge(models.LeafTypeCanonicalSettlementObservation, models.LeafTypeGovernanceDecision, "policy check")
	maybeEdge(models.LeafTypeCanonicalIntentHash, models.LeafTypeGovernanceDecision, "policy check")
	maybeEdge(models.LeafTypeRawSettlementFile, models.LeafTypeAttachmentDecision, "reconcile")
	maybeEdge(models.LeafTypeCanonicalSettlementObservation, models.LeafTypeAttachmentDecision, "reconcile")
	maybeEdge(models.LeafTypeGovernanceDecision, models.LeafTypeFinalEvidenceView, "")
	maybeEdge(models.LeafTypeAttachmentDecision, models.LeafTypeFinalEvidenceView, "")
	maybeEdge(models.LeafTypeVarianceDecision, models.LeafTypeFinalEvidenceView, "")
	// Batch pack edges
	maybeEdge(models.LeafTypeFileContentHash, models.LeafTypeCanonicalBatch, "canonicalise batch")
	maybeEdge(models.LeafTypeRawSettlementFile, models.LeafTypeCanonicalBatch, "canonicalise batch")
	maybeEdge(models.LeafTypeCanonicalBatch, models.LeafTypeBatchAttachmentSummary, "summarise")
	maybeEdge(models.LeafTypeCanonicalBatch, models.LeafTypeBatchVarianceSummary, "summarise")
	maybeEdge(models.LeafTypeBatchAttachmentSummary, models.LeafTypeFinalEvidenceView, "")
	maybeEdge(models.LeafTypeBatchVarianceSummary, models.LeafTypeFinalEvidenceView, "")

	// Every leaf feeds the proof root.
	if fev, ok := leafIDByType[models.LeafTypeFinalEvidenceView]; ok {
		edges = append(edges, models.LineageEdge{From: fev, To: rootNodeID, Label: "seal"})
	}

	return models.LineageGraph{
		EvidencePackID: pack.EvidencePackID,
		TenantID:       pack.TenantID,
		IntentID:       pack.IntentID,
		MerkleRoot:     pack.MerkleRoot,
		Nodes:          nodes,
		Edges:          edges,
	}
}
