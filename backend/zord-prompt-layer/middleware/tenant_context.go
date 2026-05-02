package middleware

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

const TenantIDContextKey = "tenant_id"

var tenantUUIDRe = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

// NOTE:
// Preferred source: trusted upstream header X-Tenant-ID.
// Fallback source: tenant_id claim from bearer token payload (only for trusted internal flow
// where token is already validated upstream; this middleware does not verify signature).
func TenantContextMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID := strings.TrimSpace(c.GetHeader("X-Tenant-ID"))

		if tenantID == "" {
			tenantID = extractTenantFromBearer(c.GetHeader("Authorization"))
		}

		if tenantID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "unauthorized",
				"details": "Missing tenant context. Please login again.",
			})
			c.Abort()
			return
		}

		if !tenantUUIDRe.MatchString(tenantID) {
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "forbidden",
				"details": "Invalid tenant context.",
			})
			c.Abort()
			return
		}

		c.Set(TenantIDContextKey, strings.ToLower(tenantID))
		c.Next()
	}
}

func extractTenantFromBearer(authHeader string) string {
	authHeader = strings.TrimSpace(authHeader)
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return ""
	}
	token := strings.TrimSpace(authHeader[len("Bearer "):])
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return ""
	}

	payloadJSON, err := decodeBase64URL(parts[1])
	if err != nil {
		return ""
	}

	var claims map[string]any
	if err := json.Unmarshal(payloadJSON, &claims); err != nil {
		return ""
	}

	// Common claim locations
	candidates := []string{"tenant_id", "tenantId", "tid"}
	for _, key := range candidates {
		if v, ok := claims[key]; ok {
			if s, ok := v.(string); ok {
				return strings.TrimSpace(s)
			}
		}
	}

	// Optional nested claim support: session.tenant_id
	if sess, ok := claims["session"].(map[string]any); ok {
		if v, ok := sess["tenant_id"]; ok {
			if s, ok := v.(string); ok {
				return strings.TrimSpace(s)
			}
		}
	}

	return ""
}

func decodeBase64URL(seg string) ([]byte, error) {
	// JWT uses base64url without padding
	if m := len(seg) % 4; m != 0 {
		seg += strings.Repeat("=", 4-m)
	}
	return base64.URLEncoding.DecodeString(seg)
}
