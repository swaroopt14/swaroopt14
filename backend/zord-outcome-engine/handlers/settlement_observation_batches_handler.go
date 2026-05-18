package handlers

import (
	"net/http"
	"strings"

	"zord-outcome-engine/db"
	"zord-outcome-engine/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SettlementObservationBatchIDItem struct {
	ClientBatchID string `json:"client_batch_id"`
}

type SettlementObservationBatchIDListResponse struct {
	Items []SettlementObservationBatchIDItem `json:"items"`
}

type SettlementObservationDetailResponse struct {
	Items []models.CanonicalSettlementObservation `json:"items"`
}

// GetSettlementObservationBatchesHandler supports 2 modes:
//  1. GET /v1/settlement/observations/batches?tenant_id=<uuid>
//     -> returns unique client_batch_id list only
//  2. GET /v1/settlement/observations/batches?tenant_id=<uuid>&client_batch_id=<id>
//     -> returns full canonical_settlement_observations rows for that batch
func (h *Handler) GetSettlementObservationBatchesHandler(c *gin.Context) {
	tenantID, err := uuid.Parse(strings.TrimSpace(c.Query("tenant_id")))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}

	clientBatchID := strings.TrimSpace(c.Query("client_batch_id"))

	// Mode 1: tenant only -> batch ids only
	if clientBatchID == "" {
		const q = `
			SELECT
				client_batch_id
			FROM canonical_settlement_observations
			WHERE tenant_id = $1
			  AND client_batch_id IS NOT NULL
			  AND client_batch_id <> ''
			GROUP BY client_batch_id
			ORDER BY MAX(COALESCE(updated_at, created_at)) DESC
		`

		rows, err := db.DB.QueryContext(c.Request.Context(), q, tenantID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch batch ids"})
			return
		}
		defer rows.Close()

		items := make([]SettlementObservationBatchIDItem, 0)
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan batch id"})
				return
			}
			items = append(items, SettlementObservationBatchIDItem{ClientBatchID: id})
		}
		if err := rows.Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed while iterating batch ids"})
			return
		}

		c.JSON(http.StatusOK, SettlementObservationBatchIDListResponse{Items: items})
		return
	}

	// Mode 2: tenant + client_batch_id -> full rows
	const q = `
		SELECT
			settlement_observation_id,
			tenant_id,
			trace_id,
			settlement_envelope_id,
			ingest_run_id,
			settlement_batch_id,
			source_file_ref,
			source_row_ref,
			source_system,
			connector_id,
			observation_kind,
			source_strength_class,
			client_reference_candidate,
			provider_reference,
			bank_reference,
			external_reference,
			batch_reference,
			merchant_id_token,
			seller_id_token,
			vendor_id_token,
			amount,
			settled_amount,
			fee_amount,
			deduction_amount,
			currency_code,
			settlement_status,
			provider_status_code,
			failure_reason_code,
			retry_flag,
			reversal_flag,
			return_flag,
			observation_timestamp,
			value_date,
			provider_ref_status,
			provider_ref_first_seen_at,
			provider_ref_last_seen_at,
			provider_ref_source_set,
			provider_ref_consistency_flag,
			mapping_profile_id,
			mapping_profile_version,
			client_batch_id,
			parse_confidence,
			mapping_confidence,
			carrier_richness_score,
			attachment_readiness_score,
			score_breakdown_json,
			score_reason_codes_json,
			score_version,
			canonical_hash,
			canonical_snapshot_ref,
			source_strength,
			source_type,
			source_system_id,
			corridor_id,
			beneficiary_fingerprint,
			zord_signature_carrier,
			warnings_json,
			created_at,
			updated_at
		FROM canonical_settlement_observations
		WHERE tenant_id = $1
		  AND client_batch_id = $2
		ORDER BY updated_at DESC, created_at DESC
	`

	rows, err := db.DB.QueryContext(c.Request.Context(), q, tenantID, clientBatchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch settlement observations"})
		return
	}
	defer rows.Close()

	items := make([]models.CanonicalSettlementObservation, 0)
	for rows.Next() {
		var row models.CanonicalSettlementObservation

		if err := rows.Scan(
			&row.SettlementObservationID,
			&row.TenantID,
			&row.TraceID,
			&row.SettlementEnvelopeID,
			&row.IngestRunID,
			&row.SettlementBatchID,
			&row.SourceFileRef,
			&row.SourceRowRef,
			&row.SourceSystem,
			&row.ConnectorID,
			&row.ObservationKind,
			&row.SourceStrengthClass,
			&row.ClientReferenceCandidate,
			&row.ProviderReference,
			&row.BankReference,
			&row.ExternalReference,
			&row.BatchReference,
			&row.MerchantIDToken,
			&row.SellerIDToken,
			&row.VendorIDToken,
			&row.Amount,
			&row.SettledAmount,
			&row.FeeAmount,
			&row.DeductionAmount,
			&row.CurrencyCode,
			&row.SettlementStatus,
			&row.ProviderStatusCode,
			&row.FailureReasonCode,
			&row.RetryFlag,
			&row.ReversalFlag,
			&row.ReturnFlag,
			&row.ObservationTimestamp,
			&row.ValueDate,
			&row.ProviderRefStatus,
			&row.ProviderRefFirstSeenAt,
			&row.ProviderRefLastSeenAt,
			&row.ProviderRefSourceSet,
			&row.ProviderRefConsistencyFlag,
			&row.MappingProfileID,
			&row.MappingProfileVersion,
			&row.ClientBatchID,
			&row.ParseConfidence,
			&row.MappingConfidence,
			&row.CarrierRichnessScore,
			&row.AttachmentReadinessScore,
			&row.ScoreBreakdownJSON,
			&row.ScoreReasonCodesJSON,
			&row.ScoreVersion,
			&row.CanonicalHash,
			&row.CanonicalSnapshotRef,
			&row.SourceStrength,
			&row.SourceType,
			&row.SourceSystemID,
			&row.CorridorID,
			&row.BeneficiaryFingerprint,
			&row.ZordSignatureCarrier,
			&row.WarningsJSON,
			&row.CreatedAt,
			&row.UpdatedAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to scan settlement observation row"})
			return
		}

		items = append(items, row)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed while iterating settlement observations"})
		return
	}

	c.JSON(http.StatusOK, SettlementObservationDetailResponse{Items: items})
}
