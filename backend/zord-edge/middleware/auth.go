package middleware

import (
	"net/http"
	"strings"

	"zord-edge/db"
	"zord-edge/services"

	"github.com/gin-gonic/gin"
)

func Authenticate() gin.HandlerFunc {
	return func(context *gin.Context) {
		{
			auth := context.GetHeader("Authorization")

			if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
				context.JSON(http.StatusUnauthorized, gin.H{"Error": "Missing API Key"})
				context.Abort()
			}

			apikey := strings.TrimPrefix(auth, "Bearer ")
			response, err := services.ValidateApiKey(context.Request.Context(), db.DB, apikey)
			if err != nil {
				context.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"success": false,
					"error": gin.H{
						"code":    "UNAUTHORIZED",
						"message": "Invalid API key",
					},
				})
				return
			}

			context.Set("tenant_id", response.TenantId)
			context.Set("tenant_name", response.TenantName)
			context.Next()

		}
	}
}
