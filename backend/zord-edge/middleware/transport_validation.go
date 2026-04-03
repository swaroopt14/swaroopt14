package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const maxPayloadSize = 1000 * 1024 // 1000 KB

var allowedContentTypes = map[string]bool{
	"application/json":    true,
	"text/csv":            true,
	"multipart/form-data": true,
}

func TransportValidation() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. Content-Type Check
		contentType := c.GetHeader("Content-Type")
		baseContentType := strings.Split(contentType, ";")[0]
		baseContentType = strings.TrimSpace(baseContentType)

		if baseContentType == "" || !allowedContentTypes[baseContentType] {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{
				"error": "Unsupported Content-Type. Allowed types: application/json, text/csv, multipart/form-data",
				"code":  "UNSUPPORTED_MEDIA_TYPE",
			})
			c.Abort()
			return
		}
		SourceType := c.GetHeader("X-Zord-Source-Type")
		if SourceType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"Error": "X-Zord-Source-Type header is required"})
			c.Abort()
			return
		}
		validSources := map[string]bool{
			"REST":        true,
			"CSV":         true,
			"PROMPT":      true,
			"WEBHOOK":     true,
			"FILE_UPLOAD": true,
		}
		if !validSources[SourceType] {
			c.JSON(http.StatusBadRequest, gin.H{"Error": "Invalid Source-Type"})
			c.Abort()
			return
		}

		c.Set("source_type", SourceType)

		// 2. Payload Size Check
		// Fast check using Content-Length if provided
		if c.Request.ContentLength > maxPayloadSize {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": "Payload size exceeds maximum allowed limit (1000KB)",
				"code":  "PAYLOAD_TOO_LARGE",
			})
			c.Abort()
			return
		}

		// Strict enforcement using MaxBytesReader to prevent spoofed Content-Length
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxPayloadSize)

		c.Next()
	}
}
