package services

import (
	"fmt"
	"strings"
)

var (
	parsers = map[string]IntentParser{
		"BANK":     &BankParser{},
		"NBFC":     &NBFCParser{},
		"MERCHANT": &BankParser{}, // Defaulting to Bank for now
		"GATEWAY":  &BankParser{}, // Defaulting to Bank for now
	}
)

// GetParserByType returns the static IntentParser for the given tenant type.
func GetParserByType(tenantType string) (IntentParser, error) {
	upperType := strings.ToUpper(strings.TrimSpace(tenantType))
	parser, ok := parsers[upperType]
	if !ok {
		return nil, fmt.Errorf("unsupported tenant type: %s", tenantType)
	}
	return parser, nil
}
