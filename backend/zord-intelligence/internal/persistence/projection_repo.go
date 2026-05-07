package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"github.com/zord/zord-intelligence/internal/models"
)

// ProjectionRepo handles all DB operations for projection_state.
type ProjectionRepo struct {
	pool *pgxpool.Pool
}

// NewProjectionRepo creates a ProjectionRepo.
func NewProjectionRepo(pool *pgxpool.Pool) *ProjectionRepo {
	return &ProjectionRepo{pool: pool}
}

// ATOMIC COUNTER OPERATIONS  (the core race-condition fix)

// AtomicIncrementSuccess atomically adds 1 to settled_count AND total_count,
// then recomputes the rate. Called when final_state == "SETTLED".
//
// Uses INSERT ... ON CONFLICT DO UPDATE — a single atomic Postgres operation.
// If row exists: increments counters. If not: inserts with count=1.
func (r *ProjectionRepo) AtomicIncrementSuccess(
	ctx context.Context,
	tenantID, corridorID string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.success_rate.%s", corridorID)

	// Step 1: atomically increment both counters
	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"settled_count":1,"total_count":1,"rate":1.0}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{settled_count}',
					to_jsonb(COALESCE((projection_state.value_json->>'settled_count')::int, 0) + 1)
				),
				'{total_count}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_count')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementSuccess upsert corridor=%s: %w", corridorID, err)
	}

	// Step 2: recompute rate from the freshly incremented counters
	// NULLIF(total, 0) returns NULL if total=0, making the division NULL,
	// which COALESCE then turns into 0.0 — prevents divide-by-zero crash.
	return r.recomputeRate(ctx, tenantID, key, windowStart)
}

// AtomicIncrementFailure atomically adds 1 to total_count only.
// Called when final_state == "FAILED" or "REVERSED".
func (r *ProjectionRepo) AtomicIncrementFailure(
	ctx context.Context,
	tenantID, corridorID string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.success_rate.%s", corridorID)

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"settled_count":0,"total_count":1,"rate":0.0}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{total_count}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_count')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementFailure upsert corridor=%s: %w", corridorID, err)
	}

	return r.recomputeRate(ctx, tenantID, key, windowStart)
}

// AtomicIncrementPending atomically adds 1 to total_pending and bucket_0_10m.
// New intents always start in the 0–10 minute bucket.
func (r *ProjectionRepo) AtomicIncrementPending(
	ctx context.Context,
	tenantID, corridorID string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.pending_backlog.%s", corridorID)

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"total_pending":1,"bucket_0_10m":1,"bucket_10_60m":0,"bucket_1_6h":0,"bucket_6h_plus":0}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{bucket_0_10m}',
					to_jsonb(COALESCE((projection_state.value_json->>'bucket_0_10m')::int, 0) + 1)
				),
				'{total_pending}',
				to_jsonb(
					(COALESCE((projection_state.value_json->>'bucket_0_10m')::int, 0) + 1) +
					COALESCE((projection_state.value_json->>'bucket_10_60m')::int, 0) +
					COALESCE((projection_state.value_json->>'bucket_1_6h')::int, 0) +
					COALESCE((projection_state.value_json->>'bucket_6h_plus')::int, 0)
				)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementPending corridor=%s: %w", corridorID, err)
	}
	return nil
}

// AtomicDecrementPending atomically subtracts 1 from bucket_0_10m and
// recomputes total_pending as the sum of all buckets.
// GREATEST(x, 0) prevents counters going below zero if events replay.
func (r *ProjectionRepo) AtomicDecrementPending(
	ctx context.Context,
	tenantID, corridorID string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.pending_backlog.%s", corridorID)

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"total_pending":0,"bucket_0_10m":0,"bucket_10_60m":0,"bucket_1_6h":0,"bucket_6h_plus":0}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{bucket_0_10m}',
					to_jsonb(GREATEST(COALESCE((projection_state.value_json->>'bucket_0_10m')::int, 0) - 1, 0))
				),
				'{total_pending}',
				to_jsonb(
					GREATEST(COALESCE((projection_state.value_json->>'bucket_0_10m')::int, 0) - 1, 0) +
					COALESCE((projection_state.value_json->>'bucket_10_60m')::int, 0) +
					COALESCE((projection_state.value_json->>'bucket_1_6h')::int, 0) +
					COALESCE((projection_state.value_json->>'bucket_6h_plus')::int, 0)
				)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicDecrementPending corridor=%s: %w", corridorID, err)
	}
	return nil
}

// AtomicIncrementFailureReason increments a specific reason code in the taxonomy.
//
// The taxonomy is stored as:
//
//	{"total_fails": 42, "reasons": {"INSUFFICIENT_FUNDS": 20, "TIMEOUT": 15}}
//
// ARRAY['reasons', $5::text] is a dynamic path — Postgres supports arrays
// as paths in jsonb_set, allowing us to update nested keys safely.
// The reason_code is passed as a parameter ($5) — never concatenated into SQL.
// This prevents SQL injection attacks.
func (r *ProjectionRepo) AtomicIncrementFailureReason(
	ctx context.Context,
	tenantID, corridorID, reasonCode string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.failure_taxonomy.%s", corridorID)

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object('total_fails', 1, 'reasons', jsonb_build_object($5::text, 1)),
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					ARRAY['reasons', $5::text],
					to_jsonb(COALESCE((projection_state.value_json->'reasons'->>$5::text)::int, 0) + 1)
				),
				'{total_fails}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_fails')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd, reasonCode); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementFailureReason corridor=%s reason=%s: %w",
			corridorID, reasonCode, err)
	}
	// Promote the raw "reasons" map into a sorted "top_reasons" array so that
	// FailureTaxonomyValue.TopReasons unmarshals correctly.
	// This is the same two-step pattern used by recomputeRate, recomputeEvidenceRate, etc.
	return r.recomputeFailureTaxonomy(ctx, tenantID, key, windowStart)
}

// recomputeFailureTaxonomy reads the current "reasons" map from the projection row,
// sorts entries by count descending, keeps the top 10, and writes them back as a
// "top_reasons" JSON array alongside per-entry "rate" values.
//
// WHY A SEPARATE RECOMPUTE STEP?
// The atomic upsert above maintains a raw map: {"reasons": {"CODE": count}}.
// FailureTaxonomyValue.TopReasons expects a typed slice: [{"reason_code":"CODE","count":N,"rate":0.47}].
// Converting inside a single JSONB expression would be unreadably complex SQL.
// A two-step pattern (increment raw, recompute derived) keeps each SQL statement simple
// and auditable — the same approach used by every other projection in this file.
//
// ORDERING: jsonb_each returns keys in undefined order in Postgres <16.
// We sort in SQL using a lateral subquery so the result is stable across Postgres versions.
func (r *ProjectionRepo) recomputeFailureTaxonomy(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	// Build top_reasons as a JSONB array of objects sorted by count DESC, top 10.
	// LATERAL jsonb_each_text lets us iterate the "reasons" map inline.
	// NULLIF prevents division-by-zero when total_fails is somehow 0.
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			value_json,
			'{top_reasons}',
			COALESCE(
				(
					SELECT jsonb_agg(
						jsonb_build_object(
							'reason_code', kv.key,
							'count',       kv.val::int,
							'rate',        ROUND(
								(kv.val::numeric /
								NULLIF((value_json->>'total_fails')::numeric, 0))::numeric,
								4
							)
						)
						ORDER BY kv.val::int DESC
					)
					FROM (
						SELECT k.key, k.value AS val
						FROM   jsonb_each_text(value_json->'reasons') AS k(key, value)
						ORDER  BY k.value::int DESC
						LIMIT  10
					) AS kv
				),
				'[]'::jsonb
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeFailureTaxonomy key=%s: %w", key, err)
	}
	return nil
}

// AtomicIncrementEvidence increments with_evidence and total_settled, recomputes rate.
func (r *ProjectionRepo) AtomicIncrementEvidence(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	key := "tenant.evidence_readiness"

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"with_evidence":1,"total_settled":1,"rate":1.0}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{with_evidence}',
					to_jsonb(COALESCE((projection_state.value_json->>'with_evidence')::int, 0) + 1)
				),
				'{total_settled}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_settled')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementEvidence tenant=%s: %w", tenantID, err)
	}

	return r.recomputeEvidenceRate(ctx, tenantID, key, windowStart)
}

