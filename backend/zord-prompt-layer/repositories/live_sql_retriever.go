package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

var uuidRegex = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var batchHintRe = regexp.MustCompile(`(?i)\bbatch(?:_id| id)?\s*[:=]?\s*([A-Za-z0-9._:-]+)\b`)

type LiveSQLRetriever struct {
	edgeDB         *sql.DB
	intentDB       *sql.DB
	relayDB        *sql.DB
	intelligenceDB *sql.DB
	evidenceDB     *sql.DB
	outcomeDB      *sql.DB
	timeout        time.Duration
}

func NewLiveSQLRetriever(edgeDB, intentDB, relayDB, intelligenceDB, evidenceDB, outcomeDB *sql.DB) *LiveSQLRetriever {
	return &LiveSQLRetriever{
		edgeDB:         edgeDB,
		intentDB:       intentDB,
		relayDB:        relayDB,
		intelligenceDB: intelligenceDB,
		evidenceDB:     evidenceDB,
		outcomeDB:      outcomeDB,
		timeout:        4 * time.Second,
	}
}
func isFailureQuery(q string) bool {
	s := strings.ToLower(q)
	return strings.Contains(s, "fail") ||
		strings.Contains(s, "failed") ||
		strings.Contains(s, "failure") ||
		strings.Contains(s, "error") ||
		strings.Contains(s, "dlq")
}
func isBatchQuery(q string) bool {
	s := strings.ToLower(q)
	return strings.Contains(s, "batch") || strings.Contains(s, "csv") || strings.Contains(s, "upload")
}

func isDuplicateProtectionQuery(q string) bool {
	s := strings.ToLower(q)
	hints := []string{
		"idempotency",
		"duplicate",
		"duplicated",
		"same payment twice",
		"sent twice",
		"replay",
		"conflict",
	}
	for _, h := range hints {
		if strings.Contains(s, h) {
			return true
		}
	}
	return false
}

type retrievalPolicy struct {
	WantsIntentAggregate bool
	WantsDLQAggregate    bool
	WantsSettlementETA   bool
	WantsFollowup        bool
}

func classifyRetrievalPolicy(q string) retrievalPolicy {
	s := strings.ToLower(strings.TrimSpace(q))

	hasAny := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(s, w) {
				return true
			}
		}
		return false
	}

	countLike := hasAny("count", "total", "how many", "number of", "breakdown", "till now", "so far", "overall")
	intentLike := hasAny("intent", "intents", "payment instruction", "payment instructions", "payments")
	dlqLike := hasAny("dlq", "failed", "failure", "not processed", "error", "rejected")
	settlementLike := hasAny("settlement", "settlement file", "settle", "arrival", "arrive")
	followupLike := hasAny("those", "that", "these", "same ones", "them", "why are those", "why is that")

	return retrievalPolicy{
		WantsIntentAggregate: countLike && intentLike,
		WantsDLQAggregate:    (countLike && dlqLike) || hasAny("failed intents", "failed payments", "dlq count"),
		WantsSettlementETA:   settlementLike && hasAny("when", "arrive", "arrival", "expected", "eta"),
		WantsFollowup:        followupLike,
	}
}
func extractBatchHint(q string) string {
	m := batchHintRe.FindStringSubmatch(q)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}
