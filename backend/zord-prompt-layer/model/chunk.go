// Standard internal shape for anything coming from Chroma.
package model

type RetrievedChunk struct {
	ChunkID    string
	Text       string
	Score      float64
	SourceType string
	RecordID   string
	IntentID   string
	TraceID    string
	TenantID   string
}