// AtomicIncrementDLQ increments the DLQ count for a topic.
func (r *ProjectionRepo) AtomicIncrementDLQ(
	ctx context.Context,
	tenantID, originalTopic string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("dlq.count.%s", originalTopic)

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4, '{"count":1}'::jsonb, now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{count}',
				to_jsonb(COALESCE((projection_state.value_json->>'count')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementDLQ topic=%s: %w", originalTopic, err)
	}
	return nil
}

// AtomicRecordLatencySample places a latency observation into a histogram bucket.
//
// WHY A HISTOGRAM INSTEAD OF RAW SAMPLES?
// ─────────────────────────────────────────
// Raw samples approach (old code):
//
//	Storage per corridor per day: up to 10,000 × 8 bytes = 80KB JSON blob
//	Every finality cert: read 80KB, deserialize, append, reserialize, write 80KB
//	With 50 corridors: 4MB of JSON churn per day just for latency samples
//
// Histogram approach (this code):
//
//	Storage: 20 integer counters = ~200 bytes regardless of sample count
//	Every finality cert: increment ONE bucket counter (tiny atomic SQL)
//	Percentile accuracy: within ±5% for most practical use cases
//
// This is how Prometheus, Datadog, and every serious metrics system works.
func (r *ProjectionRepo) AtomicRecordLatencySample(
	ctx context.Context,
	tenantID, corridorID string,
	ttfSeconds float64,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.finality_latency.%s", corridorID)
	bucketKey := fmt.Sprintf("bucket_%d", latencyBucket(ttfSeconds))

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object('total_count', 1, $5::text, 1),
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					ARRAY[$5::text],
					to_jsonb(COALESCE((projection_state.value_json->>$5::text)::int, 0) + 1)
				),
				'{total_count}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_count')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd, bucketKey); err != nil {
		return fmt.Errorf("projection_repo.AtomicRecordLatencySample corridor=%s: %w", corridorID, err)
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// READ OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

// GetLatest returns the most recent projection row for a tenant+key.
// Returns nil, nil when no row exists — normal on first startup.
func (r *ProjectionRepo) GetLatest(
	ctx context.Context,
	tenantID, key string,
) (*models.ProjectionState, error) {
	sql := `
		SELECT id, tenant_id, projection_key, window_start, window_end,
		       value_json, computed_at, projection_version
		FROM   projection_state
		WHERE  tenant_id      = $1
		  AND  projection_key = $2
		ORDER  BY window_end DESC, projection_version DESC
		LIMIT  1
	`
	row := r.pool.QueryRow(ctx, sql, tenantID, key)

	var p models.ProjectionState
	err := row.Scan(
		&p.ID, &p.TenantID, &p.ProjectionKey,
		&p.WindowStart, &p.WindowEnd,
		&p.ValueJSON, &p.ComputedAt, &p.ProjectionVersion,
	)
	if err != nil {
		// errors.Is with pgx.ErrNoRows is the correct way — never compare error strings
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("projection_repo.GetLatest key=%s: %w", key, err)
	}
	return &p, nil
}

// GetValueAs reads the latest projection and unmarshals ValueJSON into dest.
// dest must be a pointer to a struct that matches the stored JSON shape.
func (r *ProjectionRepo) GetValueAs(
	ctx context.Context,
	tenantID, key string,
	dest any,
) error {
	p, err := r.GetLatest(ctx, tenantID, key)
	if err != nil {
		return err
	}
	if p == nil {
		return nil // no data yet — dest stays zero value, not an error
	}
	return json.Unmarshal([]byte(p.ValueJSON), dest)
}

// ListByTenant returns the latest projection for every key owned by a tenant.
// Uses DISTINCT ON (Postgres feature) to get one row per unique projection_key.
func (r *ProjectionRepo) ListByTenant(
	ctx context.Context,
	tenantID string,
) ([]models.ProjectionState, error) {
	sql := `
		SELECT DISTINCT ON (projection_key)
		       id, tenant_id, projection_key, window_start, window_end,
		       value_json, computed_at, projection_version
		FROM   projection_state
		WHERE  tenant_id = $1
		ORDER  BY projection_key, window_end DESC, projection_version DESC
	`
	rows, err := r.pool.Query(ctx, sql, tenantID)
	if err != nil {
		return nil, fmt.Errorf("projection_repo.ListByTenant tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()

	var result []models.ProjectionState
	for rows.Next() {
		var p models.ProjectionState
		if err := rows.Scan(
			&p.ID, &p.TenantID, &p.ProjectionKey,
			&p.WindowStart, &p.WindowEnd, &p.ValueJSON,
			&p.ComputedAt, &p.ProjectionVersion,
		); err != nil {
			return nil, fmt.Errorf("projection_repo.ListByTenant scan: %w", err)
		}
		result = append(result, p)
	}
	return result, nil
}

// ListKeysByPrefix efficiently returns projections matching a string prefix.
func (r *ProjectionRepo) ListKeysByPrefix(
	ctx context.Context,
	tenantID, prefix string,
) ([]models.ProjectionState, error) {
	sql := `
		SELECT DISTINCT ON (projection_key)
		       id, tenant_id, projection_key, window_start, window_end,
		       value_json, computed_at, projection_version
		FROM   projection_state
		WHERE  tenant_id = $1
		  AND  projection_key LIKE $2 || '%'
		ORDER  BY projection_key, window_end DESC, projection_version DESC
	`
	rows, err := r.pool.Query(ctx, sql, tenantID, prefix)
	if err != nil {
		return nil, fmt.Errorf("projection_repo.ListKeysByPrefix tenant=%s: %w", tenantID, err)
	}
	defer rows.Close()

	var result []models.ProjectionState
	for rows.Next() {
		var p models.ProjectionState
		if err := rows.Scan(
			&p.ID, &p.TenantID, &p.ProjectionKey,
			&p.WindowStart, &p.WindowEnd, &p.ValueJSON,
			&p.ComputedAt, &p.ProjectionVersion,
		); err != nil {
			return nil, fmt.Errorf("projection_repo.ListKeysByPrefix scan: %w", err)
		}
		result = append(result, p)
	}
	return result, nil
}

// ComputePercentilesFromHistogram reads the latency histogram for a corridor
// and estimates p50 and p95 in seconds. Used by the KPI handler.
func (r *ProjectionRepo) ComputePercentilesFromHistogram(
	ctx context.Context,
	tenantID, corridorID string,
) (p50, p95 float64, totalCount int, err error) {
	key := fmt.Sprintf("corridor.finality_latency.%s", corridorID)

	p, err := r.GetLatest(ctx, tenantID, key)
	if err != nil || p == nil {
		return 0, 0, 0, err
	}

	var histogram map[string]int
	if err := json.Unmarshal([]byte(p.ValueJSON), &histogram); err != nil {
		return 0, 0, 0, fmt.Errorf("projection_repo.ComputePercentiles unmarshal: %w", err)
	}

	totalCount = histogram["total_count"]
	if totalCount == 0 {
		return 0, 0, 0, nil
	}

	p50 = estimatePercentileFromHistogram(histogram, totalCount, 0.50)
	p95 = estimatePercentileFromHistogram(histogram, totalCount, 0.95)
	return p50, p95, totalCount, nil
}

// Upsert writes a full projection value. Kept for callers that need full control.
func (r *ProjectionRepo) Upsert(ctx context.Context, p models.ProjectionState) error {
	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json  = EXCLUDED.value_json,
			window_end  = EXCLUDED.window_end,
			computed_at = EXCLUDED.computed_at
	`
	if _, err := r.pool.Exec(ctx, sql,
		p.TenantID, p.ProjectionKey, p.WindowStart, p.WindowEnd,
		p.ValueJSON, p.ComputedAt, p.ProjectionVersion,
	); err != nil {
		return fmt.Errorf("projection_repo.Upsert key=%s: %w", p.ProjectionKey, err)
	}
	return nil
}

// UpsertWithValue marshals value to JSON then calls Upsert.
func (r *ProjectionRepo) UpsertWithValue(
	ctx context.Context,
	tenantID, key string,
	windowStart, windowEnd time.Time,
	value any,
) error {
	b, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("projection_repo.UpsertWithValue marshal: %w", err)
	}
	return r.Upsert(ctx, models.ProjectionState{
		TenantID:          tenantID,
		ProjectionKey:     key,
		WindowStart:       windowStart,
		WindowEnd:         windowEnd,
		ValueJSON:         string(b),
		ComputedAt:        time.Now().UTC(),
		ProjectionVersion: 1,
	})
}

// PRIVATE HELPERS
// SLA BREACH RATE OPERATIONS (atomic SQL, race-condition free)

// AtomicIncrementSLABreached atomically increments breach counter AND updates average.
// Called when an SLA timer is marked BREACHED.
//
// Parameters:
//
//	tenantID: owner of this SLA ("tnt_A")
//	breachDurationSeconds: how many seconds past the deadline?
//	  (if deadline was 10:00 and breach detected at 10:20, this is 1200 seconds)
//	windowStart, windowEnd: the 24h window
//
// Atomic operation:
//  1. Read current breached count, total_breach_seconds from DB
//  2. Increment breached by 1
//  3. Add breach_duration_seconds to total_breach_seconds
//  4. Compute new average = total_breach_seconds / breached
//  5. Write all back to DB
//  6. Recompute breach_rate = breached / total_processed
func (r *ProjectionRepo) AtomicIncrementSLABreached(
	ctx context.Context,
	tenantID string,
	breachDurationSeconds float64,
	windowStart, windowEnd time.Time,
) error {
	key := "tenant.sla_breach_rate"

	// JSONB arithmetic all happens in SQL, not in Go.
	// This is the secret to being race-condition free.
	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"total_processed":0,"breached":1,"on_time":0,"breach_rate":0.0,"avg_breach_seconds":'||$5||',"total_breach_seconds":'||CAST(CAST($5 AS INTEGER) AS TEXT)||'}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{breached}',
						to_jsonb(COALESCE((projection_state.value_json->>'breached')::int, 0) + 1)
					),
					'{total_breach_seconds}',
					to_jsonb(COALESCE((projection_state.value_json->>'total_breach_seconds')::bigint, 0) + CAST($5 AS BIGINT))
				),
				'{avg_breach_seconds}',
				to_jsonb(
					CASE 
						WHEN (COALESCE((projection_state.value_json->>'breached')::int, 0) + 1) > 0
						THEN (COALESCE((projection_state.value_json->>'total_breach_seconds')::bigint, 0) + CAST($5 AS BIGINT))::float8 / 
						     (COALESCE((projection_state.value_json->>'breached')::int, 0) + 1)
						ELSE 0.0
					END
				)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd, int64(breachDurationSeconds)); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementSLABreached: %w", err)
	}

	// Step 2: Recompute the breach_rate = breached / total_processed
	return r.recomputeSLABreachRate(ctx, tenantID, key, windowStart)
}

// AtomicIncrementSLAOnTime atomically increments on_time counter and total_processed.
// Called when an SLA timer is marked RESOLVED (resolved before deadline).
//
// Atomic operation: increment on_time by 1, total_processed by 1, recompute rate
func (r *ProjectionRepo) AtomicIncrementSLAOnTime(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	key := "tenant.sla_breach_rate"

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"total_processed":1,"breached":0,"on_time":1,"breach_rate":0.0,"avg_breach_seconds":0,"total_breach_seconds":0}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{on_time}',
						to_jsonb(COALESCE((projection_state.value_json->>'on_time')::int, 0) + 1)
					),
					'{total_processed}',
					to_jsonb(COALESCE((projection_state.value_json->>'total_processed')::int, 0) + 1)
				),
				'{breached}',
				to_jsonb(COALESCE((projection_state.value_json->>'breached')::int, 0))  -- unchanged
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementSLAOnTime: %w", err)
	}

	// Recompute the breach_rate
	return r.recomputeSLABreachRate(ctx, tenantID, key, windowStart)
}

// recomputeSLABreachRate recalculates the rate = breached / total_processed
// Called after every breach/on_time increment so the rate is always fresh.
func (r *ProjectionRepo) recomputeSLABreachRate(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			value_json,
			'{breach_rate}',
			to_jsonb(
				COALESCE(
					(value_json->>'breached')::numeric /
					NULLIF((value_json->>'total_processed')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeSLABreachRate: %w", err)
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY RECOVERY RATE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

// AtomicIncrementRetryAttempt records a retry dispatch (attempt_no > 1).
// Called by HandleDispatchCreated when attempt_no > 1.
func (r *ProjectionRepo) AtomicIncrementRetryAttempt(
	ctx context.Context,
	tenantID, corridorID string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.retry_recovery_rate.%s", corridorID)

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"total_attempts":1,"retry_attempts":1,"recovered":0,"recovery_rate":0.0}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{retry_attempts}',
					to_jsonb(COALESCE((projection_state.value_json->>'retry_attempts')::int, 0) + 1)
				),
				'{total_attempts}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_attempts')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementRetryAttempt corridor=%s: %w", corridorID, err)
	}
	return nil
}

// AtomicIncrementFirstAttempt records a first-time dispatch (attempt_no == 1).
// Only increments total_attempts — retry_attempts stays the same.
func (r *ProjectionRepo) AtomicIncrementFirstAttempt(
	ctx context.Context,
	tenantID, corridorID string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.retry_recovery_rate.%s", corridorID)

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"total_attempts":1,"retry_attempts":0,"recovered":0,"recovery_rate":0.0}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{total_attempts}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_attempts')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementFirstAttempt corridor=%s: %w", corridorID, err)
	}
	return nil
}

// AtomicIncrementRetryRecovered records a successful SETTLED outcome for an intent
// that had at least one retry. Called when HandleFinalityCertIssued sees SETTLED
// and the intent previously had retry_attempts > 0 on this corridor.
//
//	We track "recovered" conservatively — we increment when a SETTLED cert
//
// arrives on a corridor that has retry_attempts > 0 in the window. This is a
// corridor-level aggregate, not per-intent tracking, which keeps it stateless.
func (r *ProjectionRepo) AtomicIncrementRetryRecovered(
	ctx context.Context,
	tenantID, corridorID string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.retry_recovery_rate.%s", corridorID)

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			'{"total_attempts":0,"retry_attempts":0,"recovered":1,"recovery_rate":0.0}'::jsonb,
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{recovered}',
				to_jsonb(COALESCE((projection_state.value_json->>'recovered')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementRetryRecovered corridor=%s: %w", corridorID, err)
	}
	return r.recomputeRetryRecoveryRate(ctx, tenantID, key, windowStart)
}

// recomputeRetryRecoveryRate recalculates recovery_rate = recovered / retry_attempts.
func (r *ProjectionRepo) recomputeRetryRecoveryRate(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			value_json,
			'{recovery_rate}',
			to_jsonb(
				COALESCE(
					(value_json->>'recovered')::numeric /
					NULLIF((value_json->>'retry_attempts')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeRetryRecoveryRate: %w", err)
	}
	return nil
}

// STATEMENT MATCH RATE OPERATIONS

// AtomicRecordStatementMatch records one StatementMatchEvent (MATCHED or UNMATCHED).
// Called by HandleStatementMatch in projection_service.
//
// For MATCHED events: increments matched + total_settled + accumulates aged_seconds.
// For UNMATCHED events: increments unmatched + total_settled only.
func (r *ProjectionRepo) AtomicRecordStatementMatch(
	ctx context.Context,
	tenantID, corridorID string,
	matched bool,
	agedSeconds int64,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.statement_match_rate.%s", corridorID)

	if matched {
		// MATCHED: increment matched + total_settled + accumulate aged_seconds
		upsertSQL := `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_settled', 1,
					'matched', 1,
					'unmatched', 0,
					'match_rate', 1.0,
					'avg_match_age_secs', $5::float8,
					'total_match_age_secs', $5::bigint
				),
				now(), 1)
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						jsonb_set(
							projection_state.value_json,
							'{matched}',
							to_jsonb(COALESCE((projection_state.value_json->>'matched')::int, 0) + 1)
						),
						'{total_settled}',
						to_jsonb(COALESCE((projection_state.value_json->>'total_settled')::int, 0) + 1)
					),
					'{total_match_age_secs}',
					to_jsonb(COALESCE((projection_state.value_json->>'total_match_age_secs')::bigint, 0) + $5::bigint)
				),
				computed_at = now()
		`
		if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd, agedSeconds); err != nil {
			return fmt.Errorf("projection_repo.AtomicRecordStatementMatch(matched) corridor=%s: %w", corridorID, err)
		}
	} else {
		// UNMATCHED: increment unmatched + total_settled only
		upsertSQL := `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version)
			VALUES ($1, $2, $3, $4,
				'{"total_settled":1,"matched":0,"unmatched":1,"match_rate":0.0,"avg_match_age_secs":0,"total_match_age_secs":0}'::jsonb,
				now(), 1)
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{unmatched}',
						to_jsonb(COALESCE((projection_state.value_json->>'unmatched')::int, 0) + 1)
					),
					'{total_settled}',
					to_jsonb(COALESCE((projection_state.value_json->>'total_settled')::int, 0) + 1)
				),
				computed_at = now()
		`
		if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
			return fmt.Errorf("projection_repo.AtomicRecordStatementMatch(unmatched) corridor=%s: %w", corridorID, err)
		}
	}

	// Recompute derived fields (match_rate + avg_match_age_secs) in one SQL pass
	return r.recomputeStatementMatchRate(ctx, tenantID, key, windowStart)
}

// recomputeStatementMatchRate recalculates match_rate and avg_match_age_secs.
func (r *ProjectionRepo) recomputeStatementMatchRate(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			jsonb_set(
				value_json,
				'{match_rate}',
				to_jsonb(
					COALESCE(
						(value_json->>'matched')::numeric /
						NULLIF((value_json->>'total_settled')::numeric, 0),
						0
					)
				)
			),
			'{avg_match_age_secs}',
			to_jsonb(
				COALESCE(
					(value_json->>'total_match_age_secs')::numeric /
					NULLIF((value_json->>'matched')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeStatementMatchRate: %w", err)
	}
	return nil
}

// PROVIDER REF MISSING RATE OPERATIONS

// AtomicRecordProviderRef records whether a finality cert had a provider reference.
// Called by HandleFinalityCertIssued using the new HasProviderRef field.
//
// hasRef = true  → found UTR/RRN/BankRef → good traceability
// hasRef = false → missing provider ref   → audit gap
func (r *ProjectionRepo) AtomicRecordProviderRef(
	ctx context.Context,
	tenantID, corridorID string,
	hasRef bool,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.provider_ref_missing_rate.%s", corridorID)

	// Both branches increment total_finalized; only hasRef=false increments missing_ref.
	var upsertSQL string
	if hasRef {
		upsertSQL = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version)
			VALUES ($1, $2, $3, $4,
				'{"total_finalized":1,"missing_ref":0,"with_ref":1,"missing_rate":0.0}'::jsonb,
				now(), 1)
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{with_ref}',
						to_jsonb(COALESCE((projection_state.value_json->>'with_ref')::int, 0) + 1)
					),
					'{total_finalized}',
					to_jsonb(COALESCE((projection_state.value_json->>'total_finalized')::int, 0) + 1)
				),
				computed_at = now()
		`
	} else {
		upsertSQL = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version)
			VALUES ($1, $2, $3, $4,
				'{"total_finalized":1,"missing_ref":1,"with_ref":0,"missing_rate":1.0}'::jsonb,
				now(), 1)
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{missing_ref}',
						to_jsonb(COALESCE((projection_state.value_json->>'missing_ref')::int, 0) + 1)
					),
					'{total_finalized}',
					to_jsonb(COALESCE((projection_state.value_json->>'total_finalized')::int, 0) + 1)
				),
				computed_at = now()
		`
	}
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicRecordProviderRef corridor=%s hasRef=%v: %w", corridorID, hasRef, err)
	}
	return r.recomputeProviderRefMissingRate(ctx, tenantID, key, windowStart)
}

// recomputeProviderRefMissingRate recalculates missing_rate = missing_ref / total_finalized.
func (r *ProjectionRepo) recomputeProviderRefMissingRate(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			value_json,
			'{missing_rate}',
			to_jsonb(
				COALESCE(
					(value_json->>'missing_ref')::numeric /
					NULLIF((value_json->>'total_finalized')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeProviderRefMissingRate: %w", err)
	}
	return nil
}

// CONFLICT RATE IN FUSION OPERATIONS

// AtomicRecordFusionConflict records the conflict data from one FinalityCertIssuedEvent.
// Called by HandleFinalityCertIssued using the new ConflictCount + ConflictTypes fields.
//
// conflictCount  = 0 → clean finality, no signal disagreement
// conflictCount  > 0 → at least one pair of signals disagreed
// conflictTypes  = specific type tags e.g. ["webhook_vs_poll_mismatch"]
func (r *ProjectionRepo) AtomicRecordFusionConflict(
	ctx context.Context,
	tenantID, corridorID string,
	conflictCount int,
	conflictTypes []string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("corridor.conflict_rate_in_fusion.%s", corridorID)

	hadConflict := 0
	if conflictCount > 0 {
		hadConflict = 1
	}

	// Step 1: increment the scalar counters atomically
	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_finalized', 1,
				'with_conflicts', $5::int,
				'conflict_rate', $5::float8,
				'total_conflicts', $6::int,
				'conflict_type_breakdown', '{}'::jsonb
			),
			now(), 1)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{total_finalized}',
						to_jsonb(COALESCE((projection_state.value_json->>'total_finalized')::int, 0) + 1)
					),
					'{with_conflicts}',
					to_jsonb(COALESCE((projection_state.value_json->>'with_conflicts')::int, 0) + $5::int)
				),
				'{total_conflicts}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_conflicts')::int, 0) + $6::int)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd, hadConflict, conflictCount); err != nil {
		return fmt.Errorf("projection_repo.AtomicRecordFusionConflict corridor=%s: %w", corridorID, err)
	}

	// Step 2: increment each conflict type in the breakdown map (one SQL per type)
	// This is safe — conflict_types is typically 0–3 entries per event.
	for _, ct := range conflictTypes {
		typeSQL := `
			UPDATE projection_state
			SET value_json = jsonb_set(
				value_json,
				ARRAY['conflict_type_breakdown', $4::text],
				to_jsonb(
					COALESCE(
						(value_json->'conflict_type_breakdown'->>$4::text)::int,
						0
					) + 1
				)
			),
			computed_at = now()
			WHERE tenant_id          = $1
			  AND projection_key     = $2
			  AND window_start       = $3
			  AND projection_version = 1
		`
		if _, err := r.pool.Exec(ctx, typeSQL, tenantID, key, windowStart, ct); err != nil {
			return fmt.Errorf("projection_repo.AtomicRecordFusionConflict type=%s corridor=%s: %w", ct, corridorID, err)
		}
	}

	// Step 3: recompute conflict_rate
	return r.recomputeConflictRate(ctx, tenantID, key, windowStart)
}

// recomputeConflictRate recalculates conflict_rate = with_conflicts / total_finalized.
func (r *ProjectionRepo) recomputeConflictRate(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			value_json,
			'{conflict_rate}',
			to_jsonb(
				COALESCE(
					(value_json->>'with_conflicts')::numeric /
					NULLIF((value_json->>'total_finalized')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeConflictRate: %w", err)
	}
	return nil
}

// Called after every success/failure increment so the rate is always fresh.
func (r *ProjectionRepo) recomputeRate(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			value_json,
			'{rate}',
			to_jsonb(
				COALESCE(
					(value_json->>'settled_count')::numeric /
					NULLIF((value_json->>'total_count')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeRate key=%s: %w", key, err)
	}
	return nil
}

// recomputeEvidenceRate recalculates evidence readiness rate.
func (r *ProjectionRepo) recomputeEvidenceRate(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			value_json,
			'{rate}',
			to_jsonb(
				COALESCE(
					(value_json->>'with_evidence')::numeric /
					NULLIF((value_json->>'total_settled')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeEvidenceRate key=%s: %w", key, err)
	}
	return nil
}

// latencyBucketBounds defines the upper boundary (in seconds) of each bucket.
// 20 buckets covering 0–96h+ — tuned for payout finality in Indian fintech.
var latencyBucketBounds = []float64{
	30,              // bucket_0:  0s–30s
	120,             // bucket_1:  30s–2m
	300,             // bucket_2:  2m–5m
	900,             // bucket_3:  5m–15m
	1800,            // bucket_4:  15m–30m
	3600,            // bucket_5:  30m–1h
	7200,            // bucket_6:  1h–2h
	10800,           // bucket_7:  2h–3h
	14400,           // bucket_8:  3h–4h
	18000,           // bucket_9:  4h–5h
	21600,           // bucket_10: 5h–6h
	28800,           // bucket_11: 6h–8h
	43200,           // bucket_12: 8h–12h
	64800,           // bucket_13: 12h–18h
	86400,           // bucket_14: 18h–24h
	129600,          // bucket_15: 24h–36h
	172800,          // bucket_16: 36h–48h
	259200,          // bucket_17: 48h–72h
	345600,          // bucket_18: 72h–96h
	math.MaxFloat64, // bucket_19: 96h+
}

// latencyBucket returns which bucket index a latency value falls into.
func latencyBucket(seconds float64) int {
	for i, bound := range latencyBucketBounds {
		if seconds <= bound {
			return i
		}
	}
	return 19
}

// estimatePercentileFromHistogram estimates a percentile from bucket counts.
//
// Algorithm: walk buckets accumulating counts until we reach the target rank,
// then linearly interpolate within that bucket for a smooth estimate.
//
// Example — 100 total samples, want p95 (rank = 95):
//
//	bucket_0 (0–30s):   count=60 → cumulative=60
//	bucket_1 (30s–2m):  count=30 → cumulative=90
//	bucket_2 (2m–5m):   count=8  → cumulative=98  ← crosses 95 here
//	→ target rank 95 is (95-90)=5 samples into bucket_2's 8 samples
//	→ fraction = 5/8 = 0.625
//	→ p95 = 120 + 0.625 × (300-120) = 120 + 112.5 = 232.5 seconds ≈ 3.9 minutes
func estimatePercentileFromHistogram(
	histogram map[string]int,
	total int,
	percentile float64,
) float64 {
	targetRank := int(float64(total) * percentile)
	cumulative := 0
	lowerBound := 0.0

	for i, upperBound := range latencyBucketBounds {
		bucketKey := fmt.Sprintf("bucket_%d", i)
		count := histogram[bucketKey]
		cumulative += count

		if cumulative >= targetRank && count > 0 {
			prev := cumulative - count
			fraction := float64(targetRank-prev) / float64(count)
			return lowerBound + fraction*(upperBound-lowerBound)
		}
		lowerBound = upperBound
	}

	return latencyBucketBounds[18] // fallback: last finite bound
}

// TenantCorridorPair holds one unique (tenant_id, corridor_id) combination.
// Used by the PolicyCronWorker to know which pairs to evaluate.
type TenantCorridorPair struct {
	TenantID   string
	CorridorID string
}

func (r *ProjectionRepo) GetActiveTenantCorridorPairs(ctx context.Context) ([]TenantCorridorPair, error) {
	sql := `
		SELECT DISTINCT
		       tenant_id,
		       regexp_replace(projection_key, '^corridor\.[^.]+\.', '') AS corridor_id
		FROM   projection_state
		WHERE  projection_key LIKE 'corridor.%'
		  AND  regexp_replace(projection_key, '^corridor\.[^.]+\.', '') != ''
		  AND  window_end > now() - interval '24 hours'
		ORDER  BY tenant_id, corridor_id
	`
	rows, err := r.pool.Query(ctx, sql)
	if err != nil {
		return nil, fmt.Errorf("projection_repo.GetActiveTenantCorridorPairs: %w", err)
	}
	defer rows.Close()

	var result []TenantCorridorPair
	for rows.Next() {
		var pair TenantCorridorPair
		if err := rows.Scan(&pair.TenantID, &pair.CorridorID); err != nil {
			return nil, fmt.Errorf("projection_repo.GetActiveTenantCorridorPairs scan: %w", err)
		}
		result = append(result, pair)
	}
	return result, nil
}

// ── PHASE 3: New Atomic Repo Methods for Intelligence Projections ─────────────
//
// Four new atomic SQL methods that maintain the four new projection families:
//   AtomicRecordLeakage            → leakage.total           (LEAKAGE family)
//   AtomicRecordAttachmentDecision → ambiguity.summary       (AMBIGUITY family)
//   AtomicRecordVariance           → leakage.total + batch   (LEAKAGE + PATTERN)
//   AtomicUpdateBatchHealth        → batch.health.{batch_id} (PATTERN family)
//   AtomicRecordGovernanceCoverage → defensibility.summary   (DEFENSIBILITY family)
//
// DESIGN PRINCIPLES (same as existing methods above):
//   1. ALL arithmetic happens inside Postgres — zero race conditions.
//   2. INSERT ... ON CONFLICT DO UPDATE — single atomic operation, no read-modify-write.
//   3. Money is always int64 in minor units — never float64.
//   4. Derived rates are recomputed in a second UPDATE immediately after the
//      counter increment — same two-step pattern as recomputeRate() above.
//   5. No PII ever enters these methods — only IDs and amounts.
// ─────────────────────────────────────────────────────────────────────────────

// ── LEAKAGE ───────────────────────────────────────────────────────────────────

// AtomicIncrementLeakageIntendedTotal records every canonical intent amount into
// the leakage denominator for the tenant+window, even when there is no leakage.
//
// Grade A leakage must use the full in-scope intent population:
//
//	total_intended_volume = SUM(intent.amount_minor)
func (r *ProjectionRepo) AtomicIncrementLeakageIntendedTotal(
	ctx context.Context,
	tenantID string,
	intendedMinor decimal.Decimal,
	windowStart, windowEnd time.Time,
) error {
	key := "leakage.total"
	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_amount_minor',             0::bigint,
				'unmatched_amount_minor',         0::bigint,
				'under_settlement_amount_minor',  0::bigint,
				'orphan_amount_minor',            0::bigint,
				'reversal_exposure_minor',        0::bigint,
				'unmatched_intent_count',         0,
				'under_settlement_count',         0,
				'orphan_settlement_count',        0,
				'reversal_count',                 0,
				'total_intended_amount_minor',    $5::bigint,
				'leakage_percentage',             0.0,
				'breakdown_by_type',              '{}'::jsonb
			),
			now(), 1, 'LEAKAGE', 'TENANT')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{total_intended_amount_minor}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_intended_amount_minor')::bigint, 0) + $5::bigint)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart, windowEnd, intendedMinor.IntPart()); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementLeakageIntendedTotal tenant=%s: %w", tenantID, err)
	}

	return r.recomputeLeakageTotals(ctx, tenantID, key, windowStart)
}

// AtomicRecordLeakage records one unmatched intent into the LEAKAGE projection.
//
// Called when HandleAttachmentDecision receives a MATCH_UNRESOLVED decision —
// i.e. Service 5C could not find any matching intent for a settlement, or
// a settlement exists but no intent was ever created for it (orphan).
//
// Parameters:
//
//	tenantID        — owner of this leakage event
//	leakageType     — "UNMATCHED_INTENT" | "ORPHAN_SETTLEMENT"
//	intendedMinor   — intended_amount_minor from the attachment decision (0 for orphan)
//	orphanMinor     — settled_amount_minor from the settlement observation (0 for unmatched)
//	windowStart/End — the rolling 24h window
//
// ATOMIC OPERATION:
//  1. Increment the correct counter (unmatched_intent_count or orphan_settlement_count)
//  2. Add the money to the correct bucket
//  3. Add to total_intended_amount_minor (for percentage denominator)
//  4. Recompute total_amount_minor = unmatched + under_settlement + orphan + reversal
//  5. Recompute leakage_percentage = total / total_intended
func (r *ProjectionRepo) AtomicRecordLeakage(
	ctx context.Context,
	tenantID string,
	leakageType string, // "UNMATCHED_INTENT" | "ORPHAN_SETTLEMENT"
	intendedMinor decimal.Decimal,
	orphanMinor decimal.Decimal,
	windowStart, windowEnd time.Time,
) error {
	key := "leakage.total"

	var upsertSQL string
	var args []any

	switch leakageType {
	case "UNMATCHED_INTENT":
		upsertSQL = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             $5::bigint,
					'unmatched_amount_minor',         $5::bigint,
					'under_settlement_amount_minor',  0::bigint,
					'orphan_amount_minor',            0::bigint,
					'reversal_exposure_minor',        0::bigint,
					'unmatched_intent_count',         1,
					'under_settlement_count',         0,
					'orphan_settlement_count',        0,
					'reversal_count',                 0,
					'total_intended_amount_minor',    0::bigint,
					'leakage_percentage',             1.0,
					'breakdown_by_type',              jsonb_build_object('UNMATCHED_INTENT', $5::bigint)
				),
				now(), 1, 'LEAKAGE', 'TENANT')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{unmatched_amount_minor}',
						to_jsonb(COALESCE((projection_state.value_json->>'unmatched_amount_minor')::bigint, 0) + $5::bigint)
					),
					'{unmatched_intent_count}',
					to_jsonb(COALESCE((projection_state.value_json->>'unmatched_intent_count')::int, 0) + 1)
				),
				computed_at = now()
		`
		args = []any{tenantID, key, windowStart, windowEnd, intendedMinor.IntPart()}

	case "ORPHAN_SETTLEMENT":
		upsertSQL = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             $5::bigint,
					'unmatched_amount_minor',         0::bigint,
					'under_settlement_amount_minor',  0::bigint,
					'orphan_amount_minor',            $5::bigint,
					'reversal_exposure_minor',        0::bigint,
					'unmatched_intent_count',         0,
					'under_settlement_count',         0,
					'orphan_settlement_count',        1,
					'reversal_count',                 0,
					'total_intended_amount_minor',    0::bigint,
					'leakage_percentage',             0.0,
					'breakdown_by_type',              jsonb_build_object('ORPHAN_SETTLEMENT', $5::bigint)
				),
				now(), 1, 'LEAKAGE', 'TENANT')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{orphan_amount_minor}',
						to_jsonb(COALESCE((projection_state.value_json->>'orphan_amount_minor')::bigint, 0) + $5::bigint)
					),
					'{orphan_settlement_count}',
					to_jsonb(COALESCE((projection_state.value_json->>'orphan_settlement_count')::int, 0) + 1)
				),
				computed_at = now()
		`
		args = []any{tenantID, key, windowStart, windowEnd, orphanMinor.IntPart()}

	default:
		return fmt.Errorf("projection_repo.AtomicRecordLeakage: unknown leakage_type=%s", leakageType)
	}

	if _, err := r.pool.Exec(ctx, upsertSQL, args...); err != nil {
		return fmt.Errorf("projection_repo.AtomicRecordLeakage type=%s tenant=%s: %w",
			leakageType, tenantID, err)
	}

	// Step 2: recompute total_amount_minor and leakage_percentage from all buckets
	return r.recomputeLeakageTotals(ctx, tenantID, key, windowStart)
}

// AtomicRecordVariance adds a confirmed financial variance to the LEAKAGE projection.
//
// Called when HandleVarianceRecord receives a VarianceRecordCreatedEvent.
// Unlike AtomicRecordLeakage (which records "no match found"), this records
// variances where a match WAS found but the amounts don't agree.
//
// Parameters:
//
//	tenantID          — owner
//	varianceType      — "UNDER_SETTLEMENT" | "OVER_SETTLEMENT" | "REVERSAL" | "DEDUCTION" etc.
//	varianceMinor     — the absolute variance amount (always positive, direction from type)
//	intendedMinor     — the original intended amount (for % denominator)
//	isWhitelisted     — if true this deduction was pre-agreed; do not count as leakage
//	windowStart/End   — rolling 24h window
//
// FINTECH RULE: Whitelisted deductions (pre-agreed TDS, PSP fees) must NOT
// be counted as leakage. We still record them for audit purposes but only
// the non-whitelisted variance flows into the leakage amount.
func (r *ProjectionRepo) AtomicRecordVariance(
	ctx context.Context,
	tenantID string,
	varianceType string,
	varianceMinor decimal.Decimal,
	intendedMinor decimal.Decimal,
	isWhitelisted bool,
	windowStart, windowEnd time.Time,
) error {
	key := "leakage.total"

	if isWhitelisted {
		upsertSQL := `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             0::bigint,
					'unmatched_amount_minor',         0::bigint,
					'under_settlement_amount_minor',  0::bigint,
					'orphan_amount_minor',            0::bigint,
					'reversal_exposure_minor',        0::bigint,
					'unmatched_intent_count',         0,
					'under_settlement_count',         0,
					'orphan_settlement_count',        0,
					'reversal_count',                 0,
					'total_intended_amount_minor',    0::bigint,
					'leakage_percentage',             0.0,
					'breakdown_by_type',              '{}'::jsonb
				),
				now(), 1, 'LEAKAGE', 'TENANT')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = projection_state.value_json,
				computed_at = now()
		`
		if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd, intendedMinor.IntPart()); err != nil {
			return fmt.Errorf("projection_repo.AtomicRecordVariance whitelisted tenant=%s: %w", tenantID, err)
		}
		return r.recomputeLeakageTotals(ctx, tenantID, key, windowStart)
	}

	isReversal := varianceType == "REVERSAL"

	var upsertSQL string
	if isReversal {
		upsertSQL = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             $5::bigint,
					'unmatched_amount_minor',         0::bigint,
					'under_settlement_amount_minor',  0::bigint,
					'orphan_amount_minor',            0::bigint,
					'reversal_exposure_minor',        $5::bigint,
					'unmatched_intent_count',         0,
					'under_settlement_count',         0,
					'orphan_settlement_count',        0,
					'reversal_count',                 1,
					'total_intended_amount_minor',    0::bigint,
					'leakage_percentage',             0.0,
					'breakdown_by_type',              jsonb_build_object($7::text, $5::bigint)
				),
				now(), 1, 'LEAKAGE', 'TENANT')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{reversal_exposure_minor}',
						to_jsonb(COALESCE((projection_state.value_json->>'reversal_exposure_minor')::bigint, 0) + $5::bigint)
					),
					'{reversal_count}',
					to_jsonb(COALESCE((projection_state.value_json->>'reversal_count')::int, 0) + 1)
				),
				computed_at = now()
		`
	} else {
		upsertSQL = `
			INSERT INTO projection_state
				(tenant_id, projection_key, window_start, window_end,
				 value_json, computed_at, projection_version,
				 projection_family, entity_scope_type)
			VALUES ($1, $2, $3, $4,
				jsonb_build_object(
					'total_amount_minor',             $5::bigint,
					'unmatched_amount_minor',         0::bigint,
					'under_settlement_amount_minor',  $5::bigint,
					'orphan_amount_minor',            0::bigint,
					'reversal_exposure_minor',        0::bigint,
					'unmatched_intent_count',         0,
					'under_settlement_count',         1,
					'orphan_settlement_count',        0,
					'reversal_count',                 0,
					'total_intended_amount_minor',    0::bigint,
					'leakage_percentage',             0.0,
					'breakdown_by_type',              jsonb_build_object($7::text, $5::bigint)
				),
				now(), 1, 'LEAKAGE', 'TENANT')
			ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
			DO UPDATE SET
				value_json = jsonb_set(
					jsonb_set(
						projection_state.value_json,
						'{under_settlement_amount_minor}',
						to_jsonb(COALESCE((projection_state.value_json->>'under_settlement_amount_minor')::bigint, 0) + $5::bigint)
					),
					'{under_settlement_count}',
					to_jsonb(COALESCE((projection_state.value_json->>'under_settlement_count')::int, 0) + 1)
				),
				computed_at = now()
		`
	}

	if _, err := r.pool.Exec(ctx, upsertSQL,
		tenantID, key, windowStart, windowEnd,
		varianceMinor.IntPart(), intendedMinor.IntPart(), varianceType,
	); err != nil {
		return fmt.Errorf("projection_repo.AtomicRecordVariance type=%s tenant=%s: %w",
			varianceType, tenantID, err)
	}

	return r.recomputeLeakageTotals(ctx, tenantID, key, windowStart)
}

