package fetcher

import (
	"context"
	"errors"
	"sync"

	"zord-intent-engine/internal/models"
)

var (
	ErrEnvelopeNotFound = errors.New("raw envelope not found")
)

type RawEnvelopeRepository interface {
	Save(ctx context.Context, env models.IngressEnvelope) (models.IngressEnvelope, error)
	FindByID(ctx context.Context, envelopeID string) (models.IngressEnvelope, error)
}

type InMemoryRawEnvelopeRepo struct {
	mu    sync.RWMutex
	store map[string]models.RawEnvelope
}

func NewInMemoryRawEnvelopeRepo() *InMemoryRawEnvelopeRepo {
	return &InMemoryRawEnvelopeRepo{
		store: make(map[string]models.RawEnvelope),
	}
}

func (r *InMemoryRawEnvelopeRepo) Save(env models.RawEnvelope) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.store[env.EnvelopeID] = env
	return nil
}

func (r *InMemoryRawEnvelopeRepo) FindByID(id string) (models.RawEnvelope, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	env, ok := r.store[id]
	if !ok {
		return models.RawEnvelope{}, ErrEnvelopeNotFound
	}
	return env, nil
}
