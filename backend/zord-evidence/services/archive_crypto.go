package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
)

type ArchiveCrypto struct {
	key []byte
}

func NewArchiveCrypto(keyB64 string) (*ArchiveCrypto, error) {
	raw := []byte(nil)
	var err error
	if strings.TrimSpace(keyB64) == "" {
		raw = make([]byte, 32)
		if _, err := io.ReadFull(rand.Reader, raw); err != nil {
			return nil, fmt.Errorf("generate archive encryption key: %w", err)
		}
	} else {
		raw, err = base64.StdEncoding.DecodeString(strings.TrimSpace(keyB64))
		if err != nil {
			return nil, fmt.Errorf("decode archive encryption key: %w", err)
		}
	}
	switch len(raw) {
	case 16, 24, 32:
	default:
		return nil, fmt.Errorf("invalid archive encryption key length: %d", len(raw))
	}
	return &ArchiveCrypto{key: raw}, nil
}

func (a *ArchiveCrypto) Encrypt(plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(a.key)
	if err != nil {
		return nil, fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("new gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("nonce generation: %w", err)
	}
	cipherText := gcm.Seal(nil, nonce, plain, nil)
	out := make([]byte, 0, len(nonce)+len(cipherText))
	out = append(out, nonce...)
	out = append(out, cipherText...)
	return out, nil
}
