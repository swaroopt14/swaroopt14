package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"zord-evidence/models"
	"zord-evidence/utils"

	"github.com/google/uuid"
)

// ExportResult is returned by BuildDisputeExport and holds the payload bytes
// plus metadata about the export for logging and response headers.
type ExportResult struct {
	ContentType    string
	Filename       string
	Payload        []byte
	PayloadHash    string // SHA-256 of Payload
	ExportID       string
}

// BuildDisputeExport compiles the requested export format from the given pack.
// It enforces masking rules per spec §8 and records the export in the log table.
func (s *EvidenceService) BuildDisputeExport(
	ctx context.Context,
	req models.DisputeExportRequest,
	pack *models.EvidencePack,
	db *sql.DB,
) (*ExportResult, error) {

	var payload []byte
	var contentType, filename string
	var err error

	switch req.ExportType {
	case models.ExportTypeFinanceSummary:
		payload, err = buildFinanceSummary(pack, req)
		contentType = "text/html; charset=utf-8"
		filename = fmt.Sprintf("finance_summary_%s.html", pack.EvidencePackID)

	case models.ExportTypeAuditDetailed:
		payload, err = buildAuditPack(pack, req)
		contentType = "text/html; charset=utf-8"
		filename = fmt.Sprintf("audit_pack_%s.html", pack.EvidencePackID)

	case models.ExportTypeBankPSPPack:
		payload, err = buildBankPSPPack(pack, req)
		contentType = "text/csv; charset=utf-8"
		filename = fmt.Sprintf("bank_psp_pack_%s.csv", pack.EvidencePackID)

	case models.ExportTypeRawJSON:
		payload, err = buildRawJSONExport(pack, req)
		contentType = "application/json"
		filename = fmt.Sprintf("evidence_raw_%s.json", pack.EvidencePackID)

	default:
		return nil, fmt.Errorf("unsupported export_type %q: must be one of FINANCE_SUMMARY, AUDIT_DETAILED, BANK_PSP_PACK, RAW_JSON", req.ExportType)
	}

	if err != nil {
		return nil, fmt.Errorf("build export: %w", err)
	}

	sum := sha256.Sum256(payload)
	payloadHash := fmt.Sprintf("%x", sum[:])
	exportID := "exp_" + uuid.NewString()

	// Persist export log (spec §6)
	if db != nil {
		_, _ = db.ExecContext(ctx, `
INSERT INTO evidence_export_log(
    export_id, evidence_pack_id, tenant_id, intent_id,
    payment_reference, export_type, dispute_reason, requested_by, file_hash
) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			exportID, pack.EvidencePackID, pack.TenantID, pack.IntentID,
			req.PaymentReference, req.ExportType, req.DisputeReason, req.RequestedBy, payloadHash,
		)

		// Increment export_count on the pack row
		_, _ = db.ExecContext(ctx,
			`UPDATE evidence_packs SET export_count = export_count + 1, updated_at = NOW() WHERE evidence_pack_id = $1`,
			pack.EvidencePackID,
		)
	}

	return &ExportResult{
		ContentType: contentType,
		Filename:    filename,
		Payload:     payload,
		PayloadHash: payloadHash,
		ExportID:    exportID,
	}, nil
}

// --- Finance Summary (spec §6.1) ---
// High-level executive brief. PII masked. Single scannable page.
func buildFinanceSummary(pack *models.EvidencePack, req models.DisputeExportRequest) ([]byte, error) {
	maskedItems := MaskEvidenceItems(pack.Items, MaskingLevelBusiness)
	comp := deriveComponents(pack)
	score := ComputeProofScore(comp, true)

	var sb strings.Builder
	sb.WriteString(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">`)
	sb.WriteString(`<title>Finance Summary — ` + req.PaymentReference + `</title>`)
	sb.WriteString(`<style>body{font-family:sans-serif;max-width:900px;margin:2rem auto;color:#222}`)
	sb.WriteString(`table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left}`)
	sb.WriteString(`th{background:#f5f5f5}.score{font-size:2rem;font-weight:bold}.badge{padding:4px 10px;border-radius:4px;font-size:0.85rem}`)
	sb.WriteString(`.ok{background:#d4edda;color:#155724}.warn{background:#fff3cd;color:#856404}</style></head><body>`)

	sb.WriteString(`<h1>Payment Finance Summary</h1>`)
	sb.WriteString(fmt.Sprintf(`<p><strong>Payment Reference:</strong> %s</p>`, htmlEscape(req.PaymentReference)))
	if req.DisputeReason != "" {
		sb.WriteString(fmt.Sprintf(`<p><strong>Dispute Reason:</strong> %s</p>`, htmlEscape(req.DisputeReason)))
	}
	sb.WriteString(fmt.Sprintf(`<p><strong>Generated At:</strong> %s</p>`, time.Now().UTC().Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf(`<p><strong>Evidence Pack ID:</strong> %s</p>`, pack.EvidencePackID))
	sb.WriteString(fmt.Sprintf(`<p><strong>Processing Status:</strong> <span class="badge ok">%s</span></p>`, pack.PackStatus))
	sb.WriteString(fmt.Sprintf(`<p><strong>Proof Score:</strong> <span class="score">%d/100</span></p>`, score.Score))

	if len(score.Deductions) > 0 {
		sb.WriteString(`<h3>Score Deductions</h3><ul>`)
		for _, d := range score.Deductions {
			sb.WriteString(`<li>` + htmlEscape(d) + `</li>`)
		}
		sb.WriteString(`</ul>`)
	}

	sb.WriteString(`<h2>Proof Components</h2><table><tr><th>Component</th><th>Weight</th><th>Status</th></tr>`)
	for _, c := range score.Components {
		status := `<span class="badge ok">✓ Passed</span>`
		if !c.Passed {
			status = `<span class="badge warn">✗ Missing</span>`
		}
		sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%d%%</td><td>%s</td></tr>`, htmlEscape(c.Check), c.Weight, status))
	}
	sb.WriteString(`</table>`)

	sb.WriteString(`<h2>Matched Artifacts (PII Masked)</h2><table>`)
	sb.WriteString(`<tr><th>Type</th><th>Reference (Masked)</th><th>Schema</th></tr>`)
	for _, item := range maskedItems {
		sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%s</td><td>%s</td></tr>`,
			htmlEscape(item.Type), htmlEscape(item.Ref), htmlEscape(item.SchemaVersion)))
	}
	sb.WriteString(`</table>`)

	// Service 2 lineage signals
	sb.WriteString(`<h2>Service 2 — Intent Pipeline Signals</h2><table><tr><th>Field</th><th>Value</th></tr>`)
	if pack.PaymentInstructionReceived != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Payment Instruction Received</td><td>%s</td></tr>`, pack.PaymentInstructionReceived.UTC().Format(time.RFC3339)))
	}
	if pack.CanonicalIntentCreated != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Canonical Intent Created</td><td>%s</td></tr>`, pack.CanonicalIntentCreated.UTC().Format(time.RFC3339)))
	}
	if pack.MappingProfileUsed != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Mapping Profile</td><td>%s</td></tr>`, htmlEscape(*pack.MappingProfileUsed)))
	}
	if pack.GovernanceDecision != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Governance Decision</td><td>%s</td></tr>`, htmlEscape(*pack.GovernanceDecision)))
	}
	if pack.RequiredFieldsStatus != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Required Fields Status</td><td>%v</td></tr>`, *pack.RequiredFieldsStatus))
	}
	if pack.TokenizationStatus != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Tokenization Status</td><td>%v</td></tr>`, *pack.TokenizationStatus))
	}
	sb.WriteString(`</table>`)

	// Service 5 lineage signals
	sb.WriteString(`<h2>Service 5 — Settlement Reconciliation Signals</h2><table><tr><th>Field</th><th>Value</th></tr>`)
	if pack.SettlementRecordReceived != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Settlement Record Received</td><td>%s</td></tr>`, pack.SettlementRecordReceived.UTC().Format(time.RFC3339)))
	}
	if pack.CanonicalSettlementCreated != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Canonical Settlement Created</td><td>%s</td></tr>`, pack.CanonicalSettlementCreated.UTC().Format(time.RFC3339)))
	}
	if pack.AttachmentDecision != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Attachment Decision</td><td>%s</td></tr>`, htmlEscape(*pack.AttachmentDecision)))
	}
	if pack.MatchConfidence != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Match Confidence</td><td>%.2f%%</td></tr>`, *pack.MatchConfidence*100))
	}
	if pack.ValueDateCheck != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Value Date Check</td><td>%v</td></tr>`, *pack.ValueDateCheck))
	}
	if pack.AmountMatch != nil {
		sb.WriteString(fmt.Sprintf(`<tr><td>Amount Match</td><td>%v</td></tr>`, *pack.AmountMatch))
	}
	sb.WriteString(`</table>`)

	sb.WriteString(`<p style="margin-top:2rem;font-size:0.8rem;color:#666">`)
	sb.WriteString(`This document is confidential. Generated by Zord Evidence Service. PII fields are tokenised per RBI data localisation guidelines.</p>`)
	sb.WriteString(`</body></html>`)

	return []byte(sb.String()), nil
}

// --- Audit Evidence Pack (spec §6.2) ---
// Compliance-focused. Full hashes, timestamps, Merkle root, process checklist.
func buildAuditPack(pack *models.EvidencePack, req models.DisputeExportRequest) ([]byte, error) {
	maskedItems := MaskEvidenceItems(pack.Items, MaskingLevelAudit)
	comp := deriveComponents(pack)
	score := ComputeProofScore(comp, true)

	var sb strings.Builder
	sb.WriteString(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">`)
	sb.WriteString(`<title>Audit Evidence Pack — ` + pack.EvidencePackID + `</title>`)
	sb.WriteString(`<style>body{font-family:monospace;max-width:1000px;margin:2rem auto;color:#111}`)
	sb.WriteString(`table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px;font-size:0.85rem}`)
	sb.WriteString(`th{background:#eee}.hash{font-family:monospace;font-size:0.75rem;word-break:break-all}</style></head><body>`)

	sb.WriteString(`<h1>Audit Evidence Pack</h1>`)
	sb.WriteString(fmt.Sprintf(`<p><strong>Evidence Pack ID:</strong> <span class="hash">%s</span></p>`, pack.EvidencePackID))
	sb.WriteString(fmt.Sprintf(`<p><strong>Intent ID:</strong> %s</p>`, pack.IntentID))
	sb.WriteString(fmt.Sprintf(`<p><strong>Contract ID:</strong> %s</p>`, pack.ContractID))
	sb.WriteString(fmt.Sprintf(`<p><strong>Tenant ID:</strong> %s</p>`, pack.TenantID))
	sb.WriteString(fmt.Sprintf(`<p><strong>Mode:</strong> %s</p>`, pack.Mode))
	sb.WriteString(fmt.Sprintf(`<p><strong>Ruleset Version:</strong> %s</p>`, pack.RulesetVersion))
	sb.WriteString(fmt.Sprintf(`<p><strong>Pack Status:</strong> %s</p>`, pack.PackStatus))
	sb.WriteString(fmt.Sprintf(`<p><strong>Created At:</strong> %s</p>`, pack.CreatedAt.UTC().Format(time.RFC3339Nano)))
	sb.WriteString(fmt.Sprintf(`<p><strong>Dispute Reason:</strong> %s</p>`, htmlEscape(req.DisputeReason)))

	sb.WriteString(`<h2>Cryptographic Seal</h2>`)
	sb.WriteString(fmt.Sprintf(`<p><strong>Merkle Root:</strong> <span class="hash">%s</span></p>`, pack.MerkleRoot))
	if len(pack.Signatures) > 0 {
		sig := pack.Signatures[0]
		sb.WriteString(fmt.Sprintf(`<p><strong>Signature Algorithm:</strong> %s</p>`, sig.Alg))
		sb.WriteString(fmt.Sprintf(`<p><strong>Signer:</strong> %s</p>`, sig.Signer))
		sb.WriteString(fmt.Sprintf(`<p><strong>Signature:</strong> <span class="hash">%s</span></p>`, sig.Sig))
		sb.WriteString(fmt.Sprintf(`<p><strong>Signed At:</strong> %s</p>`, sig.SignedAt.UTC().Format(time.RFC3339Nano)))
	}

	sb.WriteString(`<h2>Proof Score Breakdown</h2>`)
	sb.WriteString(fmt.Sprintf(`<p>Total Score: <strong>%d / 100</strong></p>`, score.Score))
	sb.WriteString(`<table><tr><th>Check</th><th>Weight</th><th>Status</th><th>Note</th></tr>`)
	for _, c := range score.Components {
		status := "✓"
		if !c.Passed {
			status = "✗"
		}
		sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%d%%</td><td>%s</td><td>%s</td></tr>`,
			htmlEscape(c.Check), c.Weight, status, htmlEscape(c.Explanation)))
	}
	sb.WriteString(`</table>`)

	sb.WriteString(`<h2>Evidence Items (Leaf Hashes)</h2>`)
	sb.WriteString(`<table><tr><th>#</th><th>Type</th><th>Ref</th><th>Leaf Hash</th><th>Schema</th></tr>`)
	for i, item := range maskedItems {
		sb.WriteString(fmt.Sprintf(`<tr><td>%d</td><td>%s</td><td>%s</td><td class="hash">%s</td><td>%s</td></tr>`,
			i, htmlEscape(item.Type), htmlEscape(item.Ref), item.LeafHash, item.SchemaVersion))
	}
	sb.WriteString(`</table>`)

	sb.WriteString(`<h2>Schema Versions</h2><table><tr><th>Key</th><th>Version</th></tr>`)
	for k, v := range pack.SchemaVersions {
		sb.WriteString(fmt.Sprintf(`<tr><td>%s</td><td>%s</td></tr>`, htmlEscape(k), htmlEscape(v)))
	}
	sb.WriteString(`</table>`)
	sb.WriteString(`<p style="margin-top:2rem;font-size:0.75rem;color:#555">`)
	sb.WriteString(fmt.Sprintf(`Audit pack generated at %s. Zord Evidence Service. Compliant with RBI ODR framework.</p>`, time.Now().UTC().Format(time.RFC3339)))
	sb.WriteString(`</body></html>`)

	return []byte(sb.String()), nil
}

