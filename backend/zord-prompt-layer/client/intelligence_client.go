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

type CorridorHealthRow struct {
	CorridorID         string  `json:"corridor_id"`
	SuccessRate        float64 `json:"success_rate"`
	FinalityP95Seconds float64 `json:"finality_p95_seconds"`
	TotalPending       int     `json:"total_pending"`
}
type corridorHealthResponse struct {
	Corridors []CorridorHealthRow `json:"corridors"`
}
type topFailureRow struct {
	ReasonCode string  `json:"reason_code"`
	Count      int     `json:"count"`
	Rate       float64 `json:"rate"`
}

type topFailuresResponse struct {
	TopReasons []topFailureRow `json:"top_reasons"`
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
func (c *IntelligenceClient) FetchCorridorHealth(tenantID string) ([]CorridorHealthRow, error) {
	if strings.TrimSpace(tenantID) == "" {
		return nil, nil
	}
	u := fmt.Sprintf("%s/v1/intelligence/corridors/health", c.BaseURL)
	q := url.Values{}
	q.Set("tenant_id", tenantID)
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
		return nil, fmt.Errorf("intelligence corridor health error: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var out corridorHealthResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out.Corridors, nil
}

func (c *IntelligenceClient) FetchTopFailures(tenantID, corridorID string) ([]topFailureRow, error) {
	if strings.TrimSpace(tenantID) == "" {
		return nil, nil
	}
	u := fmt.Sprintf("%s/v1/intelligence/failures/top", c.BaseURL)
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	if strings.TrimSpace(corridorID) != "" {
		q.Set("corridor_id", corridorID)
	}
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
		return nil, fmt.Errorf("intelligence top failures error: status=%d body=%s", resp.StatusCode, string(raw))
	}

	var out topFailuresResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out.TopReasons, nil
}
