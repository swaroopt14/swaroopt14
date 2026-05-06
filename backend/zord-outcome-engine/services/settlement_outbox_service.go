package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"
)

// SettlementOutboxService manages the emission of durable events for settlement lifecycle.
type SettlementOutboxService struct{}

// EmitForJob manages the creation of durable outbox events for a job.
// It generates two types of events:
// 1. individual 'created' events for each canonical observation.
// 2. 'batch_ready' events for each unique batch reference found in the file.
func (s *SettlementOutboxService) EmitForJob(
	ctx context.Context,
	jobID string,
	tenantID uuid.UUID,
	observations []models.CanonicalSettlementObservation,
) error {
	log.Printf("settlement.outbox.start job_id=%s count=%d", jobID, len(observations))
	var lastErr error
	batchCount := 0
	var settlementBatchID string

	if err := db.DB.QueryRowContext(ctx, `
		SELECT settlement_batch_id
		FROM settlement_ingest_runs
		WHERE ingest_run_id = $1 AND tenant_id = $2
		LIMIT 1`,
		jobID, tenantID,
	).Scan(&settlementBatchID); err != nil {
		return fmt.Errorf("outbox batch lookup failed: %w", err)
	}

	// ── EVENT TYPE 1: Observation Created ──────────────────────────────────
	// These events are used to notify systems that a new settled item is available.
	for _, obs := range observations {
		payload := map[string]interface{}{
			"settlement_observation_id":  obs.SettlementObservationID,
			"tenant_id":                  tenantID,
			"job_id":                     jobID,
			"observation_kind":           obs.ObservationKind,
			"settlement_status":          obs.SettlementStatus,
			"amount":                     obs.Amount,
			"currency_code":              obs.CurrencyCode,
			"bank_reference":             obs.BankReference,
			"provider_reference":         obs.ProviderReference,
			"attachment_readiness_score": obs.AttachmentReadinessScore,
			"canonical_hash":             obs.CanonicalHash,
		}

		if err := s.insertEvent(ctx, tenantID, jobID, settlementBatchID, "settlement_observation", obs.SettlementObservationID, "canonical.settlement.created", payload); err != nil {
			lastErr = err
		}
	}

	// 2. Emit one event per batch group: canonical.settlement.batch_ready
	batchGroups := make(map[string]int)
	for _, obs := range observations {
		batchRef := safeDeref(obs.BatchReference)
		if batchRef == "" {
			batchRef = "unknown"
		}
		batchGroups[batchRef]++
	}

	for batchRef, count := range batchGroups {
		payload := map[string]interface{}{
			"job_id":          jobID,
			"tenant_id":       tenantID,
			"batch_reference": batchRef,
			"row_count":       count,
			"event":           "batch_ready",
		}

		if err := s.insertEvent(ctx, tenantID, jobID, settlementBatchID, "settlement_observation", uuid.New(), "canonical.settlement.batch_ready", payload); err != nil {
			lastErr = err
		}
		batchCount++
	}

	log.Printf("settlement.outbox.emitted job_id=%s observation_events=%d batch_events=%d", jobID, len(observations), batchCount)
	return lastErr
}

func (s *SettlementOutboxService) insertEvent(
	ctx context.Context,
	tenantID uuid.UUID, jobID string, settlementBatchID string,
	family string,
	entityID uuid.UUID,
	eventType string,
	payload interface{},
) error {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		log.Printf("settlement.outbox.marshal_failed type=%s err=%v", eventType, err)
		return err
	}

	_, err = db.DB.ExecContext(ctx, `
		INSERT INTO settlement_outbox_events (
			outbox_event_id, tenant_id, trace_id, job_id, ingest_run_id, settlement_batch_id,
			entity_family, entity_id,
			event_type, payload_json,
			status, attempts, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		uuid.New(), tenantID, nil, jobID, jobID, settlementBatchID,
		family, entityID,
		eventType, payloadJSON,
		"PENDING", 0, time.Now().UTC(),
	)
	if err != nil {
		log.Printf("settlement.outbox.insert_failed type=%s err=%v", eventType, err)
		return fmt.Errorf("outbox insert failed: %w", err)
	}

	return nil
}
