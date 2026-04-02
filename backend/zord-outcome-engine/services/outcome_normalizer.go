package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/google/uuid"
)

type OutcomeNormalizer struct {
	Events any
}

// RawEnvelopeMeta holds envelope metadata for normalization. Payload is passed separately (in memory).
type RawEnvelopeMeta struct {
	RawOutcomeEnvelopeID uuid.UUID
	TenantID             uuid.UUID
	TraceID              uuid.UUID
	ConnectorID          uuid.UUID
	SourceClass          string
	corridorID           string
	ReceivedAt           time.Time
	RawBytesSHA256       []byte
}

// NormalizePayload creates a canonical outcome event from in-memory payload and envelope metadata. No S3 read.
func (n *OutcomeNormalizer) NormalizePayload(ctx context.Context, meta *RawEnvelopeMeta, payload []byte) (*models.CanonicalOutcomeEvent, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if meta == nil {
		return nil, fmt.Errorf("envelope meta is nil")
	}

	log.Printf("normalize.start envelope_id=%s tenant_id=%s trace_id=%s connector_id=%s source_class=%s payload_bytes=%d", meta.RawOutcomeEnvelopeID.String(), meta.TenantID.String(), meta.TraceID.String(), meta.ConnectorID.String(), meta.SourceClass, len(payload))

	ev, err := n.normalizeByConnector(ctx, meta, payload)
	if err != nil {
		log.Printf("normalize.error envelope_id=%s err=%v", meta.RawOutcomeEnvelopeID.String(), err)
		return nil, err
	}
	if ev == nil {
		return nil, fmt.Errorf("normalizer produced nil event")
	}

	if ev.DedupeKey == "" {
		ev.DedupeKey = computeDedupeKey(meta, ev)
	}
	if ev.ReceivedAt.IsZero() {
		ev.ReceivedAt = meta.ReceivedAt
	}
	if ev.TraceID == nil {
		t := meta.TraceID
		ev.TraceID = &t
	}
	ev.TenantID = meta.TenantID
	ev.ConnectorID = meta.ConnectorID
	ev.RawOutcomeEnvelopeID = meta.RawOutcomeEnvelopeID
	ev.SourceClass = meta.SourceClass

	log.Printf("normalize.done envelope_id=%s event_id=%s status=%s provider_event_id=%s utr=%s dedupe_key=%s", meta.RawOutcomeEnvelopeID.String(), ev.EventID.String(), ev.StatusCandidate, safe(ev.ProviderEventID), safe(ev.UTR), ev.DedupeKey)
	return ev, nil
}

func normalizeAndInsertCanonical(ctx context.Context, meta *RawEnvelopeMeta, payload []byte) (*models.CanonicalOutcomeEvent, error) {
	normalizer := &OutcomeNormalizer{Events: nil}
	ev, err := normalizer.NormalizePayload(ctx, meta, payload)
	if err != nil {
		return nil, err
	}

	log.Printf("canonical.insert.start event_id=%s dedupe_key=%s", ev.EventID.String(), ev.DedupeKey)
	_, err = db.DB.ExecContext(ctx, `
INSERT INTO canonical_outcome_events(
	event_id,
	raw_outcome_envelope_id,
	tenant_id,
	contract_id,
	intent_id,
	dispatch_id,
	trace_id,
	connector_id,
	corridor_id,
	source_class,
	status_candidate,
	provider_ref_hash,
	provider_event_id,
	utr,
	amount,
	currency,
	observed_at,
	received_at,
	correlation_confidence,
	dedupe_key
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
ON CONFLICT (dedupe_key) DO NOTHING
`,
		ev.EventID,
		ev.RawOutcomeEnvelopeID,
		ev.TenantID,
		ev.ContractID,
		ev.IntentID,
		ev.DispatchID,
		ev.TraceID,
		ev.ConnectorID,
		ev.CorridorID,
		ev.SourceClass,
		ev.StatusCandidate,
		ev.ProviderRefHash,
		ev.ProviderEventID,
		ev.UTR,
		ev.Amount,
		ev.Currency,
		ev.ObservedAt,
		ev.ReceivedAt,
		ev.CorrelationConfidence,
		ev.DedupeKey,
	)
	if err != nil {
		log.Printf("canonical.insert.error event_id=%s err=%v", ev.EventID.String(), err)
		return nil, err
	}
	log.Printf("canonical.insert.done event_id=%s", ev.EventID.String())
	return ev, nil
}

