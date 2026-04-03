package handlers

import (
	"net/http"

	"zord-token-enclave/internal/services"

	"github.com/gin-gonic/gin"
)

type DetokenizeHandler struct {
	svc *services.TokenService
}

func NewDetokenizeHandler(s *services.TokenService) *DetokenizeHandler {
	return &DetokenizeHandler{svc: s}
}

func (h *DetokenizeHandler) Detokenize(c *gin.Context) {
	var req map[string]string

	// ✅ Bind incoming token map
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// ✅ Call service
	resp, err := h.svc.DetokenizeFields(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(), // helpful for debugging
		})
		return
	}

	// ✅ Return decrypted PII
	c.JSON(http.StatusOK, resp)
}
