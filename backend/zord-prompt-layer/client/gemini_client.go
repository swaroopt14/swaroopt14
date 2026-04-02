package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type GeminiClient struct {
	APIKeys []string
	Model   string
	BaseURL string
	HTTP    *http.Client
}

func NewGeminiClient(apiKeys []string, model, baseURL string) *GeminiClient {
	return &GeminiClient{
		APIKeys: apiKeys,
		Model:   model,
		BaseURL: baseURL,
		HTTP: &http.Client{
			Timeout:   30 * time.Second,
			Transport: otelhttp.NewTransport(http.DefaultTransport),
		},
	}
}

type generateRequest struct {
	Contents []struct {
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	} `json:"contents"`
}

type generateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
}

func (c *GeminiClient) Generate(prompt string) (string, error) {
	if len(c.APIKeys) == 0 {
		return "", fmt.Errorf("missing GEMINI_API_KEY/GEMINI_API_KEYS")
	}

	reqBody := generateRequest{
		Contents: []struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		}{
			{
				Parts: []struct {
					Text string `json:"text"`
				}{
					{Text: prompt},
				},
			},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	var lastErr error

	for _, key := range c.APIKeys {
		url := fmt.Sprintf("%s/models/%s:generateContent", c.BaseURL, c.Model)
		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(bodyBytes))
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Goog-Api-Key", key)

		resp, err := c.HTTP.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 300 {
			// fallback to next key for quota/rate/server issues
			if resp.StatusCode == 429 || resp.StatusCode >= 500 || resp.StatusCode == 403 {
				lastErr = fmt.Errorf("gemini error: status=%d body=%s", resp.StatusCode, string(raw))
				continue
			}
			return "", fmt.Errorf("gemini error: status=%d body=%s", resp.StatusCode, string(raw))
		}

		var out generateResponse
		if err := json.Unmarshal(raw, &out); err != nil {
			lastErr = err
			continue
		}
		if len(out.Candidates) == 0 || len(out.Candidates[0].Content.Parts) == 0 {
			lastErr = fmt.Errorf("empty response from gemini")
			continue
		}

		return out.Candidates[0].Content.Parts[0].Text, nil
	}

	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("all gemini api keys failed")
}
