package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/segmentio/kafka-go"
	"github.com/zord/zord-intelligence/internal/models"
)

const (
	defaultDBURL     = "postgres://zpi:zpi_secret@localhost:5440/zord_intelligence?sslmode=disable"
	defaultKafkaAddr = "localhost:9092"
	defaultBaseURL   = "http://localhost:8089"
	tenantID         = "tnt_gradeA_test"
	corridorID       = "gradea.UPI"
	normalBatchCount = 5
)

type publisher struct {
	writer *kafka.Writer
}

type predictionSummary struct {
	Family string  `json:"family"`
	Scope  string  `json:"scope"`
	Value  string  `json:"value"`
	Score  float64 `json:"score"`
}

type snapshotSummary struct {
	Type         string         `json:"type"`
	ScopeType    string         `json:"scope_type"`
	ScopeRef     string         `json:"scope_ref,omitempty"`
	ModelVersion string         `json:"model_version,omitempty"`
	Data         map[string]any `json:"data"`
}

type apiSummary struct {
	Path          string         `json:"path"`
	StatusCode    int            `json:"status_code"`
	DataAvailable bool           `json:"data_available"`
	Data          map[string]any `json:"data"`
}

type featureSummary struct {
	Family   string         `json:"family"`
	Scope    string         `json:"scope"`
	Features map[string]any `json:"features"`
}

type exerciseReport struct {
	TenantID string `json:"tenant_id"`

	Baseline struct {
		Batches                []string          `json:"batches"`
		FeatureRows            int               `json:"feature_rows"`
		Predictions            int               `json:"predictions"`
		LatestAmbiguity        predictionSummary `json:"latest_ambiguity"`
		PatternBaseline        predictionSummary `json:"pattern_baseline"`
		LeakageHistorySeedRows int               `json:"leakage_history_seed_rows"`
		PatternHistorySeedRows int               `json:"pattern_history_seed_rows"`
	} `json:"baseline"`

	HighRisk struct {
		BatchID           string              `json:"batch_id"`
		ExpectedProcessed int                 `json:"expected_processed_events"`
		ActualProcessed   int                 `json:"actual_processed_events"`
		Projections       map[string]any      `json:"projections"`
		FeatureRows       []featureSummary    `json:"feature_rows"`
		Predictions       []predictionSummary `json:"predictions"`
		Snapshots         []snapshotSummary   `json:"snapshots"`
		ActionContracts   int                 `json:"action_contracts"`
		ActuationOutbox   int                 `json:"actuation_outbox"`
	} `json:"high_risk"`

	API []apiSummary `json:"api"`

	Comparisons struct {
		AmbiguityScoreIncreased bool    `json:"ambiguity_score_increased"`
		PatternScoreIncreased   bool    `json:"pattern_score_increased"`
		BaselineAmbiguityScore  float64 `json:"baseline_ambiguity_score"`
		HighRiskAmbiguityScore  float64 `json:"high_risk_ambiguity_score"`
		BaselinePatternScore    float64 `json:"baseline_pattern_score"`
		HighRiskPatternScore    float64 `json:"high_risk_pattern_score"`
	} `json:"comparisons"`
}

