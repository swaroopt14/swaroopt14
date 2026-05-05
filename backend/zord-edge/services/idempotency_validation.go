package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
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
	var storedFingerprint string
	var firstEnvelopeID uuid.NullUUID
	var conflictCount int
	var principalID uuid.NullUUID
	var sourceClass sql.NullString

	selectQuery := `
		SELECT request_fingerprint, first_envelope_id, conflict_count, principal_id_first_seen, source_class_first_seen
		FROM idempotency_keys
		WHERE tenant_id = $1 AND idempotency_key = $2
	`
	err = db.DB.QueryRowContext(ctx, selectQuery, msg.TenantID, msg.IdempotencyKey).
		Scan(&storedFingerprint, &firstEnvelopeID, &conflictCount, &principalID, &sourceClass)
	if err != nil {
		log.Printf("Error fetching stored idempotency record: %v", err)
		return uuid.Nil, err
	}

	// --- Track the conflict ---
	newConflictCount := conflictCount + 1
	// Hash the fingerprint as requested before storing as JSON.
	fingerprintHash := sha256.Sum256([]byte(msg.RequestFingerprint))
	snapshot := map[string]interface{}{
		"fingerprint": hex.EncodeToString(fingerprintHash[:]),
	}
	snapshotJSON, _ := json.Marshal(snapshot)

	updateFields := `
		conflict_count = $1,
		last_conflict_at = now(),
		response_snapshot_json = $2
	`
	updateArgs := []interface{}{newConflictCount, string(snapshotJSON), msg.TenantID, msg.IdempotencyKey}

	// --- Metadata Retrieval (First Seen) ---
	// If first_envelope_id is present but metadata is not, fetch it from ingress_envelopes.
	if firstEnvelopeID.Valid && !principalID.Valid {
		var pID uuid.UUID
		var sc string
		metaQuery := `SELECT principal_id, source_class FROM ingress_envelopes WHERE envelope_id = $1`
		err = db.DB.QueryRowContext(ctx, metaQuery, firstEnvelopeID.UUID).Scan(&pID, &sc)
		if err == nil {
			updateFields += ", principal_id_first_seen = $5, source_class_first_seen = $6"
			updateArgs = append(updateArgs, pID, sc)
		} else {
			log.Printf("Warning: Failed to fetch metadata for envelope %s: %v", firstEnvelopeID.UUID.String(), err)
		}
	}

	// --- Fingerprint comparison and final update ---
	if storedFingerprint == msg.RequestFingerprint {
		// Exact duplicate — update last_seen_at and resolution_type.
		finalUpdateQuery := `
			UPDATE idempotency_keys
			SET last_seen_at = now(), resolution_type = 'REUSED', ` + updateFields + `
			WHERE tenant_id = $3 AND idempotency_key = $4
		`
		_, _ = db.DB.ExecContext(ctx, finalUpdateQuery, updateArgs...)

		log.Printf("Duplicate idempotency key with same fingerprint: tenant_id=%s key=%s envelope_id=%v",
			msg.TenantID, msg.IdempotencyKey, firstEnvelopeID.UUID.String())

		if firstEnvelopeID.Valid {
			return firstEnvelopeID.UUID, nil
		}
		return uuid.Nil, nil
	}

	// Different payload with same key — hard reject.
	finalUpdateQuery := `
		UPDATE idempotency_keys
		SET ` + updateFields + `
		WHERE tenant_id = $3 AND idempotency_key = $4
	`
	_, _ = db.DB.ExecContext(ctx, finalUpdateQuery, updateArgs...)

	log.Printf("Idempotency key reused with different payload: tenant_id=%s key=%s",
		msg.TenantID, msg.IdempotencyKey)
	return uuid.Nil, ErrFingerprintMismatch
}
