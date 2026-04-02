package middleware

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func GetIdempotencyKey() gin.HandlerFunc {
	return func(context *gin.Context) {
		{
			idempotencyKey := context.GetHeader("X-Idempotency-Key")
			if idempotencyKey == "" {
				idempotencyKey = uuid.New().String()
				log.Printf("Generated idempotency key: %s", idempotencyKey)
			}
			log.Printf("Received idempotency key: %s", idempotencyKey)
			context.Set("idempotency_key", idempotencyKey)
			context.Next()

		}
	}
}
