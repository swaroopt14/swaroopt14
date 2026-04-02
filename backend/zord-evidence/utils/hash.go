package utils

import (
	"crypto/sha256"
	"encoding/hex"
)

func SHA256Hex(v string) string {
	sum := sha256.Sum256([]byte(v))
	return "sha256:" + hex.EncodeToString(sum[:])
}