// recomputeLeakageTotals recalculates total_amount_minor and leakage_percentage
// from the four bucket columns. Called after every leakage increment.
//
// total_amount_minor = unmatched + under_settlement + orphan + reversal_exposure
// leakage_percentage = total_amount_minor / total_intended_amount_minor
//
// NULLIF prevents divide-by-zero when no intents have been seen yet.
func (r *ProjectionRepo) recomputeLeakageTotals(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			jsonb_set(
				value_json,
				'{total_amount_minor}',
				to_jsonb(
					COALESCE((value_json->>'unmatched_amount_minor')::bigint, 0) +
					COALESCE((value_json->>'under_settlement_amount_minor')::bigint, 0) +
					COALESCE((value_json->>'orphan_amount_minor')::bigint, 0) +
					COALESCE((value_json->>'reversal_exposure_minor')::bigint, 0)
				)
			),
			'{leakage_percentage}',
			to_jsonb(
				COALESCE(
					(
						COALESCE((value_json->>'unmatched_amount_minor')::numeric, 0) +
						COALESCE((value_json->>'under_settlement_amount_minor')::numeric, 0) +
						COALESCE((value_json->>'orphan_amount_minor')::numeric, 0) +
						COALESCE((value_json->>'reversal_exposure_minor')::numeric, 0)
					) /
					NULLIF((value_json->>'total_intended_amount_minor')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeLeakageTotals key=%s: %w", key, err)
	}
	return nil
}

// ── AMBIGUITY ─────────────────────────────────────────────────────────────────

// AtomicRecordAttachmentDecision updates the AMBIGUITY projection from one
// attachment decision event (Service 5C: attachment.decision.created).
//
// Called for every decision type. The method selectively increments counters
// based on decision_type — only MATCH_AMBIGUOUS and MATCH_UNRESOLVED feed
// the ambiguity counts; all decisions update the running confidence average.
//
// Parameters:
//
//	tenantID          — owner
//	decisionType      — "MATCH_EXACT" | "MATCH_HIGH" | "MATCH_AMBIGUOUS" |
//	                    "MATCH_UNRESOLVED" | "MATCH_DUPLICATE"
//	confidenceScore   — 0.0–1.0 from Service 5C
//	intendedMinor     — intended amount (used for value_at_risk on ambiguous/unresolved)
//	supportingCarriers — carrier fields that matched (empty slice = no carriers)
//	windowStart/End   — rolling 24h window
//
// RUNNING AVERAGE ALGORITHM:
//
//	Using incremental sum/count (simpler than Welford, same accuracy for floats):
//	  new_sum   = old_sum + confidence_score
//	  new_count = old_count + 1
//	  new_avg   = new_sum / new_count
//	All arithmetic in Postgres — no read-modify-write in Go.
func (r *ProjectionRepo) AtomicRecordAttachmentDecision(
	ctx context.Context,
	tenantID string,
	decisionType string,
	confidenceScore float64,
	intendedMinor decimal.Decimal,
	supportingCarriers []string,
	windowStart, windowEnd time.Time,
) error {
	key := "ambiguity.summary"

	// Determine which ambiguity counters to increment.
	isAmbiguous := decisionType == "MATCH_AMBIGUOUS"
	isUnresolved := decisionType == "MATCH_UNRESOLVED"
	// Value-at-risk applies to both ambiguous and unresolved decisions.
	isAtRisk := isAmbiguous || isUnresolved
	// Provider ref missing = no supporting carriers at all.
	hasNoCarriers := len(supportingCarriers) == 0

	ambiguousIncr := 0
	if isAmbiguous {
		ambiguousIncr = 1
	}
	unresolvedIncr := 0
	if isUnresolved {
		unresolvedIncr = 1
	}
	atRiskAmount := decimal.Zero
	if isAtRisk {
		atRiskAmount = intendedMinor
	}
	ambiguousAmount := decimal.Zero
	if isAmbiguous {
		ambiguousAmount = intendedMinor
	}
	missingCarrierIncr := 0
	if hasNoCarriers {
		missingCarrierIncr = 1
	}

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'ambiguous_intent_count',       $5::int,
				'ambiguous_amount_minor',       $6::bigint,
				'unresolved_settlement_count',  $7::int,
				'value_at_risk_minor',          $8::bigint,
				'avg_attachment_confidence',    $9::float8,
				'confidence_sum',               $9::float8,
				'confidence_count',             1,
				'provider_ref_missing_count',   $10::int,
				'total_decisions',              1,
				'provider_ref_missing_rate',    $10::float8,
				'ambiguity_rate',               $5::float8
			),
			now(), 1, 'AMBIGUITY', 'TENANT')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							jsonb_set(
								jsonb_set(
									jsonb_set(
										jsonb_set(
											projection_state.value_json,
											'{ambiguous_intent_count}',
											to_jsonb(COALESCE((projection_state.value_json->>'ambiguous_intent_count')::int, 0) + $5::int)
										),
										'{ambiguous_amount_minor}',
										to_jsonb(COALESCE((projection_state.value_json->>'ambiguous_amount_minor')::bigint, 0) + $6::bigint)
									),
									'{unresolved_settlement_count}',
									to_jsonb(COALESCE((projection_state.value_json->>'unresolved_settlement_count')::int, 0) + $7::int)
								),
								'{value_at_risk_minor}',
								to_jsonb(COALESCE((projection_state.value_json->>'value_at_risk_minor')::bigint, 0) + $8::bigint)
							),
							'{confidence_sum}',
							to_jsonb(COALESCE((projection_state.value_json->>'confidence_sum')::float8, 0.0) + $9::float8)
						),
						'{confidence_count}',
						to_jsonb(COALESCE((projection_state.value_json->>'confidence_count')::int, 0) + 1)
					),
					'{provider_ref_missing_count}',
					to_jsonb(COALESCE((projection_state.value_json->>'provider_ref_missing_count')::int, 0) + $10::int)
				),
				'{total_decisions}',
				to_jsonb(COALESCE((projection_state.value_json->>'total_decisions')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL,
		tenantID, key, windowStart, windowEnd,
		ambiguousIncr,             // $5
		ambiguousAmount.IntPart(), // $6
		unresolvedIncr,            // $7
		atRiskAmount.IntPart(),    // $8
		confidenceScore,           // $9
		missingCarrierIncr,        // $10
	); err != nil {
		return fmt.Errorf("projection_repo.AtomicRecordAttachmentDecision tenant=%s decision=%s: %w",
			tenantID, decisionType, err)
	}

	return r.recomputeAmbiguityRates(ctx, tenantID, key, windowStart)
}

