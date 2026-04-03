package handlers

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zord/zord-intelligence/internal/models"
	"github.com/zord/zord-intelligence/internal/persistence"
	"github.com/zord/zord-intelligence/internal/services"
)

type CorridorHealthHandler struct {
	projectionRepo *persistence.ProjectionRepo
}

func NewCorridorHealthHandler(repo *persistence.ProjectionRepo) *CorridorHealthHandler {
	return &CorridorHealthHandler{projectionRepo: repo}
}

func (h *CorridorHealthHandler) HandleCorridorHealthTick(
	ctx context.Context,
	e models.CorridorHealthTickEvent,
) error {
	if e.TenantID == "" || e.CorridorID == "" || e.EventID == "" {
		log.Printf("invalid event: missing required fields tenant=%s corridor=%s event_id=%s",
			e.TenantID, e.CorridorID, e.EventID)
		return nil
	}

	processed, err := h.projectionRepo.IsProcessed(ctx, e.TenantID, e.EventID)
	if err != nil {
		return fmt.Errorf("HandleCorridorHealthTick IsProcessed event_id=%s: %w", e.EventID, err)
	}
	if processed {
		return nil
	}

	tickAt := e.TickAt.UTC()
	if tickAt.IsZero() {
		tickAt = time.Now().UTC()
	}

	windowStart := tickAt.Truncate(24 * time.Hour)
	windowEnd := windowStart.Add(24 * time.Hour)
	key := fmt.Sprintf("corridor.health_status.%s", e.CorridorID)

	value := struct {
		LastTick time.Time `json:"last_tick"`
		Status   string    `json:"status"`
	}{
		LastTick: tickAt,
		Status:   "OK",
	}

	if err := h.projectionRepo.UpsertWithValue(ctx, e.TenantID, key, windowStart, windowEnd, value); err != nil {
		return err
	}

	if err := h.projectionRepo.MarkProcessed(ctx, e.TenantID, e.EventID); err != nil {
		return fmt.Errorf("HandleCorridorHealthTick MarkProcessed event_id=%s: %w", e.EventID, err)
	}

	return nil
}

type KafkaIngestionHandler struct {
	*services.ProjectionService
	corridorHealthHandler *CorridorHealthHandler
	slaTimerHandler       *SLATimerHandler
}

func NewKafkaIngestionHandler(
	projectionService *services.ProjectionService,
	corridorHealthHandler *CorridorHealthHandler,
	slaTimerHandler *SLATimerHandler,
) *KafkaIngestionHandler {
	return &KafkaIngestionHandler{
		ProjectionService:     projectionService,
		corridorHealthHandler: corridorHealthHandler,
		slaTimerHandler:       slaTimerHandler,
	}
}

func (h *KafkaIngestionHandler) HandleCorridorHealthTick(
	ctx context.Context,
	e models.CorridorHealthTickEvent,
) error {
	if h.corridorHealthHandler == nil {
		return nil
	}
	return h.corridorHealthHandler.HandleCorridorHealthTick(ctx, e)
}

func (h *KafkaIngestionHandler) HandleSLATimerTick(
	ctx context.Context,
	e models.SLATimerTickEvent,
) error {
	if h.slaTimerHandler == nil {
		return nil
	}
	return h.slaTimerHandler.HandleSLATimerTick(ctx, e)
}
