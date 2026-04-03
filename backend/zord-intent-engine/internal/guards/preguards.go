package guards

import (
	"time"

	"zord-intent-engine/internal/models"
)

const (
	MaxBatchSize     = 20000
	TenantDailyLimit = 6000000000 // ₹60 Cr
	RemainingLimit   = 1000000000 // example ₹10 Cr
	NEFTCutoffHour   = 18
)

type Constraints struct {
	Deadline string `json:"deadline"`
}

func RunPreGuards(
	in *models.IncomingIntent,
	intent models.ParsedIncomingIntent,
) *models.DLQEntry {

	// -------- Corridor guard --------
	if intent.Amount.Currency != "INR" {
		return &models.DLQEntry{
			TenantID:    in.TenantID.String(),
			EnvelopeID:  in.EnvelopeID.String(),
			Stage:       "PREGUARD",
			ReasonCode:  "TENANT_CORRIDOR_NOT_ALLOWED",
			ErrorDetail: "only INR corridor allowed",
			Replayable:  false,
			CreatedAt:   time.Now().UTC(),
		}
	}

	// -------- Deadline guard --------

	if deadlineRaw, ok := intent.Constraints["deadline"]; ok {

		deadlineStr, ok := deadlineRaw.(string)
		if ok {

			deadline, err := time.Parse(time.RFC3339, deadlineStr)
			if err == nil && time.Now().After(deadline) {

				return &models.DLQEntry{
					TenantID:    in.TenantID.String(),
					EnvelopeID:  in.EnvelopeID.String(),
					Stage:       "PREGUARD",
					ReasonCode:  "DEADLINE_EXPIRED",
					ErrorDetail: "intent deadline expired",
					Replayable:  false,
					CreatedAt:   time.Now().UTC(),
				}

			}

		}
	}

	//NEFT cutoff window guard

	now := time.Now()

	if intent.IntentType == "NEFT" {

		if now.Hour() >= NEFTCutoffHour {

			return &models.DLQEntry{
				TenantID:    in.TenantID.String(),
				EnvelopeID:  in.EnvelopeID.String(),
				Stage:       "PREGUARD",
				ReasonCode:  "PAYMENT_WINDOW_CLOSED",
				ErrorDetail: "NEFT cutoff window passed",
				Replayable:  true,
				CreatedAt:   time.Now().UTC(),
			}
		}
	}
	return nil
}
