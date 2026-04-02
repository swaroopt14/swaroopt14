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

	EdgeReadDSN            string
	IntentReadDSN          string
	RelayReadDSN           string
	IntelligenceBaseURL    string
	IntelligenceTimeoutSec int

	ChromaURL        string
	ChromaCollection string
	DefaultTopK      int

	EmbeddingModelPath string
	TokenizerPath      string

	EmbeddingInputIDsName      string
	EmbeddingAttentionMaskName string
	EmbeddingTokenTypeIDsName  string
	EmbeddingOutputName        string
	EmbeddingMaxLength         int

	ChromaTenant   string
	ChromaDatabase string
	GeminiAPIKeys  []string
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

		GeminiAPIKey:        os.Getenv("GEMINI_API_KEY"),
		GeminiAPIKeys:       parseCSVKeys(os.Getenv("GEMINI_API_KEYS")),
		GeminiModel:         get("GEMINI_MODEL", "gemini-2.5-flash"),
		GeminiBaseURL:       get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
		EdgeReadDSN:         os.Getenv("EDGE_READ_DSN"),
		IntentReadDSN:       os.Getenv("INTENT_READ_DSN"),
		RelayReadDSN:        os.Getenv("RELAY_READ_DSN"),
		IntelligenceBaseURL: get("INTELLIGENCE_BASE_URL", "http://zord-intelligence:8087"),
		IntelligenceTimeoutSec: func() int {
			v := get("INTELLIGENCE_TIMEOUT_SEC", "3")
			n, err := strconv.Atoi(v)
			if err != nil || n <= 0 {
				return 3
			}
			return n
		}(),

		ChromaURL:        get("CHROMA_URL", "http://localhost:8000"),
		ChromaCollection: get("CHROMA_COLLECTION", "zord_prompt_chunks"),
		DefaultTopK:      topK,

		EmbeddingModelPath:         get("EMBEDDING_MODEL_PATH", "./assets/models/bge-small-en-v1.5/model.onnx"),
		TokenizerPath:              get("TOKENIZER_PATH", "./assets/models/bge-small-en-v1.5/tokenizer.json"),
		EmbeddingInputIDsName:      get("EMBEDDING_INPUT_IDS_NAME", "input_ids"),
		EmbeddingAttentionMaskName: get("EMBEDDING_ATTENTION_MASK_NAME", "attention_mask"),
		EmbeddingTokenTypeIDsName:  get("EMBEDDING_TOKEN_TYPE_IDS_NAME", "token_type_ids"),
		EmbeddingOutputName:        get("EMBEDDING_OUTPUT_NAME", "last_hidden_state"),
		EmbeddingMaxLength:         256,
		ChromaTenant:               get("CHROMA_TENANT", "default_tenant"),
		ChromaDatabase:             get("CHROMA_DATABASE", "default_database"),
	}
}
