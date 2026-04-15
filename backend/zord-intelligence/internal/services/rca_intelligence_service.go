package services

// rca_intelligence_service.go
//
// Implements spec Section 10.4 — Root Cause Intelligence.
//
// WHAT THIS SERVICE DOES:
// Reads failure taxonomy projections (maintained by AtomicIncrementFailureReason
// for corridor-level failure codes) and produces a materialised RCA snapshot.
//
// RCA answers: WHY are failures, leakages, and ambiguities happening?
//
// DETERMINISTIC FIRST (spec §10.4):
//   "Build RCA trees / taxonomies such as:
//    missing reference family, duplicate-risk family, parser weakness family,
//    batch hygiene family, provider status inconsistency family,
//    value-date mismatch family, deduction/TDS family, reversal/return family"
//
// The spec also mentions TF-IDF + HDBSCAN for failure reason clustering.
// That is Phase 8 ML. Phase 4 uses deterministic bucket taxonomy.
//
// TAXONOMY MAPPING:
// We classify raw reason codes into semantic families using keyword matching.
// This is simpler and more auditable than ML clustering for v1, and gives
// finance/ops a stable vocabulary to work with.

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// RCAIntelligenceService computes RCA snapshots from failure taxonomy projections.
type RCAIntelligenceService struct {
	projRepo     *persistence.ProjectionRepo
	snapshotRepo *persistence.IntelligenceSnapshotRepo
}

// NewRCAIntelligenceService creates an RCAIntelligenceService.
func NewRCAIntelligenceService(
	projRepo *persistence.ProjectionRepo,
	snapshotRepo *persistence.IntelligenceSnapshotRepo,
) *RCAIntelligenceService {
	return &RCAIntelligenceService{
		projRepo:     projRepo,
		snapshotRepo: snapshotRepo,
	}
}

// RCASnapshot is the shape written into intelligence_snapshots.snapshot_json
// for snapshot_type = RCA.
type RCASnapshot struct {
	// ── Top failure drivers (spec §10.4 output) ───────────────────────────
	// "Top 5 ambiguity drivers, leakage drivers, reversal/return drivers"
	TopFailureDrivers []RCABucket `json:"top_failure_drivers"` // sorted by count desc

	// ── Taxonomy family breakdown ─────────────────────────────────────────
	// Key: family name (e.g. "MISSING_REFERENCE")
	// Value: aggregate count across all corridors
	FamilyBreakdown map[string]int `json:"family_breakdown"`

	// ── Total failures counted ────────────────────────────────────────────
	TotalFailures int `json:"total_failures"`

	// ── Top corridor by failures ──────────────────────────────────────────
	TopFailureCorridorID string `json:"top_failure_corridor_id,omitempty"`
	TopFailureCount      int    `json:"top_failure_count"`

	// ── Narrative (deterministic template) ────────────────────────────────
	// Phase 4 uses a template-based narrative.
	// Phase 7 (explanation layer) will replace this with LLM-generated text.
	Narrative string `json:"narrative"`

	// ── Recommended action ────────────────────────────────────────────────
	RecommendedAction string `json:"recommended_action,omitempty"`

	ComputedAt time.Time `json:"computed_at"`
}

// RCABucket is one row in the RCA top-drivers list.
type RCABucket struct {
	ReasonCode   string  `json:"reason_code"`   // raw reason code from PSP
	Family       string  `json:"family"`        // semantic family (e.g. "MISSING_REFERENCE")
	Count        int     `json:"count"`
	CorridorID   string  `json:"corridor_id"`
	SharePct     float64 `json:"share_pct"` // this bucket's share of total_failures
}

// rcaFamilies maps semantic families to keyword patterns.
// When a reason_code matches a family's keywords, it's bucketed into that family.
// This is the deterministic taxonomy from spec §10.4.
var rcaFamilies = map[string][]string{
	"MISSING_REFERENCE":            {"MISSING_REF", "NO_UTR", "NO_RRN", "MISSING_CLIENT_REF", "REF_NOT_FOUND"},
	"INSUFFICIENT_FUNDS":           {"INSUFFICIENT_FUNDS", "BALANCE_LOW", "CREDIT_LIMIT", "FUNDS"},
	"ACCOUNT_ISSUES":               {"INVALID_ACCOUNT", "ACCOUNT_FROZEN", "ACCOUNT_CLOSED", "BENEFICIARY"},
	"TIMEOUT_NETWORK":              {"TIMEOUT", "NETWORK_ERROR", "CONNECTION", "GATEWAY_TIMEOUT"},
	"DUPLICATE_RISK":               {"DUPLICATE", "ALREADY_PROCESSED", "IDEMPOTENCY"},
	"VALUE_DATE_MISMATCH":          {"VALUE_DATE", "DATE_MISMATCH", "CROSS_PERIOD"},
	"DEDUCTION_TDS":                {"TDS", "DEDUCTION", "FEE_DEDUCTED", "GST"},
	"PSP_SYSTEM_ERROR":             {"SYSTEM_ERROR", "INTERNAL_ERROR", "PSP_ERROR", "BANK_ERROR"},
	"REVERSAL_RETURN":              {"REVERSAL", "RETURNED", "CHARGEBACK", "RECALLED"},
	"COMPLIANCE_BLOCK":             {"COMPLIANCE", "AML_HOLD", "KYC_FAILED", "REGULATORY"},
	"PARSER_WEAKNESS":              {"PARSE_ERROR", "MAPPING_FAILURE", "UNKNOWN_FORMAT"},
}

