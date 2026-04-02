package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"zord-outcome-engine/db"
	"zord-outcome-engine/vault"

	"github.com/google/uuid"
)

func recomputeFusionAndFinality(ctx context.Context, contractID string) (string, error) {
	log.Printf("fusion.recompute.start contract_id=%s", contractID)
	q := `
SELECT event_id::text, source_class, status_candidate, utr 
FROM canonical_outcome_events
WHERE contract_id = $1::uuid
ORDER BY received_at DESC, created_at DESC
`
	rows, err := db.DB.QueryContext(ctx, q, contractID)
	if err != nil {
		if err == sql.ErrNoRows {
			// No events at all.
		} else {
			log.Printf("fusion.recompute.query_error contract_id=%s err=%v", contractID, err)
			return "", err
		}
	}
	defer rows.Close()

	type rowData struct {
		eventID string
		source  string
		status  string
		utr     *string
	}
	var all []rowData
	for rows.Next() {
		var r rowData
		if err := rows.Scan(&r.eventID, &r.source, &r.status, &r.utr); err != nil {
			log.Printf("fusion.recompute.scan_error contract_id=%s err=%v", contractID, err)
			return "", err
		}
		all = append(all, r)
	}

	// Default authority ordering (can be driven by env later).
	authority := map[string]int{
		"S4": 3,
		"S2": 2,
		"S3": 1,
	}
	bestUTR := (*string)(nil)
	bestEventID := ""
	bestSource := ""
	bestStatus := ""
	bestRank := -1
	bestIsTerminal := false

	for _, r := range all {
		rank := authority[r.source]           //Checks which source
		status := strings.ToUpper(r.status)   //Checks status from that source
		isTerminal := isTerminalState(status) //Shares status to Term State func to check is it final

		// Rule 1: terminal beats non-terminal
		if isTerminal && !bestIsTerminal {
			bestIsTerminal = true
			bestRank = rank
			bestSource = r.source
			bestStatus = status
			bestUTR = r.utr
			bestEventID = r.eventID
			continue
		}

		// Rule 2: if both terminal or both non-terminal → use authority
		if isTerminal == bestIsTerminal && rank > bestRank {
			bestRank = rank
			bestSource = r.source
			bestStatus = status
			bestUTR = r.utr
			bestEventID = r.eventID
		}
	}

	state := "UNKNOWN_DIVERGENT"
	confidence := 0.0
	basis := `{"winning_signals":[]}`
	finalState := (*string)(nil)
	ruleVersion := "v2.1"
	var finalityCertificateID *uuid.UUID
	if bestSource != "" {
		state = strings.ToUpper(bestStatus)
		confidence = 0.50
		basisBytes, _ := json.Marshal(map[string][]string{"winning_signals": {bestEventID}})
		basis = string(basisBytes)
		if isTerminalState(state) {
			if state == "SUCCESS" && bestUTR == nil {
				log.Printf("fusion.skip_finality contract_id=%s reason=missing_utr", contractID)
			} else {
				id := uuid.New()
				finalityCertificateID = &id
				finalState = &state
				switch bestSource {
				case "S4":
					confidence = 0.95
				case "S2":
					confidence = 0.80
				default:
					confidence = 0.60
				}
			}
		}
	} else if err != sql.ErrNoRows {
		return "", err
	}

	_, err = db.DB.ExecContext(ctx, `
INSERT INTO fused_outcomes(
	contract_id, current_state,finality_certificate_id, final_state, finality_confidence, finality_basis, rule_version, last_updated_at
) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,NOW())
ON CONFLICT (contract_id) DO UPDATE SET
	current_state = EXCLUDED.current_state,
	finality_certificate_id = EXCLUDED.finality_certificate_id,
	final_state = EXCLUDED.final_state,
	finality_confidence = EXCLUDED.finality_confidence,
	finality_basis = EXCLUDED.finality_basis,
	rule_version = EXCLUDED.rule_version,
	last_updated_at = NOW()
`,
		contractID, state, finalityCertificateID, finalState, confidence, basis, ruleVersion,
	)
	if err != nil {
		log.Printf("fusion.recompute.upsert_error contract_id=%s err=%v", contractID, err)
		return "", err
	}

	if finalState != nil {
		log.Printf("fusion.recompute.final_state contract_id=%s final_state=%s confidence=%.2f basis=%s", contractID, *finalState, confidence, basis)

		intentSum := sha256.Sum256([]byte(contractID))
		intentHashStr := "sha256:" + hex.EncodeToString(intentSum[:])
		inputHashes := []string{intentHashStr}

		rawRows, err := db.DB.QueryContext(ctx, `
SELECT r.raw_bytes_sha256
FROM canonical_outcome_events c
JOIN raw_outcome_envelopes r ON c.raw_outcome_envelope_id = r.raw_outcome_envelope_id
WHERE c.contract_id = $1::uuid
ORDER BY c.received_at ASC
`, contractID)
		if err == nil {
			defer rawRows.Close()
			for rawRows.Next() {
				var hashBytes []byte
				if err := rawRows.Scan(&hashBytes); err == nil {
					inputHashes = append(inputHashes, "sha256:"+hex.EncodeToString(hashBytes))
				}
			}
		} else {
			log.Printf("fusion.recompute.raw_hashes_error contract_id=%s err=%v", contractID, err)
		}

		inputHashesBytes, _ := json.Marshal(inputHashes)
		inputHashesStr := string(inputHashesBytes)

		payload := map[string]any{
			"contract_id":  contractID,
			"final_state":  *finalState,
			"confidence":   confidence,
			"rule_id":      ruleVersion,
			"input_hashes": inputHashes,
		}
		payloadBytes, _ := json.Marshal(payload)
		sigSum := vault.SignEnvelopeHash(payloadBytes)
		sig := "zord_sig_" + hex.EncodeToString(sigSum[:])

		_, _ = db.DB.ExecContext(ctx, `
INSERT INTO finality_certificates(
	finality_certificate_id, contract_id, final_state, confidence, input_hashes, rule_id, signature, created_at
) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,NOW())
ON CONFLICT (contract_id, rule_id) DO NOTHING
`,
			finalityCertificateID, contractID, *finalState, confidence, inputHashesStr, ruleVersion, sig,
		)
	}
	log.Printf("fusion.recompute.done contract_id=%s current_state=%s final_state=%s confidence=%.2f basis=%s", contractID, state, safeStrPtr(finalState), confidence, basis)
	return state, nil
}

func safeStrPtr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func isTerminalState(state string) bool {
	switch state {
	case "SUCCESS", "FAILED", "REVERSED":
		return true
	default:
		return false
	}
}

func computeSimpleInputHash(contractID, finalState, ruleID string) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%s", contractID, finalState, ruleID)))
	return fmt.Sprintf("%x", sum[:])
}
