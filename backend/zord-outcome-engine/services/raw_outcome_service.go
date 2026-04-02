package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
	"zord-outcome-engine/storage"

	"github.com/google/uuid"
)

type RawOutcomeService struct {
	S3 *storage.S3Store
}

func (s *RawOutcomeService) Ingest(ctx context.Context, req models.IngestRequest) (*models.IngestResponse, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	log.Printf("raw_outcome.ingest.start source_class=%s connector_id=%s reference_id=%s payload_bytes=%d", req.SourceClass, req.ConnectorID, safeStr(req.ReferenceID), len(req.Payload))

	connectorUUID, err := uuid.Parse(req.ConnectorID)
	if err != nil {
		log.Printf("raw_outcome.ingest.bad_connector_id source_class=%s connector_id=%s err=%v", req.SourceClass, req.ConnectorID, err)
		return nil, err
	}

	if req.ReferenceID == nil || strings.TrimSpace(*req.ReferenceID) == "" {
		log.Printf("raw_outcome.ingest.missing_reference_id source_class=%s connector_id=%s", req.SourceClass, req.ConnectorID)
		return nil, fmt.Errorf("reference_id is required (expected dispatch_id)")
	}
	dispatchUUID, err := uuid.Parse(strings.TrimSpace(*req.ReferenceID))
	if err != nil {
		log.Printf("raw_outcome.ingest.bad_reference_id source_class=%s connector_id=%s reference_id=%s err=%v", req.SourceClass, req.ConnectorID, safeStr(req.ReferenceID), err)
		return nil, fmt.Errorf("invalid reference_id (expected uuid dispatch_id): %w", err)
	}

	// Resolve tenant_id and trace_id from dispatch_index using dispatch_id(reference_id) + connector_id.
	// This is the only reliable source for webhook/poll/SFTP because we don't rely on headers.
	var tenantIDStr, traceIDStr, contractIDStr, intentIDStr, corridorID string
	err = db.DB.QueryRowContext(ctx, `
SELECT tenant_id::text, trace_id::text, contract_id::text, intent_id::text, corridor_id::text
FROM dispatch_index
WHERE dispatch_id = $1::uuid AND connector_id = $2::uuid
LIMIT 1
`, dispatchUUID, connectorUUID).Scan(&tenantIDStr, &traceIDStr, &contractIDStr, &intentIDStr, &corridorID)
	if err != nil {
		log.Printf("raw_outcome.ingest.dispatch_index_lookup_failed source_class=%s connector_id=%s dispatch_id=%s err=%v", req.SourceClass, req.ConnectorID, dispatchUUID.String(), err)
		return nil, err
	}

	tenantUUID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		log.Printf("raw_outcome.ingest.bad_tenant_id source_class=%s tenant_id=%s err=%v", req.SourceClass, tenantIDStr, err)
		return nil, err
	}
	traceUUID, err := uuid.Parse(traceIDStr)
	if err != nil {
		log.Printf("raw_outcome.ingest.bad_trace_id source_class=%s trace_id=%s err=%v", req.SourceClass, traceIDStr, err)
		return nil, err
	}
	log.Printf("raw_outcome.ingest.dispatch_index_resolved source_class=%s connector_id=%s dispatch_id=%s tenant_id=%s trace_id=%s contract_id=%s intent_id=%s", req.SourceClass, req.ConnectorID, dispatchUUID.String(), tenantIDStr, traceIDStr, contractIDStr, intentIDStr)

	// Store encrypted payload in S3 (encryption happens inside storage).
	envelopeID, receivedAt, objRef, err := s.S3.StoreRawPayload(ctx, req.Payload, tenantIDStr)
	if err != nil {
		log.Printf("raw_outcome.ingest.s3_store_failed source_class=%s dispatch_id=%s tenant_id=%s err=%v", req.SourceClass, dispatchUUID.String(), tenantIDStr, err)
		return nil, err
	}
	log.Printf("raw_outcome.ingest.s3_stored source_class=%s dispatch_id=%s tenant_id=%s envelope_id=%s received_at=%s obj_ref=%s", req.SourceClass, dispatchUUID.String(), tenantIDStr, envelopeID.String(), receivedAt.UTC().Format(time.RFC3339Nano), objRef)

	sum := sha256.Sum256(req.Payload)

	rawEnv := &models.RawOutcomeEnvelope{
		RawOutcomeEnvelopeID: envelopeID,
		TenantID:             tenantUUID,
		TraceID:              traceUUID,
		ConnectorID:          connectorUUID,
		SourceClass:          req.SourceClass,
		ReceivedAt:           receivedAt,
		RawBytesSHA256:       sum[:],
		ObjectStoreRef:       objRef,
		CorridorID:           corridorID,
		CreatedAt:            time.Now().UTC(),
	}
	// Persist raw_outcome_envelopes row using db.DB directly.
	// Use sha256 + tenant as idempotency key: on conflict, reuse existing row.
	if err := insertOrGetRawEnvelope(ctx, rawEnv); err != nil {
		log.Printf("raw_outcome.ingest.raw_envelope_persist_failed source_class=%s envelope_id=%s err=%v", req.SourceClass, envelopeID.String(), err)
		return nil, err
	}
	log.Printf("raw_outcome.ingest.raw_envelope_persisted source_class=%s envelope_id=%s tenant_id=%s trace_id=%s", req.SourceClass, rawEnv.RawOutcomeEnvelopeID.String(), tenantIDStr, traceIDStr)

	// Normalize using the in-memory payload (no S3 read).
	meta := &RawEnvelopeMeta{
		RawOutcomeEnvelopeID: envelopeID,
		TenantID:             tenantUUID,
		TraceID:              traceUUID,
		ConnectorID:          connectorUUID,
		SourceClass:          req.SourceClass,
		ReceivedAt:           receivedAt,
		corridorID:           corridorID,
		RawBytesSHA256:       sum[:],
	}
	canonical, err := normalizeAndInsertCanonical(ctx, meta, req.Payload)
	if err != nil {
		log.Printf("raw_outcome.ingest.normalize_failed source_class=%s envelope_id=%s err=%v", req.SourceClass, envelopeID.String(), err)
		return nil, err
	}
	log.Printf("raw_outcome.ingest.normalized source_class=%s envelope_id=%s canonical_event_id=%s status=%s provider_event_id=%s utr=%s", req.SourceClass, envelopeID.String(), canonical.EventID.String(), canonical.StatusCandidate, safeStr(canonical.ProviderEventID), safeStr(canonical.UTR))

	// Run correlation engine: L1 match by reference_id (dispatch_id), L2 by provider_ref_hash.
	dispatchIDStr := dispatchUUID.String()
	res, err := correlateCanonical(ctx, &dispatchIDStr, canonical.ProviderRefHash)
	if err != nil {
		log.Printf("raw_outcome.ingest.correlation_engine_failed source_class=%s canonical_event_id=%s dispatch_id=%s err=%v", req.SourceClass, canonical.EventID.String(), dispatchUUID.String(), err)
		return nil, err
	}
	if res.DispatchID == nil {
		//Need to check this logic if Correlation failed
		log.Printf("raw_outcome.ingest.correlation_unmatched source_class=%s canonical_event_id=%s dispatch_id=%s reason=%s", req.SourceClass, canonical.EventID.String(), dispatchUUID.String(), res.Reason)
	} else {
		if err := applyCorrelation(ctx, canonical.EventID, res); err != nil {
			log.Printf("raw_outcome.ingest.correlation_apply_failed source_class=%s canonical_event_id=%s dispatch_id=%s err=%v", req.SourceClass, canonical.EventID.String(), dispatchUUID.String(), err)
			return nil, err
		}
		log.Printf("raw_outcome.ingest.correlation_applied source_class=%s canonical_event_id=%s dispatch_id=%s confidence=%d reason=%s", req.SourceClass, canonical.EventID.String(), dispatchUUID.String(), res.CorrelationConfidence, res.Reason)
	}

	out := &models.IngestResponse{
		RawOutcomeEnvelopeID: envelopeID.String(),
		CanonicalEventID:     canonical.EventID.String(),
		ReceivedAt:           receivedAt,
	}

	// We have a dispatch_index row, so contract_id is available (NOT NULL).
	contractStr := contractIDStr
	out.ContractID = &contractStr

	state, err := recomputeFusionAndFinality(ctx, contractStr)
	if err != nil {
		log.Printf("raw_outcome.ingest.fusion_failed source_class=%s contract_id=%s err=%v", req.SourceClass, contractStr, err)
		return nil, err
	}
	out.FusedState = &state
	log.Printf("raw_outcome.ingest.done source_class=%s envelope_id=%s canonical_event_id=%s contract_id=%s fused_state=%s", req.SourceClass, envelopeID.String(), canonical.EventID.String(), contractStr, state)

	return out, nil
}

func safeStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// insertOrGetRawEnvelope enforces idempotency on (tenant_id, raw_bytes_sha256).
func insertOrGetRawEnvelope(ctx context.Context, env *models.RawOutcomeEnvelope) error {
	row := db.DB.QueryRowContext(ctx, `
INSERT INTO raw_outcome_envelopes(
	raw_outcome_envelope_id,
	tenant_id,
	trace_id,
	connector_id,
	source_class,
	received_at,
	raw_bytes_sha256,
	object_store_ref
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
ON CONFLICT (tenant_id, raw_bytes_sha256) DO NOTHING
RETURNING raw_outcome_envelope_id, received_at, object_store_ref
`,
		env.RawOutcomeEnvelopeID,
		env.TenantID,
		env.TraceID,
		env.ConnectorID,
		env.SourceClass,
		env.ReceivedAt,
		env.RawBytesSHA256,
		env.ObjectStoreRef,
	)
	var id uuid.UUID
	var receivedAt time.Time
	var objRef string
	err := row.Scan(&id, &receivedAt, &objRef)
	if err == nil {
		// Fresh insert; keep env as-is.
		return nil
	}
	if err != sql.ErrNoRows {
		return err
	}

	// Conflict path: look up existing envelope by tenant + sha256.
	r := db.DB.QueryRowContext(ctx, `
SELECT raw_outcome_envelope_id, received_at, object_store_ref
FROM raw_outcome_envelopes
WHERE tenant_id = $1 AND raw_bytes_sha256 = $2
LIMIT 1
`,
		env.TenantID,
		env.RawBytesSHA256,
	)
	if err := r.Scan(&id, &receivedAt, &objRef); err != nil {
		return err
	}
	env.RawOutcomeEnvelopeID = id
	env.ReceivedAt = receivedAt
	env.ObjectStoreRef = objRef
	return nil
}
