package client

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type IntelligenceClient struct {
	BaseURL string
	HTTP    *http.Client
}

func NewIntelligenceClient(baseURL string, timeoutSec int) *IntelligenceClient {
	if timeoutSec <= 0 {
		timeoutSec = 3
	}
	return &IntelligenceClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP:    &http.Client{Timeout: time.Duration(timeoutSec) * time.Second},
	}
}

type actionListResponse struct {
	Actions []struct {
		Decision   string `json:"decision"`
		PolicyID   string `json:"policy_id"`
		Confidence any    `json:"confidence"`
	} `json:"actions"`
}

func (c *IntelligenceClient) FetchNextActions(tenantID string, limit int) ([]string, error) {
	if strings.TrimSpace(tenantID) == "" {
		return []string{}, nil
	}
	if limit <= 0 {
		limit = 3
	}

	u := fmt.Sprintf("%s/v1/intelligence/actions", c.BaseURL)
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	q.Set("limit", fmt.Sprintf("%d", limit))
	u = u + "?" + q.Encode()

	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("intelligence actions error: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var out actionListResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}

	next := make([]string, 0, len(out.Actions))
	for _, a := range out.Actions {
		decision := strings.TrimSpace(a.Decision)
		if decision == "" {
			decision = "REVIEW"
		}
		policy := strings.TrimSpace(a.PolicyID)
		if policy == "" {
			next = append(next, fmt.Sprintf("%s recommended by intelligence", decision))
		} else {
			next = append(next, fmt.Sprintf("%s (policy: %s)", decision, policy))
		}
	}
	return next, nil
}