func main() {
	ctx := context.Background()

	dbURL := envOrDefault("GRADEA_DB_URL", defaultDBURL)
	kafkaAddr := envOrDefault("GRADEA_KAFKA_ADDR", defaultKafkaAddr)
	baseURL := envOrDefault("GRADEA_BASE_URL", defaultBaseURL)

	pool, err := pgxpool.New(ctx, dbURL)
	must(err)
	defer pool.Close()

	pub := &publisher{
		writer: &kafka.Writer{
			Addr:         kafka.TCP(kafkaAddr),
			Balancer:     &kafka.LeastBytes{},
			RequiredAcks: kafka.RequireAll,
			Async:        false,
		},
	}
	defer pub.writer.Close()

	must(waitReady(ctx, baseURL+"/readyz", 60*time.Second))
	must(resetRelevantTables(ctx, pool))
	must(enablePolicies(ctx, pool))
	must(seedLeakageHistory(ctx, pool, tenantID, 10))
	must(seedPatternHistory(ctx, pool, tenantID, 10))

	report := exerciseReport{TenantID: tenantID}
	report.Baseline.LeakageHistorySeedRows = 10
	report.Baseline.PatternHistorySeedRows = 10

	baselineEvents := 0
	batchIDs := make([]string, 0, normalBatchCount)
	for i := 1; i <= normalBatchCount; i++ {
		batchID := fmt.Sprintf("batch_baseline_%02d", i)
		batchIDs = append(batchIDs, batchID)
		baselineEvents += publishNormalBatch(ctx, pub, tenantID, batchID, i)
	}
	report.Baseline.Batches = batchIDs

	must(waitProcessedCount(ctx, pool, tenantID, baselineEvents, 300*time.Second))
	time.Sleep(3 * time.Second)

	report.Baseline.FeatureRows = countRows(ctx, pool, "SELECT COUNT(*) FROM ml_feature_store WHERE tenant_id=$1", tenantID)
	report.Baseline.Predictions = countRows(ctx, pool, "SELECT COUNT(*) FROM ml_predictions WHERE tenant_id=$1", tenantID)
	report.Baseline.LatestAmbiguity = latestPrediction(ctx, pool, tenantID, "AMBIGUITY", "")
	report.Baseline.PatternBaseline = latestPrediction(ctx, pool, tenantID, "PATTERN", "batch_baseline_05")

	highRiskBatchID := "batch_high_risk"
	report.HighRisk.BatchID = highRiskBatchID
	highRiskEvents := publishHighRiskBatch(ctx, pub, tenantID, highRiskBatchID)

	report.HighRisk.ExpectedProcessed = baselineEvents + highRiskEvents
	_ = waitProcessedCount(ctx, pool, tenantID, report.HighRisk.ExpectedProcessed, 300*time.Second)
	time.Sleep(5 * time.Second)

	report.HighRisk.ActualProcessed = countRows(ctx, pool, "SELECT COUNT(*) FROM processed_events WHERE tenant_id=$1", tenantID)
	report.HighRisk.Projections = loadProjections(ctx, pool, tenantID, highRiskBatchID)
	report.HighRisk.FeatureRows = loadLatestFeatures(ctx, pool, tenantID, 12)
	report.HighRisk.Predictions = loadLatestPredictions(ctx, pool, tenantID, highRiskBatchID)
	report.HighRisk.Snapshots = loadSnapshots(ctx, pool, tenantID, highRiskBatchID)
	report.HighRisk.ActionContracts = countRows(ctx, pool, "SELECT COUNT(*) FROM action_contracts WHERE tenant_id=$1", tenantID)
	report.HighRisk.ActuationOutbox = countRows(ctx, pool, "SELECT COUNT(*) FROM actuation_outbox o JOIN action_contracts a ON a.action_id = o.action_id WHERE a.tenant_id=$1", tenantID)

	report.API = collectAPI(baseURL, tenantID, highRiskBatchID)

	highRiskAmb := findPrediction(report.HighRisk.Predictions, "AMBIGUITY", "")
	highRiskPattern := findPrediction(report.HighRisk.Predictions, "PATTERN", highRiskBatchID)
	report.Comparisons.BaselineAmbiguityScore = report.Baseline.LatestAmbiguity.Score
	report.Comparisons.HighRiskAmbiguityScore = highRiskAmb.Score
	report.Comparisons.BaselinePatternScore = report.Baseline.PatternBaseline.Score
	report.Comparisons.HighRiskPatternScore = highRiskPattern.Score
	report.Comparisons.AmbiguityScoreIncreased = highRiskAmb.Score > report.Baseline.LatestAmbiguity.Score
	report.Comparisons.PatternScoreIncreased = highRiskPattern.Score > report.Baseline.PatternBaseline.Score

	out, err := json.MarshalIndent(report, "", "  ")
	must(err)
	fmt.Println(string(out))
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func waitReady(ctx context.Context, url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 3 * time.Second}
	for time.Now().Before(deadline) {
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		resp, err := client.Do(req)
		if err == nil {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("service did not become ready at %s", url)
}

func enablePolicies(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		UPDATE policy_registry
		SET enabled = true
		WHERE policy_id IN (
			'P_AMBIGUITY_RATE_HIGH',
			'P_GOVERNANCE_REJECTION',
			'P_PATTERN_BATCH_RISK'
		)
	`)
	return err
}

func resetRelevantTables(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		TRUNCATE TABLE
			projection_state,
			intelligence_snapshots,
			ml_feature_store,
			ml_predictions,
			processed_events,
			action_contracts,
			actuation_outbox,
			batch_contracts,
			ml_labels
		RESTART IDENTITY CASCADE
	`)
	return err
}

func seedLeakageHistory(ctx context.Context, pool *pgxpool.Pool, tenant string, rows int) error {
	now := time.Now().UTC()
	for i := rows; i >= 1; i-- {
		rowID := "seed_leak_" + uuid.NewString()
		createdAt := now.Add(-time.Duration(i) * 24 * time.Hour)
		features := map[string]any{
			"leakage_percentage":          0.001 + float64(i)*0.0001,
			"total_amount_minor":          10 + i,
			"total_intended_amount_minor": 10_000,
		}
		payload, _ := json.Marshal(features)
		if _, err := pool.Exec(ctx, `
			INSERT INTO ml_feature_store
				(feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
				 window_start, window_end, features_json, label_json, model_version, created_at)
			VALUES ($1, $2, 'TENANT', $2, 'LEAKAGE', $3, $4, $5, NULL, NULL, $4)
		`, rowID, tenant, createdAt.Add(-24*time.Hour), createdAt, payload); err != nil {
			return err
		}
	}
	return nil
}

func seedPatternHistory(ctx context.Context, pool *pgxpool.Pool, tenant string, rows int) error {
	now := time.Now().UTC()
	for i := rows; i >= 1; i-- {
		rowID := "seed_pattern_" + uuid.NewString()
		createdAt := now.Add(-time.Duration(i) * 24 * time.Hour)
		features := map[string]any{
			"total_count":                 5,
			"settled_count":               5,
			"total_intended_amount_minor": 5_000,
			"total_variance_minor":        0,
			"ambiguity_score":             0.01,
			"ambiguity_rate":              0.01,
			"variance_rate":               0.0,
			"settlement_ratio":            1.0,
			"unresolved_ratio":            0.0,
			"missing_ref_rate":            0.0,
			"finality_status":             "FULLY_SETTLED",
		}
		payload, _ := json.Marshal(features)
		if _, err := pool.Exec(ctx, `
			INSERT INTO ml_feature_store
				(feature_row_id, tenant_id, scope_type, scope_ref, feature_family,
				 window_start, window_end, features_json, label_json, model_version, created_at)
			VALUES ($1, $2, 'BATCH', $1, 'PATTERN', $3, $4, $5, NULL, NULL, $4)
		`, rowID, tenant, createdAt.Add(-24*time.Hour), createdAt, payload); err != nil {
			return err
		}
	}
	return nil
}

func publishNormalBatch(ctx context.Context, pub *publisher, tenant, batchID string, ordinal int) int {
	events := 0
	baseTime := time.Now().UTC().AddDate(0, 0, -(normalBatchCount-ordinal+1))

	total := int64(0)
	for i := 1; i <= 5; i++ {
		intentID := fmt.Sprintf("%s_intent_%02d", batchID, i)
		contractID := fmt.Sprintf("%s_contract_%02d", batchID, i)
		settlementID := fmt.Sprintf("%s_settlement_%02d", batchID, i)
		amountMinor := int64(1000)
		total += amountMinor

		pub.mustPublish(ctx, "canonical.intent.created", tenant, models.IntentCreatedEvent{
			EventID:    "evt_" + uuid.NewString(),
			TenantID:   tenant,
			IntentID:   intentID,
			ContractID: contractID,
			CorridorID: corridorID,
			Amount:     "1000",
			Currency:   "INR",
			CreatedAt:  baseTime,
			TraceID:    "trace_" + uuid.NewString(),
		})
		events++

		pub.mustPublish(ctx, "canonical.settlement.created", tenant, models.CanonicalSettlementCreatedEvent{
			EventID:             "evt_" + uuid.NewString(),
			TenantID:            tenant,
			TraceID:             "trace_" + uuid.NewString(),
			OccurredAt:          baseTime,
			SettlementID:        settlementID,
			BatchID:             batchID,
			SourceType:          "SFTP_FILE",
			SourceStrength:      "HIGH",
			SourceSystemID:      "baseline.psp",
			ParseConfidence:     0.99,
			SettledAmountMinor:  amountMinor,
			Currency:            "INR",
			SettlementDate:      baseTime.Format("2006-01-02"),
			UTR:                 fmt.Sprintf("UTR-%s-%02d", batchID, i),
			RRN:                 fmt.Sprintf("RRN-%s-%02d", batchID, i),
			BankRef:             fmt.Sprintf("BANK-%s-%02d", batchID, i),
			ProviderRef:         fmt.Sprintf("PROV-%s-%02d", batchID, i),
			ClientRef:           intentID,
			CarrierRichness:     1.0,
			AttachmentReadiness: "READY",
			StatusObservation:   "SETTLED",
		})
		events++

		pub.mustPublish(ctx, "attachment.decision.created", tenant, models.AttachmentDecisionCreatedEvent{
			EventID:             "evt_" + uuid.NewString(),
			TenantID:            tenant,
			TraceID:             "trace_" + uuid.NewString(),
			OccurredAt:          baseTime,
			DecisionID:          "adec_" + uuid.NewString(),
			SettlementID:        settlementID,
			IntentID:            intentID,
			ContractID:          contractID,
			CorridorID:          corridorID,
			BatchID:             batchID,
			DecisionType:        "MATCH_EXACT",
			ConfidenceScore:     0.99,
			AmbiguityScore:      0.01,
			SupportingCarriers:  []string{"utr", "client_ref", "provider_ref"},
			CandidateSetSize:    1,
			CandidateSetHash:    "cand_" + uuid.NewString(),
			SettledAmountMinor:  amountMinor,
			IntendedAmountMinor: amountMinor,
			Currency:            "INR",
		})
		events++

		evidencePackID := fmt.Sprintf("%s_evidence_%02d", batchID, i)
		pub.mustPublish(ctx, "evidence.pack.ready", tenant, models.EvidencePackReadyEvent{
			EventID:        "evt_" + uuid.NewString(),
			TenantID:       tenant,
			IntentID:       intentID,
			ContractID:     contractID,
			EvidencePackID: evidencePackID,
			MerkleRoot:     "mrk_" + uuid.NewString(),
			CreatedAt:      baseTime,
			TraceID:        "trace_" + uuid.NewString(),
		})
		events++

		pub.mustPublish(ctx, "governance.decision.created", tenant, models.GovernanceDecisionCreatedEvent{
			EventID:              "evt_" + uuid.NewString(),
			TenantID:             tenant,
			TraceID:              "trace_" + uuid.NewString(),
			OccurredAt:           baseTime,
			GovernanceDecisionID: "gdec_" + uuid.NewString(),
			IntentID:             intentID,
			ContractID:           contractID,
			EvidencePackID:       evidencePackID,
			DecisionOutcome:      "APPROVED",
			KYCChecked:           true,
			AMLChecked:           true,
			RiskChecked:          true,
			PolicyCompliant:      true,
			ReplayEquivalent:     true,
			AuthorityLevel:       "RULE_BASED",
			DecidedAt:            baseTime,
		})
		events++
	}

	pub.mustPublish(ctx, "batch.summary.updated", tenant, models.BatchSummaryUpdatedEvent{
		EventID:                   "evt_" + uuid.NewString(),
		TenantID:                  tenant,
		TraceID:                   "trace_" + uuid.NewString(),
		OccurredAt:                baseTime,
		BatchID:                   batchID,
		SourceReference:           batchID + ".csv",
		CorridorID:                corridorID,
		TotalCount:                5,
		SuccessCount:              5,
		FailedCount:               0,
		PendingCount:              0,
		ReversedCount:             0,
		PartialReconCount:         0,
		TotalIntendedAmountMinor:  total,
		TotalConfirmedAmountMinor: total,
		TotalVarianceMinor:        0,
		AmbiguityScore:            0.01,
		BatchFinalityStatus:       "FULLY_SETTLED",
	})
	return events + 1
}

func publishHighRiskBatch(ctx context.Context, pub *publisher, tenant, batchID string) int {
	events := 0
	baseTime := time.Now().UTC().Add(5 * time.Second)
	amounts := []int64{1000, 1500, 2000, 2500, 3000}
	totalIntended := int64(0)
	for _, amount := range amounts {
		totalIntended += amount
	}

	intentIDs := make([]string, 0, len(amounts))
	contractIDs := make([]string, 0, len(amounts))
	for i, amount := range amounts {
		intentID := fmt.Sprintf("%s_intent_%02d", batchID, i+1)
		contractID := fmt.Sprintf("%s_contract_%02d", batchID, i+1)
		intentIDs = append(intentIDs, intentID)
		contractIDs = append(contractIDs, contractID)
		pub.mustPublish(ctx, "canonical.intent.created", tenant, models.IntentCreatedEvent{
			EventID:    "evt_" + uuid.NewString(),
			TenantID:   tenant,
			IntentID:   intentID,
			ContractID: contractID,
			CorridorID: corridorID,
			Amount:     fmt.Sprintf("%d", amount),
			Currency:   "INR",
			CreatedAt:  baseTime,
			TraceID:    "trace_" + uuid.NewString(),
		})
		events++
	}

	settlementA := fmt.Sprintf("%s_settlement_a", batchID)
	settlementB := fmt.Sprintf("%s_settlement_b", batchID)
	pub.mustPublish(ctx, "canonical.settlement.created", tenant, models.CanonicalSettlementCreatedEvent{
		EventID:             "evt_" + uuid.NewString(),
		TenantID:            tenant,
		TraceID:             "trace_" + uuid.NewString(),
		OccurredAt:          baseTime,
		SettlementID:        settlementA,
		BatchID:             batchID,
		SourceType:          "SFTP_FILE",
		SourceStrength:      "MEDIUM",
		SourceSystemID:      "risk.psp",
		ParseConfidence:     0.82,
		SettledAmountMinor:  1000,
		Currency:            "INR",
		SettlementDate:      baseTime.Format("2006-01-02"),
		ClientRef:           intentIDs[0],
		CarrierRichness:     0.40,
		AttachmentReadiness: "PARTIAL",
		StatusObservation:   "SETTLED",
	})
	events++
	pub.mustPublish(ctx, "canonical.settlement.created", tenant, models.CanonicalSettlementCreatedEvent{
		EventID:             "evt_" + uuid.NewString(),
		TenantID:            tenant,
		TraceID:             "trace_" + uuid.NewString(),
		OccurredAt:          baseTime,
		SettlementID:        settlementB,
		BatchID:             batchID,
		SourceType:          "MANUAL_UPLOAD",
		SourceStrength:      "LOW",
		SourceSystemID:      "risk.manual",
		ParseConfidence:     0.61,
		SettledAmountMinor:  1000,
		Currency:            "INR",
		SettlementDate:      baseTime.Format("2006-01-02"),
		ClientRef:           intentIDs[1],
		CarrierRichness:     0.20,
		AttachmentReadiness: "PARTIAL",
		StatusObservation:   "SETTLED",
	})
	events++

	decisionDefs := []models.AttachmentDecisionCreatedEvent{
		{
			DecisionID:          "adec_" + uuid.NewString(),
			SettlementID:        settlementA,
			IntentID:            intentIDs[0],
			ContractID:          contractIDs[0],
			DecisionType:        "MATCH_EXACT",
			ConfidenceScore:     0.98,
			AmbiguityScore:      0.02,
			SupportingCarriers:  []string{"client_ref", "amount"},
			CandidateSetSize:    1,
			SettledAmountMinor:  1000,
			IntendedAmountMinor: 1000,
		},
		{
			DecisionID:          "adec_" + uuid.NewString(),
			SettlementID:        settlementB,
			IntentID:            intentIDs[1],
			ContractID:          contractIDs[1],
			DecisionType:        "MATCH_EXACT",
			ConfidenceScore:     0.88,
			AmbiguityScore:      0.10,
			SupportingCarriers:  []string{"amount_only"},
			CandidateSetSize:    2,
			SettledAmountMinor:  1000,
			IntendedAmountMinor: 1500,
		},
		{
			DecisionID:          "adec_" + uuid.NewString(),
			SettlementID:        "unseen_settlement_1",
			IntentID:            intentIDs[2],
			ContractID:          contractIDs[2],
			DecisionType:        "MATCH_AMBIGUOUS",
			ConfidenceScore:     0.52,
			AmbiguityScore:      0.82,
			SupportingCarriers:  []string{"amount_only"},
			CandidateSetSize:    4,
			SettledAmountMinor:  2000,
			IntendedAmountMinor: 2000,
		},
		{
			DecisionID:          "adec_" + uuid.NewString(),
			SettlementID:        "unseen_settlement_2",
			IntentID:            intentIDs[3],
			ContractID:          contractIDs[3],
			DecisionType:        "MATCH_AMBIGUOUS",
			ConfidenceScore:     0.45,
			AmbiguityScore:      0.91,
			SupportingCarriers:  []string{"amount_only"},
			CandidateSetSize:    5,
			SettledAmountMinor:  2500,
			IntendedAmountMinor: 2500,
		},
		{
			DecisionID:          "adec_" + uuid.NewString(),
			SettlementID:        "missing_settlement",
			IntentID:            "",
			ContractID:          "",
			DecisionType:        "MATCH_UNRESOLVED",
			ConfidenceScore:     0.0,
			AmbiguityScore:      1.0,
			SupportingCarriers:  nil,
			CandidateSetSize:    0,
			SettledAmountMinor:  0,
			IntendedAmountMinor: 3000,
		},
	}

	for _, def := range decisionDefs {
		def.EventID = "evt_" + uuid.NewString()
		def.TenantID = tenant
		def.TraceID = "trace_" + uuid.NewString()
		def.OccurredAt = baseTime
		def.CorridorID = corridorID
		def.BatchID = batchID
		def.CandidateSetHash = "cand_" + uuid.NewString()
		def.Currency = "INR"
		pub.mustPublish(ctx, "attachment.decision.created", tenant, def)
		events++
	}

	pub.mustPublish(ctx, "variance.record.created", tenant, models.VarianceRecordCreatedEvent{
		EventID:             "evt_" + uuid.NewString(),
		TenantID:            tenant,
		TraceID:             "trace_" + uuid.NewString(),
		OccurredAt:          baseTime,
		VarianceID:          "var_" + uuid.NewString(),
		DecisionID:          decisionDefs[1].DecisionID,
		IntentID:            intentIDs[1],
		SettlementID:        settlementB,
		CorridorID:          corridorID,
		BatchID:             batchID,
		VarianceType:        "UNDER_SETTLEMENT",
		IntendedAmountMinor: 1500,
		SettledAmountMinor:  1000,
		VarianceAmountMinor: 500,
		Currency:            "INR",
		ExpectedValueDate:   baseTime.Format("2006-01-02"),
		ActualValueDate:     baseTime.Format("2006-01-02"),
		CrossPeriodFlag:     false,
		DeductionReason:     "",
		IsWhitelisted:       false,
		EvidenceGapFlags:    []string{"supporting_bank_ref_missing"},
	})
	events++

	pub.mustPublish(ctx, "variance.record.created", tenant, models.VarianceRecordCreatedEvent{
		EventID:             "evt_" + uuid.NewString(),
		TenantID:            tenant,
		TraceID:             "trace_" + uuid.NewString(),
		OccurredAt:          baseTime,
		VarianceID:          "var_" + uuid.NewString(),
		DecisionID:          decisionDefs[2].DecisionID,
		IntentID:            intentIDs[2],
		SettlementID:        "reversal_settlement",
		CorridorID:          corridorID,
		BatchID:             batchID,
		VarianceType:        "REVERSAL",
		IntendedAmountMinor: 2000,
		SettledAmountMinor:  0,
		VarianceAmountMinor: 2000,
		Currency:            "INR",
		ExpectedValueDate:   baseTime.Format("2006-01-02"),
		ActualValueDate:     baseTime.Format("2006-01-02"),
		CrossPeriodFlag:     false,
		DeductionReason:     "",
		IsWhitelisted:       false,
		EvidenceGapFlags:    []string{"reversal_notice_missing"},
	})
	events++

	for i := 0; i < 3; i++ {
		intentID := intentIDs[i]
		contractID := contractIDs[i]
		evidencePackID := fmt.Sprintf("%s_evidence_%02d", batchID, i+1)

		pub.mustPublish(ctx, "evidence.pack.ready", tenant, models.EvidencePackReadyEvent{
			EventID:        "evt_" + uuid.NewString(),
			TenantID:       tenant,
			IntentID:       intentID,
			ContractID:     contractID,
			EvidencePackID: evidencePackID,
			MerkleRoot:     "mrk_" + uuid.NewString(),
			CreatedAt:      baseTime,
			TraceID:        "trace_" + uuid.NewString(),
		})
		events++

		outcome := "APPROVED"
		replay := true
		if i == 2 {
			outcome = "REJECTED"
			replay = false
		}
		pub.mustPublish(ctx, "governance.decision.created", tenant, models.GovernanceDecisionCreatedEvent{
			EventID:              "evt_" + uuid.NewString(),
			TenantID:             tenant,
			TraceID:              "trace_" + uuid.NewString(),
			OccurredAt:           baseTime,
			GovernanceDecisionID: "gdec_" + uuid.NewString(),
			IntentID:             intentID,
			ContractID:           contractID,
			EvidencePackID:       evidencePackID,
			DecisionOutcome:      outcome,
			KYCChecked:           true,
			AMLChecked:           i != 2,
			RiskChecked:          true,
			PolicyCompliant:      i != 2,
			ReplayEquivalent:     replay,
			AuthorityLevel:       "HUMAN_REVIEW",
			DecidedAt:            baseTime,
		})
		events++
	}

	pub.mustPublish(ctx, "batch.summary.updated", tenant, models.BatchSummaryUpdatedEvent{
		EventID:                   "evt_" + uuid.NewString(),
		TenantID:                  tenant,
		TraceID:                   "trace_" + uuid.NewString(),
		OccurredAt:                baseTime,
		BatchID:                   batchID,
		SourceReference:           batchID + ".csv",
		CorridorID:                corridorID,
		TotalCount:                5,
		SuccessCount:              0,
		FailedCount:               1,
		PendingCount:              2,
		ReversedCount:             1,
		PartialReconCount:         1,
		TotalIntendedAmountMinor:  totalIntended,
		TotalConfirmedAmountMinor: 2500,
		TotalVarianceMinor:        2500,
		AmbiguityScore:            0.86,
		BatchFinalityStatus:       "PROCESSING",
	})
	return events + 1
}

func (p *publisher) mustPublish(ctx context.Context, topic, tenant string, payload any) {
	body, err := json.Marshal(payload)
	must(err)
	must(p.writer.WriteMessages(ctx, kafka.Message{
		Topic: topic,
		Key:   []byte(tenant),
		Value: body,
	}))
}

func waitProcessedCount(ctx context.Context, pool *pgxpool.Pool, tenant string, expected int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if countRows(ctx, pool, "SELECT COUNT(*) FROM processed_events WHERE tenant_id=$1", tenant) >= expected {
			return nil
		}
		time.Sleep(2 * time.Second)
	}
	actual := countRows(ctx, pool, "SELECT COUNT(*) FROM processed_events WHERE tenant_id=$1", tenant)
	return fmt.Errorf("processed_events timeout: expected at least %d got %d", expected, actual)
}

