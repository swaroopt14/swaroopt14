package normalizer

// synonymDict maps every known tenant variant → Zord canonical JSON path.
// Keys are lowercased and trimmed before lookup.
// Add new synonyms here when onboarding new tenants — no code change needed elsewhere.
var synonymDict = map[string]string{
    // ── Amount ────────────────────────────────────────────────────
    "amount":            "amount.value",
    "net amount":        "amount.value",
    "settled_amount":    "amount.value",
    "amount_paid":       "amount.value",
    "credited_amount":   "amount.value",
    "payout amount":     "amount.value",
    "transfer amount":   "amount.value",
    "txn amount":        "amount.value",
    "txnamount":         "amount.value",
    "net_amount":        "amount.value",

    // ── Currency ──────────────────────────────────────────────────
    "currency":          "amount.currency",
    "currency_code":     "amount.currency",
    "ccy":               "amount.currency",

    // ── Beneficiary name ──────────────────────────────────────────
    "beneficiary_name":  "beneficiary.name",
    "vendor name":       "beneficiary.name",
    "vendor_name":       "beneficiary.name",
    "payee name":        "beneficiary.name",
    "payee_name":        "beneficiary.name",
    "recipient name":    "beneficiary.name",
    "account name":      "beneficiary.name",
    "name":              "beneficiary.name",

    // ── Instrument kind ───────────────────────────────────────────
    "instrument_kind":   "beneficiary.instrument.kind",
    "payment_mode":      "beneficiary.instrument.kind",
    "transfer_mode":     "beneficiary.instrument.kind",
    "mode":              "beneficiary.instrument.kind",

    // ── IFSC ──────────────────────────────────────────────────────
    "ifsc":              "beneficiary.instrument.ifsc",
    "ifsc_code":         "beneficiary.instrument.ifsc",
    "ifsc code":         "beneficiary.instrument.ifsc",
    "bank_code":         "beneficiary.instrument.ifsc",

    // ── VPA / UPI ─────────────────────────────────────────────────
    "vpa":               "beneficiary.instrument.vpa",
    "upi_id":            "beneficiary.instrument.vpa",
    "upi id":            "beneficiary.instrument.vpa",
    "upi_vpa":           "beneficiary.instrument.vpa",
    "virtual_payment_address": "beneficiary.instrument.vpa",

    // ── References ────────────────────────────────────────────────
    "client_payout_ref": "client_payout_ref",
    "order_id":          "client_payout_ref",
    "order id":          "client_payout_ref",
    "reference_no":      "client_payout_ref",
    "reference no":      "client_payout_ref",
    "payout_ref":        "client_payout_ref",

    "client_batch_ref":  "client_batch_ref",
    "batch_id":          "client_batch_ref",
    "batch id":          "client_batch_ref",
    "batch_ref":         "client_batch_ref",

    "idempotency_key":   "idempotency_key",
    "idempotency key":   "idempotency_key",
    "dedup_key":         "idempotency_key",

    // ── Intent type ───────────────────────────────────────────────
    "intent_type":       "intent_type",
    "payment_type":      "intent_type",
    "transfer_type":     "intent_type",
    "payout_type":       "intent_type",

    // ── Provider hint ─────────────────────────────────────────────
    "provider_hint":     "provider_hint",
    "gateway":           "provider_hint",
    "psp":               "provider_hint",
    "payment_gateway":   "provider_hint",

    // ── Execution date ────────────────────────────────────────────
    "intended_execution_at": "intended_execution_at",
    "execution_date":     "intended_execution_at",
    "payout_date":        "intended_execution_at",
    "value_date":         "intended_execution_at",
    "transfer_date":      "intended_execution_at",

    // ── Account number ────────────────────────────────────────────
    "account_number":    "account_number",
    "account no":        "account_number",
    "account_no":        "account_number",
    "acc_no":            "account_number",
    "bank_account":      "account_number",

    // ── Purpose ───────────────────────────────────────────────────
    "purpose_code":      "purpose_code",
    "purpose":           "purpose_code",
    "narration":         "purpose_code",
    "remarks":           "purpose_code",
}