// --- Bank / PSP Dispute Pack (spec §6.3) ---
// External execution pack in CSV. Strips Zord-internal metadata.
// Only outputs parameters banks and PSPs understand: UTR, client reference IDs,
// value dates, attachment status, match confidence, and variance flags.
// Amount and currency are intentionally absent — they belong to upstream services.
func buildBankPSPPack(pack *models.EvidencePack, req models.DisputeExportRequest) ([]byte, error) {
	var sb strings.Builder

	// Header — no amount/currency columns (owned by upstream services)
	sb.WriteString("payment_reference,intent_id,contract_id,batch_id,utr_number,client_reference_id,value_date,attachment_status,match_confidence,variance_flag,value_date_check,amount_match,merkle_root,pack_status,dispute_reason,export_timestamp\n")

	// Use live upstream fields carried on the pack from Service 5
	utr := ""
	if pack.BankReference != nil {
		utr = *pack.BankReference
	}
	clientRef := ""
	if pack.ClientReference != nil {
		clientRef = *pack.ClientReference
	}
	attachStatus := "UNKNOWN"
	if pack.AttachmentDecision != nil && *pack.AttachmentDecision != "" {
		attachStatus = *pack.AttachmentDecision
	} else if getLeafByType(pack, models.LeafTypeAttachmentDecision) != nil {
		attachStatus = "MATCHED"
	}
	matchConfidence := ""
	if pack.MatchConfidence != nil {
		matchConfidence = fmt.Sprintf("%.4f", *pack.MatchConfidence)
	}
	valueDateCheck := "false"
	if pack.ValueDateCheck != nil && *pack.ValueDateCheck {
		valueDateCheck = "true"
	}
	amountMatch := "false"
	if pack.AmountMatch != nil && *pack.AmountMatch {
		amountMatch = "true"
	}
	varianceFlag := "false"
	if v := getLeafByType(pack, models.LeafTypeVarianceDecision); v != nil {
		if v.Hash != models.ZeroVarianceHash {
			varianceFlag = "true"
		}
	}

	// Mask UTR — last 4 digits visible; bank already knows their own reference
	maskedUTR := MaskUTR(utr)

	sb.WriteString(fmt.Sprintf("%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n",
		csvEscape(req.PaymentReference),
		csvEscape(pack.IntentID),
		csvEscape(pack.ContractID),
		csvEscape(pack.BatchID),
		csvEscape(maskedUTR),
		csvEscape(clientRef),
		csvEscape(pack.CreatedAt.UTC().Format("2006-01-02")),
		csvEscape(attachStatus),
		csvEscape(matchConfidence),
		csvEscape(varianceFlag),
		csvEscape(valueDateCheck),
		csvEscape(amountMatch),
		csvEscape(pack.MerkleRoot),
		csvEscape(pack.PackStatus),
		csvEscape(req.DisputeReason),
		csvEscape(time.Now().UTC().Format(time.RFC3339)),
	))

	return []byte(sb.String()), nil
}

