
// cmd/demopsp/main.go
//
// A minimal HTTP server that mimics RazorpayX's /payouts endpoint.
// Run this locally to test the full dispatch loop end-to-end without
// connecting to any real PSP.
//
// Usage:
//   go run ./cmd/demopsp
//   PSP_BASE_URL=http://localhost:8099 go run ./cmd/main.go
//
// The server logs every request it receives. It always returns 200 with
// a synthetic payout_id. To test failure paths, send a request with
// amount = 0 — the server will return 422.

package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"
    "time"
)

type payoutRequest struct {
    ReferenceID string      `json:"reference_id"`
    Narration   string      `json:"narration"`
    Amount      int64       `json:"amount"`
    Mode        string      `json:"mode"`
    Beneficiary beneficiary `json:"beneficiary"`
}

type beneficiary struct {
    Name          string `json:"name"`
    AccountNumber string `json:"account_number"`
    IFSC          string `json:"ifsc"`
}

type payoutResponse struct {
    PayoutID    string `json:"payout_id"`
    ReferenceID string `json:"reference_id"`
    Status      string `json:"status"`
}

type errorResponse struct {
    Error   string `json:"error"`
    Code    string `json:"code"`
}

func main() {
    port := os.Getenv("DEMO_PSP_PORT")
    if port == "" {
        port = "8099"
    }

    mux := http.NewServeMux()
    mux.HandleFunc("/payouts", handlePayout)
    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        _, _ = fmt.Fprintln(w, `{"status":"ok"}`)
    })

    log.Printf("demo PSP server listening on :%s", port)
    if err := http.ListenAndServe(":"+port, mux); err != nil {
        log.Fatalf("demo PSP server failed: %v", err)
    }
}

func handlePayout(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        writeJSON(w, http.StatusMethodNotAllowed, errorResponse{
            Error: "method not allowed",
            Code:  "METHOD_NOT_ALLOWED",
        })
        return
    }

    var req payoutRequest
    log.Println(req)
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errorResponse{
            Error: "invalid request body",
            Code:  "INVALID_REQUEST",
        })
        return
    }

    // Validation — mirrors real RazorpayX validation rules.
    if req.ReferenceID == "" {
        writeJSON(w, http.StatusUnprocessableEntity, errorResponse{
            Error: "reference_id is required",
            Code:  "MISSING_REFERENCE_ID",
        })
        return
    }
    if req.Beneficiary.AccountNumber == "" || req.Beneficiary.Name == "" || req.Beneficiary.IFSC == "" {
        writeJSON(w, http.StatusUnprocessableEntity, errorResponse{
            Error: "beneficiary fields are required",
            Code:  "MISSING_BENEFICIARY",
        })
        return
    }

    // Simulate failure for amount = 0 — useful for testing the FAILED path.
    if req.Amount == 0 {
        writeJSON(w, http.StatusUnprocessableEntity, errorResponse{
            Error: "amount must be greater than 0",
            Code:  "INVALID_AMOUNT",
        })
        return
    }

    // Log the request — note we log reference_id and narration but NOT
    // account_number or name. Even in a test server, PII discipline matters.
    log.Printf("demo PSP: payout request received | reference_id=%s narration=%s amount=%d mode=%s ifsc=%s",
        req.ReferenceID,
        req.Narration,
        req.Amount,
        req.Mode,
        req.Beneficiary.IFSC,
    )

    // Synthetic payout_id in RazorpayX format.
    payoutID := fmt.Sprintf("pout_%s_%d", req.ReferenceID, time.Now().UnixMilli())

    resp := payoutResponse{
        PayoutID:    payoutID,
        ReferenceID: req.ReferenceID,
        Status:      "pending",
    }

    log.Printf("demo PSP: payout accepted | payout_id=%s reference_id=%s",
        payoutID, req.ReferenceID,
    )

    writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(v)
}

