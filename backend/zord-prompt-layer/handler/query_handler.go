package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"zord-prompt-layer/dto"
	plmiddleware "zord-prompt-layer/middleware"
	"zord-prompt-layer/services"
)

type QueryHandler struct {
	rag services.RAGService
}

func NewQueryHandler(rag services.RAGService) *QueryHandler {
	return &QueryHandler{rag: rag}
}

func (h *QueryHandler) Query(c *gin.Context) {
	var req dto.QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request",
			"details": err.Error(),
		})
		return
	}
	ctxTenant, ok := c.Get(plmiddleware.TenantIDContextKey)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "unauthorized",
			"details": "Missing tenant context. Please login again.",
		})
		return
	}
	tenantID, ok := ctxTenant.(string)
	if !ok || strings.TrimSpace(tenantID) == "" {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "forbidden",
			"details": "Invalid tenant context.",
		})
		return
	}

	// Optional hardening: if body tenant_id is sent and mismatches auth tenant, reject.
	if strings.TrimSpace(req.TenantID) != "" && !strings.EqualFold(strings.TrimSpace(req.TenantID), tenantID) {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "forbidden",
			"details": "Tenant mismatch with authenticated context.",
		})
		return
	}

	// Canonical tenant is always from auth context.
	req.TenantID = tenantID

	if req.TopK <= 0 {
		req.TopK = 5
	}

	resp, err := h.rag.Query(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "query failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, resp)
}