func (n *OutcomeNormalizer) normalizeByConnector(ctx context.Context, meta *RawEnvelopeMeta, raw []byte) (*models.CanonicalOutcomeEvent, error) {
	// Minimal connector-specific normalization:
	// - For now, treat all webhooks as JSON and pull common keys if present.
	// - Correlation happens in the correlation engine.
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("invalid JSON payload: %w", err)
	}

	status := normalizeStatusCandidate(obj["status"])
	if status == "" {
		status = "PENDING"
	}
	var CorridorID *string
	keys := []string{
		"corridor_id",
		"mode",
		"rail",
		"channel",
		"payment_method",
		"transfer_type",
	}
	for _, key := range keys {
		if v, ok := obj[key].(string); ok && v != "" {
			c := NormalizeCorridorCandidate(v)
			CorridorID = &c
			break
		}
	}
	//Fallback to dispatch_index data
	if CorridorID == nil || *CorridorID == "" {
		c := meta.corridorID
		CorridorID = &c
	}

	// provider_event_id: fallback priority: provider_event_id > payout_id > provider_payout_id > provider_reference
	var providerEventID *string
	if v := parseStringPtr(obj["provider_event_id"]); v != nil {
		providerEventID = v
	} else if v := parseStringPtr(obj["payout_id"]); v != nil {
		providerEventID = v
	} else if v := parseStringPtr(obj["provider_payout_id"]); v != nil {
		providerEventID = v
	} else if v := parseStringPtr(obj["provider_reference"]); v != nil {
		providerEventID = v
	}
	var providerRefHash *string
	if v, ok := obj["utr"].(string); ok && v != "" {
		h := sha256.Sum256([]byte(v))
		s := hex.EncodeToString(h[:])
		providerRefHash = &s
	}

	utr := parseStringPtr(obj["utr"])

	var observedAt *time.Time
	keystime := []string{
		"observed_at",
		"event_time",
		"created_at",
		"processed_at",
		"updated_at",
		"txn_date",
		"timestamp",
	}

	for _, key := range keystime {
		if v, ok := obj[key]; ok {
			if t := parseTimeMaybe(v); t != nil {
				observedAt = t
				break // stop once found ✅
			}
		}
	}
	if observedAt == nil {
		t := meta.ReceivedAt
		observedAt = &t
	}

	var amountStr *string
	if v, ok := obj["amount"]; ok {
		switch tv := v.(type) {
		case float64:
			s := fmt.Sprintf("%.2f", tv)
			amountStr = &s
		case string:
			if tv != "" {
				amountStr = &tv
			}
		}
	}
	var currency *string
	if v, ok := obj["currency"].(string); ok && v != "" {
		currency = &v
	}

	ev := &models.CanonicalOutcomeEvent{
		EventID:         uuid.New(),
		StatusCandidate: status,
		ProviderEventID: providerEventID,
		ProviderRefHash: providerRefHash,
		UTR:             utr,
		CorridorID:      CorridorID,
		ObservedAt:      observedAt,
		Amount:          amountStr,
		Currency:        currency,
		ReceivedAt:      meta.ReceivedAt,
	}
	return ev, nil
}

func parseStringPtr(v any) *string {
	s, _ := v.(string)
	if s == "" {
		return nil
	}
	return &s
}

func safe(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func normalizeStatusCandidate(v any) string {
	s, _ := v.(string)
	switch s {
	case "SUCCESS", "FAILED", "PENDING", "REVERSED", "RECEIVED", "UNKNOWN_DIVERGENT":
		return s
	case "success", "succeeded", "paid", "processed":
		return "SUCCESS"
	case "failed", "rejected":
		return "FAILED"
	case "reversed", "chargeback":
		return "REVERSED"
	case "received":
		return "RECEIVED"
	case "pending", "processing":
		return "PENDING"
	default:
		if s == "" {
			return ""
		}
		return "PENDING"
	}
}
func NormalizeCorridorCandidate(v string) string {
	s := strings.ToUpper(strings.TrimSpace(v))

	switch s {
	case "IMPS", "IMMEDIATE_PAYMENT":
		return "IMPS"

	case "NEFT":
		return "NEFT"

	case "RTGS":
		return "RTGS"

	case "UPI":
		return "UPI"

	case "CARD", "DEBIT_CARD", "CREDIT_CARD":
		return "CARD"

	case "WALLET":
		return "WALLET"

	default:
		return s // keep unknown values as-is
	}
}

func parseTimeMaybe(v any) *time.Time {
	s, _ := v.(string)
	if s == "" {
		return nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return &t
	}
	return nil
}

// Need to check dedupe key logic here
func computeDedupeKey(meta *RawEnvelopeMeta, ev *models.CanonicalOutcomeEvent) string {
	if ev.ProviderEventID != nil && *ev.ProviderEventID != "" {
		return fmt.Sprintf("prov_evt:%s:%s:%s",
			meta.ConnectorID.String(),
			*ev.ProviderEventID,
			ev.StatusCandidate,
		)
	}
	if len(meta.RawBytesSHA256) > 0 {
		return fmt.Sprintf("rawsha:%s", hex.EncodeToString(meta.RawBytesSHA256))
	}
	if ev.ProviderRefHash != nil && *ev.ProviderRefHash != "" {
		return fmt.Sprintf("provref:%s:%s", *ev.ProviderRefHash, ev.StatusCandidate)
	}
	return fmt.Sprintf("envelope:%s:%s", meta.RawOutcomeEnvelopeID.String(), ev.StatusCandidate)
}
