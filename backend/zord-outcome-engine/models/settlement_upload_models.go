package models

import "github.com/google/uuid"

// SettlementUploadResponse is what the API returns after a file is uploaded and parsed.
type SettlementUploadResponse struct {
	JobID          uuid.UUID `json:"job_id"`
	Status         string    `json:"status"`
	RowCountParsed int       `json:"row_count_parsed"`
	RowCountFailed int       `json:"row_count_failed"`
	Message        string    `json:"message"`
}