// recomputeAmbiguityRates recalculates the three derived rates:
//
//	avg_attachment_confidence = confidence_sum / confidence_count
//	provider_ref_missing_rate = provider_ref_missing_count / total_decisions
//	ambiguity_rate            = ambiguous_intent_count / total_decisions
func (r *ProjectionRepo) recomputeAmbiguityRates(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			jsonb_set(
				jsonb_set(
					value_json,
					'{avg_attachment_confidence}',
					to_jsonb(
						COALESCE(
							(value_json->>'confidence_sum')::numeric /
							NULLIF((value_json->>'confidence_count')::numeric, 0),
							0
						)
					)
				),
				'{provider_ref_missing_rate}',
				to_jsonb(
					COALESCE(
						(value_json->>'provider_ref_missing_count')::numeric /
						NULLIF((value_json->>'total_decisions')::numeric, 0),
						0
					)
				)
			),
			'{ambiguity_rate}',
			to_jsonb(
				COALESCE(
					(value_json->>'ambiguous_intent_count')::numeric /
					NULLIF((value_json->>'total_decisions')::numeric, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeAmbiguityRates: %w", err)
	}
	return nil
}

// ── DEFENSIBILITY ─────────────────────────────────────────────────────────────

// AtomicRecordGovernanceCoverage updates the DEFENSIBILITY projection when a
// governance decision arrives from Service 6.
//
// Called by HandleGovernanceDecision in projection_service.go.
//
// The method increments coverage counts for each governance check that was
// performed and recomputes all four coverage rates.
//
// Parameters:
//
//	tenantID         — owner
//	decisionOutcome  — "APPROVED" | "REJECTED" | "ESCALATED" | "PENDING"
//	kycChecked       — KYC verification was performed
//	amlChecked       — AML screening was performed
//	replayEquivalent — evidence is sufficient to replay the decision
//	windowStart/End  — rolling 24h window
//
// NOTE: We do NOT increment total_intents here. total_intents is incremented
// separately by AtomicIncrementDefensibilityIntent (called on intent.created).
// This separation keeps denominators accurate even when governance decisions
// arrive out-of-order relative to intent creation.
func (r *ProjectionRepo) AtomicRecordGovernanceCoverage(
	ctx context.Context,
	tenantID string,
	decisionOutcome string,
	kycChecked bool,
	amlChecked bool,
	replayEquivalent bool,
	windowStart, windowEnd time.Time,
) error {
	key := "defensibility.summary"

	// Convert booleans to int increments for SQL arithmetic.
	kycIncr := 0
	if kycChecked {
		kycIncr = 1
	}
	amlIncr := 0
	if amlChecked {
		amlIncr = 1
	}
	replayIncr := 0
	if replayEquivalent {
		replayIncr = 1
	}
	approvedIncr := 0
	rejectedIncr := 0
	escalatedIncr := 0
	switch decisionOutcome {
	case "APPROVED":
		approvedIncr = 1
	case "REJECTED":
		rejectedIncr = 1
	case "ESCALATED":
		escalatedIncr = 1
	}

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_intents',              0,
				'with_evidence_pack',         0,
				'with_governance_decision',   1,
				'with_replay_equivalence',    $5::int,
				'with_kyc_checked',           $6::int,
				'with_aml_checked',           $7::int,
				'governance_approved_count',  $8::int,
				'governance_rejected_count',  $9::int,
				'governance_escalated_count', $10::int,
				'evidence_pack_rate',         0.0,
				'governance_coverage_pct',    0.0,
				'replayability_pct',          0.0,
				'audit_ready_pct',            0.0,
				'dispute_ready_pct',          0.0
			),
			now(), 1, 'DEFENSIBILITY', 'TENANT')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							jsonb_set(
								jsonb_set(
									jsonb_set(
										projection_state.value_json,
										'{with_governance_decision}',
										to_jsonb(COALESCE((projection_state.value_json->>'with_governance_decision')::int, 0) + 1)
									),
									'{with_replay_equivalence}',
									to_jsonb(COALESCE((projection_state.value_json->>'with_replay_equivalence')::int, 0) + $5::int)
								),
								'{with_kyc_checked}',
								to_jsonb(COALESCE((projection_state.value_json->>'with_kyc_checked')::int, 0) + $6::int)
							),
							'{with_aml_checked}',
							to_jsonb(COALESCE((projection_state.value_json->>'with_aml_checked')::int, 0) + $7::int)
						),
						'{governance_approved_count}',
						to_jsonb(COALESCE((projection_state.value_json->>'governance_approved_count')::int, 0) + $8::int)
					),
					'{governance_rejected_count}',
					to_jsonb(COALESCE((projection_state.value_json->>'governance_rejected_count')::int, 0) + $9::int)
				),
				'{governance_escalated_count}',
				to_jsonb(COALESCE((projection_state.value_json->>'governance_escalated_count')::int, 0) + $10::int)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL,
		tenantID, key, windowStart, windowEnd,
		replayIncr,    // $5
		kycIncr,       // $6
		amlIncr,       // $7
		approvedIncr,  // $8
		rejectedIncr,  // $9
		escalatedIncr, // $10
	); err != nil {
		return fmt.Errorf("projection_repo.AtomicRecordGovernanceCoverage tenant=%s: %w", tenantID, err)
	}

	return r.recomputeDefensibilityRates(ctx, tenantID, key, windowStart)
}

