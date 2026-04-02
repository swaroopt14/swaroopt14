package utils

import (
	"regexp"
	"strings"

	"zord-prompt-layer/dto"
)

var (
	uuidRe = regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`)

	// key=value or key: value
	keyValIDRe = regexp.MustCompile(`(?i)\b(intent_id|trace_id|tenant_id|envelope_id|contract_id|action_id|record_id|chunk_id|idempotency[_\s]?key|account(_id|_number)?)\b\s*[:=]\s*[^,\s]+`)

	// JSON style: "key":"value"
	jsonSensitivePairRe = regexp.MustCompile(`(?i)"(intent_id|trace_id|tenant_id|envelope_id|contract_id|action_id|record_id|chunk_id|idempotency_key|account_id|account_number|iban|ifsc|swift|pan|vault_object_ref)"\s*:\s*"[^"]*"`)

	// loose sensitive values
	sensitiveValRe = regexp.MustCompile(`(?i)\b(idempotency[_\s]?key|account(_id|_number)?|iban|ifsc|swift|pan|vault_object_ref)\b\s*[:=]?\s*[^,\n]*`)

	sensitiveWordRe = regexp.MustCompile(`(?i)\b(api[_-]?key|secret|password|token)\b`)
)

func SanitizeAnswerText(s string) string {
	out := uuidRe.ReplaceAllString(s, "[redacted-id]")
	out = keyValIDRe.ReplaceAllString(out, "")
	out = jsonSensitivePairRe.ReplaceAllString(out, "")
	out = sensitiveValRe.ReplaceAllString(out, "")
	out = sensitiveWordRe.ReplaceAllString(out, "[redacted-sensitive]")
	out = strings.Join(strings.Fields(out), " ")
	return strings.TrimSpace(out)
}

func SanitizeCitations(in []dto.Citation) []dto.Citation {
	out := make([]dto.Citation, 0, len(in))
	for _, c := range in {
		c.RecordID = ""
		c.ChunkID = ""
		c.Snippet = SanitizeAnswerText(c.Snippet)
		out = append(out, c)
	}
	return out
}

func SanitizeActions(in []string) []string {
	out := make([]string, 0, len(in))
	for _, a := range in {
		x := SanitizeAnswerText(a)
		if strings.TrimSpace(x) != "" {
			out = append(out, x)
		}
	}
	return out
}

var actionSectionRe = regexp.MustCompile(`(?is)(^|\n)#+\s*(recommended actions?|next actions?|action items?|what to do next)\b.*$`)

func StripActionLikeSections(s string) string {
	out := actionSectionRe.ReplaceAllString(s, "")
	return strings.TrimSpace(out)
}
