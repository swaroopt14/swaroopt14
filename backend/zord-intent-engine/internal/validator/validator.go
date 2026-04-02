package validator

import (
	"context"
	"time"

	"zord-intent-engine/internal/models"
	"zord-intent-engine/internal/persistence"
)

type Validator struct {
	dlqRepo persistence.DLQRepository
}

func NewValidator(dlqRepo persistence.DLQRepository) *Validator {
	return &Validator{dlqRepo: dlqRepo}
}

// ValidateParsed executes validation on already-parsed payload (STEP 5 → STEP 6)
func (v *Validator) ValidateParsed(
	ctx context.Context,
	tenantID string,
	envelopeID string,
	intent models.ParsedIncomingIntent,
) (*models.ParsedIncomingIntent, *models.DLQEntry, error) {

	// STEP 2 — STRUCTURAL validation
	if err := StructuralValidate(intent); err != nil {
		dlq, _ := v.persistDLQ(
			ctx,
			tenantID,
			envelopeID,
			"STRUCTURAL_VALIDATION",
			err,
			false,
		)
		return nil, dlq, nil
	}

	// STEP 3 — SEMANTIC validation
	if err := SemanticValidate(intent); err != nil {
		dlq, perr := v.persistDLQ(
			ctx,
			tenantID,
			envelopeID,
			"SEMANTIC_VALIDATION",
			err,
			false,
		)
		if perr != nil {
			return nil, nil, perr
		}
		return nil, dlq, nil
	}

	return &intent, nil, nil
}

func (v *Validator) persistDLQ(
	ctx context.Context,
	tenantID string,
	envelopeID string,
	stage string,
	err error,
	replayable bool,
) (*models.DLQEntry, error) {

	ve, ok := err.(ValidationError)
	if !ok {
		ve = ValidationError{
			Code: "VALIDATION_FAILED",
			Msg:  err.Error(),
		}
	}

	entry := models.DLQEntry{
		TenantID:   tenantID,
		EnvelopeID: envelopeID,

		Stage:       stage,
		ReasonCode:  ve.Code,
		ErrorDetail: ve.Msg,
		Replayable:  replayable,

		CreatedAt: time.Now().UTC(),
	}

	saved, err := v.dlqRepo.Save(ctx, entry)
	if err != nil {
		return nil, err
	}

	return &saved, nil
}