func countRows(ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) int {
	var count int
	must(pool.QueryRow(ctx, sql, args...).Scan(&count))
	return count
}

func latestPrediction(ctx context.Context, pool *pgxpool.Pool, tenant, family, scopeRef string) predictionSummary {
	sql := `
		SELECT prediction_family, COALESCE(scope_ref, ''), prediction_value, prediction_score
		FROM ml_predictions
		WHERE tenant_id=$1 AND prediction_family=$2
	`
	args := []any{tenant, family}
	if scopeRef != "" {
		sql += " AND scope_ref=$3"
		args = append(args, scopeRef)
	}
	sql += " ORDER BY created_at DESC LIMIT 1"

	var result predictionSummary
	if err := pool.QueryRow(ctx, sql, args...).Scan(&result.Family, &result.Scope, &result.Value, &result.Score); err != nil {
		return predictionSummary{Family: family, Scope: scopeRef}
	}
	return result
}

func loadLatestPredictions(ctx context.Context, pool *pgxpool.Pool, tenant, highRiskBatch string) []predictionSummary {
	items := []predictionSummary{
		latestPrediction(ctx, pool, tenant, "AMBIGUITY", ""),
		latestPrediction(ctx, pool, tenant, "LEAKAGE", ""),
		latestPrediction(ctx, pool, tenant, "PATTERN", highRiskBatch),
	}
	return items
}

