package routes

import (
	"net/http"
	"zord-evidence/handlers"

	"github.com/gin-gonic/gin"
)

func Register(r *gin.Engine, h *handlers.EvidenceHandler) {
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	v1 := r.Group("/v1/evidence")
	{
		v1.POST("/packs", h.GenerateEvidencePack)
		v1.GET("/packs/:packID", h.GetEvidencePack)
		v1.GET("/packs/:packID/views/:viewType", h.GetEvidencePackView)
		v1.POST("/replay", h.ReplayEvidencePack)
	}
}