// AtomicIncrementDefensibilityIntent increments total_intents and with_evidence_pack
// in the DEFENSIBILITY projection.
//
// Called when an EvidencePackReadyEvent arrives (Service 6).
// Also called without the evidence increment when a new intent is seen
// (to keep the denominator accurate).
//
// hasEvidencePack — true when called from HandleEvidencePackReady,
//
//	false when called from HandleIntentCreated
func (r *ProjectionRepo) AtomicIncrementDefensibilityIntent(
	ctx context.Context,
	tenantID string,
	hasEvidencePack bool,
	windowStart, windowEnd time.Time,
) error {
	key := "defensibility.summary"

	packIncr := 0
	if hasEvidencePack {
		packIncr = 1
	}

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_intents',              1,
				'with_evidence_pack',         $5::int,
				'with_governance_decision',   0,
				'with_replay_equivalence',    0,
				'with_kyc_checked',           0,
				'with_aml_checked',           0,
				'governance_approved_count',  0,
				'governance_rejected_count',  0,
				'governance_escalated_count', 0,
				'evidence_pack_rate',         $5::float8,
				'governance_coverage_pct',    0.0,
				'replayability_pct',          0.0,
				'audit_ready_pct',            0.0,
				'dispute_ready_pct',          0.0
			),
			now(), 1, 'DEFENSIBILITY', 'TENANT')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				jsonb_set(
					projection_state.value_json,
					'{total_intents}',
					to_jsonb(COALESCE((projection_state.value_json->>'total_intents')::int, 0) + 1)
				),
				'{with_evidence_pack}',
				to_jsonb(COALESCE((projection_state.value_json->>'with_evidence_pack')::int, 0) + $5::int)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd, packIncr); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementDefensibilityIntent tenant=%s: %w", tenantID, err)
	}

	return r.recomputeDefensibilityRates(ctx, tenantID, key, windowStart)
}

