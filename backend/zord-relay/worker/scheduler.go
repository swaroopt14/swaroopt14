package worker

import (
	"context"
	"fmt"
	"sync"

	"go.uber.org/zap"

	"zord-relay/config"
	"zord-relay/publisher"
)

// Scheduler starts and supervises one Worker per configured upstream service.
// Each worker runs in its own goroutine with independent poll loops.
type Scheduler struct {
	workers []*Worker
	log     *zap.Logger
}

// NewScheduler builds one Worker per service defined in cfg.Services.
func NewScheduler(
	cfg *config.Config,
	pub publisher.Publisher,
	log *zap.Logger,
) (*Scheduler, error) {
	if len(cfg.Services) == 0 {
		return nil, fmt.Errorf("scheduler: no services configured")
	}

	workers := make([]*Worker, 0, len(cfg.Services))
	for _, svcCfg := range cfg.Services {
		w := NewWorker(svcCfg, cfg.Relay, pub, log)
		workers = append(workers, w)
		log.Info("registered worker",
			zap.String("service", svcCfg.Name),
			zap.String("base_url", svcCfg.BaseURL),
			zap.String("default_topic", svcCfg.DefaultTopic),
		)
	}

	return &Scheduler{workers: workers, log: log}, nil
}

// Run starts all workers and blocks until ctx is cancelled.
// Each worker is supervised: if it panics, it is logged but does not bring
// down the other workers.
func (s *Scheduler) Run(ctx context.Context) {
	var wg sync.WaitGroup
	for _, w := range s.workers {
		wg.Add(1)
		go func(w *Worker) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					s.log.Error("worker panicked",
						zap.String("service", w.svcCfg.Name),
						zap.Any("panic", r),
					)
				}
			}()
			w.Run(ctx)
		}(w)
	}
	wg.Wait()
	s.log.Info("all workers stopped")
}
