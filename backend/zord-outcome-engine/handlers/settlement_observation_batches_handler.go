package handlers

import (
	"net/http"
	"strings"
	"time"

	"zord-outcome-engine/db"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type SettlementObservationBatchIDItem struct {
	ClientBatchID string `json:"client_batch_id"`
}

type SettlementObservationBatchIDListResponse struct {
	Items []SettlementObservationBatchIDItem `json:"items"`
}

type SettlementObservationDetailResponse struct {
	Items []SettlementObservationBatchDetailItem `json:"items"`
}
type SettlementObservationBatchDetailItem struct {
	SettlementBatchID    string           `json:"settlement_batch_id"`
	SourceRowRef         string           `json:"source_row_ref"`
	SourceSystem         string           `json:"source_system"`
	Amount               decimal.Decimal  `json:"amount"`
	SettledAmount        *decimal.Decimal `json:"settled_amount"`
	FeeAmount            *decimal.Decimal `json:"fee_amount"`
	DeductionAmount      *decimal.Decimal `json:"deduction_amount"`
	CurrencyCode         string           `json:"currency_code"`
	SettlementStatus     string           `json:"settlement_status"`
	BankReference        *string          `json:"bank_reference"`
	ProviderStatusCode   *string          `json:"provider_status_code"`
	FailureReasonCode    *string          `json:"failure_reason_code"`
	RetryFlag            bool             `json:"retry_flag"`
	ReversalFlag         bool             `json:"reversal_flag"`
	ReturnFlag           bool             `json:"return_flag"`
	ObservationTimestamp time.Time        `json:"observation_timestamp"`
	ValueDate            *time.Time       `json:"value_date"`
	SourceSystemID       string           `json:"source_system_id"`
	CreatedAt            time.Time        `json:"created_at"`
	UpdatedAt            time.Time        `json:"updated_at"`
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
			settlement_batch_id,
			source_row_ref,
			source_system,
			amount,
			settled_amount,
			fee_amount,
			deduction_amount,
			currency_code,
			settlement_status,
			bank_reference,
			provider_status_code,
			failure_reason_code,
			retry_flag,
			reversal_flag,
			return_flag,
			observation_timestamp,
			value_date,
			source_system_id,
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

	items := make([]SettlementObservationBatchDetailItem, 0)
	for rows.Next() {
		var row SettlementObservationBatchDetailItem

		if err := rows.Scan(
			&row.SettlementBatchID,
			&row.SourceRowRef,
			&row.SourceSystem,
			&row.Amount,
			&row.SettledAmount,
			&row.FeeAmount,
			&row.DeductionAmount,
			&row.CurrencyCode,
			&row.SettlementStatus,
			&row.BankReference,
			&row.ProviderStatusCode,
			&row.FailureReasonCode,
			&row.RetryFlag,
			&row.ReversalFlag,
			&row.ReturnFlag,
			&row.ObservationTimestamp,
			&row.ValueDate,
			&row.SourceSystemID,
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
