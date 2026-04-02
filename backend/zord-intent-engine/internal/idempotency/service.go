package idempotency

import (
	"context"
	"errors"
)

var ErrKeyConflict = errors.New(
	"idempotency key reused with different payload",
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) CheckAndLock(
	ctx context.Context,
	tenantID string,
	key string,
	firstEnvelopeID string,
) (*Record, error) {

	rec, err := s.repo.Get(ctx, tenantID, key)
	if err != nil {
		return nil, err
	}

	if rec != nil {
		// Existing terminal or in-progress result
		return rec, nil
	}

	// First writer wins
	if err := s.repo.InsertInProgress(
		ctx,
		tenantID,
		key,
		firstEnvelopeID,
	); err != nil {
		return nil, err
	}

	return nil, nil
}