// AtomicIncrementDefensibilityEvidencePack increments only with_evidence_pack in the
// DEFENSIBILITY projection without changing the total_intents denominator.
//
// Grade A derives total_intents from attachment decisions. Evidence-pack events
// should improve coverage, not make the denominator look larger than the tenant's
// actual population of intents.
func (r *ProjectionRepo) AtomicIncrementDefensibilityEvidencePack(
	ctx context.Context,
	tenantID string,
	windowStart, windowEnd time.Time,
) error {
	key := "defensibility.summary"

	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_intents',              0,
				'with_evidence_pack',         1,
				'with_governance_decision',   0,
				'with_replay_equivalence',    0,
				'with_kyc_checked',           0,
				'with_aml_checked',           0,
				'governance_approved_count',  0,
				'governance_rejected_count',  0,
				'governance_escalated_count', 0,
				'evidence_pack_rate',         0.0,
				'governance_coverage_pct',    0.0,
				'replayability_pct',          0.0,
				'audit_ready_pct',            0.0,
				'dispute_ready_pct',          0.0
			),
			now(), 1, 'DEFENSIBILITY', 'TENANT')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_set(
				projection_state.value_json,
				'{with_evidence_pack}',
				to_jsonb(COALESCE((projection_state.value_json->>'with_evidence_pack')::int, 0) + 1)
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL, tenantID, key, windowStart, windowEnd); err != nil {
		return fmt.Errorf("projection_repo.AtomicIncrementDefensibilityEvidencePack tenant=%s: %w", tenantID, err)
	}

	return r.recomputeDefensibilityRates(ctx, tenantID, key, windowStart)
}

