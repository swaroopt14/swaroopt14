package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// TokenClient calls Service 3 (Token Enclave) for JIT detokenization.
// Detokenization must only happen immediately before a PSP call.
// Resolved values must never be logged, stored, or passed outside
// the scope of the PSP call that consumes them.
type TokenClient interface {
	Detokenize(ctx context.Context, req DetokenizeRequest) (*DetokenizeResponse, error)
}

// DetokenizeRequest matches Service 3's /v1/detokenize input exactly.
// It is a flat map of field-name → token-value.
// Only send the fields you actually need for the PSP call.
// Example:
//
//	{
//	  "account_number": "tok_thZQ2Y8oOP6CUg...",
//	  "name":           "tok_h+v05u6HV5ypX...",
//	  "ifsc":           "tok_3lHFptxRL9DPy...",
//	  "vpa":            "tok_SuqX4NuAK+4aV..."
//	}
type DetokenizeRequest struct {
	AccountNumber string `json:"account_number,omitempty"`
	Name          string `json:"name,omitempty"`
	IFSC          string `json:"ifsc,omitempty"`
	VPA           string `json:"vpa,omitempty"`
	Email         string `json:"email,omitempty"`
	Phone         string `json:"phone,omitempty"`
}

// DetokenizeResponse is the resolved plaintext map returned by Service 3.
// Same field names as the request, values are now plaintext.
// These values exist in memory only — zero them after the PSP call.
type DetokenizeResponse struct {
	AccountNumber string `json:"account_number,omitempty"`
	Name          string `json:"name,omitempty"`
	IFSC          string `json:"ifsc,omitempty"`
	VPA           string `json:"vpa,omitempty"`
	Email         string `json:"email,omitempty"`
	Phone         string `json:"phone,omitempty"`
}

// HTTPTokenClient calls Service 3's real /v1/detokenize endpoint.
type HTTPTokenClient struct {
	baseURL string
	http    *http.Client
}

func NewHTTPTokenClient(baseURL string, timeoutSecs int) *HTTPTokenClient {
	return &HTTPTokenClient{
		baseURL: baseURL,
		http: &http.Client{
			Timeout: time.Duration(timeoutSecs) * time.Second,
		},
	}
}

func (c *HTTPTokenClient) Detokenize(ctx context.Context, req DetokenizeRequest) (*DetokenizeResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("token_client: marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/detokenize", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("token_client: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("token_client: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token_client: HTTP %d", resp.StatusCode)
	}

	var result DetokenizeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("token_client: decode response: %w", err)
	}
	return &result, nil
}

// StubTokenClient returns placeholder values for local development.
// Returns the token string itself prefixed with STUB_ so it is obvious
// in logs that real PII is not being used.
// NEVER use in production or against any real PSP.
type StubTokenClient struct{}

func NewStubTokenClient() *StubTokenClient {
	return &StubTokenClient{}
}

func (c *StubTokenClient) Detokenize(_ context.Context, req DetokenizeRequest) (*DetokenizeResponse, error) {
	return &DetokenizeResponse{
		AccountNumber: stubResolve(req.AccountNumber),
		Name:          stubResolve(req.Name),
		IFSC:          stubResolve(req.IFSC),
		VPA:           stubResolve(req.VPA),
		Email:         stubResolve(req.Email),
		Phone:         stubResolve(req.Phone),
	}, nil
}

func stubResolve(token string) string {
	if token == "" {
		return ""
	}
	return "STUB_" + token
}
