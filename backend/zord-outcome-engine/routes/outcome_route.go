package routes

import (
	"zord-outcome-engine/handlers"

	"github.com/gin-gonic/gin"
)

func Routes(router *gin.Engine, h *handlers.Handler) {

	router.GET("/v1/health", handlers.HealthCheck)
	router.POST("/v1/settlement/upload", h.SettlementUploadHandler)

	// Job status query — allows callers to re-check progress after upload.
	router.GET("/v1/settlement/jobs/:job_id", h.GetSettlementJobHandler)
	// Supported PSPs — returns the live list of registered PSP keys and their file formats.
	router.GET("/v1/settlement/supported-psps", handlers.GetSupportedPSPs)
}
