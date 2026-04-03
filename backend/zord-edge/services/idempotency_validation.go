package services

import (
	"bytes"
	"context"
	"errors"
	"log"

	"zord-edge/db"
	"zord-edge/model"

	"github.com/google/uuid"
)

// ErrFingerprintMismatch is returned when an idempotency key is reused with a
// different payload fingerprint — a hard conflict that must be rejected.
var ErrFingerprintMismatch = errors.New("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD")

// PersistIdempotency inserts a new idempotency record or detects duplicates.
//
// Returns:
//   - (uuid.Nil, nil)              → new key, proceed normally
//   - (firstEnvelopeID, nil)       → exact duplicate (same fingerprint), return 409
//   - (uuid.Nil, ErrFingerprintMismatch) → same key, different payload, hard reject
func PersistIdempotency(ctx context.Context, msg model.RawIntentMessage) (uuid.UUID, error) {

	if msg.IdempotencyKey == "" {
		log.Print("Idempotency key is missing, skipping idempotency validation")
		return uuid.Nil, nil
	}

	// --- Attempt insert ---
	insertQuery := `
		INSERT INTO idempotency_keys
			(tenant_id, idempotency_key, status, request_fingerprint,
			 first_seen_at, last_seen_at, resolution_type, expires_at)
		VALUES ($1, $2, 'RESERVED', $3, now(), now(), 'CREATED', now() + interval '1 hour')
		ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
	`
	res, err := db.DB.ExecContext(ctx, insertQuery,
		msg.TenantID,
		msg.IdempotencyKey,
		msg.RequestFingerprint,
	)
	if err != nil {
		log.Printf("Error in idempotency persist: %v", err)
		return uuid.Nil, err
	}

	rows, err := res.RowsAffected()
	if err != nil {
		log.Printf("Error checking idempotency rows affected: %v", err)
		return uuid.Nil, err
	}

	// New record inserted — proceed.
	if rows == 1 {
		return uuid.Nil, nil
	}

	// --- Conflict: fetch stored record ---
	var storedFingerprint []byte
	var firstEnvelopeID uuid.UUID

	selectQuery := `
		SELECT request_fingerprint, first_envelope_id
		FROM idempotency_keys
		WHERE tenant_id = $1 AND idempotency_key = $2
	`
	err = db.DB.QueryRowContext(ctx, selectQuery, msg.TenantID, msg.IdempotencyKey).
		Scan(&storedFingerprint, &firstEnvelopeID)
	if err != nil {
		log.Printf("Error fetching stored idempotency record: %v", err)
		return uuid.Nil, err
	}

	// --- Fingerprint comparison ---
	if bytes.Equal(storedFingerprint, msg.RequestFingerprint) {
		// Exact duplicate — update last_seen_at and resolution_type, then return the original envelope.
		_, _ = db.DB.ExecContext(ctx, `
			UPDATE idempotency_keys
			SET last_seen_at = now(), resolution_type = 'REUSED'
			WHERE tenant_id = $1 AND idempotency_key = $2
		`, msg.TenantID, msg.IdempotencyKey)

		log.Printf("Duplicate idempotency key with same fingerprint: tenant_id=%s key=%s envelope_id=%s",
			msg.TenantID, msg.IdempotencyKey, firstEnvelopeID)
		return firstEnvelopeID, nil
	}

	// Different payload with same key — hard reject.
	log.Printf("Idempotency key reused with different payload: tenant_id=%s key=%s",
		msg.TenantID, msg.IdempotencyKey)
	return uuid.Nil, ErrFingerprintMismatch
}
