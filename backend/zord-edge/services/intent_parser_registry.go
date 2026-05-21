package services

import (
	"fmt"
	"strings"

	"zord-edge/model"
)

var (
	parsers = map[string]IntentParser{
		"BANK":     &BankParser{},
		"NBFC":     &NBFCParser{},
		"MERCHANT": &MerchantParser{},
		"VENDOR":   &VendorParser{},
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

// GetParserByProfile returns a GenericSourceParser configured with the given profile.
// This is the new profile-driven path for source-type specific tenants.
func GetParserByProfile(profile *model.IntentMappingProfile) IntentParser {
	return NewGenericSourceParser(profile)
}
