package handler

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"

	"zord-prompt-layer/dto"
	"zord-prompt-layer/services"
)

var tenantIDUUIDRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

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
	if strings.TrimSpace(req.TenantID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request",
			"details": "Please provide tenant_id to continue.",
		})
		return
	}
	if !tenantIDUUIDRe.MatchString(strings.TrimSpace(req.TenantID)) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request",
			"details": "Invalid tenant_id. Please provide a valid tenant_id.",
		})
		return
	}
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
