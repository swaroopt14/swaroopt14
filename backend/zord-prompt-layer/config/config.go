package config

import (
	"os"
	"strconv"
	"strings"
)

type AppConfig struct {
	ServiceName string
	HTTPPort    string

	GeminiAPIKey  string
	GeminiModel   string
	GeminiBaseURL string

	EdgeReadDSN   string
	IntentReadDSN string
	RelayReadDSN  string

	DefaultTopK int

	IntelligenceReadDSN string
	EvidenceReadDSN     string
	GeminiAPIKeys       []string
}

func parseCSVKeys(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		k := strings.TrimSpace(p)
		if k != "" {
			out = append(out, k)
		}
	}
	return out
}

func Load() AppConfig {
	get := func(k, d string) string {
		v := os.Getenv(k)
		if v == "" {
			return d
		}
		return v
	}

	topK := 5
	if v := os.Getenv("DEFAULT_TOP_K"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			topK = n
		}
	}

	return AppConfig{
		ServiceName: get("SERVICE_NAME", "zord-prompt-layer"),
		HTTPPort:    get("HTTP_PORT", "8086"),

		GeminiAPIKey:  os.Getenv("GEMINI_API_KEY"),
		GeminiAPIKeys: parseCSVKeys(os.Getenv("GEMINI_API_KEYS")),
		GeminiModel:   get("GEMINI_MODEL", "gemini-2.5-flash"),
		GeminiBaseURL: get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
		EdgeReadDSN:   os.Getenv("EDGE_READ_DSN"),
		IntentReadDSN: os.Getenv("INTENT_READ_DSN"),
		RelayReadDSN:  os.Getenv("RELAY_READ_DSN"),

		DefaultTopK: topK,

		IntelligenceReadDSN: os.Getenv("INTELLIGENCE_READ_DSN"),
		EvidenceReadDSN:     os.Getenv("EVIDENCE_READ_DSN"),
	}
}
