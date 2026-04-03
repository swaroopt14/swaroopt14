package models

import "time"

type RawEnvelope struct {
	EnvelopeID    string    `json:"envelope_id"`
	SchemaVersion string    `json:"schema_version"`
	SourceType    string    `json:"source_type"` // JSON / XML / CSV
	Payload       []byte    `json:"payload"`
	ReceivedAt    time.Time `json:"received_at"`
	Checksum      string    `json:"checksum"`
}
