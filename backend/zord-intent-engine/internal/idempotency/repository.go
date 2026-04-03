package idempotency

import "context"

type Repository interface {
	Get(
		ctx context.Context,
		tenantID string,
		key string,
	) (*Record, error)

	InsertInProgress(
		ctx context.Context,
		tenantID string,
		key string,
		firstEnvelopeID string,
	) error

	Finalize(
		ctx context.Context,
		tenantID string,
		key string,
		status Status,
		canonicalIntentID *string,
		response []byte,
	) error
}
