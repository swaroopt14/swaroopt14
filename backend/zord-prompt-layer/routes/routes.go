package routes

import (
	"zord-prompt-layer/handler"

	"github.com/gin-gonic/gin"
)

func Register(router *gin.Engine, healthHandler *handler.HealthHandler, queryHandler *handler.QueryHandler) {
	router.GET("/health", healthHandler.Health)
	router.POST("/query", queryHandler.Query)
}
