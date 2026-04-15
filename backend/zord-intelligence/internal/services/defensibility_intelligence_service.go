package services

// defensibility_intelligence_service.go
//
// Implements spec Section 10.3 — Evidence & Defensibility Intelligence.
//
// WHAT THIS SERVICE DOES:
// Reads the defensibility.summary projection (maintained by
// AtomicRecordGovernanceCoverage and AtomicIncrementDefensibilityIntent)
// and produces a materialised DEFENSIBILITY snapshot.
//
// KEY PRINCIPLE: Defensibility is kept DETERMINISTIC.
// The spec says: "This should stay mostly deterministic because defensibility
// is too important to hide behind model opacity."
//
// SCORING RUBRIC (spec §10.3):
//   pack exists?                  +20
//   governance decision present?  +15
//   attachment decision present?  +15  (tracked via ambiguity projection)
//   replay equivalence?           +10
//   KYC checked?                  +10  (part of +10 governance check)
//   AML checked?                  +10
//   supporting carriers OK?       +10  (derived from ambiguity — low missing rate)
//   Total possible:               100  (we use audit_ready_pct as proxy)
//
// TIER assignment (from score):
//   STRONG:   >= 85
//   GOOD:     >= 70
//   WEAK:     >= 50
//   FRAGILE:  < 50

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// DefensibilityIntelligenceService computes DEFENSIBILITY snapshots.
type DefensibilityIntelligenceService struct {
	projRepo      *persistence.ProjectionRepo
	snapshotRepo  *persistence.IntelligenceSnapshotRepo
	batchRepo     *persistence.BatchContractRepo
}

// NewDefensibilityIntelligenceService creates a DefensibilityIntelligenceService.
func NewDefensibilityIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	batchRepo *persistence.BatchContractRepo,
) *DefensibilityIntelligenceService {
	return &DefensibilityIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		batchRepo:    batchRepo,
	}
}

// DefensibilitySnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = DEFENSIBILITY.
type DefensibilitySnapshot struct {
	// ── Headline rates ────────────────────────────────────────────────────
	AuditReadyPct        float64 `json:"audit_ready_pct"`        // spec: "audit-ready percentage"
	DisputeReadyPct      float64 `json:"dispute_ready_pct"`      // spec: "dispute-ready percentage"
	GovernanceCoveragePct float64 `json:"governance_coverage_pct"` // what % have governance decisions
	EvidencePackRate     float64 `json:"evidence_pack_rate"`     // what % have evidence packs
	ReplayabilityPct     float64 `json:"replayability_pct"`      // what % are replay-equivalent

	// ── Counts ───────────────────────────────────────────────────────────
	TotalIntents            int `json:"total_intents"`
	WithEvidencePack        int `json:"with_evidence_pack"`
	WithGovernanceDecision  int `json:"with_governance_decision"`
	WithReplayEquivalence   int `json:"with_replay_equivalence"`
	WithKYCChecked          int `json:"with_kyc_checked"`
	WithAMLChecked          int `json:"with_aml_checked"`

	// ── Governance outcome breakdown ─────────────────────────────────────
	GovernanceApprovedCount  int `json:"governance_approved_count"`
	GovernanceRejectedCount  int `json:"governance_rejected_count"`  // compliance risk flag
	GovernanceEscalatedCount int `json:"governance_escalated_count"`

	// ── Composite defensibility score (0–100) ────────────────────────────
	// Computed from the rubric in spec §10.3.
	DefensibilityScore float64 `json:"defensibility_score"`

	// ── Tier ─────────────────────────────────────────────────────────────
	DefensibilityTier string `json:"defensibility_tier"` // STRONG | GOOD | WEAK | FRAGILE

	// ── Weakest cohort ────────────────────────────────────────────────────
	WeakestProofRef string `json:"weakest_proof_ref,omitempty"`

	// ── Compliance alerts ─────────────────────────────────────────────────
	// Non-empty when governance_rejected > 0 or compliance risk is high.
	ComplianceAlert string `json:"compliance_alert,omitempty"`

	// ── Recommended action ────────────────────────────────────────────────
	RecommendedAction string `json:"recommended_action,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

// ComputeAndSave builds a DEFENSIBILITY snapshot and persists it.
//
// Called after every GovernanceDecisionCreatedEvent and EvidencePackReadyEvent.
// Also updates defensibility_tier on the batch_contracts row when a batchID
// is supplied (i.e. when the governance decision is batch-scoped).
func (s *DefensibilityIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID string,
	batchID string, // empty when event is not batch-scoped
	windowStart, windowEnd time.Time,
) error {
	// Step 1: read current defensibility projection
	def, err := s.projRepo.GetDefensibilitySummary(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("defensibility_svc.ComputeAndSave GetDefensibilitySummary tenant=%s: %w",
			tenantID, err)
	}
	if def == nil || def.TotalIntents == 0 {
		return nil
	}

	// Step 2: build snapshot
	snap := s.buildSnapshot(def)

	// Step 3: persist snapshot
	projRefs := []string{"defensibility.summary"}
	projRefsJSON, _ := json.Marshal(projRefs)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("defensibility_svc.ComputeAndSave marshal tenant=%s: %w", tenantID, err)
	}

	snapID := "snap_" + uuid.New().String()
	modelVer := "deterministic_v1"
	if err := s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "DEFENSIBILITY",
		ScopeType:          "TENANT",
		ScopeRef:           nil,
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("defensibility_svc.ComputeAndSave Create snapshot tenant=%s: %w",
			tenantID, err)
	}

	// Step 4: if batch-scoped, update the defensibility_tier on batch_contracts
	// This lets GET /v1/intelligence/batches/{id} return the correct tier
	// without needing to join intelligence_snapshots.
	if batchID != "" {
		if err := s.batchRepo.SetDefensibilityTier(ctx, batchID, snap.DefensibilityTier); err != nil {
			// Non-fatal — the snapshot was already written
			return fmt.Errorf("defensibility_svc: SetDefensibilityTier batch=%s: %w", batchID, err)
		}
	}

	return nil
}

// buildSnapshot converts a DefensibilityValue projection into a full snapshot.
func (s *DefensibilityIntelligenceService) buildSnapshot(dv *models.DefensibilityValue) DefensibilitySnapshot {
	snap := DefensibilitySnapshot{
		AuditReadyPct:            dv.AuditReadyPct,
		DisputeReadyPct:          dv.DisputeReadyPct,
		GovernanceCoveragePct:    dv.GovernanceCoveragePct,
		EvidencePackRate:         dv.EvidencePackRate,
		ReplayabilityPct:         dv.ReplayabilityPct,
		TotalIntents:             dv.TotalIntents,
		WithEvidencePack:         dv.WithEvidencePack,
		WithGovernanceDecision:   dv.WithGovernanceDecision,
		WithReplayEquivalence:    dv.WithReplayEquivalence,
		WithKYCChecked:           dv.WithKYCChecked,
		WithAMLChecked:           dv.WithAMLChecked,
		GovernanceApprovedCount:  dv.GovernanceApprovedCount,
		GovernanceRejectedCount:  dv.GovernanceRejectedCount,
		GovernanceEscalatedCount: dv.GovernanceEscalatedCount,
		WeakestProofRef:          dv.WeakestProofRef,
		ComputedAt:               time.Now().UTC(),
	}

	// Compute defensibility score from the spec rubric (total = 100 points)
	snap.DefensibilityScore = s.computeScore(dv)
	snap.DefensibilityTier = defensibilityTier(snap.DefensibilityScore)
	snap.RecommendedAction = s.recommendedAction(dv)

	if dv.GovernanceRejectedCount > 0 {
		snap.ComplianceAlert = fmt.Sprintf(
			"%d governance decisions were REJECTED — compliance review required",
			dv.GovernanceRejectedCount,
		)
	}

	return snap
}

// computeScore applies the spec §10.3 scoring rubric.
// Returns a score 0–100.
func (s *DefensibilityIntelligenceService) computeScore(dv *models.DefensibilityValue) float64 {
	if dv.TotalIntents == 0 {
		return 0
	}
	n := float64(dv.TotalIntents)

	score := 0.0
	score += (float64(dv.WithEvidencePack) / n) * 20        // pack exists? +20
	score += (float64(dv.WithGovernanceDecision) / n) * 15  // governance present? +15
	score += (float64(dv.WithReplayEquivalence) / n) * 10   // replay equivalent? +10
	score += (float64(dv.WithKYCChecked) / n) * 10          // KYC checked? (part of governance +10)
	score += (float64(dv.WithAMLChecked) / n) * 10          // AML checked? +10
	// Remaining 35 points come from attachment/carrier quality (tracked via ambiguity projection).
	// We approximate by using governance_approved_count as a proxy for full coverage.
	score += (float64(dv.GovernanceApprovedCount) / n) * 35

	if score > 100 {
		score = 100
	}
	return score
}

// defensibilityTier maps a score to a tier.
func defensibilityTier(score float64) string {
	switch {
	case score >= 85:
		return "STRONG"
	case score >= 70:
		return "GOOD"
	case score >= 50:
		return "WEAK"
	default:
		return "FRAGILE"
	}
}

func (s *DefensibilityIntelligenceService) recommendedAction(dv *models.DefensibilityValue) string {
	if dv.TotalIntents == 0 {
		return ""
	}
	// If fewer than 70% of intents have governance coverage, regenerate evidence
	if dv.GovernanceCoveragePct < 0.70 {
		return "REGENERATE_EVIDENCE: governance decision coverage below 70% — rebuild evidence packs"
	}
	// If fewer than 80% have evidence packs, escalate
	if dv.EvidencePackRate < 0.80 {
		return "ESCALATE: evidence pack rate below 80% — audit-readiness at risk"
	}
	if dv.GovernanceRejectedCount > 0 {
		return "ESCALATE: governance rejections detected — compliance team review required"
	}
	return ""
}
