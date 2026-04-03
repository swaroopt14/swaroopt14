package handlers

import (
	"net/http"

	"zord-token-enclave/internal/services"

	"github.com/gin-gonic/gin"
)

type TokenHandler struct {
	svc *services.TokenService
}

type DetokenizeRequest struct {
	AccountNumber string `json:"account_number"`
	IFSC          string `json:"ifsc"`
	VPA           string `json:"vpa"`
	Name          string `json:"name"`
	Phone         string `json:"phone"`
	Email         string `json:"email"`
}

func NewTokenHandler(s *services.TokenService) *TokenHandler {
	return &TokenHandler{svc: s}
}

func (h *TokenHandler) Tokenize(c *gin.Context) {
	var req struct {
		TenantID string            `json:"tenant_id"`
		TraceID  string            `json:"trace_id"`
		PII      map[string]string `json:"pii"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if req.TenantID == "" || len(req.PII) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id and pii required"})
		return
	}

	tokens, err := h.svc.TokenizePII(
		c.Request.Context(),
		req.TenantID,
		req.TraceID,
		req.PII,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tokens": tokens,
	})
}
