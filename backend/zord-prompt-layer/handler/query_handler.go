package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"zord-prompt-layer/dto"
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