func (r *LiveSQLRetriever) Retrieve(req dto.QueryRequest, intentID, traceID string, topK int, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	tenantID := ""
	effectiveTopK := topK
	if effectiveTopK <= 0 {
		effectiveTopK = 5
	}
	if isBatchQuery(req.Query) && effectiveTopK < 25 {
		effectiveTopK = 25
	}
	if strings.TrimSpace(req.TenantID) != "" {
		resolved, err := r.resolveTenantID(req.TenantID)
		if err != nil {
			return nil, err
		}
		tenantID = resolved
		// If tenant was provided but not found, return empty evidence.
		if tenantID == "" || !uuidRegex.MatchString(tenantID) {
			return []model.RetrievedChunk{}, nil
		}
	}

	failureOnly := isFailureQuery(req.Query)
	includeDuplicateSignals := isDuplicateProtectionQuery(req.Query)
	policy := classifyRetrievalPolicy(req.Query)
	chunks := make([]model.RetrievedChunk, 0, effectiveTopK*4)

	if r.edgeDB != nil {
		if c, err := r.fetchFromEdge(tenantID, traceID, effectiveTopK, failureOnly, scope, includeDuplicateSignals); err == nil {
			chunks = append(chunks, c...)
		}

	}
	if r.intentDB != nil {
		if c, err := r.fetchFromIntent(tenantID, intentID, traceID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
		if d, err := r.fetchFromIntentDLQ(tenantID, effectiveTopK, scope, policy); err == nil {
			chunks = append(chunks, d...)
		}
		if b, err := r.fetchBatchIntentSummary(tenantID, req.Query, scope, policy); err == nil {
			chunks = append(chunks, b...)
		}
	}
	if r.relayDB != nil {
		if c, err := r.fetchFromRelay(tenantID, intentID, traceID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
	}

	if r.intelligenceDB != nil {
		if c, err := r.fetchFromIntelligence(tenantID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
	}

	if r.evidenceDB != nil {
		if c, err := r.fetchFromEvidence(tenantID, effectiveTopK, failureOnly, scope); err == nil {
			chunks = append(chunks, c...)
		}
	}

	finalTopK := topK
	if finalTopK <= 0 {
		finalTopK = 5
	}
	if isBatchQuery(req.Query) && finalTopK < 20 {
		finalTopK = 20
	}
	chunks = rankAndTrimBalanced(chunks, finalTopK)
	return chunks, nil

}

func (r *LiveSQLRetriever) resolveTenantID(input string) (string, error) {
	if uuidRegex.MatchString(input) {
		return strings.ToLower(input), nil
	}
	if r.edgeDB == nil {
		return "", nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	var tenantID string
	err := r.edgeDB.QueryRowContext(ctx, `
		SELECT tenant_id::text
		FROM tenants
		WHERE tenant_name = $1
		LIMIT 1
	`, input).Scan(&tenantID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("tenant resolution failed: %w", err)
	}
	return strings.ToLower(tenantID), nil
}

func (r *LiveSQLRetriever) fetchFromEdge(
	tenantID, traceID string,
	topK int,
	failureOnly bool,
	scope utils.QueryScope,
	includeDuplicateSignals bool,
) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	perTableLimit := topK
	if perTableLimit <= 0 {
		perTableLimit = 5
	}

	out := make([]model.RetrievedChunk, 0, perTableLimit*5)

	// ------------------------------------------------------------------
	// 1) ingress_outbox (highest operational value first)
	// Safe columns only:
	// source, topic, status, attempts, next_retry_at, event_type,
	// created_at, updated_at, published_at, failure_reason_code
	// ------------------------------------------------------------------
	{
		args := []any{}
		q := `
			SELECT source, topic, status, attempts,
			       next_retry_at::text, event_type,
			       created_at::text, updated_at::text, published_at::text,
			       failure_reason_code
			FROM ingress_outbox
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if traceID != "" && uuidRegex.MatchString(traceID) {
			q += fmt.Sprintf(" AND trace_id::text = $%d", len(args)+1)
			args = append(args, strings.ToLower(traceID))
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR failure_reason_code IS NOT NULL)"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge outbox retrieval failed: %w", err)
		}
		for rows.Next() {
			var source, topic, status, eventType string
			var attempts int
			var nextRetryAt, createdAt, updatedAt, publishedAt, failureReason sql.NullString

			if err := rows.Scan(
				&source, &topic, &status, &attempts,
				&nextRetryAt, &eventType,
				&createdAt, &updatedAt, &publishedAt, &failureReason,
			); err != nil {
				rows.Close()
				return nil, err
			}

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_ingress_outbox",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.99,
				Text: fmt.Sprintf(
					"Ingestion handoff status: source=%s topic=%s status=%s attempts=%d event_type=%s created_at=%s updated_at=%s published_at=%s next_retry_at=%s failure_reason=%s",
					source, topic, status, attempts, eventType,
					nullText(createdAt), nullText(updatedAt), nullText(publishedAt), nullText(nextRetryAt), nullText(failureReason),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	// ------------------------------------------------------------------
	// 2) ingress_envelopes
	// Safe columns only:
	// ingress_channel, source_class, source_system, content_type,
	// payload_size, status, received_at, file_name, file_size_bytes,
	// row_count_estimate, file_upload_channel
	// ------------------------------------------------------------------
	{
		args := []any{}
		q := `
			SELECT ingress_channel, source_class, source_system, content_type,
			       payload_size, status, received_at::text,
			       file_name, file_size_bytes, row_count_estimate, file_upload_channel
			FROM ingress_envelopes
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if traceID != "" && uuidRegex.MatchString(traceID) {
			q += fmt.Sprintf(" AND trace_id::text = $%d", len(args)+1)
			args = append(args, strings.ToLower(traceID))
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR status ILIKE '%DLQ%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND received_at >= $%d AND received_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY received_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge envelopes retrieval failed: %w", err)
		}
		for rows.Next() {
			var ingressChannel, sourceClass, sourceSystem, contentType, status, receivedAt string
			var payloadSize int
			var fileName, fileSizeBytes, rowCountEstimate, fileUploadChannel sql.NullString

			if err := rows.Scan(
				&ingressChannel, &sourceClass, &sourceSystem, &contentType,
				&payloadSize, &status, &receivedAt,
				&fileName, &fileSizeBytes, &rowCountEstimate, &fileUploadChannel,
			); err != nil {
				rows.Close()
				return nil, err
			}

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_ingress_envelopes",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.97,
				Text: fmt.Sprintf(
					"Ingress receive status: channel=%s source_class=%s source_system=%s content_type=%s payload_size=%d status=%s received_at=%s file_name=%s file_size_bytes=%s row_count_estimate=%s upload_channel=%s",
					ingressChannel, sourceClass, sourceSystem, contentType, payloadSize, status, receivedAt,
					nullText(fileName), nullText(fileSizeBytes), nullText(rowCountEstimate), nullText(fileUploadChannel),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	// ------------------------------------------------------------------
	// 3) idempotency_keys
	// Safe columns only:
	// status, resolution_type, conflict_count, source_class_first_seen,
	// first_seen_at, last_seen_at, expires_at, last_conflict_at
	// ------------------------------------------------------------------
	if includeDuplicateSignals {
		args := []any{}
		q := `
			SELECT status, resolution_type, conflict_count, source_class_first_seen,
			       first_seen_at::text, last_seen_at::text, expires_at::text, last_conflict_at::text
			FROM idempotency_keys
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (conflict_count > 0 OR status ILIKE '%FAIL%' OR resolution_type ILIKE '%CONFLICT%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND last_seen_at >= $%d AND last_seen_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY last_seen_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge idempotency retrieval failed: %w", err)
		}
		for rows.Next() {
			var status, resolutionType string
			var conflictCount int
			var sourceClassFirstSeen, firstSeenAt, lastSeenAt, expiresAt, lastConflictAt sql.NullString

			if err := rows.Scan(
				&status, &resolutionType, &conflictCount, &sourceClassFirstSeen,
				&firstSeenAt, &lastSeenAt, &expiresAt, &lastConflictAt,
			); err != nil {
				rows.Close()
				return nil, err
			}

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_idempotency_keys",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.95,
				Text: fmt.Sprintf(
					"Idempotency state: status=%s resolution=%s conflicts=%d source_class=%s first_seen_at=%s last_seen_at=%s expires_at=%s last_conflict_at=%s",
					status, resolutionType, conflictCount, nullText(sourceClassFirstSeen),
					nullText(firstSeenAt), nullText(lastSeenAt), nullText(expiresAt), nullText(lastConflictAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	// ------------------------------------------------------------------
	// 4) connectors
	// Safe columns only:
	// provider, connector_id, active, created_at, updated_at
	// ------------------------------------------------------------------
	{
		args := []any{}
		q := `
			SELECT provider, connector_id, active, created_at::text, updated_at::text
			FROM connectors
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND active = false"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND updated_at >= $%d AND updated_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY updated_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge connectors retrieval failed: %w", err)
		}
		for rows.Next() {
			var provider, connectorID, createdAt, updatedAt string
			var active bool
			if err := rows.Scan(&provider, &connectorID, &active, &createdAt, &updatedAt); err != nil {
				rows.Close()
				return nil, err
			}

			// connector_id is queried (as requested) but not exposed in text to minimize identifier leakage risk.
			_ = connectorID

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_connectors",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.90,
				Text: fmt.Sprintf(
					"Connector configuration: provider=%s active=%t created_at=%s updated_at=%s",
					provider, active, createdAt, updatedAt,
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	// ------------------------------------------------------------------
	// 5) tenants
	// Safe columns only:
	// tenant_name, is_active, created_at
	// ------------------------------------------------------------------
	{
		args := []any{}
		q := `
			SELECT tenant_name, is_active, created_at::text
			FROM tenants
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND is_active = false"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", perTableLimit)

		rows, err := r.edgeDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("edge tenants retrieval failed: %w", err)
		}
		for rows.Next() {
			var tenantName, createdAt string
			var isActive bool
			if err := rows.Scan(&tenantName, &isActive, &createdAt); err != nil {
				rows.Close()
				return nil, err
			}

			out = append(out, model.RetrievedChunk{
				ChunkID:    "",
				SourceType: "edge_tenants",
				RecordID:   "",
				IntentID:   "",
				TraceID:    "",
				TenantID:   "",
				Score:      0.88,
				Text:       fmt.Sprintf("Tenant profile: name=%s active=%t created_at=%s", tenantName, isActive, createdAt),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return out, nil
}

func nullText(v sql.NullString) string {
	if !v.Valid || strings.TrimSpace(v.String) == "" {
		return "-"
	}
	return v.String
}

func (r *LiveSQLRetriever) fetchFromIntent(tenantID, intentID, traceID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	args := []any{}
	q := `
		SELECT intent_id::text, envelope_id::text, trace_id::text, status, intent_type,
		       amount::text, currency, confidence_score::text, created_at::text
		FROM payment_intents
		WHERE 1=1
	`
	if tenantID != "" {
		q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
		args = append(args, tenantID)
	}
	if intentID != "" && uuidRegex.MatchString(intentID) {
		q += fmt.Sprintf(" AND intent_id::text = $%d", len(args)+1)
		args = append(args, strings.ToLower(intentID))
	}
	if traceID != "" && uuidRegex.MatchString(traceID) {
		q += fmt.Sprintf(" AND trace_id::text = $%d", len(args)+1)
		args = append(args, strings.ToLower(traceID))
	}
	if failureOnly {
		q += " AND status ILIKE '%FAIL%'"
	}
	if scope.HasExplicitTime {
		q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
		args = append(args, scope.StartUTC, scope.EndUTC)
	}

	q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

	rows, err := r.intentDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("intent retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, topK*2)
	for rows.Next() {
		var id, envelopeID, tr, status, intentType, amount, currency, createdAt string
		var confidence sql.NullString

		if err := rows.Scan(&id, &envelopeID, &tr, &status, &intentType, &amount, &currency, &confidence, &createdAt); err != nil {
			return nil, err
		}

		confidenceVal := "null"
		if confidence.Valid {
			confidenceVal = confidence.String
		}

		out = append(out, model.RetrievedChunk{
			ChunkID:    "",
			SourceType: "intent_payment_intents",
			RecordID:   "",
			IntentID:   "",
			TraceID:    "",
			TenantID:   "",
			Score:      1.0,
			Text: fmt.Sprintf("Intent event: status=%s type=%s amount=%s %s confidence=%s created_at=%s",
				status, intentType, amount, currency, confidenceVal, createdAt),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	args = []any{}
	q = `
		SELECT event_id::text, aggregate_id::text, trace_id::text, event_type, status, retry_count::text, created_at::text, sent_at::text
		FROM outbox
		WHERE 1=1
	`
	if tenantID != "" {
		q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
		args = append(args, tenantID)
	}
	if intentID != "" && uuidRegex.MatchString(intentID) {
		q += fmt.Sprintf(" AND aggregate_id::text = $%d", len(args)+1)
		args = append(args, strings.ToLower(intentID))
	}
	if traceID != "" && uuidRegex.MatchString(traceID) {
		q += fmt.Sprintf(" AND trace_id::text = $%d", len(args)+1)
		args = append(args, strings.ToLower(traceID))
	}
	if failureOnly {
		q += " AND status ILIKE '%FAIL%'"
	}
	if scope.HasExplicitTime {
		q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
		args = append(args, scope.StartUTC, scope.EndUTC)
	}

	q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

	rows2, err := r.intentDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("outbox retrieval failed: %w", err)
	}
	defer rows2.Close()

	for rows2.Next() {
		var eventID, aggID, tr, eventType, status, retryCount, createdAt, sentAt sql.NullString
		if err := rows2.Scan(&eventID, &aggID, &tr, &eventType, &status, &retryCount, &createdAt, &sentAt); err != nil {
			return nil, err
		}
		out = append(out, model.RetrievedChunk{
			ChunkID:    "",
			SourceType: "intent_outbox",
			RecordID:   "",
			IntentID:   "",
			TraceID:    "",
			TenantID:   "",
			Score:      0.95,
			Text: fmt.Sprintf("Outbox event: event_type=%s status=%s retry_count=%s created_at=%s sent_at=%s",
				eventType.String, status.String, retryCount.String, createdAt.String, sentAt.String),
		})
	}
	return out, rows2.Err()
}
func (r *LiveSQLRetriever) fetchBatchIntentSummary(tenantID, userQuery string, scope utils.QueryScope, policy retrievalPolicy) ([]model.RetrievedChunk, error) {
	batchID := extractBatchHint(userQuery)
	if tenantID == "" {
		return []model.RetrievedChunk{}, nil
	}

	if !isBatchQuery(userQuery) && !policy.WantsIntentAggregate && !policy.WantsSettlementETA {
		return []model.RetrievedChunk{}, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	out := make([]model.RetrievedChunk, 0, 3)

	if batchID != "" {
		// Specific batch aggregate snapshot
		{
			var received, canonicalized, dlqCount, reviewCount, lowMatch, lowProof, dupRisk int
			var successRate, avgQuality, batchQuality, updatedAt sql.NullString

			err := r.intentDB.QueryRowContext(ctx, `
				SELECT
					received_count,
					canonicalized_count,
					dlq_count,
					review_count,
					low_matchability_count,
					low_proof_readiness_count,
					duplicate_risk_count,
					canonicalization_success_rate::text,
					avg_intent_quality_score::text,
					batch_quality_score::text,
					updated_at::text
				FROM canonical_batches
				WHERE tenant_id::text = $1 AND batch_id = $2
				AND ($3::timestamptz IS NULL OR updated_at >= $3)
				AND ($4::timestamptz IS NULL OR updated_at < $4)
				LIMIT 1
			`, tenantID, batchID, nullableTS(scope.StartUTC, scope.HasExplicitTime), nullableTS(scope.EndUTC, scope.HasExplicitTime)).Scan(
				&received, &canonicalized, &dlqCount, &reviewCount, &lowMatch, &lowProof, &dupRisk,
				&successRate, &avgQuality, &batchQuality, &updatedAt,
			)

			if err == nil {
				out = append(out, model.RetrievedChunk{
					SourceType: "intent_canonical_batches",
					Score:      1.0,
					Text: fmt.Sprintf(
						"Batch quality summary: batch_id=%s received=%d canonicalized=%d dlq=%d review=%d low_matchability=%d low_proof_readiness=%d duplicate_risk_count=%d canonicalization_success_rate=%s avg_intent_quality_score=%s batch_quality_score=%s updated_at=%s",
						batchID, received, canonicalized, dlqCount, reviewCount, lowMatch, lowProof, dupRisk,
						nullText(successRate), nullText(avgQuality), nullText(batchQuality), nullText(updatedAt),
					),
				})
			}
		}
	} else {
		// No explicit batch_id in query: include latest tenant batch snapshots for broader batch CSV context.
		rows, err := r.intentDB.QueryContext(ctx, `
			SELECT batch_id, received_count, canonicalized_count, dlq_count, review_count, batch_quality_score::text, updated_at::text
			FROM canonical_batches
			WHERE tenant_id::text = $1
			  AND ($2::timestamptz IS NULL OR updated_at >= $2)
			  AND ($3::timestamptz IS NULL OR updated_at < $3)
			ORDER BY updated_at DESC
			LIMIT 5
		`, tenantID, nullableTS(scope.StartUTC, scope.HasExplicitTime), nullableTS(scope.EndUTC, scope.HasExplicitTime))
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id string
				var received, canonicalized, dlqCount, reviewCount int
				var batchQuality, updatedAt sql.NullString
				if scanErr := rows.Scan(&id, &received, &canonicalized, &dlqCount, &reviewCount, &batchQuality, &updatedAt); scanErr != nil {
					continue
				}
				out = append(out, model.RetrievedChunk{
					SourceType: "intent_canonical_batches_recent",
					Score:      0.98,
					Text: fmt.Sprintf(
						"Recent batch summary: batch_id=%s received=%d canonicalized=%d dlq=%d review=%d batch_quality_score=%s updated_at=%s",
						id, received, canonicalized, dlqCount, reviewCount, nullText(batchQuality), nullText(updatedAt),
					),
				})
			}
		}
	}

	// Per-status distribution across intents (specific batch when provided, else tenant window)
	{
		var (
			rows *sql.Rows
			err  error
		)
		if batchID != "" {
			rows, err = r.intentDB.QueryContext(ctx, `
				SELECT status, COUNT(*)::int
				FROM payment_intents
				WHERE tenant_id::text = $1 AND batchid = $2
				  AND ($3::timestamptz IS NULL OR created_at >= $3)
				  AND ($4::timestamptz IS NULL OR created_at < $4)
				GROUP BY status
				ORDER BY COUNT(*) DESC
			`, tenantID, batchID, nullableTS(scope.StartUTC, scope.HasExplicitTime), nullableTS(scope.EndUTC, scope.HasExplicitTime))
		} else {
			rows, err = r.intentDB.QueryContext(ctx, `
				SELECT status, COUNT(*)::int
				FROM payment_intents
				WHERE tenant_id::text = $1
				  AND ($2::timestamptz IS NULL OR created_at >= $2)
				  AND ($3::timestamptz IS NULL OR created_at < $3)
				GROUP BY status
				ORDER BY COUNT(*) DESC
			`, tenantID, nullableTS(scope.StartUTC, scope.HasExplicitTime), nullableTS(scope.EndUTC, scope.HasExplicitTime))
		}
		if err == nil {
			defer rows.Close()
			parts := make([]string, 0, 8)
			total := 0
			for rows.Next() {
				var status string
				var cnt int
				if err := rows.Scan(&status, &cnt); err != nil {
					continue
				}
				total += cnt
				parts = append(parts, fmt.Sprintf("%s=%d", status, cnt))
			}
			if len(parts) > 0 {
				label := "Tenant batch intent distribution"
				if batchID != "" {
					label = "Batch intent distribution: batch_id=" + batchID
				}
				out = append(out, model.RetrievedChunk{
					SourceType: "intent_batch_status_distribution",
					Score:      0.99,
					Text:       fmt.Sprintf("%s total_intents=%d status_breakdown=%s", label, total, strings.Join(parts, ", ")),
				})
			}
		}
	}
	if policy.WantsSettlementETA {
		ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
		defer cancel()

		args := []any{tenantID}
		q := `
			SELECT MAX(created_at)::text
			FROM payment_intents
			WHERE tenant_id::text = $1
		`
		if scope.HasExplicitTime {
			q += " AND created_at >= $2 AND created_at < $3"
			args = append(args, scope.StartUTC, scope.EndUTC)
		}

		var latestCreatedAt sql.NullString
		if err := r.intentDB.QueryRowContext(ctx, q, args...).Scan(&latestCreatedAt); err == nil && latestCreatedAt.Valid {
			settlementAvailable := false
			settlementLatestAt := ""

			if r.outcomeDB != nil {
				outcomeArgs := []any{tenantID}
				outcomeQ := `
					SELECT MAX(created_at)::text
					FROM canonical_settlement_observations
					WHERE tenant_id::text = $1
				`
				if scope.HasExplicitTime {
					outcomeQ += " AND created_at >= $2 AND created_at < $3"
					outcomeArgs = append(outcomeArgs, scope.StartUTC, scope.EndUTC)
				}

				var latestSettlementAt sql.NullString
				if err := r.outcomeDB.QueryRowContext(ctx, outcomeQ, outcomeArgs...).Scan(&latestSettlementAt); err == nil && latestSettlementAt.Valid {
					settlementAvailable = true
					settlementLatestAt = nullText(latestSettlementAt)
				}
			}

			out = append(out, model.RetrievedChunk{
				SourceType: "intent_payment_intents",
				Score:      1.0,
				Text: fmt.Sprintf(
					"Settlement ETA policy: normal_settlement_window=T+1_day latest_payment_instruction_created_at=%s settlement_evidence_available=%t latest_settlement_evidence_at=%s estimate_basis=latest_payment_instruction_timestamp",
					nullText(latestCreatedAt),
					settlementAvailable,
					settlementLatestAt,
				),
			})
		}
	}
	return out, nil
}

func nullableTS(t time.Time, enabled bool) any {
	if !enabled {
		return nil
	}
	return t
}
func (r *LiveSQLRetriever) fetchFromIntentDLQ(tenantID string, topK int, scope utils.QueryScope, policy retrievalPolicy) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	args := []any{}
	q := `
		SELECT dlq_id::text, tenant_id::text, envelope_id::text, stage, reason_code, error_detail, replayable::text, created_at::text
		FROM dlq_items
		WHERE 1=1
	`
	if tenantID != "" {
		q += fmt.Sprintf(" AND tenant_id::text = $%d", len(args)+1)
		args = append(args, tenantID)
	}
	if scope.HasExplicitTime {
		q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
		args = append(args, scope.StartUTC, scope.EndUTC)
	}

	// dlq_items are already failure records; no extra failureOnly condition needed
	q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

	rows, err := r.intentDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("intent dlq retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, topK)
	if policy.WantsDLQAggregate && tenantID != "" {
		args := []any{tenantID}
		q := `
			SELECT
				COUNT(*)::bigint AS dlq_entries,
				COUNT(DISTINCT COALESCE(NULLIF(trace_id::text, ''), envelope_id::text))::bigint AS unique_payment_instructions_affected
			FROM dlq_items
			WHERE tenant_id::text = $1
		`
		if scope.HasExplicitTime {
			q += " AND created_at >= $2 AND created_at < $3"
			args = append(args, scope.StartUTC, scope.EndUTC)
		}

		var dlqEntries int64
		var uniqueAffected int64
		if err := r.intentDB.QueryRowContext(ctx, q, args...).Scan(&dlqEntries, &uniqueAffected); err == nil {
			out = append(out, model.RetrievedChunk{
				SourceType: "intent_dlq_items",
				Score:      0.99,
				Text: fmt.Sprintf(
					"DLQ aggregate summary: dlq_entries=%d unique_payment_instructions_affected=%d time_scope=%s",
					dlqEntries,
					uniqueAffected,
					scopeLabel(scope),
				),
			})
		}
	}

	for rows.Next() {
		var dlqID, tID, envelopeID, stage, reasonCode, errorDetail, replayable, createdAt sql.NullString
		if err := rows.Scan(&dlqID, &tID, &envelopeID, &stage, &reasonCode, &errorDetail, &replayable, &createdAt); err != nil {
			return nil, err
		}
		out = append(out, model.RetrievedChunk{
			ChunkID:    "",
			SourceType: "intent_dlq_items",
			RecordID:   "",
			TenantID:   "",
			Score:      0.97,
			Text: fmt.Sprintf("DLQ item: stage=%s reason_code=%s replayable=%s created_at=%s error_detail=%s",
				stage.String, reasonCode.String, replayable.String, createdAt.String, errorDetail.String),
		})
	}
	return out, rows.Err()
}

func (r *LiveSQLRetriever) fetchFromRelay(tenantID, intentID, traceID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	if topK <= 0 {
		topK = 5
	}
	out := make([]model.RetrievedChunk, 0, topK*2)

	{
		args := []any{}
		q := `
			SELECT status, attempt_count, retry_class, provider_response_status,
			       next_dispatch_attempt_at::text, created_at::text, updated_at::text, sent_at::text, acked_at::text
			FROM dispatches
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR status ILIKE '%RETRY%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.relayDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("relay dispatches retrieval failed: %w", err)
		}
		for rows.Next() {
			var status string
			var attempt int
			var retryClass, providerStatus, nextAttempt, createdAt, updatedAt, sentAt, ackedAt sql.NullString
			if err := rows.Scan(&status, &attempt, &retryClass, &providerStatus, &nextAttempt, &createdAt, &updatedAt, &sentAt, &ackedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "relay_dispatches",
				Score:      0.93,
				Text: fmt.Sprintf(
					"Relay dispatch status: status=%s attempts=%d retry_class=%s provider_response_status=%s next_retry_at=%s created_at=%s updated_at=%s sent_at=%s acked_at=%s",
					status, attempt, nullText(retryClass), nullText(providerStatus), nullText(nextAttempt),
					nullText(createdAt), nullText(updatedAt), nullText(sentAt), nullText(ackedAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	{
		args := []any{}
		q := `
			SELECT event_type, status, retry_count, created_at::text, published_at::text
			FROM relay_outbox
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR retry_count > 0)"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.relayDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("relay outbox retrieval failed: %w", err)
		}
		for rows.Next() {
			var eventType, status, createdAt string
			var retryCount int
			var publishedAt sql.NullString
			if err := rows.Scan(&eventType, &status, &retryCount, &createdAt, &publishedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "relay_outbox",
				Score:      0.90,
				Text: fmt.Sprintf(
					"Relay event delivery: event_type=%s status=%s retry_count=%d created_at=%s published_at=%s",
					eventType, status, retryCount, createdAt, nullText(publishedAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	return out, nil
}
func (r *LiveSQLRetriever) fetchFromIntelligence(tenantID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	if topK <= 0 {
		topK = 5
	}
	out := make([]model.RetrievedChunk, 0, topK*3)

	{
		args := []any{}
		q := `
			SELECT projection_key, value_json::text, window_end::text, computed_at::text
			FROM projection_state
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND computed_at >= $%d AND computed_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY computed_at DESC LIMIT %d", topK)

		rows, err := r.intelligenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("intelligence projection retrieval failed: %w", err)
		}
		for rows.Next() {
			var key, valueJSON, windowEnd, computedAt string
			if err := rows.Scan(&key, &valueJSON, &windowEnd, &computedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "intelligence_projection_state",
				Score:      0.92,
				Text:       fmt.Sprintf("Intelligence metric: projection=%s window_end=%s computed_at=%s value=%s", key, windowEnd, computedAt, valueJSON),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	{
		args := []any{}
		q := `
			SELECT snapshot_type, scope_type, window_start::text, window_end::text, model_version, created_at::text
			FROM intelligence_snapshots
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.intelligenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("intelligence snapshots retrieval failed: %w", err)
		}
		for rows.Next() {
			var snapType, scopeType, windowStart, windowEnd, modelVersion, createdAt sql.NullString
			if err := rows.Scan(&snapType, &scopeType, &windowStart, &windowEnd, &modelVersion, &createdAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "intelligence_snapshots",
				Score:      0.89,
				Text: fmt.Sprintf(
					"Intelligence snapshot: type=%s scope=%s window_start=%s window_end=%s model_version=%s created_at=%s",
					nullText(snapType), nullText(scopeType), nullText(windowStart), nullText(windowEnd), nullText(modelVersion), nullText(createdAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	{
		args := []any{}
		q := `
			SELECT decision, confidence::text, contract_status, policy_family, severity, created_at::text
			FROM action_contracts
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (severity = 'HIGH' OR contract_status ILIKE '%PENDING%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.intelligenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("intelligence actions retrieval failed: %w", err)
		}
		for rows.Next() {
			var decision, confidence, status, family, severity, createdAt sql.NullString
			if err := rows.Scan(&decision, &confidence, &status, &family, &severity, &createdAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "intelligence_action_contracts",
				Score:      0.88,
				Text: fmt.Sprintf(
					"Intelligence action state: decision=%s confidence=%s status=%s family=%s severity=%s created_at=%s",
					nullText(decision), nullText(confidence), nullText(status), nullText(family), nullText(severity), nullText(createdAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	return out, nil
}

func (r *LiveSQLRetriever) fetchFromEvidence(tenantID string, topK int, failureOnly bool, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	defer cancel()

	if topK <= 0 {
		topK = 5
	}
	out := make([]model.RetrievedChunk, 0, topK*2)

	{
		args := []any{}
		q := `
			SELECT mode, pack_status, ruleset_version, signature_alg, replay_equivalence_status, created_at::text, updated_at::text
			FROM evidence_packs
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (pack_status ILIKE '%FAILED%' OR replay_equivalence_status ILIKE '%MISMATCH%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.evidenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("evidence packs retrieval failed: %w", err)
		}
		for rows.Next() {
			var mode, packStatus, rulesetVersion, signatureAlg, replayStatus, createdAt, updatedAt sql.NullString
			if err := rows.Scan(&mode, &packStatus, &rulesetVersion, &signatureAlg, &replayStatus, &createdAt, &updatedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "evidence_packs",
				Score:      0.90,
				Text: fmt.Sprintf(
					"Evidence pack status: mode=%s pack_status=%s ruleset_version=%s signature_algorithm=%s replay_status=%s created_at=%s updated_at=%s",
					nullText(mode), nullText(packStatus), nullText(rulesetVersion), nullText(signatureAlg), nullText(replayStatus), nullText(createdAt), nullText(updatedAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	{
		args := []any{}
		q := `
			SELECT status, ruleset_version, equivalence_result, created_at::text, completed_at::text
			FROM evidence_replay_jobs
			WHERE 1=1
		`
		if tenantID != "" {
			q += fmt.Sprintf(" AND tenant_id = $%d", len(args)+1)
			args = append(args, tenantID)
		}
		if failureOnly {
			q += " AND (status ILIKE '%FAIL%' OR equivalence_result ILIKE '%MISMATCH%')"
		}
		if scope.HasExplicitTime {
			q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
			args = append(args, scope.StartUTC, scope.EndUTC)
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

		rows, err := r.evidenceDB.QueryContext(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("evidence replay retrieval failed: %w", err)
		}
		for rows.Next() {
			var status, rulesetVersion, equivalence, createdAt, completedAt sql.NullString
			if err := rows.Scan(&status, &rulesetVersion, &equivalence, &createdAt, &completedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, model.RetrievedChunk{
				SourceType: "evidence_replay_jobs",
				Score:      0.86,
				Text: fmt.Sprintf(
					"Evidence replay job: status=%s ruleset_version=%s equivalence_result=%s created_at=%s completed_at=%s",
					nullText(status), nullText(rulesetVersion), nullText(equivalence), nullText(createdAt), nullText(completedAt),
				),
			})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	return out, nil
}
func rankAndTrimBalanced(chunks []model.RetrievedChunk, topK int) []model.RetrievedChunk {
	if topK <= 0 || len(chunks) <= topK {
		return chunks
	}

	buckets := map[string][]model.RetrievedChunk{}
	for _, c := range chunks {
		k := sourceServiceBucket(c.SourceType)
		buckets[k] = append(buckets[k], c)
	}

	keys := make([]string, 0, len(buckets))
	for k := range buckets {
		sort.SliceStable(buckets[k], func(i, j int) bool { return buckets[k][i].Score > buckets[k][j].Score })
		keys = append(keys, k)
	}
	sort.SliceStable(keys, func(i, j int) bool {
		return buckets[keys[i]][0].Score > buckets[keys[j]][0].Score
	})

	out := make([]model.RetrievedChunk, 0, topK)
	for len(out) < topK {
		added := false
		for _, k := range keys {
			if len(buckets[k]) == 0 {
				continue
			}
			out = append(out, buckets[k][0])
			buckets[k] = buckets[k][1:]
			added = true
			if len(out) == topK {
				break
			}
		}
		if !added {
			break
		}
	}
	return out
}
func scopeLabel(scope utils.QueryScope) string {
	if strings.TrimSpace(scope.TimePhrase) != "" {
		return strings.TrimSpace(scope.TimePhrase)
	}
	if scope.HasExplicitTime {
		return scope.StartUTC.UTC().Format(time.RFC3339) + "_to_" + scope.EndUTC.UTC().Format(time.RFC3339)
	}
	return "all_available_records"
}
func sourceServiceBucket(sourceType string) string {
	s := strings.ToLower(strings.TrimSpace(sourceType))
	switch {
	case strings.HasPrefix(s, "edge_"):
		return "edge"
	case strings.HasPrefix(s, "intent_"):
		return "intent"
	case strings.HasPrefix(s, "relay_"):
		return "relay"
	case strings.HasPrefix(s, "intelligence_"):
		return "intelligence"
	case strings.HasPrefix(s, "evidence_"):
		return "evidence"
	default:
		return s
	}
}
