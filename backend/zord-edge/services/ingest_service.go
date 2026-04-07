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
		(trace_id, envelope_id, tenant_id, ingress_channel, source_class, source_system, content_type, idempotency_key, payload_size, payload_hash, envelope_hash, envelope_signature, vault_object_ref, request_headers_hash, schema_hint, mapping_profile_hint, object_encryption_alg, kms_key_version, parser_classification, transport_request_id, client_reference_hint, source_system_hint, ingress_api_version, retention_policy_class, webhook_provider_id, connector_binding_id, encryption_key_id, object_store_version, idempotency_reservation_status, principal_id, auth_method, status, received_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
	`
	_, err = tx.ExecContext(ctx, query,
		envelope.TraceID,
		envelope.EnvelopeID,
		envelope.TenantID,
		envelope.IngressChannel,
		envelope.SourceClass,
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
		envelope.MappingProfileHint,
		envelope.ObjectEncryptionAlg,
		envelope.KMSKeyVersion,
		envelope.ParserClassification,
		envelope.TransportRequestID,
		envelope.ClientReferenceHint,
		envelope.SourceSystemHint,
		envelope.IngressAPIVersion,
		envelope.RetentionPolicyClass,
		envelope.WebhookProviderID,
		envelope.ConnectorBindingID,
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
		(trace_id, envelope_id, tenant_id, object_ref, received_at, source, idempotency_key, encrypted_payload, payload_hash, envelope_hash, envelope_signature, topic, lease_id, event_type, lease_until, created_at, updated_at, published_at, failure_reason_code)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
	`
	topic := "vault.envelope.accepted.v1"
	_, err = tx.ExecContext(ctx, outboxQuery,
		envelope.TraceID,
		envelope.EnvelopeID,
		envelope.TenantID,
		envelope.ObjectRef,
		envelope.ReceivedAt,
		envelope.IngressChannel,
		envelope.IdempotencyKey,
		envelope.Payload, // This should be the encrypted payload
		envelope.PayloadHash,
		envelope.EnvelopeHash,
		envelope.EnvelopeSignature,
		topic,
		envelope.LeaseID,
		envelope.EventType,
		envelope.LeaseUntil,
		envelope.CreatedAt,
		envelope.UpdatedAt,
		envelope.PublishedAt,
		envelope.FailureReasonCode,
	)
	if err != nil {
		log.Printf("Failed to insert into ingress_outbox in transaction: %v", err)
		return err
	}

	return tx.Commit()

}