func findPrediction(items []predictionSummary, family, scope string) predictionSummary {
	for _, item := range items {
		if item.Family == family && (scope == "" || item.Scope == scope) {
			return item
		}
	}
	return predictionSummary{Family: family, Scope: scope}
}

func loadProjections(ctx context.Context, pool *pgxpool.Pool, tenant, highRiskBatch string) map[string]any {
	keys := []string{
		"ambiguity.summary",
		"leakage.total",
		"defensibility.summary",
		"batch.health." + highRiskBatch,
	}
	result := make(map[string]any, len(keys))
	for _, key := range keys {
		var raw []byte
		err := pool.QueryRow(ctx, `
			SELECT value_json::text
			FROM projection_state
			WHERE tenant_id=$1 AND projection_key=$2
			ORDER BY computed_at DESC
			LIMIT 1
		`, tenant, key).Scan(&raw)
		if err != nil {
			result[key] = nil
			continue
		}
		var payload map[string]any
		must(json.Unmarshal(raw, &payload))
		result[key] = payload
	}
	return result
}

func loadLatestFeatures(ctx context.Context, pool *pgxpool.Pool, tenant string, limit int) []featureSummary {
	rows, err := pool.Query(ctx, `
		SELECT feature_family, scope_type, COALESCE(scope_ref, ''), features_json::text
		FROM ml_feature_store
		WHERE tenant_id=$1
		ORDER BY created_at DESC
		LIMIT $2
	`, tenant, limit)
	must(err)
	defer rows.Close()

	var out []featureSummary
	for rows.Next() {
		var family, scopeType, scopeRef, raw string
		must(rows.Scan(&family, &scopeType, &scopeRef, &raw))
		features := map[string]any{}
		if raw != "" {
			must(json.Unmarshal([]byte(raw), &features))
		}
		out = append(out, featureSummary{
			Family:   family,
			Scope:    scopeType + ":" + scopeRef,
			Features: features,
		})
	}
	return out
}

