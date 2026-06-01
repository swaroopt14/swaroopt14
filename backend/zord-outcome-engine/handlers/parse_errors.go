package handlers

import (
	"net/http"
	"zord-outcome-engine/db"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func SettlementParseErrors(c *gin.Context) {
	batchid := c.Query("batch_id")
	if batchid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batch_id query parameter is required"})
		return
	}
	rawtenantid := c.Query("tenant_id")
	tenantid, err := uuid.Parse(rawtenantid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant_id"})
		return
	}

	query := `SELECT source_row_ref,error_stage,reason_code,
	severity FROM settlement_parse_errors WHERE client_batch_id = $1 AND tenant_id =$2`

	rows, err := db.DB.QueryContext(c.Request.Context(), query, batchid, tenantid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type ParseErrorRow struct {
		SourceRowRef *string `json:"source_row_ref"`
		ErrorStage   string  `json:"error_stage"`
		ReasonCode   string  `json:"reason_code"`
		Severity     string  `json:"severity"`
	}

	errors := []ParseErrorRow{}
	for rows.Next() {
		var row ParseErrorRow
		if err := rows.Scan(
			&row.SourceRowRef,
			&row.ErrorStage,
			&row.ReasonCode,
			&row.Severity,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		errors = append(errors, row)
	}

	c.JSON(http.StatusOK, errors)
}
