package handlers

import (
	"net/http"
	"strings"
	"zord-evidence/models"
	"zord-evidence/services"

	"github.com/gin-gonic/gin"
)

type EvidenceHandler struct {
	svc *services.EvidenceService
}

func NewEvidenceHandler(svc *services.EvidenceService) *EvidenceHandler {
	return &EvidenceHandler{svc: svc}
}

func (h *EvidenceHandler) GenerateEvidencePack(c *gin.Context) {
	var req models.GenerateEvidenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pack, err := h.svc.GeneratePack(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, pack)
}

func (h *EvidenceHandler) GetEvidencePack(c *gin.Context) {
	packID := c.Param("packID")
	pack, err := h.svc.GetPack(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, pack)
}

func (h *EvidenceHandler) GetEvidencePackView(c *gin.Context) {
	packID := c.Param("packID")
	viewType := c.Param("viewType")
	view, err := h.svc.GetPackView(c.Request.Context(), packID, viewType)
	if err != nil {
		if strings.Contains(err.Error(), "unsupported view_type") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, view)
}

func (h *EvidenceHandler) ReplayEvidencePack(c *gin.Context) {
	var req models.ReplayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.svc.ReplayPack(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}
