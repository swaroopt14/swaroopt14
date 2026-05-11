package worker

import (
	"context"
	"log"

	"zord-intent-engine/internal/etl"
	"zord-intent-engine/internal/persistence"
)

// AirflowWorker is called once per Airflow task execution.
// It leases outbox events, runs ETL scoring, acks/nacks, returns summary.
type AirflowWorker struct {
	outboxRepo persistence.OutboxPullRepository
	processor  *ETLProcessor
}

func NewAirflowWorker(
	outboxRepo persistence.OutboxPullRepository,
	runRepo *etl.RunRepository,
) *AirflowWorker {
	return &AirflowWorker{
		outboxRepo: outboxRepo,
		processor:  NewETLProcessor(outboxRepo, runRepo),
	}
}

type RunSummary struct {
	LeaseID          string
	Leased           int
	Accepted         int
	Failed           int
	ParseSuccessRate float64
	BelowThreshold   bool
}

func (w *AirflowWorker) RunOnce(ctx context.Context, limit, leaseTTLSeconds int, leasedBy string) (*RunSummary, error) {
	leaseID, _, events, err := w.outboxRepo.LeaseOutboxBatch(ctx, limit, leaseTTLSeconds, leasedBy)
	if err != nil {
		return nil, err
	}

	if len(events) == 0 {
		log.Println("[AirflowWorker] outbox empty, nothing to process")
		return &RunSummary{}, nil
	}

	log.Printf("[AirflowWorker] leased %d events lease_id=%s", len(events), leaseID)

	results := w.processor.ProcessBatch(ctx, events)

	var ackIDs, nackIDs []string
	accepted, failed := 0, 0

	for _, r := range results {
		switch r.Status {
		case "ok":
			ackIDs = append(ackIDs, r.OutboxEventID)
			accepted++
		case "failed":
			nackIDs = append(nackIDs, r.OutboxEventID)
			failed++
		}
	}

	if len(ackIDs) > 0 {
		if _, err := w.outboxRepo.AckOutboxBatch(ctx, leaseID, ackIDs); err != nil {
			log.Printf("[AirflowWorker] ack failed: %v", err)
		}
	}
	if len(nackIDs) > 0 {
		if _, err := w.outboxRepo.NackOutboxBatch(ctx, leaseID, nackIDs); err != nil {
			log.Printf("[AirflowWorker] nack failed: %v", err)
		}
	}

	successRate := 1.0
	if len(events) > 0 {
		successRate = float64(accepted) / float64(len(events))
	}

	return &RunSummary{
		LeaseID:          leaseID,
		Leased:           len(events),
		Accepted:         accepted,
		Failed:           failed,
		ParseSuccessRate: successRate,
		BelowThreshold:   successRate < etl.ParseSuccessThreshold,
	}, nil
}
