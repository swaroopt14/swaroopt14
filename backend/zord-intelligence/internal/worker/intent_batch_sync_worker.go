package worker

import (
	"context"
	"log"
	"time"

	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

// IntentBatchSyncWorker bridges intent-side batch state into intelligence when
// upstream intent.created Kafka events are unavailable.
//
// It polls canonical_batches in intent-engine, materializes the intent-safe
// batch features into batch_contracts, and triggers the existing leakage model
// before any settlement data is needed.
type IntentBatchSyncWorker struct {
	intentRepo    *persistence.IntentBridgeRepo
	leakageSvc    *services.LeakagePredictionService
	interval      time.Duration
	lookback      time.Duration
	candidateCap  int
	maxSyncPerRun int
}

func NewIntentBatchSyncWorker(
	intentRepo *persistence.IntentBridgeRepo,
	leakageSvc *services.LeakagePredictionService,
	interval time.Duration,
	lookback time.Duration,
) *IntentBatchSyncWorker {
	if interval <= 0 {
		interval = 2 * time.Second
	}
	if lookback <= 0 {
		lookback = 48 * time.Hour
	}
	return &IntentBatchSyncWorker{
		intentRepo:    intentRepo,
		leakageSvc:    leakageSvc,
		interval:      interval,
		lookback:      lookback,
		candidateCap:  200,
		maxSyncPerRun: 4,
	}
}

func (w *IntentBatchSyncWorker) Start(ctx context.Context) {
	if w == nil || w.intentRepo == nil || w.leakageSvc == nil {
		return
	}

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	log.Printf("intent_batch_sync_worker: started (interval=%s lookback=%s)", w.interval, w.lookback)
	w.runOnce(ctx)

	for {
		select {
		case <-ticker.C:
			w.runOnce(ctx)
		case <-ctx.Done():
			log.Println("intent_batch_sync_worker: shutting down")
			return
		}
	}
}

func (w *IntentBatchSyncWorker) runOnce(ctx context.Context) {
	since := time.Now().UTC().Add(-w.lookback)
	candidates, err := w.intentRepo.ListRecentBatchCandidates(ctx, since, w.candidateCap)
	if err != nil {
		log.Printf("intent_batch_sync_worker: list candidates failed: %v", err)
		return
	}
	if len(candidates) == 0 {
		return
	}

	for idx, candidate := range candidates {
		if w.maxSyncPerRun > 0 && idx >= w.maxSyncPerRun {
			break
		}
		if err := w.leakageSvc.SyncIntentPredictionIfStale(ctx, candidate.TenantID, candidate.BatchID); err != nil {
			log.Printf(
				"intent_batch_sync_worker: sync failed tenant=%s batch=%s: %v",
				candidate.TenantID,
				candidate.BatchID,
				err,
			)
		}
	}
}
