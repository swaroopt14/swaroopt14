package validator

// ValidationError is a typed domain error used by validation logic.
// It carries a stable, spec-compliant reason code.
type ValidationError struct {
	Code string
	Msg  string
}

func (e ValidationError) Error() string {
	return e.Msg
}

/* ---------- Constructors ---------- */

// SCHEMA validation failures
func schemaError(msg string) error {
	return ValidationError{
		Code: "SCHEMA_INVALID",
		Msg:  msg,
	}
}

// SEMANTIC validation failures
func semanticError(msg string) error {
	return ValidationError{
		Code: "SEMANTIC_INVALID",
		Msg:  msg,
	}
}
