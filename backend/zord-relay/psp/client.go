package psp

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// PayoutRequest is the payload sent to the PSP.
// All PII fields here are resolved from Service 3 tokens just before this
// call is made. They exist in memory only for the duration of this call.
// After Do() returns, the caller must zero / discard these fields immediately.
type PayoutRequest struct {
	ReferenceID string      `json:"reference_id"` // = dispatch_id (L1 correlation carrier)
	Narration   string      `json:"narration"`    // = "ZRD:" + contract_id (L2 carrier)
	Amount      int64       `json:"amount"`       // in smallest currency unit (paise)
	Mode        string      `json:"mode"`         // corridor_id e.g. IMPS
	Beneficiary Beneficiary `json:"beneficiary"`
}

// Beneficiary contains the resolved PII fields.
// These are obtained from Service 3 (detokenize) immediately before the PSP call
// and must be discarded from memory immediately after Do() returns.
// NEVER log these fields. NEVER persist these fields.
type Beneficiary struct {
	Name          string `json:"name"`           // resolved from beneficiary_name_token
	AccountNumber string `json:"account_number"` // resolved from bank_account_token
	IFSC          string `json:"ifsc"`           // not PII, safe to pass
}

// PayoutResponse is the PSP's synchronous acknowledgement.
// This is NOT a final outcome — status = "pending" means the PSP has
// accepted the instruction. The real outcome (success/failure + UTR)
// arrives later via webhook or statement reconciliation (Service 5).
type PayoutResponse struct {
	PayoutID    string `json:"payout_id"`    // PSP's internal ID (provider_attempt_id)
	ReferenceID string `json:"reference_id"` // echoed back from our request
	Status      string `json:"status"`       // "pending" at this stage
}

// Client is the PSP HTTP client interface.
// Swap the concrete implementation for real RazorpayX, Cashfree, etc.
// The demo implementation returns a deterministic response without
// making any real network call.
type Client interface {
	// Do sends a payout request to the PSP.
	// Returns PayoutResponse on HTTP 2xx.
	// Returns error on any non-2xx, timeout, or network failure.
	Do(ctx context.Context, req PayoutRequest) (PayoutResponse, error)
}

// DemoClient is a deterministic stub that always returns success.
// Replace with a real implementation before connecting to any PSP.
// The URL field is kept so you can swap in a mock HTTP server for
// integration testing without changing the interface.
type DemoClient struct {
	BaseURL    string
	TimeoutSec int
	http       *http.Client
}

func NewDemoClient(baseURL string, timeoutSec int) *DemoClient {
	return &DemoClient{
		BaseURL:    baseURL,
		TimeoutSec: timeoutSec,
		http: &http.Client{
			Timeout: time.Duration(timeoutSec) * time.Second,
		},
	}
}

// Do returns a synthetic PSP acknowledgement.
// In production this will be replaced by a real HTTP call to RazorpayX.
// The response shape mirrors the real RazorpayX payout response exactly
// so the swap is a one-line change.
func (c *DemoClient) Do(_ context.Context, req PayoutRequest) (PayoutResponse, error) {
	if req.ReferenceID == "" {
		return PayoutResponse{}, fmt.Errorf("psp: reference_id is required")
	}
	if req.Beneficiary.AccountNumber == "" || req.Beneficiary.Name == "" {
		return PayoutResponse{}, fmt.Errorf("psp: beneficiary fields are required")
	}

	// Synthetic payout_id — mirrors RazorpayX's "pout_" prefix format.
	payoutID := "pout_demo_" + req.ReferenceID

	return PayoutResponse{
		PayoutID:    payoutID,
		ReferenceID: req.ReferenceID,
		Status:      "pending",
	}, nil
}
