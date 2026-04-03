package validator

import (
	"math/big"
	"regexp"
	"strings"
	"time"

	"zord-intent-engine/internal/models"
)

/* ---------- Semantic helpers ---------- */

func validateAmount(value string) error {
	value = strings.TrimSpace(value)

	amt, ok := new(big.Rat).SetString(value)
	if !ok {
		return semanticError("amount must be a valid decimal")
	}

	if amt.Sign() <= 0 {
		return semanticError("amount must be greater than zero")
	}

	// 🔐 Check decimal scale (max 2 digits after decimal)
	parts := strings.Split(value, ".")
	if len(parts) == 2 {
		if len(parts[1]) > 2 {
			return semanticError("amount must not have more than two decimal places")
		}
	}

	return nil
}

func validateCurrency(code string) error {
	code = strings.ToUpper(strings.TrimSpace(code))

	switch code {
	case "INR", "USD", "EUR", "GBP":
		return nil
	default:
		return semanticError("currency must be ISO-4217 compliant")
	}
}

func validateDeadline(constraints map[string]any) error {
	raw, ok := constraints["deadline_at"]
	if !ok {
		return nil // optional
	}

	deadlineStr, ok := raw.(string)
	if !ok {
		return semanticError("deadline_at must be a string (RFC3339)")
	}

	t, err := time.Parse(time.RFC3339, deadlineStr)
	if err != nil {
		return semanticError("deadline_at must be RFC3339")
	}

	if t.Before(time.Now().UTC()) {
		return semanticError("deadline_at must not be in the past")
	}

	return nil
}

var ifscRegex = regexp.MustCompile(`^[A-Z]{4}0[A-Z0-9]{6}$`)

func SemanticValidate(intent models.ParsedIncomingIntent) error {
	if err := validateAmount(intent.Amount.Value); err != nil {
		return err
	}

	if err := validateCurrency(intent.Amount.Currency); err != nil {
		return err
	}

	if err := validateDeadline(intent.Constraints); err != nil {
		return err
	}

	if err := validateInstrumentParsed(intent); err != nil {
		return err
	}

	return nil
}

/* ---------- Instrument rules ---------- */

func validateInstrumentParsed(intent models.ParsedIncomingIntent) error {
	switch intent.Beneficiary.Instrument.Kind {
	case "BANK":
		if strings.TrimSpace(intent.AccountNumber) == "" {
			return semanticError("account_number required for BANK instrument")
		}
		if !ifscRegex.MatchString(intent.Beneficiary.Instrument.IFSC) {
			return semanticError("invalid IFSC format")
		}

	case "UPI":
		if !strings.Contains(intent.Beneficiary.Instrument.VPA, "@") {
			return semanticError("invalid UPI VPA")
		}

	case "WALLET", "CARD":
		return nil

	default:
		return semanticError("unsupported instrument kind")
	}

	return nil
}
