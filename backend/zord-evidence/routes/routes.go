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
		// §13: Pack generation and retrieval
		v1.POST("/packs", h.GenerateEvidencePack)
		v1.GET("/packs", h.ListEvidencePacks) // ?tenant_id=&intent_id=  §17

		v1.GET("/packs/:packID", h.GetEvidencePack)

		// §18: role-specific projections — merchant, psp, bank, nbfc
		v1.GET("/packs/:packID/views/:viewType", h.GetEvidencePackView)

		// §14.4: Merkle inclusion proofs for selective disclosure
		v1.GET("/packs/:packID/inclusion-proofs", h.GetInclusionProofs)

		// §17: Replay and equivalence check
		v1.POST("/replay", h.ReplayEvidencePack)
	}
}