func loadSnapshots(ctx context.Context, pool *pgxpool.Pool, tenant, batchID string) []snapshotSummary {
	type queryDef struct {
		snapshotType string
		scopeType    string
		scopeRef     string
	}
	defs := []queryDef{
		{snapshotType: "LEAKAGE", scopeType: "TENANT"},
		{snapshotType: "AMBIGUITY", scopeType: "TENANT"},
		{snapshotType: "DEFENSIBILITY", scopeType: "TENANT"},
		{snapshotType: "PATTERN", scopeType: "BATCH", scopeRef: batchID},
		{snapshotType: "RECOMMENDATION", scopeType: "TENANT"},
	}

	var out []snapshotSummary
	for _, def := range defs {
		sql := `
			SELECT scope_type, COALESCE(scope_ref, ''), COALESCE(model_version, ''), snapshot_json::text
			FROM intelligence_snapshots
			WHERE tenant_id=$1 AND snapshot_type=$2 AND scope_type=$3
		`
		args := []any{tenant, def.snapshotType, def.scopeType}
		if def.scopeRef != "" {
			sql += " AND scope_ref=$4"
			args = append(args, def.scopeRef)
		}
		sql += " ORDER BY created_at DESC LIMIT 1"

		var scopeType, scopeRef, modelVersion, raw string
		if err := pool.QueryRow(ctx, sql, args...).Scan(&scopeType, &scopeRef, &modelVersion, &raw); err != nil {
			continue
		}
		data := map[string]any{}
		must(json.Unmarshal([]byte(raw), &data))
		out = append(out, snapshotSummary{
			Type:         def.snapshotType,
			ScopeType:    scopeType,
			ScopeRef:     scopeRef,
			ModelVersion: modelVersion,
			Data:         data,
		})
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Type < out[j].Type })
	return out
}

