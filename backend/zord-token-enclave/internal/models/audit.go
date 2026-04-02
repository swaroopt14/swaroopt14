package models

import "time"

type TokenAudit struct {
	AuditID   string
	TokenID   string
	TenantID  string
	Actor     string
	Action    string
	Purpose   string
	Decision  string
	TraceID   string
	CreatedAt time.Time
}
