package services

import (
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
	"strings"
)

type Signer struct {
	private ed25519.PrivateKey
}

func NewSigner(privateKeyB64 string) (*Signer, error) {
	if strings.TrimSpace(privateKeyB64) == "" {
		pub, priv, err := ed25519.GenerateKey(nil)
		if err != nil {
			return nil, err
		}
		_ = pub
		return &Signer{private: priv}, nil
	}

	raw, err := base64.StdEncoding.DecodeString(privateKeyB64)
	if err != nil {
		return nil, fmt.Errorf("decode private key: %w", err)
	}
	if len(raw) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("invalid private key length: %d", len(raw))
	}
	return &Signer{private: ed25519.PrivateKey(raw)}, nil
}

func (s *Signer) Sign(payload string) string {
	sig := ed25519.Sign(s.private, []byte(payload))
	return base64.StdEncoding.EncodeToString(sig)
}