// recomputeDefensibilityRates recalculates the five derived defensibility rates
// from their respective numerators and the shared total_intents denominator.
//
// audit_ready_pct   = (with_evidence_pack + with_governance_decision) / (2 * total_intents)
//
//	— requires BOTH pack AND governance to be considered audit-ready
//
// dispute_ready_pct = (with_evidence_pack + with_governance_decision + with_replay) / (3 * total_intents)
//
//	— requires all three
//
// NULLIF prevents divide-by-zero during startup before any intents arrive.
func (r *ProjectionRepo) recomputeDefensibilityRates(
	ctx context.Context,
	tenantID, key string,
	windowStart time.Time,
) error {
	sql := `
		UPDATE projection_state
		SET value_json = jsonb_set(
			jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							value_json,
							'{evidence_pack_rate}',
							to_jsonb(
								COALESCE(
									(value_json->>'with_evidence_pack')::numeric /
									NULLIF((value_json->>'total_intents')::numeric, 0),
									0
								)
							)
						),
						'{governance_coverage_pct}',
						to_jsonb(
							COALESCE(
								(value_json->>'with_governance_decision')::numeric /
								NULLIF((value_json->>'total_intents')::numeric, 0),
								0
							)
						)
					),
					'{replayability_pct}',
					to_jsonb(
						COALESCE(
							(value_json->>'with_replay_equivalence')::numeric /
							NULLIF((value_json->>'total_intents')::numeric, 0),
							0
						)
					)
				),
				'{audit_ready_pct}',
				to_jsonb(
					COALESCE(
						(
							(value_json->>'with_evidence_pack')::numeric +
							(value_json->>'with_governance_decision')::numeric
						) /
						NULLIF((value_json->>'total_intents')::numeric * 2, 0),
						0
					)
				)
			),
			'{dispute_ready_pct}',
			to_jsonb(
				COALESCE(
					(
						(value_json->>'with_evidence_pack')::numeric +
						(value_json->>'with_governance_decision')::numeric +
						(value_json->>'with_replay_equivalence')::numeric
					) /
					NULLIF((value_json->>'total_intents')::numeric * 3, 0),
					0
				)
			)
		),
		computed_at = now()
		WHERE tenant_id          = $1
		  AND projection_key     = $2
		  AND window_start       = $3
		  AND projection_version = 1
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart); err != nil {
		return fmt.Errorf("projection_repo.recomputeDefensibilityRates: %w", err)
	}
	return nil
}

// ── BATCH HEALTH ──────────────────────────────────────────────────────────────

// AtomicUpdateBatchHealth writes (or replaces) the PATTERN projection for a batch.
//
// Called by HandleBatchSummaryUpdated when a BatchSummaryUpdatedEvent arrives.
//
// WHY REPLACE INSTEAD OF INCREMENT?
// BatchSummaryUpdatedEvent from Service 5C is a FULL SNAPSHOT of the batch's
// current state — it already contains the correct aggregate counts.
// Attempting to increment on top of a snapshot would double-count.
// Instead we replace the value_json entirely with the new snapshot.
// This is safe because:
//   - The event is already idempotency-checked by HandleBatchSummaryUpdated
//   - The batch_id is the entity_scope_ref, making each batch row unique
//   - The source of truth for batch state is Service 5C, not ZPI
//
// Parameters:
//
//	tenantID          — owner
//	batchID           — e.g. "PAYROLL-2026-04-01"
//	totalCount        — total intents in this batch
//	successCount      — fully settled
//	failedCount       — failed or reversed
//	pendingCount      — not yet resolved
//	reversedCount     — reversed after settling
//	partialReconCount — attached but with variance
//	intendedMinor     — total_intended_amount_minor
//	confirmedMinor    — total_confirmed_amount_minor
//	varianceMinor     — total_variance_minor (positive = leakage)
//	ambiguityScore    — 0.0–1.0 from Service 5C
//	finalityStatus    — "PROCESSING" | "FULLY_SETTLED" | "PARTIALLY_SETTLED" | etc.
//	windowStart/End   — rolling 24h window
func (r *ProjectionRepo) AtomicUpdateBatchHealth(
	ctx context.Context,
	tenantID string,
	batchID string,
	totalCount, successCount, failedCount, pendingCount, reversedCount, partialReconCount int,
	intendedMinor, confirmedMinor, varianceMinor decimal.Decimal,
	ambiguityScore float64,
	finalityStatus string,
	windowStart, windowEnd time.Time,
) error {
	key := fmt.Sprintf("batch.health.%s", batchID)

	// Full replace — see WHY REPLACE comment above.
	upsertSQL := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type, entity_scope_ref)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'total_count',                    $5::int,
				'success_count',                  $6::int,
				'failed_count',                   $7::int,
				'pending_count',                  $8::int,
				'reversed_count',                 $9::int,
				'partial_recon_count',            $10::int,
				'total_intended_amount_minor',    $11::bigint,
				'total_confirmed_amount_minor',   $12::bigint,
				'total_variance_minor',           $13::bigint,
				'ambiguity_score',                $14::float8,
				'finality_status',                $15::text,
				'updated_at',                     now()
			),
			now(), 1, 'PATTERN', 'BATCH', $16)
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_build_object(
				'total_count',                    $5::int,
				'success_count',                  $6::int,
				'failed_count',                   $7::int,
				'pending_count',                  $8::int,
				'reversed_count',                 $9::int,
				'partial_recon_count',            $10::int,
				'total_intended_amount_minor',    $11::bigint,
				'total_confirmed_amount_minor',   $12::bigint,
				'total_variance_minor',           $13::bigint,
				'ambiguity_score',                $14::float8,
				'finality_status',                $15::text,
				'updated_at',                     now()
			),
			entity_scope_ref = $16,
			computed_at      = now()
	`
	if _, err := r.pool.Exec(ctx, upsertSQL,
		tenantID, key, windowStart, windowEnd,
		totalCount,               // $5
		successCount,             // $6
		failedCount,              // $7
		pendingCount,             // $8
		reversedCount,            // $9
		partialReconCount,        // $10
		intendedMinor.IntPart(),  // $11
		confirmedMinor.IntPart(), // $12
		varianceMinor.IntPart(),  // $13
		ambiguityScore,           // $14
		finalityStatus,           // $15
		batchID,                  // $16 — entity_scope_ref
	); err != nil {
		return fmt.Errorf("projection_repo.AtomicUpdateBatchHealth batch=%s tenant=%s: %w",
			batchID, tenantID, err)
	}
	return nil
}

