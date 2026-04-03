package fetcher

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"zord-intent-engine/internal/models"

	"github.com/google/uuid"
)

type Service struct {
	repo RawEnvelopeRepository
}

func NewService(repo RawEnvelopeRepository) *Service {
	return &Service{repo: repo}
}

func (s *Service) StoreRawIntent(
	ctx context.Context,
	tenantID string,
	payload json.RawMessage,
) (models.IngressEnvelope, error) {

	envelopeID := uuid.NewString()

	checksum := sha256.Sum256(payload)

	env := models.IngressEnvelope{
		EnvelopeID: envelopeID,
		TenantID:   tenantID,

		Source:         "API",
		IdempotencyKey: "zord-api-56787634587", // optional, safe stub

		PayloadHash: hex.EncodeToString(checksum[:]),
		ObjectRef:   "inline",

		ParseStatus: "PARSED",

		ReceivedAt: time.Now().UTC(),
	}

	saved, err := s.repo.Save(ctx, env)
	if err != nil {
		return models.IngressEnvelope{}, err
	}

	return saved, nil
}
