package keymanager

import (
	"context"

	"zord-token-enclave/internal/models"
	"zord-token-enclave/internal/repository"
)

type manager struct {
	repo *repository.TokenRepository
}

func NewKeyManager(repo *repository.TokenRepository) KeyManager {
	return &manager{repo: repo}
}

func (m *manager) GetActiveKey(ctx context.Context, tenantID string) (*models.EncryptionKey, error) {
	return m.repo.GetActiveKey(ctx, tenantID)
}

func (m *manager) GetKeyByID(ctx context.Context, keyID string) (*models.EncryptionKey, error) {
	return m.repo.GetKeyByID(ctx, keyID)
}