// GetLeakageSummary is a convenience read method for the Leakage intelligence layer.
// Returns the latest leakage projection for a tenant, or nil if none exists yet.
func (r *ProjectionRepo) GetLeakageSummary(
	ctx context.Context,
	tenantID string,
) (*models.LeakageValue, error) {
	var v models.LeakageValue
	if err := r.GetValueAs(ctx, tenantID, "leakage.total", &v); err != nil {
		return nil, fmt.Errorf("projection_repo.GetLeakageSummary: %w", err)
	}
	return &v, nil
}

// GetAmbiguitySummary is a convenience read method for the Ambiguity intelligence layer.
func (r *ProjectionRepo) GetAmbiguitySummary(
	ctx context.Context,
	tenantID string,
) (*models.AmbiguityValue, error) {
	var v models.AmbiguityValue
	if err := r.GetValueAs(ctx, tenantID, "ambiguity.summary", &v); err != nil {
		return nil, fmt.Errorf("projection_repo.GetAmbiguitySummary: %w", err)
	}
	return &v, nil
}

// GetDefensibilitySummary is a convenience read method for the Defensibility intelligence layer.
func (r *ProjectionRepo) GetDefensibilitySummary(
	ctx context.Context,
	tenantID string,
) (*models.DefensibilityValue, error) {
	var v models.DefensibilityValue
	if err := r.GetValueAs(ctx, tenantID, "defensibility.summary", &v); err != nil {
		return nil, fmt.Errorf("projection_repo.GetDefensibilitySummary: %w", err)
	}
	return &v, nil
}

// GetBatchHealth is a convenience read method for one batch's health projection.
func (r *ProjectionRepo) GetBatchHealth(
	ctx context.Context,
	tenantID, batchID string,
) (*models.BatchHealthValue, error) {
	key := fmt.Sprintf("batch.health.%s", batchID)
	var v models.BatchHealthValue
	if err := r.GetValueAs(ctx, tenantID, key, &v); err != nil {
		return nil, fmt.Errorf("projection_repo.GetBatchHealth batch=%s: %w", batchID, err)
	}
	return &v, nil
}

func (r *ProjectionRepo) UpsertPatternTenantSummary(
	ctx context.Context,
	tenantID string,
	batchRiskScore float64,
	proofReadinessScore float64,
	windowStart, windowEnd time.Time,
) error {
	key := "pattern.tenant_summary"
	sql := `
		INSERT INTO projection_state
			(tenant_id, projection_key, window_start, window_end,
			 value_json, computed_at, projection_version,
			 projection_family, entity_scope_type)
		VALUES ($1, $2, $3, $4,
			jsonb_build_object(
				'batch_risk_score', $5::numeric,
				'proof_readiness_score', $6::numeric,
				'duplicate_cluster_count', 0::numeric
			),
			now(), 1, 'PATTERN', 'TENANT')
		ON CONFLICT (tenant_id, projection_key, window_start, projection_version)
		DO UPDATE SET
			value_json = jsonb_build_object(
				'batch_risk_score', $5::numeric,
				'proof_readiness_score', $6::numeric,
				'duplicate_cluster_count', 0::numeric
			),
			computed_at = now()
	`
	if _, err := r.pool.Exec(ctx, sql, tenantID, key, windowStart, windowEnd, batchRiskScore, proofReadinessScore); err != nil {
		return fmt.Errorf("projection_repo.UpsertPatternTenantSummary tenant=%s: %w", tenantID, err)
	}
	return nil
}
