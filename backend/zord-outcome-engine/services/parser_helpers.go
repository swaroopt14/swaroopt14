package services

import (
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

// cellStr safely extracts a trimmed string from a row slice.
func cellStr(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

// parseDecimal converts a string to decimal.Decimal, defaulting to Zero.
func parseDecimal(s string) decimal.Decimal {
	if s == "" {
		return decimal.Zero
	}
	v, _ := decimal.NewFromString(s)
	return v
}

// parseSettlementDate attempts to parse common Razorpay/Cashfree date formats.
func parseSettlementDate(s string) (time.Time, string) {
	if s == "" {
		return time.Now().UTC(), "empty"
	}
	// Common recon date formats.
	layouts := []string{
		"02/01/2006 15:04:05",
		"2006-01-02 15:04:05",
		"02/01/2006",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), ""
		}
	}
	return time.Now().UTC(), "format error"
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
