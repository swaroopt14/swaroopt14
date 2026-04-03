package models

import "time"

type EncryptionKey struct {
	KeyID      string
	TenantID   string
	Version    int
	RawKey     []byte
	Status     string
	ActiveFrom time.Time
}
