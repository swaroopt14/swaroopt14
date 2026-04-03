package idempotency

// import (
// 	"crypto/sha256"
// 	"encoding/hex"
// 	"encoding/json"

// 	"main.go/internal/models"
// )

// func ComputeSalientHash(c models.CanonicalIntent) (string, error) {
// 	payload := map[string]any{
// 		"intent_type": c.IntentType,
// 		"amount": map[string]any{
// 			"value":    c.AmountValue,
// 			"currency": c.AmountCurrency,
// 		},
// 		"beneficiary": map[string]any{
// 			"kind":    c.BeneficiaryKind,
// 			"country": c.BeneficiaryCountry,
// 		},
// 		"purpose_code": c.PurposeCode,
// 	}

// 	b, err := json.Marshal(payload)
// 	if err != nil {
// 		return "", err
// 	}

// 	sum := sha256.Sum256(b)
// 	return hex.EncodeToString(sum[:]), nil
// }
