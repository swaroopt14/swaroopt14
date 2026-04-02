package routes

import (
	"zord-outcome-engine/handlers"

	"github.com/gin-gonic/gin"
)

func Routes(router *gin.Engine, h *handlers.Handler) {

	router.GET("/v1/health", handlers.HealthCheck)
	router.POST("/v1/outcomes/webhook/:connector", h.WebhookHandler)
	router.POST("/v1/outcomes/poll/:connector", h.PollHandler)
	router.POST("/v1/outcomes/statement/:connector", h.StatementHandler)
}
