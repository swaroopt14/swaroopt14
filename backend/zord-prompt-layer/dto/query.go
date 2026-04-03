// Return extracted entities explicitly for frontend rendering/debug
package dto

type QueryRequest struct {
	TenantID string `json:"tenant_id,omitempty"`
	Query    string `json:"query" binding:"required"`
	IntentID string `json:"intent_id,omitempty"`
	TraceID  string `json:"trace_id,omitempty"`
	TopK     int    `json:"top_k,omitempty"`
}

type Citation struct {
	SourceType string  `json:"source_type"`
	RecordID   string  `json:"record_id"`
	ChunkID    string  `json:"chunk_id"`
	Snippet    string  `json:"snippet"`
	Score      float64 `json:"score"`
}

type EntitiesFound struct {
	IntentID string `json:"intent_id,omitempty"`
	TraceID  string `json:"trace_id,omitempty"`
}

type QueryResponse struct {
	Answer        string        `json:"answer"`
	Confidence    string        `json:"confidence"`
	EntitiesFound EntitiesFound `json:"entities_found"`
	Citations     []Citation    `json:"citations"`
	NextActions   []string      `json:"next_actions"`
}
