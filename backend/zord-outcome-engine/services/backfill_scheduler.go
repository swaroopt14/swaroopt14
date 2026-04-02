package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
	"zord-outcome-engine/db"

	"github.com/google/uuid"
)

var errProviderEventIDMissing = errors.New("provider_event_id missing")

// PSPBaseURL is the hardcoded PSP base URL.
// Replace this with your PSP base URL (example: https://api.razorpay.com/v1).
const PSPBaseURL = "http://host.docker.internal:8099"

// InternalOutcomeEngineBaseURL is used by the poll worker to feed PSP poll responses back into the
// existing ingest pipeline (so normalization + canonical insert happen in one place).
const InternalOutcomeEngineBaseURL = "http://localhost:8081"

// StartBackfillScheduler periodically schedules polling for contracts that are not yet terminal.
func StartBackfillScheduler(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := scheduleBackfillPolls(ctx); err != nil {
					log.Printf("backfill scheduler error: %v", err)
				}
			}
		}
	}()
}

func scheduleBackfillPolls(ctx context.Context) error {
	// Align with doc:
	// - If no webhook (S2) within ~2 minutes -> start polling
	// - If webhook says SUCCESS but no UTR yet -> keep polling until UTR appears
	//
	// We approximate "no webhook within 2 minutes" as: no S2 canonical event yet, and the dispatch_index row exists.
	// (dispatch_index doesn't track created_at, so we can't perfectly time-gate without extra columns.)
	rows, err := db.DB.QueryContext(ctx, `
SELECT d.contract_id, d.dispatch_id, d.connector_id, d.corridor_id
FROM dispatch_index d
LEFT JOIN (
	SELECT
		contract_id,
		BOOL_OR(source_class = 'S2') AS has_webhook,
		BOOL_OR(utr IS NOT NULL AND utr <> '') AS has_utr,
		BOOL_OR(status_candidate = 'SUCCESS' AND (utr IS NULL OR utr = '')) AS success_no_utr
	FROM canonical_outcome_events
	GROUP BY contract_id
) ce ON ce.contract_id = d.contract_id
WHERE (ce.has_utr IS DISTINCT FROM TRUE)
  AND (ce.success_no_utr IS TRUE OR ce.has_webhook IS DISTINCT FROM TRUE)
GROUP BY d.contract_id, d.dispatch_id, d.connector_id, d.corridor_id
LIMIT 50
`)
	if err != nil {
		return err
	}
	defer rows.Close()

	now := time.Now().UTC()

	scheduled := 0
	for rows.Next() {
		var contractID, dispatchID, connectorID uuid.UUID
		var corridorID string
		if err := rows.Scan(&contractID, &dispatchID, &connectorID, &corridorID); err != nil {
			return err
		}

		// Upsert basic poll schedule starting at now+2min (webhook grace).
		_, err := db.DB.ExecContext(ctx, `
INSERT INTO poll_schedule(
	contract_id, dispatch_id, next_poll_at, poll_stage, last_poll_at, poll_failures, connector_id, corridor_id
) VALUES ($1,$2,$3,0,NULL,0,$4,$5)
ON CONFLICT (contract_id) DO NOTHING
`, contractID, dispatchID, now.Add(2*time.Minute), connectorID, corridorID)
		if err != nil {
			log.Printf("poll_schedule upsert error: %v", err)
			continue
		}
		scheduled++
		log.Printf("backfill.schedule.upserted contract_id=%s dispatch_id=%s connector_id=%s corridor_id=%s next_poll_at=%s", contractID.String(), dispatchID.String(), connectorID.String(), corridorID, now.Add(2*time.Minute).UTC().Format(time.RFC3339Nano))
	}
	if scheduled > 0 {
		log.Printf("backfill.schedule.done scheduled=%d", scheduled)
	}
	return nil
}

// StartPollWorker executes scheduled polls according to the configured backoff stages.
func StartPollWorker(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := runPollBatch(ctx); err != nil {
					log.Printf("poll worker error: %v", err)
				}
			}
		}
	}()
}

