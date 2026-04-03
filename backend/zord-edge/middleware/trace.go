package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TraceMiddleware() gin.HandlerFunc {
	return func(context *gin.Context) {

		traceId := uuid.New().String()

		context.Set("trace_id", traceId)

		context.Next()
	}
}
