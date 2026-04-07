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

// POST /v1/evidence/packs — generate a new evidence pack (spec §13)
func (h *EvidenceHandler) GenerateEvidencePack(c *gin.Context) {
	var req models.GenerateEvidenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pack, err := h.svc.GeneratePack(c.Request.Context(), req)
	if err != nil {
		if strings.Contains(err.Error(), "required") || strings.Contains(err.Error(), "must be one of") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, pack)
}

// GET /v1/evidence/packs/:packID — fetch a specific pack
func (h *EvidenceHandler) GetEvidencePack(c *gin.Context) {
	packID := c.Param("packID")
	pack, err := h.svc.GetPack(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, pack)
}

// GET /v1/evidence/packs — list packs by intent_id (spec §17)
// Query params: tenant_id (required), intent_id (required)
func (h *EvidenceHandler) ListEvidencePacks(c *gin.Context) {
	tenantID := strings.TrimSpace(c.Query("tenant_id"))
	intentID := strings.TrimSpace(c.Query("intent_id"))
	if tenantID == "" || intentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "tenant_id and intent_id query params are required"})
		return
	}
	resp, err := h.svc.ListPacksByIntentID(c.Request.Context(), tenantID, intentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// GET /v1/evidence/packs/:packID/views/:viewType — role-specific projection (spec §18)
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

// GET /v1/evidence/packs/:packID/inclusion-proofs — selective disclosure (spec §14.4)
func (h *EvidenceHandler) GetInclusionProofs(c *gin.Context) {
	packID := c.Param("packID")
	proofs, err := h.svc.GetInclusionProofs(c.Request.Context(), packID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"evidence_pack_id": packID, "inclusion_proofs": proofs})
}

// POST /v1/evidence/replay — replay a pack and compare Merkle root (spec §17)
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
