package routes

import (
	"zord-outcome-engine/handlers"

	"github.com/gin-gonic/gin"
)

func Routes(router *gin.Engine, h *handlers.Handler) {

	router.GET("/v1/health", handlers.HealthCheck)
	router.POST("/v1/settlement/upload", h.SettlementUploadHandler)
}
