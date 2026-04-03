package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type NormalizedIngestRecord struct {
	NIRID                  uuid.UUID `json:"nir_id" db:"nir_id"`
	EnvelopeID             uuid.UUID `json:"envelope_id" db:"envelope_id"`
	TenantID               uuid.UUID `json:"tenant_id" db:"tenant_id"`
	DetectedFormat         string    `json:"detected_format" db:"detected_format"`
	ProfileID              string    `json:"profile_id" db:"profile_id"`
	ProfileVersion         string    `json:"profile_version" db:"profile_version"`
	FieldsJSON             json.RawMessage `json:"fields_json" db:"fields_json"`
	FieldConfidenceSummary json.RawMessage `json:"field_confidence_summary" db:"field_confidence_summary"`
	UnmappedJSON           json.RawMessage `json:"unmapped_json" db:"unmapped_json"`
	MappingUncertainFlag   bool      `json:"mapping_uncertain_flag" db:"mapping_uncertain_flag"`
	CreatedAt              time.Time `json:"created_at" db:"created_at"`
}