// --- Raw JSON Export (spec §6.4) ---
// Complete verifiable ledger dump with schema blocks, signatures, and proof paths.
// No PII masking — caller must have admin permission (enforced at handler layer).
func buildRawJSONExport(pack *models.EvidencePack, req models.DisputeExportRequest) ([]byte, error) {
	comp := deriveComponents(pack)
	score := ComputeProofScore(comp, true)

	payload := map[string]any{
		"export_metadata": map[string]any{
			"export_type":       req.ExportType,
			"payment_reference": req.PaymentReference,
			"dispute_reason":    req.DisputeReason,
			"requested_by":      req.RequestedBy,
			"exported_at":       time.Now().UTC().Format(time.RFC3339Nano),
		},
		"evidence_pack":       pack,
		"proof_score":         score,
		"proof_components":    comp,
		"lineage_graph":       BuildLineageGraph(pack),
		"verification_hint": map[string]any{
			"instruction": "Re-compute leaf hashes from items using SHA256(type||ref||hash||schema_version) and rebuild the Merkle root using BuildMerkleRoot(leaves). Compare against merkle_root field.",
			"merkle_root": pack.MerkleRoot,
		},
	}
	return json.MarshalIndent(payload, "", "  ")
}

// --- helpers ---

func deriveComponents(pack *models.EvidencePack) models.ProofComponents {
	var c models.ProofComponents
	for _, item := range pack.Items {
		switch item.Type {
		case models.LeafTypeRawSettlementLine, models.LeafTypeCanonicalIntentHash:
			c.PaymentInstructionAvailable = true
		case models.LeafTypeRawSettlementFile, models.LeafTypeCanonicalSettlementObservation:
			c.SettlementRecordAvailable = true
		case models.LeafTypeAttachmentDecision:
			c.MatchDecisionAvailable = true
		case models.LeafTypeGovernanceDecision:
			c.GovernanceDecisionAvailable = true
		case models.LeafTypeVarianceDecision:
			c.ReplayCheckPassed = true
		}
	}
	return c
}

