package services

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// baseParser provides common utilities for static parsers.
type baseParser struct{}

// get returns the trimmed cell value for a given column index.
func (p *baseParser) get(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

// parseAmount handles common numeric cleaning.
func (p *baseParser) parseAmount(raw string) (float64, error) {
	if strings.TrimSpace(raw) == "" {
		return 0, fmt.Errorf("amount is empty")
	}

	// Default: Strip currency symbols and commas
	cleaned := strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) || r == '.' {
			return r
		}
		return -1
	}, raw)

	return strconv.ParseFloat(cleaned, 64)
}

// buildColIndex creates a map of trimmed header names to indices.
func (p *baseParser) buildColIndex(headers []string) map[string]int {
	m := make(map[string]int, len(headers))
	for i, h := range headers {
		m[strings.ToLower(strings.TrimSpace(h))] = i
	}
	return m
}

// getFromCandidates tries multiple header names and returns the first non-empty value found.
// If the last candidate is not present in colIndex, it is treated as a literal default value.
func (p *baseParser) getFromCandidates(row []string, colIndex map[string]int, candidates ...string) string {
	for i, c := range candidates {
		normalized := strings.ToLower(strings.TrimSpace(c))
		if idx, ok := colIndex[normalized]; ok && idx < len(row) {
			val := strings.TrimSpace(row[idx])
			if val != "" {
				return val
			}
		} else if i == len(candidates)-1 && len(candidates) > 1 {
			// If it's the last candidate and NOT in headers, treat it as a literal default
			// This matches calls like: get("intent_type", "PAYOUT")
			return c
		}
	}
	return ""
}
