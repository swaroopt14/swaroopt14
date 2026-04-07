package crypto

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// NormalizeValue performs basic cleanup before hashing to ensure consistency.
func NormalizeValue(val string) string {
	// Trim spaces and convert to lowercase
	return strings.ToLower(strings.TrimSpace(val))
}

// GenerateDeterministicToken creates a stable, non-reversible token for a value.
func GenerateDeterministicToken(secret []byte, value string) string {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(value))
	return hex.EncodeToString(h.Sum(nil))
}