func collectAPI(baseURL, tenant, batchID string) []apiSummary {
	paths := []string{
		"/v1/intelligence/leakage?tenant_id=" + tenant,
		"/v1/intelligence/ambiguity?tenant_id=" + tenant,
		"/v1/intelligence/defensibility?tenant_id=" + tenant,
		"/v1/intelligence/pattern?tenant_id=" + tenant + "&batch_id=" + batchID,
		"/v1/intelligence/recommendation?tenant_id=" + tenant,
	}

	client := &http.Client{Timeout: 5 * time.Second}
	results := make([]apiSummary, 0, len(paths))
	for _, path := range paths {
		item := apiSummary{Path: path}
		resp, err := client.Get(baseURL + path)
		if err != nil {
			results = append(results, item)
			continue
		}
		item.StatusCode = resp.StatusCode
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var envelope struct {
			DataAvailable bool            `json:"data_available"`
			Data          json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(body, &envelope); err == nil {
			item.DataAvailable = envelope.DataAvailable
			if len(bytes.TrimSpace(envelope.Data)) > 0 && string(bytes.TrimSpace(envelope.Data)) != "null" {
				data := map[string]any{}
				if err := json.Unmarshal(envelope.Data, &data); err == nil {
					item.Data = data
				}
			}
		}
		results = append(results, item)
	}
	return results
}
