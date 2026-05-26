package normalizer

import (
	"encoding/json"
	"testing"
)

func TestNormalizeGeneralPayoutDateAndExplicitRail(t *testing.T) {
	raw := []byte(`{
		"source_row_ref": "row:7",
		"amount": "1250.50",
		"currency": "INR",
		"beneficiary_name": "Acme Supplies",
		"beneficiary_ifsc": "HDFC0001",
		"beneficiary_account_number": "1234567890",
		"payment_method": "rtgs",
		"scheduled_execution_at": "2026-06-15",
		"idempotency_key": "idem-7"
	}`)

	res, err := Normalize(raw, nil)
	if err != nil {
		t.Fatalf("Normalize() error = %v", err)
	}

	var got struct {
		SourceRowRef string `json:"source_row_ref"`
		Amount       struct {
			Value    string `json:"value"`
			Currency string `json:"currency"`
		} `json:"amount"`
		Beneficiary struct {
			Instrument struct {
				Kind string `json:"kind"`
				IFSC string `json:"ifsc"`
			} `json:"instrument"`
		} `json:"beneficiary"`
		IntendedExecutionAt string `json:"intended_execution_at"`
	}
	if err := json.Unmarshal(res.NormalizedJSON, &got); err != nil {
		t.Fatalf("normalized JSON unmarshal error = %v", err)
	}

	if got.SourceRowRef != "row:7" {
		t.Fatalf("source_row_ref = %q, want row:7", got.SourceRowRef)
	}
	if got.IntendedExecutionAt != "2026-06-15T00:00:00Z" {
		t.Fatalf("intended_execution_at = %q, want 2026-06-15T00:00:00Z", got.IntendedExecutionAt)
	}
	if got.Beneficiary.Instrument.Kind != "RTGS" {
		t.Fatalf("beneficiary.instrument.kind = %q, want RTGS", got.Beneficiary.Instrument.Kind)
	}
}

func TestNormalizeInfersRailFromVPAThenIFSC(t *testing.T) {
	tests := []struct {
		name string
		raw  []byte
		want string
	}{
		{
			name: "vpa",
			raw: []byte(`{
				"amount": "99",
				"beneficiary_name": "UPI Payee",
				"beneficiary_vpa": "payee@upi",
				"idempotency_key": "idem-upi"
			}`),
			want: "UPI",
		},
		{
			name: "ifsc",
			raw: []byte(`{
				"amount": "99",
				"beneficiary_name": "Bank Payee",
				"beneficiary_ifsc": "HDFC0001",
				"idempotency_key": "idem-bank"
			}`),
			want: "NEFT",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := Normalize(tt.raw, nil)
			if err != nil {
				t.Fatalf("Normalize() error = %v", err)
			}

			var got struct {
				Beneficiary struct {
					Instrument struct {
						Kind string `json:"kind"`
					} `json:"instrument"`
				} `json:"beneficiary"`
			}
			if err := json.Unmarshal(res.NormalizedJSON, &got); err != nil {
				t.Fatalf("normalized JSON unmarshal error = %v", err)
			}
			if got.Beneficiary.Instrument.Kind != tt.want {
				t.Fatalf("beneficiary.instrument.kind = %q, want %s", got.Beneficiary.Instrument.Kind, tt.want)
			}
		})
	}
}
