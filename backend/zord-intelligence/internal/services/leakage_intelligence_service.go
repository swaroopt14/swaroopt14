package services

// leakage_intelligence_service.go
//
// Implements spec Section 10.1 — Leakage & Value-at-Risk Intelligence.
//
// WHAT THIS SERVICE DOES:
// Consumes attachment decisions and variance records (already atomically
// recorded into projection_state by Phase 3 repo methods), then produces
// a materialised LEAKAGE intelligence snapshot in intelligence_snapshots.
//
// A snapshot captures the complete leakage picture for a tenant+window:
//   - total money at risk
//   - breakdown by type (unmatched, under-settlement, orphan, reversal)
//   - top leakage drivers
//   - leakage percentage of total intended volume
//
// DESIGN:
//   deterministic-first — all numbers come from atomic projection_state counters.
//   No ML required for the core calculation.
//   Snapshots are written once per significant event, not on every Kafka message.

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// LeakageIntelligenceService computes LEAKAGE snapshots from projection_state data.
type LeakageIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
	mlRepo       *persistence.MLFeatureStoreRepo
}

// NewLeakageIntelligenceService creates a LeakageIntelligenceService.
func NewLeakageIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
	mlRepo *persistence.MLFeatureStoreRepo,
) *LeakageIntelligenceService {
	return &LeakageIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
		mlRepo:       mlRepo,
	}
}

// LeakageSnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = LEAKAGE.
//
// Fields map directly to spec Section 10.1 outputs:
//   "total leakage amount"
//   "leakage percentage of total intended volume"
//   "breakdown by type"
//   "top leakage drivers"
type LeakageSnapshot struct {
	// ── Headline numbers ─────────────────────────────────────────────────
	TotalAmountMinor           int64   `json:"total_amount_minor"`
	LeakagePercentage          float64 `json:"leakage_percentage"`
	TotalIntendedAmountMinor   int64   `json:"total_intended_amount_minor"`

	// ── Breakdown by type (all in minor units) ────────────────────────────
	UnmatchedAmountMinor       int64 `json:"unmatched_amount_minor"`
	UnderSettlementAmountMinor int64 `json:"under_settlement_amount_minor"`
	OrphanAmountMinor          int64 `json:"orphan_amount_minor"`
	ReversalExposureMinor      int64 `json:"reversal_exposure_minor"`

	// ── Event counts ─────────────────────────────────────────────────────
	UnmatchedIntentCount  int `json:"unmatched_intent_count"`
	UnderSettlementCount  int `json:"under_settlement_count"`
	OrphanSettlementCount int `json:"orphan_settlement_count"`
	ReversalCount         int `json:"reversal_count"`

	// ── Per-type breakdown map ────────────────────────────────────────────
	// Key: variance type string. Value: cumulative minor-unit amount.
	BreakdownByType map[string]int64 `json:"breakdown_by_type"`

	// ── Top leakage drivers (deterministic ranking) ───────────────────────
	// Sorted by amount desc. Used by the recommendation layer.
	TopDrivers []LeakageDriver `json:"top_drivers"`

	// ── Risk tier ─────────────────────────────────────────────────────────
	// Derived from leakage_percentage using fixed thresholds (spec §10.1).
	RiskTier string `json:"risk_tier"` // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "CLEAN"

	// ── Recommended action ────────────────────────────────────────────────
	// Human-readable suggestion fed to the Recommendation intelligence layer.
	RecommendedAction string `json:"recommended_action,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

// LeakageDriver is one entry in LeakageSnapshot.TopDrivers.
type LeakageDriver struct {
	DriverType  string  `json:"driver_type"`   // e.g. "UNMATCHED_INTENT"
	AmountMinor int64   `json:"amount_minor"`
	Count       int     `json:"count"`
	SharePct    float64 `json:"share_pct"` // this driver's share of total_amount_minor
}

// ComputeAndSave reads the current leakage projection for a tenant, computes
// the full intelligence snapshot, and persists it to intelligence_snapshots.
//
// Also persists LEAKAGE ML features to ml_feature_store for future forecasting.
//
// Called by HandleAttachmentDecision and HandleVarianceRecord in projection_service.go
// after every leakage-relevant event. The snapshot is a point-in-time view
// of the running projection_state counters.
//
// IDEMPOTENCY: We always write a NEW snapshot (new snapshot_id) rather than
// updating an existing one. Snapshots are immutable write-once records.
// The intelligence_snapshots table stores history; dashboards query latest.
func (s *LeakageIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	// Step 1: read the latest leakage projection
	leakage, err := s.projRepo.GetLeakageSummary(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("leakage_svc.ComputeAndSave GetLeakageSummary tenant=%s: %w", tenantID, err)
	}
	if leakage == nil {
		// No leakage data yet — tenant hasn't received any attachment decisions.
		// This is normal on a brand-new tenant. Do not write an empty snapshot.
		return nil
	}

	// Step 2: build the snapshot from projection data
	snap := s.buildSnapshot(leakage)

	// Step 3: build projection refs (audit trail of which row fed this snapshot)
	projRefs := []string{"leakage.total"}
	projRefsJSON, _ := json.Marshal(projRefs)

	// Step 4: marshal snapshot body
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("leakage_svc.ComputeAndSave marshal snap tenant=%s: %w", tenantID, err)
	}

	// Step 5: persist to intelligence_snapshots
	snapID := "snap_" + uuid.New().String()
	modelVer := "deterministic_v1"
	if err := s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "LEAKAGE",
		ScopeType:          "TENANT",
		ScopeRef:           nil, // TENANT scope has no scope_ref
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("leakage_svc.ComputeAndSave Create snapshot tenant=%s: %w", tenantID, err)
	}

	// Step 6: persist ML features for future leakage forecasting (Phase 8)
	// We capture features now so the training dataset accumulates from day 1.
	// label_json is nil — the outcome (actual resolved leakage) comes later.
	if err := s.persistMLFeatures(ctx, tenantID, snapID, leakage, windowStart, windowEnd); err != nil {
		// Non-fatal: ML feature capture failure must not block the main flow.
		log.Printf("leakage_svc: persistMLFeatures failed tenant=%s snap=%s: %v",
			tenantID, snapID, err)
	}

	return nil
}

// buildSnapshot converts a LeakageValue projection into a full LeakageSnapshot.
func (s *LeakageIntelligenceService) buildSnapshot(lv *models.LeakageValue) LeakageSnapshot {
	snap := LeakageSnapshot{
		TotalAmountMinor:           lv.TotalAmountMinor,
		LeakagePercentage:          lv.LeakagePercentage,
		TotalIntendedAmountMinor:   lv.TotalIntendedAmountMinor,
		UnmatchedAmountMinor:       lv.UnmatchedAmountMinor,
		UnderSettlementAmountMinor: lv.UnderSettlementAmountMinor,
		OrphanAmountMinor:          lv.OrphanAmountMinor,
		ReversalExposureMinor:      lv.ReversalExposureMinor,
		UnmatchedIntentCount:       lv.UnmatchedIntentCount,
		UnderSettlementCount:       lv.UnderSettlementCount,
		OrphanSettlementCount:      lv.OrphanSettlementCount,
		ReversalCount:              lv.ReversalCount,
		BreakdownByType:            lv.BreakdownByType,
		ComputedAt:                 time.Now().UTC(),
	}

	// Build top drivers list (sorted by amount desc, top 5)
	snap.TopDrivers = s.buildTopDrivers(lv)

	// Assign risk tier using the fixed thresholds from spec Section 10.1
	snap.RiskTier = leakageRiskTier(lv.LeakagePercentage)

	// Generate a recommended action based on the dominant leakage type
	snap.RecommendedAction = s.recommendedAction(lv)

	return snap
}

// buildTopDrivers creates a ranked list of leakage drivers sorted by amount.
func (s *LeakageIntelligenceService) buildTopDrivers(lv *models.LeakageValue) []LeakageDriver {
	type driverEntry struct {
		driverType  string
		amountMinor int64
		count       int
	}

	candidates := []driverEntry{
		{"UNMATCHED_INTENT", lv.UnmatchedAmountMinor, lv.UnmatchedIntentCount},
		{"UNDER_SETTLEMENT", lv.UnderSettlementAmountMinor, lv.UnderSettlementCount},
		{"ORPHAN_SETTLEMENT", lv.OrphanAmountMinor, lv.OrphanSettlementCount},
		{"REVERSAL", lv.ReversalExposureMinor, lv.ReversalCount},
	}

	// Sort descending by amount (simple insertion sort — 4 elements max)
	for i := 1; i < len(candidates); i++ {
		for j := i; j > 0 && candidates[j].amountMinor > candidates[j-1].amountMinor; j-- {
			candidates[j], candidates[j-1] = candidates[j-1], candidates[j]
		}
	}

	var drivers []LeakageDriver
	for _, c := range candidates {
		if c.amountMinor == 0 {
			continue // skip zero-amount drivers
		}
		sharePct := 0.0
		if lv.TotalAmountMinor > 0 {
			sharePct = float64(c.amountMinor) / float64(lv.TotalAmountMinor)
		}
		drivers = append(drivers, LeakageDriver{
			DriverType:  c.driverType,
			AmountMinor: c.amountMinor,
			Count:       c.count,
			SharePct:    sharePct,
		})
	}
	return drivers
}

// leakageRiskTier classifies a leakage percentage into a risk tier.
// Thresholds derived from spec Section 10.1 and standard fintech reconciliation SLAs.
//
//	CRITICAL: > 5% of intended volume is leaking
//	HIGH:     > 2.5%
//	MEDIUM:   > 1%
//	LOW:      > 0%
//	CLEAN:    0 — no leakage detected
func leakageRiskTier(pct float64) string {
	switch {
	case pct > 0.05:
		return "CRITICAL"
	case pct > 0.025:
		return "HIGH"
	case pct > 0.01:
		return "MEDIUM"
	case pct > 0:
		return "LOW"
	default:
		return "CLEAN"
	}
}

// recommendedAction returns the most important recommended action based on the
// dominant leakage type. Feeds into the Recommendation intelligence layer.
func (s *LeakageIntelligenceService) recommendedAction(lv *models.LeakageValue) string {
	// Pick the dominant leakage type by amount
	max := int64(0)
	dominant := ""
	buckets := map[string]int64{
		"UNMATCHED_INTENT":  lv.UnmatchedAmountMinor,
		"UNDER_SETTLEMENT":  lv.UnderSettlementAmountMinor,
		"ORPHAN_SETTLEMENT": lv.OrphanAmountMinor,
		"REVERSAL":          lv.ReversalExposureMinor,
	}
	for k, v := range buckets {
		if v > max {
			max = v
			dominant = k
		}
	}

	switch dominant {
	case "UNMATCHED_INTENT":
		return "REQUEST_SOURCE_PATCH: intents are not appearing in settlement files — fix carrier fields in source system"
	case "UNDER_SETTLEMENT":
		return "OPEN_OPS_INCIDENT: PSP is settling less than intended — review deduction agreements"
	case "ORPHAN_SETTLEMENT":
		return "REVIEW_AMBIGUOUS_BATCH: settlements arriving without matching intents — check batch ingestion pipeline"
	case "REVERSAL":
		return "ESCALATE: reversals after success detected — finance review required immediately"
	default:
		return ""
	}
}

// persistMLFeatures writes a LEAKAGE feature vector to ml_feature_store.
// Features are captured here so Phase 8 ML engines have training data from day 1.
func (s *LeakageIntelligenceService) persistMLFeatures(
	ctx context.Context,
	tenantID, snapshotID string,
	lv *models.LeakageValue,
	windowStart, windowEnd time.Time,
) error {
	features := map[string]any{
		"total_amount_minor":             lv.TotalAmountMinor,
		"leakage_percentage":             lv.LeakagePercentage,
		"unmatched_intent_count":         lv.UnmatchedIntentCount,
		"under_settlement_count":         lv.UnderSettlementCount,
		"orphan_settlement_count":        lv.OrphanSettlementCount,
		"reversal_count":                 lv.ReversalCount,
		"total_intended_amount_minor":    lv.TotalIntendedAmountMinor,
		"snapshot_id":                    snapshotID, // link feature to snapshot for auditability
	}
	featJSON, err := json.Marshal(features)
	if err != nil {
		return err
	}
	return s.mlRepo.Insert(ctx, persistence.MLFeatureRow{
		FeatureRowID:  "feat_" + uuid.New().String(),
		TenantID:      tenantID,
		ScopeType:     "TENANT",
		ScopeRef:      tenantID,
		FeatureFamily: "LEAKAGE",
		WindowStart:   windowStart,
		WindowEnd:     windowEnd,
		FeaturesJSON:  featJSON,
		LabelJSON:     nil, // label attached later when leakage is resolved
		CreatedAt:     time.Now().UTC(),
	})
}
