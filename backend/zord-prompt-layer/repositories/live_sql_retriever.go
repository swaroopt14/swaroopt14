package repositories

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
	"time"

	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

var uuidRegex = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type LiveSQLRetriever struct {
	edgeDB   *sql.DB
	intentDB *sql.DB
	relayDB  *sql.DB
	timeout  time.Duration
}

func NewLiveSQLRetriever(edgeDB, intentDB, relayDB *sql.DB) *LiveSQLRetriever {
	return &LiveSQLRetriever{
		edgeDB:   edgeDB,
		intentDB: intentDB,
		relayDB:  relayDB,
		timeout:  4 * time.Second,
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

func (r *LiveSQLRetriever) Retrieve(req dto.QueryRequest, intentID, traceID string, topK int, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
	tenantID := ""
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
	chunks := make([]model.RetrievedChunk, 0, topK*4)

	if r.edgeDB != nil {
		c, err := r.fetchFromEdge(tenantID, traceID, topK, failureOnly, scope)

		if err != nil {
			return nil, err
		}
		chunks = append(chunks, c...)
	}
	if r.intentDB != nil {
		c, err := r.fetchFromIntent(tenantID, intentID, traceID, topK, failureOnly, scope)
		if err != nil {
			return nil, err
		}
		chunks = append(chunks, c...)

		d, err := r.fetchFromIntentDLQ(tenantID, topK, scope)
		if err != nil {
			return nil, err
		}
		chunks = append(chunks, d...)
	}
	if r.relayDB != nil {
		c, err := r.fetchFromRelay(tenantID, intentID, traceID, topK, failureOnly, scope)
		if err != nil {
			return nil, err
		}
		chunks = append(chunks, c...)
	}

	if len(chunks) > topK {
		chunks = chunks[:topK]
	}
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
	{
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

	if len(out) > topK && topK > 0 {
		out = out[:topK]
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
			ChunkID:    "intent_" + id,
			SourceType: "intent_payment_intents",
			RecordID:   id,
			IntentID:   id,
			TraceID:    tr,
			TenantID:   tenantID,
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
			ChunkID:    "outbox_" + eventID.String,
			SourceType: "intent_outbox",
			RecordID:   eventID.String,
			IntentID:   aggID.String,
			TraceID:    tr.String,
			TenantID:   tenantID,
			Score:      0.95,
			Text: fmt.Sprintf("Outbox event: event_type=%s status=%s retry_count=%s created_at=%s sent_at=%s",
				eventType.String, status.String, retryCount.String, createdAt.String, sentAt.String),
		})
	}
	return out, rows2.Err()
}
func (r *LiveSQLRetriever) fetchFromIntentDLQ(tenantID string, topK int, scope utils.QueryScope) ([]model.RetrievedChunk, error) {
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
	for rows.Next() {
		var dlqID, tID, envelopeID, stage, reasonCode, errorDetail, replayable, createdAt sql.NullString
		if err := rows.Scan(&dlqID, &tID, &envelopeID, &stage, &reasonCode, &errorDetail, &replayable, &createdAt); err != nil {
			return nil, err
		}
		out = append(out, model.RetrievedChunk{
			ChunkID:    "intent_dlq_" + dlqID.String,
			SourceType: "intent_dlq_items",
			RecordID:   dlqID.String,
			TenantID:   tID.String,
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

	args := []any{}
	q := `
		SELECT contract_id::text, intent_id::text, envelope_id::text, trace_id, status, created_at::text
		FROM payout_contracts
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
	if traceID != "" {
		q += fmt.Sprintf(" AND trace_id = $%d", len(args)+1)
		args = append(args, traceID)
	}
	if failureOnly {
		q += " AND status ILIKE '%FAIL%'"
	}
	if scope.HasExplicitTime {
		q += fmt.Sprintf(" AND created_at >= $%d AND created_at < $%d", len(args)+1, len(args)+2)
		args = append(args, scope.StartUTC, scope.EndUTC)
	}

	q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT %d", topK)

	rows, err := r.relayDB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("relay retrieval failed: %w", err)
	}
	defer rows.Close()

	out := make([]model.RetrievedChunk, 0, topK)
	for rows.Next() {
		var contractID, id, envelopeID, tr, status, createdAt string
		if err := rows.Scan(&contractID, &id, &envelopeID, &tr, &status, &createdAt); err != nil {
			return nil, err
		}
		out = append(out, model.RetrievedChunk{
			ChunkID:    "relay_contract_" + contractID,
			SourceType: "relay_payout_contracts",
			RecordID:   contractID,
			IntentID:   id,
			TraceID:    tr,
			TenantID:   tenantID,
			Score:      0.93,
			Text: fmt.Sprintf("Relay contract event: status=%s created_at=%s",
				status, createdAt),
		})
	}
	return out, rows.Err()
}
