package kafka

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE 6 — OUTCOME CONSUMER
//
// Consumes payments.outcome.events.v1 (published by zord-relay after polling
// zord-outcome-engine's outcome_outbox table).
//
// Supported event types:
//   outcome.leaf_bundle.created — carries all 4 Merkle leaf candidates for one
//                                 attached intent/observation pair.
//
// On receipt the consumer validates the bundle and immediately calls
// EvidenceService.GeneratePack() — no buffering required because the emitter
// guarantees all 4 leaves arrive in a single event.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"encoding/json"
	"log"
	"zord-evidence/models"
)

// PackGenerator is the narrow interface this consumer requires from the
// evidence service.  *services.EvidenceService satisfies it automatically.
// Defined here (in the kafka package) to avoid a circular import:
//
//	kafka → services → kafka  (would be circular)
//	kafka → models            (safe: models has no kafka dependency)
type PackGenerator interface {
	GeneratePack(ctx context.Context, req models.GenerateEvidenceRequest) (*models.EvidencePack, error)
	HandleLeafUpdate(ctx context.Context, tenantID, envelopeID, intentID, contractID, traceID string, newLeaves []models.PendingLeafCandidate) error
}

// OutcomeEventType constants understood by this consumer.
const (
	EventOutcomeLeafBundle = "outcome.leaf_bundle.created"
)

// leafCandidateWire is the on-wire representation of one Merkle leaf inside
// an outcome.leaf_bundle.created payload.  Must match the emitter's struct.
type leafCandidateWire struct {
	Type          string `json:"type"`
	Ref           string `json:"ref"`
	Hash          string `json:"hash"`
	SchemaVersion string `json:"schema_version"`
}

// leafBundleEvent is the full parsed payload of an outcome.leaf_bundle.created
// Kafka message.
type leafBundleEvent struct {
	EventType               string              `json:"event_type"`
	TenantID                string              `json:"tenant_id"`
	IntentID                string              `json:"intent_id"`
	SettlementObservationID string              `json:"settlement_observation_id"`
	AttachmentJobID         string              `json:"attachment_job_id"`
	DecisionType            string              `json:"decision_type"`
	Leaves                  []leafCandidateWire `json:"leaves"`
}

// StartOutcomeConsumer starts a dedicated Kafka consumer group for
// outcome leaf bundles and routes events to the evidence service.
// It can listen to multiple topics to handle environment-specific overrides.
func StartOutcomeConsumer(
	ctx context.Context,
	brokers []string,
	groupID string,
	topics []string,
	pg PackGenerator,
) error {
	log.Printf("outcome.consumer.start group=%s topics=%v brokers=%v", groupID, topics, brokers)
	// buildOutcomeHandler returns a MessageHandler (func(ctx, key, []byte) error)
	// which is exactly what StartConsumerForTopics expects.
	return StartConsumerForTopics(ctx, brokers, groupID, topics, buildOutcomeHandler(pg))
}

// buildOutcomeHandler returns the MessageHandler func used by StartConsumer.
func buildOutcomeHandler(pg PackGenerator) MessageHandler {
	return func(ctx context.Context, key string, raw []byte) error {
		// Peek at event_type before full unmarshal to support future extensibility.
		var peek struct {
			EventType string `json:"event_type"`
		}
		if err := json.Unmarshal(raw, &peek); err != nil {
			log.Printf("outcome.consumer.peek_failed key=%s err=%v — skipping", key, err)
			return nil // non-retryable parse error
		}

		switch peek.EventType {
		case EventOutcomeLeafBundle:
			return handleLeafBundle(ctx, raw, pg)
		default:
			log.Printf("outcome.consumer.unknown_event_type type=%s key=%s — skipping", peek.EventType, key)
			return nil
		}
	}
}

// handleLeafBundle processes one outcome.leaf_bundle.created event.
func handleLeafBundle(ctx context.Context, raw []byte, pg PackGenerator) error {
	var relayEvt models.RelayEvent
	if err := json.Unmarshal(raw, &relayEvt); err != nil {
		log.Printf("outcome.consumer.relay_parse_failed err=%v — skipping", err)
		return nil
	}

	var evt leafBundleEvent
	if err := json.Unmarshal(relayEvt.Payload, &evt); err != nil {
		log.Printf("outcome.consumer.payload_parse_failed err=%v — skipping", err)
		return nil
	}

	// Use RelayEvent IDs as fallback if payload is missing them
	tenantID := evt.TenantID
	if tenantID == "" {
		tenantID = relayEvt.TenantID
	}
	intentID := evt.IntentID
	if intentID == "" {
		intentID = relayEvt.AggregateID
	}

	if tenantID == "" || intentID == "" {
		log.Printf("outcome.consumer.missing_ids tenant=%q intent=%q — skipping", tenantID, intentID)
		return nil
	}

	log.Printf("outcome.consumer.leaf_bundle_received tenant=%s intent=%s obs=%s leaves=%d",
		tenantID, intentID, evt.SettlementObservationID, len(evt.Leaves))

	// Map wire leaves → pending leaf models.
	contractID := relayEvt.ContractID
	pendingLeaves := make([]models.PendingLeafCandidate, 0, len(evt.Leaves))
	for _, l := range evt.Leaves {
		sv := l.SchemaVersion
		if sv == "" {
			sv = "v1"
		}
		pendingLeaves = append(pendingLeaves, models.PendingLeafCandidate{
			TenantID:      tenantID,
			IntentID:      &intentID,
			ContractID:    &contractID,
			LeafType:      l.Type,
			ItemRef:       l.Ref,
			Hash:          l.Hash,
			SchemaVersion: sv,
			SourceTopic:   "payments.outcome.events.v1",
		})
	}

	if len(pendingLeaves) == 0 {
		log.Printf("outcome.consumer.empty_leaves intent=%s — skipping", intentID)
		return nil
	}

	// Use HandleLeafUpdate to buffer and check for pack readiness.
	err := pg.HandleLeafUpdate(ctx, tenantID, relayEvt.EnvelopeID, intentID, contractID, relayEvt.TraceID, pendingLeaves)
	if err != nil {
		log.Printf("outcome.consumer.handle_leaf_update_failed tenant=%s intent=%s err=%v", tenantID, intentID, err)
		return err
	}

	log.Printf("outcome.consumer.leaves_processed tenant=%s intent=%s leaves=%d",
		tenantID, intentID, len(pendingLeaves))
	return nil
}