func extractRefByType(pack *models.EvidencePack, leafType string) string {
	item := getLeafByType(pack, leafType)
	if item == nil {
		return ""
	}
	return item.Ref
}

func getLeafByType(pack *models.EvidencePack, leafType string) *models.EvidenceItem {
	for i := range pack.Items {
		if pack.Items[i].Type == leafType {
			return &pack.Items[i]
		}
	}
	return nil
}

// enrichPackSigs builds the CryptographicSignatures view from pack items.
func enrichPackSigs(pack *models.EvidencePack) models.CryptographicSignatures {
	sigs := models.CryptographicSignatures{}
	for _, item := range pack.Items {
		switch item.Type {
		case models.LeafTypeRawSettlementLine:
			sigs.RawIntentHash = item.Hash
		case models.LeafTypeCanonicalIntentHash:
			sigs.CanonicalIntentHash = item.Hash
		case models.LeafTypeRawSettlementFile:
			sigs.RawSettlementHash = item.Hash
		case models.LeafTypeCanonicalSettlementObservation:
			sigs.CanonicalSettlementHash = item.Hash
		case models.LeafTypeAttachmentDecision:
			sigs.AttachmentDecisionHash = item.Hash
		case models.LeafTypeGovernanceDecision:
			sigs.GovernanceDecisionHash = item.Hash
		case models.LeafTypeEnvelopeHash:
			sigs.EnvelopeHash = item.Hash
		case models.LeafTypeFinalEvidenceView:
			sigs.FinalEvidenceViewHash = item.Hash
		}
	}
	return sigs
}

