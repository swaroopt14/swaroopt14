package middleware

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// AdminAuthMiddleware secures internal administration endpoints.
// It checks for a valid X-Zord-ADMIN-KEY header.
func AdminAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		adminKey := c.GetHeader("X-Zord-ADMIN-KEY")
		expectedKey := os.Getenv("INTERNAL_ADMIN_KEY")

		// Security Constraint: Ensure the environment variable is actually set.
		if expectedKey == "" {
			log.Print("[CRITICAL] INTERNAL_ADMIN_KEY is not set in environment. Blocking all admin access.")
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Admin authentication is not configured",
			})
			return
		}

		if adminKey == "" || adminKey != expectedKey {
			log.Printf("[SECURITY] Unauthorized admin access attempt from IP: %s", c.ClientIP())
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid or missing admin key",
			})
			return
		}

		log.Printf("[SECURITY] Authorized admin access to %s from IP: %s", c.Request.URL.Path, c.ClientIP())
		c.Next()
	}
}
