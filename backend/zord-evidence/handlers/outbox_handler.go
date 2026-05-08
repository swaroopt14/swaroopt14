package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"zord-evidence/repositories"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type OutboxHandler struct {
	repo repositories.OutboxPullRepository
}

func NewOutboxHandler(repo repositories.OutboxPullRepository) *OutboxHandler {
	return &OutboxHandler{repo: repo}
}

type leaseResponse struct {
	LeaseID    string      `json:"lease_id"`
	LeaseUntil *string     `json:"lease_until,omitempty"`
	Events     interface{} `json:"events"`
}

type ackNackRequest struct {
	LeaseID  string   `json:"lease_id"`
	EventIDs []string `json:"event_ids"`
}

type ackNackResponse struct {
	Updated int64 `json:"updated"`
}

func (h *OutboxHandler) Lease(c *gin.Context) {
	limit := 500
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err == nil && n > 0 {
			limit = n
		}
	}

	ttl := 60
	if raw := strings.TrimSpace(c.Query("lease_ttl_seconds")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err == nil && n > 0 {
			ttl = n
		}
	}

	leaseID, leaseUntil, events, err := h.repo.LeaseOutboxBatch(c.Request.Context(), limit, ttl, "relay")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to lease outbox events"})
		return
	}

	var leaseUntilStr *string
	if leaseUntil != nil {
		s := leaseUntil.Format("2006-01-02T15:04:05Z")
		leaseUntilStr = &s
	}

	c.JSON(http.StatusOK, leaseResponse{
		LeaseID:    leaseID,
		LeaseUntil: leaseUntilStr,
		Events:     events,
	})
}

func (h *OutboxHandler) Ack(c *gin.Context) {
	var req ackNackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json body"})
		return
	}

	if _, err := uuid.Parse(req.LeaseID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lease_id"})
		return
	}

	if len(req.EventIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "event_ids is required"})
		return
	}

	updated, err := h.repo.AckOutboxBatch(c.Request.Context(), req.LeaseID, req.EventIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to ack outbox events"})
		return
	}

	c.JSON(http.StatusOK, ackNackResponse{Updated: updated})
}

func (h *OutboxHandler) Nack(c *gin.Context) {
	var req ackNackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json body"})
		return
	}

	if _, err := uuid.Parse(req.LeaseID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid lease_id"})
		return
	}

	if len(req.EventIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "event_ids is required"})
		return
	}

	updated, err := h.repo.NackOutboxBatch(c.Request.Context(), req.LeaseID, req.EventIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to nack outbox events"})
		return
	}

	c.JSON(http.StatusOK, ackNackResponse{Updated: updated})
}