func runPollBatch(ctx context.Context) error {
	rows, err := db.DB.QueryContext(ctx, `
SELECT contract_id, dispatch_id, next_poll_at, poll_stage, poll_failures, connector_id, corridor_id
FROM poll_schedule
WHERE next_poll_at <= NOW()
LIMIT 20
`)
	if err != nil {
		return err
	}
	defer rows.Close()

	now := time.Now().UTC()
	client := &http.Client{Timeout: 8 * time.Second}

	for rows.Next() {
		var contractID, dispatchID, connectorID uuid.UUID
		var nextPollAt time.Time
		var stage, failures int
		var corridorID string
		if err := rows.Scan(&contractID, &dispatchID, &nextPollAt, &stage, &failures, &connectorID, &corridorID); err != nil {
			return err
		}

		// Stop polling once UTR exists (doc requirement).
		var anyUTR string
		if err := db.DB.QueryRowContext(ctx, `
SELECT utr
FROM canonical_outcome_events
WHERE contract_id = $1 AND utr IS NOT NULL AND utr <> ''
LIMIT 1
`, contractID).Scan(&anyUTR); err == nil && anyUTR != "" {
			log.Printf("poll.stop.utr_present contract_id=%s utr=%s", contractID.String(), anyUTR)
			_, _ = db.DB.ExecContext(ctx, `DELETE FROM poll_schedule WHERE contract_id=$1`, contractID)
			continue
		}

		// Call PSP GET poll and feed the response back into /v1/outcomes/poll/:connector.
		log.Printf("poll.tick contract_id=%s dispatch_id=%s connector_id=%s corridor_id=%s stage=%d failures=%d", contractID.String(), dispatchID.String(), connectorID.String(), corridorID, stage, failures)
		if err := pollPSP(ctx, client, contractID, dispatchID, connectorID, corridorID); err != nil {
			if errors.Is(err, errProviderEventIDMissing) {
				// No provider_event_id to poll yet (e.g. webhook didn't include it).
				// Don't count as a poll failure; just try again later.
				log.Printf("poll.skip.missing_provider_event_id contract_id=%s dispatch_id=%s", contractID.String(), dispatchID.String())
				_, _ = db.DB.ExecContext(ctx, `
UPDATE poll_schedule
SET next_poll_at = $1, last_poll_at = $2
WHERE contract_id = $3
`, now.Add(30*time.Second), now, contractID)
				continue
			}
			log.Printf("psp poll error contract_id=%s dispatch_id=%s: %v", contractID.String(), dispatchID.String(), err)
			_, _ = db.DB.ExecContext(ctx, `
UPDATE poll_schedule
SET poll_failures = poll_failures + 1, last_poll_at = $1
WHERE contract_id = $2
`, now, contractID)
			failures++
		}

		interval := pollIntervalForStage(stage)
		newStage := stage
		if stage < 3 {
			newStage++
		}

		_, _ = db.DB.ExecContext(ctx, `
UPDATE poll_schedule
SET poll_stage = $1, next_poll_at = $2, last_poll_at = $3
WHERE contract_id = $4
`, newStage, now.Add(interval), now, contractID)
		log.Printf("poll.reschedule contract_id=%s next_poll_at=%s new_stage=%d interval=%s", contractID.String(), now.Add(interval).UTC().Format(time.RFC3339Nano), newStage, interval.String())
	}
	return nil
}

func pollPSP(
	ctx context.Context,
	client *http.Client,
	contractID uuid.UUID,
	dispatchID uuid.UUID,
	connectorID uuid.UUID,
	corridorID string,
) error {
	if PSPBaseURL == "" || PSPBaseURL == "http://CHANGE_ME_PSP_BASE_URL" {
		return fmt.Errorf("PSPBaseURL is not configured; set services.PSPBaseURL")
	}

	// We must poll by provider_event_id (the PSP payout identifier).
	var providerEventID string
	if err := db.DB.QueryRowContext(ctx, `
SELECT provider_event_id
FROM canonical_outcome_events
WHERE contract_id = $1 AND provider_event_id IS NOT NULL AND provider_event_id <> ''
ORDER BY received_at DESC, created_at DESC
LIMIT 1
`, contractID).Scan(&providerEventID); err != nil || providerEventID == "" {
		return fmt.Errorf("%w for contract_id=%s", errProviderEventIDMissing, contractID.String())
	}

	pspURL := strings.TrimRight(PSPBaseURL, "/") + "/payouts/" + url.PathEscape(providerEventID)
	log.Printf("psp.get.start contract_id=%s provider_event_id=%s url=%s", contractID.String(), providerEventID, pspURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, pspURL, nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("psp poll http status %d", resp.StatusCode)
	}
	log.Printf("psp.get.done contract_id=%s provider_event_id=%s status=%d", contractID.String(), providerEventID, resp.StatusCode)

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	// Feed into the existing ingest endpoint for S3 (poll) so it gets normalized and persisted.
	// Ensure the payload contains reference_id so ingestion can resolve tenant/trace via dispatch_index.
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		// If PSP returns non-JSON, still wrap it minimally.
		obj = map[string]any{
			"raw": string(raw),
		}
	}
	obj["reference_id"] = dispatchID.String()
	obj["corridor_id"] = corridorID
	obj["provider_event_id"] = providerEventID

	ingestBytes, err := json.Marshal(obj)
	if err != nil {
		return err
	}

	internalURL := strings.TrimRight(InternalOutcomeEngineBaseURL, "/") + "/v1/outcomes/poll/" + url.PathEscape(connectorID.String())
	log.Printf("poll.ingest_internal.start contract_id=%s dispatch_id=%s connector_id=%s url=%s", contractID.String(), dispatchID.String(), connectorID.String(), internalURL)
	ireq, err := http.NewRequestWithContext(ctx, http.MethodPost, internalURL, bytes.NewReader(ingestBytes))
	if err != nil {
		return err
	}
	ireq.Header.Set("Content-Type", "application/json")
	iresp, err := client.Do(ireq)
	if err != nil {
		return err
	}
	defer iresp.Body.Close()
	if iresp.StatusCode < 200 || iresp.StatusCode >= 300 {
		b, _ := io.ReadAll(iresp.Body)
		return fmt.Errorf("internal poll ingest status %d body=%s", iresp.StatusCode, string(b))
	}
	log.Printf("poll.ingest_internal.done contract_id=%s dispatch_id=%s connector_id=%s status=%d", contractID.String(), dispatchID.String(), connectorID.String(), iresp.StatusCode)
	return nil
}

func pollIntervalForStage(stage int) time.Duration {
	switch stage {
	case 0:
		// 0–2 min: every 10s
		return 10 * time.Second
	case 1:
		// 2–10 min: every 30s
		return 30 * time.Second
	case 2:
		// 10–60 min: every 5m
		return 5 * time.Minute
	default:
		// 1–24h: every 30m (we clamp with stage>=3)
		return 30 * time.Minute
	}
}
