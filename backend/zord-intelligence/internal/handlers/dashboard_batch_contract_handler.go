package handlers

// dashboard_batch_contract_handler.go
//
// GET /v1/intelligence/dashboard/batch_contract/{batch_id}?tenant_id=X
//
// Returns per-batch reference coverage and risk amounts straight from the
// batch_contracts table for a single batch.
//
//   - bank_reference_coverage — bank_ref_present_count / settlement_ref_count * 100,
//     formatted as a percentage string (e.g. "77.44%"). Percentage of
//     settlement observations for this batch that carried a bank-side
//     reference (BankRef, UTR, or RRN). null when no settlement
//     observations have been recorded yet.
//   - variance_amount         — total_variance_minor
//   - orphan_amount           — orphan_amount_minor
//   - unmatch_amount          — unmatched_amount_minor

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/zord/zord-intelligence/internal/persistence"
)

// DashboardBatchContractHandler serves GET /v1/intelligence/dashboard/batch_contract/{batch_id}.
type DashboardBatchContractHandler struct {
	batchRepo        *persistence.BatchContractRepo
	intelligenceMode string
}

// NewDashboardBatchContractHandler creates a DashboardBatchContractHandler.
func NewDashboardBatchContractHandler(batchRepo *persistence.BatchContractRepo, mode string) *DashboardBatchContractHandler {
	return &DashboardBatchContractHandler{batchRepo: batchRepo, intelligenceMode: mode}
}

// GetBatchContract handles GET /v1/intelligence/dashboard/batch_contract/{batch_id}?tenant_id=X
func (h *DashboardBatchContractHandler) GetBatchContract(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	batchID := chi.URLParam(r, "batch_id")

	if tenantID == "" {
		writeError(w, http.StatusBadRequest, "tenant_id is required")
		return
	}
	if batchID == "" {
		writeError(w, http.StatusBadRequest, "batch_id is required")
		return
	}

	batch, err := h.batchRepo.GetByID(r.Context(), batchID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch batch")
		return
	}
	if batch == nil || batch.TenantID != tenantID {
		writeError(w, http.StatusNotFound, "batch not found")
		return
	}

	var bankReferenceCoverage interface{} = nil
	if batch.SettlementRefCount > 0 {
		pct := float64(batch.BankRefPresentCount) / float64(batch.SettlementRefCount) * 100
		bankReferenceCoverage = fmt.Sprintf("%.2f%%", pct)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"tenant_id":               tenantID,
		"intelligence_mode":       h.intelligenceMode,
		"batch_id":                batch.BatchID,
		"bank_reference_coverage": bankReferenceCoverage,
		"settlement_ref_count":    batch.SettlementRefCount,
		"bank_ref_present_count":  batch.BankRefPresentCount,
		"variance_amount":         batch.TotalVarianceMinor,
		"orphan_amount":           batch.OrphanAmountMinor,
		"unmatch_amount":          batch.UnmatchedAmountMinor,
	})
}
