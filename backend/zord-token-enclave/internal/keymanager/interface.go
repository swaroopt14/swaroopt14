package keymanager

import (
	"context"
	"zord-token-enclave/internal/models"
)

type KeyManager interface {
	GetActiveKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error)
	GetKeyByID(ctx context.Context, keyID string) (*models.EncryptionKey, error)
}
