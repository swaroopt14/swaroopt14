package client

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
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

type TopFailureRow struct {
	ReasonCode string  `json:"reason_code"`
	Count      int     `json:"count"`
	Rate       float64 `json:"rate"`
}

type SLABreachResponse struct {
	TenantID         string  `json:"tenant_id"`
	TotalProcessed   int     `json:"total_processed"`
	Breached         int     `json:"breached"`
	OnTime           int     `json:"on_time"`
	BreachRate       float64 `json:"breach_rate"`
	AvgBreachSeconds float64 `json:"avg_breach_seconds"`
}

type PendingApprovalSummary struct {
	TotalPending   int `json:"total_pending"`
	ExpiringIn1h   int `json:"expiring_in_1h"`
	ExpiringIn6h   int `json:"expiring_in_6h"`
	HighSeverity   int `json:"high_severity"`
	MediumSeverity int `json:"medium_severity"`
	LowSeverity    int `json:"low_severity"`
}

type corridorHealthResponse struct {
	Corridors []CorridorHealthRow `json:"corridors"`
}
type topFailuresResponse struct {
	TopReasons []TopFailureRow `json:"top_reasons"`
}
type pendingApprovalResponse struct {
	Summary PendingApprovalSummary `json:"summary"`
}
type actionListResponse struct {
	Actions []struct {
		Decision   string `json:"decision"`
		PolicyID   string `json:"policy_id"`
		Confidence any    `json:"confidence"`
	} `json:"actions"`
}
type RCAClustersResponse struct {
	TenantID         string            `json:"tenant_id"`
	IntelligenceMode string            `json:"intelligence_mode"`
	SnapshotID       string            `json:"snapshot_id"`
	ModelVersion     *string           `json:"model_version,omitempty"`
	ClusterCount     int               `json:"cluster_count"`
	ClusteredPoints  int               `json:"clustered_points"`
	NoisePoints      int               `json:"noise_points"`
	TotalPoints      int               `json:"total_points"`
	ReturnedClusters int               `json:"returned_clusters"`
	Clusters         []json.RawMessage `json:"clusters"`
	DataAvailable    bool              `json:"data_available"`
	Reason           string            `json:"reason,omitempty"`
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

func (c *IntelligenceClient) doGetJSON(path string, q url.Values, out any) error {
	u := c.BaseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	maxRetries := 2

	for attempt := 0; attempt <= maxRetries; attempt++ {
		start := time.Now()
		log.Printf("[prompt-layer][intelligence] GET start path=%s query=%s attempt=%d", path, q.Encode(), attempt+1)
		req, err := http.NewRequest(http.MethodGet, u, nil)
		if err != nil {
			return err
		}

		resp, err := c.HTTP.Do(req)
		if err != nil {
			log.Printf("[prompt-layer][intelligence] GET transport_error path=%s attempt=%d err=%v duration_ms=%d",
				path, attempt+1, err, time.Since(start).Milliseconds())
			if attempt < maxRetries {
				time.Sleep(backoff(attempt))
				continue
			}
			return err
		}
		log.Printf("[prompt-layer][intelligence] GET response path=%s status=%d attempt=%d duration_ms=%d",
			path, resp.StatusCode, attempt+1, time.Since(start).Milliseconds())

		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 300 {
			retriable := resp.StatusCode == http.StatusTooManyRequests ||
				resp.StatusCode == http.StatusServiceUnavailable ||
				resp.StatusCode == http.StatusBadGateway ||
				resp.StatusCode == http.StatusGatewayTimeout
			log.Printf("[prompt-layer][intelligence] GET failed path=%s status=%d retriable=%t attempt=%d body=%s",
				path, resp.StatusCode, retriable, attempt+1, string(raw))
			if retriable && attempt < maxRetries {
				log.Printf("[prompt-layer][intelligence] GET retrying path=%s next_attempt=%d", path, attempt+2)
				time.Sleep(backoff(attempt))
				continue
			}
			return fmt.Errorf("intelligence api error: status=%d body=%s", resp.StatusCode, string(raw))
		}

		if out == nil {
			return nil
		}
		if err := json.Unmarshal(raw, out); err != nil {
			return err
		}
		return nil
	}
	return fmt.Errorf("intelligence api failed after retries")
}

func backoff(attempt int) time.Duration {
	d := 200 * time.Millisecond
	for i := 0; i < attempt; i++ {
		d *= 2
	}
	if d > 2*time.Second {
		d = 2 * time.Second
	}
	return d
}

func (c *IntelligenceClient) FetchNextActions(tenantID string, limit int) ([]string, error) {
	if strings.TrimSpace(tenantID) == "" {
		return []string{}, nil
	}
	if limit <= 0 {
		limit = 3
	}

	q := url.Values{}
	q.Set("tenant_id", tenantID)
	q.Set("limit", fmt.Sprintf("%d", limit))

	var out actionListResponse
	if err := c.doGetJSON("/v1/intelligence/actions", q, &out); err != nil {
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
	q := url.Values{}
	q.Set("tenant_id", tenantID)

	var out corridorHealthResponse
	if err := c.doGetJSON("/v1/intelligence/corridors/health", q, &out); err != nil {
		return nil, err
	}
	return out.Corridors, nil
}

func (c *IntelligenceClient) FetchTopFailures(tenantID, corridorID string) ([]TopFailureRow, error) {
	if strings.TrimSpace(tenantID) == "" {
		return nil, nil
	}
	q := url.Values{}
	q.Set("tenant_id", tenantID)
	if strings.TrimSpace(corridorID) != "" {
		q.Set("corridor_id", corridorID)
	}

	var out topFailuresResponse
	if err := c.doGetJSON("/v1/intelligence/failures/top", q, &out); err != nil {
		return nil, err
	}
	return out.TopReasons, nil
}

func (c *IntelligenceClient) FetchSLABreach(tenantID string) (*SLABreachResponse, error) {
	if strings.TrimSpace(tenantID) == "" {
		return nil, nil
	}
	q := url.Values{}
	q.Set("tenant_id", tenantID)

	var out SLABreachResponse
	if err := c.doGetJSON("/v1/intelligence/sla-breach", q, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *IntelligenceClient) FetchPendingApprovalSummary(tenantID string) (*PendingApprovalSummary, error) {
	if strings.TrimSpace(tenantID) == "" {
		return nil, nil
	}
	q := url.Values{}
	q.Set("tenant_id", tenantID)

	var out pendingApprovalResponse
	if err := c.doGetJSON("/v1/intelligence/actions/pending-approval", q, &out); err != nil {
		return nil, err
	}
	return &out.Summary, nil
}
func (c *IntelligenceClient) FetchRCAClusters(tenantID string) (*RCAClustersResponse, error) {
	if strings.TrimSpace(tenantID) == "" {
		return nil, nil
	}
	q := url.Values{}
	q.Set("tenant_id", tenantID)

	var out RCAClustersResponse
	if err := c.doGetJSON("/v1/intelligence/rca/clusters", q, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