// ComputeAndSave reads failure taxonomy projections for a corridor and builds
// an RCA snapshot.
//
// Called after every OutcomeNormalizedEvent (via HandleOutcomeNormalized).
// The corridorID is passed so we can read the corridor-specific failure taxonomy.
func (s *RCAIntelligenceService) ComputeAndSave(
	ctx context.Context,
	tenantID, corridorID string,
	windowStart, windowEnd time.Time,
) error {
	// Step 1: read failure taxonomy for this corridor
	taxKey := fmt.Sprintf("corridor.failure_taxonomy.%s", corridorID)
	var taxVal models.FailureTaxonomyValue
	if err := s.projRepo.GetValueAs(ctx, tenantID, taxKey, &taxVal); err != nil {
		return fmt.Errorf("rca_svc.ComputeAndSave GetValueAs corridor=%s: %w", corridorID, err)
	}
	if taxVal.TotalFails == 0 {
		return nil // no failures yet
	}

	// Step 2: build snapshot
	snap := s.buildSnapshot(&taxVal, corridorID)

	// Step 3: persist
	projRefs := []string{taxKey}
	projRefsJSON, _ := json.Marshal(projRefs)
	snapJSON, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("rca_svc.ComputeAndSave marshal corridor=%s: %w", corridorID, err)
	}

	scopeRef := corridorID
	snapID := "snap_" + uuid.New().String()
	modelVer := "deterministic_v1"
	if err := s.snapshotRepo.Create(ctx, persistence.IntelligenceSnapshot{
		SnapshotID:         snapID,
		TenantID:           tenantID,
		SnapshotType:       "RCA",
		ScopeType:          "CORRIDOR",
		ScopeRef:           &scopeRef,
		WindowStart:        windowStart,
		WindowEnd:          windowEnd,
		ProjectionRefsJSON: projRefsJSON,
		SnapshotJSON:       snapJSON,
		ModelVersion:       &modelVer,
		CreatedAt:          time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("rca_svc.ComputeAndSave Create snapshot corridor=%s: %w", corridorID, err)
	}

	return nil
}

// buildSnapshot converts a FailureTaxonomyValue into an RCASnapshot.
func (s *RCAIntelligenceService) buildSnapshot(tv *models.FailureTaxonomyValue, corridorID string) RCASnapshot {
	snap := RCASnapshot{
		TotalFailures:        tv.TotalFails,
		TopFailureCorridorID: corridorID,
		FamilyBreakdown:      make(map[string]int),
		ComputedAt:           time.Now().UTC(),
	}

	// Build RCA buckets from top reasons
	var buckets []RCABucket
	for _, rc := range tv.TopReasons {
		family := classifyReasonCode(rc.ReasonCode)
		snap.FamilyBreakdown[family] += rc.Count
		buckets = append(buckets, RCABucket{
			ReasonCode: rc.ReasonCode,
			Family:     family,
			Count:      rc.Count,
			CorridorID: corridorID,
			SharePct:   rc.Rate,
		})
	}

	// Sort by count desc (top 5)
	for i := 1; i < len(buckets); i++ {
		for j := i; j > 0 && buckets[j].Count > buckets[j-1].Count; j-- {
			buckets[j], buckets[j-1] = buckets[j-1], buckets[j]
		}
	}
	if len(buckets) > 5 {
		buckets = buckets[:5]
	}
	snap.TopFailureDrivers = buckets
	snap.TopFailureCount = tv.TotalFails
	snap.Narrative = s.buildNarrative(snap.TopFailureDrivers, corridorID, tv.TotalFails)
	snap.RecommendedAction = s.recommendedAction(snap.TopFailureDrivers)

	return snap
}

// classifyReasonCode maps a raw PSP reason code to a semantic family.
// Unknown codes are bucketed as "OTHER".
func classifyReasonCode(code string) string {
	upper := strings.ToUpper(code)
	for family, keywords := range rcaFamilies {
		for _, kw := range keywords {
			if strings.Contains(upper, kw) {
				return family
			}
		}
	}
	return "OTHER"
}

// buildNarrative generates a deterministic natural-language summary.
// Phase 7 will replace this with LLM-generated text from intelligence_explanations.
func (s *RCAIntelligenceService) buildNarrative(
	drivers []RCABucket,
	corridorID string,
	total int,
) string {
	if len(drivers) == 0 {
		return fmt.Sprintf("No failures detected for corridor %s.", corridorID)
	}

	parts := make([]string, 0, len(drivers))
	for _, d := range drivers {
		pct := int(d.SharePct * 100)
		parts = append(parts, fmt.Sprintf("%d%% from %s (%s)", pct, d.Family, d.ReasonCode))
	}

	return fmt.Sprintf(
		"Corridor %s had %d total failures. Top drivers: %s.",
		corridorID, total, strings.Join(parts, "; "),
	)
}

func (s *RCAIntelligenceService) recommendedAction(drivers []RCABucket) string {
	if len(drivers) == 0 {
		return ""
	}
	switch drivers[0].Family {
	case "MISSING_REFERENCE":
		return "REQUEST_SOURCE_PATCH: dominant failure cause is missing reference fields"
	case "TIMEOUT_NETWORK":
		return "NOTIFY: PSP connectivity issues detected — monitor provider health"
	case "PSP_SYSTEM_ERROR":
		return "ESCALATE: PSP system errors are the top failure driver"
	case "COMPLIANCE_BLOCK":
		return "ESCALATE: compliance blocks are causing failures — legal review required"
	case "REVERSAL_RETURN":
		return "ESCALATE: reversals/returns are the top failure driver — finance review required"
	case "DUPLICATE_RISK":
		return "REQUEST_SOURCE_PATCH: duplicate submissions detected — fix source system idempotency"
	default:
		return ""
	}
}
