package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	"zord-edge/model"
)

// intent *model.Payment_Intent,
func SaveRawIntent(
	ctx context.Context,
	db *sql.DB,
	envelope *model.IngressEnvelope,

) error {
	//log.Printf("%+v\n", envelope)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("SaveRawIntent Trasaction Error: %v", err)
		return err
	}

	defer func() {
		_ = tx.Rollback()
	}()

	query := `
		INSERT INTO ingress_envelopes
		(trace_id,envelope_id, tenant_id, source, source_system,content_type,idempotency_key,payload_size,payload_hash,envelope_hash,envelope_signature,vault_object_ref,request_headers_hash,schema_hint,encryption_key_id,object_store_version,idempotency_reservation_status,principal_id,auth_method,status,received_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
	`
	_, err = tx.ExecContext(ctx, query,
		envelope.TraceID,
		envelope.EnvelopeID,
		envelope.TenantID,
		envelope.Source,
		envelope.SourceSystem,
		envelope.ContentType,
		envelope.IdempotencyKey,
		envelope.PayloadSize,
		envelope.PayloadHash,
		envelope.EnvelopeHash,
		envelope.EnvelopeSignature,
		envelope.ObjectRef,
		envelope.RequestHeadersHash,
		envelope.SchemaHint,
		envelope.EncryptionKeyID,
		envelope.ObjectStoreVersion,
		envelope.IdempotencyReservationStatus,
		envelope.PrincipalID,
		envelope.AuthMethod,
		envelope.Status,
		envelope.ReceivedAt)
	if err != nil {

		return err
	}

	query = `UPDATE idempotency_keys
		SET status=$1, first_envelope_id=$2, last_seen_at=now(), resolution_type='CREATED'
		WHERE tenant_id=$3 AND idempotency_key=$4`

	res, err := tx.ExecContext(ctx, query, "COMPLETED", envelope.EnvelopeID, envelope.TenantID, envelope.IdempotencyKey)
	if err != nil {
		log.Printf("Error updating idempotency key: %v", err)
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return fmt.Errorf("idempotency update affected %d rows", rows)
	}

	// --- Insert into ingress_outbox ---
	outboxQuery := `
		INSERT INTO ingress_outbox
		(trace_id, envelope_id, tenant_id, object_ref, received_at, source, idempotency_key, encrypted_payload, payload_hash, topic)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	topic := "vault.envelope.accepted.v1"
	_, err = tx.ExecContext(ctx, outboxQuery,
		envelope.TraceID,
		envelope.EnvelopeID,
		envelope.TenantID,
		envelope.ObjectRef,
		envelope.ReceivedAt,
		envelope.Source,
		envelope.IdempotencyKey,
		envelope.Payload, // This should be the encrypted payload
		envelope.PayloadHash,
		topic,
	)
	if err != nil {
		log.Printf("Failed to insert into ingress_outbox in transaction: %v", err)
		return err
	}

	return tx.Commit()

}