// BuildEnrichedPack wraps an existing EvidencePack with the spec §4 enrichment layer.
// Service2 and Service5 lineage signals are populated directly from the pack fields
// that were carried end-to-end from RelayEvent → PendingLeafCandidate → EvidencePack.
func BuildEnrichedPack(pack *models.EvidencePack) *models.EnrichedEvidencePack {
	comp := deriveComponents(pack)
	sealExists := pack.PackStatus != ""
	score := ComputeProofScore(comp, sealExists)
	status := DeriveProofStatus(comp, sealExists, pack.PackStatus == "SUPERSEDED", false)

	enriched := &models.EnrichedEvidencePack{
		EvidencePack:            *pack,
		ProofStatus:             status,
		ProofScore:              score.Score,
		ProofScoreBreakdown:     score,
		GeneratedBy:             "system",
		VerificationStatus:      false, // updated by verify endpoint
		ProofComponents:         comp,
		CryptographicSignatures: enrichPackSigs(pack),
	}

	return enriched
}

// RecomputeMerkleRoot deterministically re-derives the Merkle root from stored
// items exactly as GeneratePack does. Used by the verify endpoint.
func RecomputeMerkleRoot(pack *models.EvidencePack) string {
	leaves := make([]utils.MerkleLeaf, 0, len(pack.Items))
	for i, item := range pack.Items {
		leafInput := item.Type + "||" + item.Ref + "||" + item.Hash + "||" + item.SchemaVersion
		leafHash := utils.SHA256Hex(leafInput)
		leaves = append(leaves, utils.MerkleLeaf{Index: i, LeafHash: leafHash})
	}
	return utils.BuildMerkleRoot(leaves)
}

func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

func csvEscape(s string) string {
	if strings.ContainsAny(s, ",\"\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}
