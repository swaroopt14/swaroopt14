package services

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"zord-prompt-layer/client"
	"zord-prompt-layer/utils"
)

type LLMService struct {
	gemini *client.GeminiClient
}

func NewLLMService(g *client.GeminiClient) *LLMService {
	return &LLMService{gemini: g}
}

func (s *LLMService) ExtractQueryScope(userQuery string) (utils.QueryScope, error) {
	nowUTC := time.Now().UTC().Format(time.RFC3339)

	prompt :=
		"You are an extraction engine. Return strict JSON only.\n" +
			"Schema:\n" +
			"{\"wants_visualization\": boolean, \"time_phrase\": string, \"start_utc\": string, \"end_utc\": string}\n" +
			"Reference:\n" +
			fmt.Sprintf("- now_utc: %s\n", nowUTC) +
			"- Interpret relative time words (today/yesterday/this month/etc.) from current runtime.\n" +

			"Rules:\n" +
			"- wants_visualization=true only if user explicitly asks for chart/graph/trend/visualization.\n" +
			"- If user asks a specific time scope, set start_utc and end_utc in RFC3339 UTC format.\n" +
			"- Use half-open window: [start_utc, end_utc).\n" +
			"- If no explicit time scope, keep start_utc and end_utc empty.\n" +
			"- time_phrase can be short hint text (or empty).\n" +
			"- Do not include extra keys.\n\n" +
			"USER QUERY:\n" + userQuery

	raw, err := s.gemini.Generate(prompt)
	if err != nil {
		return utils.QueryScope{}, err
	}

	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var out struct {
		WantsVisualization bool   `json:"wants_visualization"`
		TimePhrase         string `json:"time_phrase"`
		StartUTC           string `json:"start_utc"`
		EndUTC             string `json:"end_utc"`
	}
	if err := json.Unmarshal([]byte(clean), &out); err != nil {
		return utils.QueryScope{}, nil
	}

	scope := utils.QueryScope{
		WantsVisualization: out.WantsVisualization,
		TimePhrase:         out.TimePhrase,
	}

	// Guardrail parse: only accept valid RFC3339 UTC window
	if strings.TrimSpace(out.StartUTC) != "" && strings.TrimSpace(out.EndUTC) != "" {
		start, err1 := time.Parse(time.RFC3339, strings.TrimSpace(out.StartUTC))
		end, err2 := time.Parse(time.RFC3339, strings.TrimSpace(out.EndUTC))
		if err1 == nil && err2 == nil && end.After(start) {
			scope.HasExplicitTime = true
			scope.StartUTC = start.UTC()
			scope.EndUTC = end.UTC()
		}
	}

	return scope, nil
}

func (s *LLMService) GenerateFromContextScoped(userQuery string, context string, wantsVisualization bool) (string, error) {
	visRule := "Do not include visualization section."
	if wantsVisualization {
		visRule = "Include a small visualization-ready section (text summary only)."
	}

	prompt :=
		"You are Zord Prompt Layer assistant.\n" +
			"Rules:\n" +
			"1) Use only CONTEXT. Do not infer facts that are not present in CONTEXT.\n" +
			"2) If CONTEXT is insufficient, clearly say: \"I don't have enough information in current data to answer that confidently.\"\n" +
			"3) Use plain, simple language that anyone can understand, even without technical or finance background.\n" +
			"4) Talk like a helpful teammate or friend, not like a system log.\n" +
			"5) Translate technical states into everyday language. Examples: pending/queued/received -> in process, success/completed/canonicalized -> done, failed/rejected/dlq -> did not go through.\n" +
			"6) Never say words like context, evidence, tenant-scoped, idempotency, envelope, trace, schema, outbox, projection, canonicalized, or dlq in the final answer.\n" +
			"7) If the records only show upload or intake progress, say that the payments were received or uploaded, but final payout progress is not visible yet.\n" +
			"8) Answer only what is asked. Keep it short, direct, and to the point.\n" +
			"9) The answer must be clean markdown, not plain prose.\n" +
			"10) Preferred structure:\n" +
			"   - Start with a bold one-line takeaway.\n" +
			"   - Follow with 2 to 5 short bullet points.\n" +
			"   - Add a tiny markdown table only when comparing values helps.\n" +
			"11) Avoid long, monotonous paragraphs. Prefer short sections and crisp lines.\n" +
			"12) Keep paragraphs to at most 2 sentences.\n" +
			"13) Do not use jargon like SQL or infrastructure internals.\n" +
			"14) Do not mention table names, schema names, SQL, pipelines, or infrastructure internals.\n" +
			"15) Never reveal identifiers or sensitive fields (tenant_id, intent_id, trace_id, envelope_id, outbox_id, idempotency_key, account_number, iban, ifsc, swift, pan, api keys, tokens, secrets).\n" +
			"16) Do NOT include recommendations, action items, or mitigation steps in answer text.\n" +

			"17) " + visRule + "\n\n" +
			"CONTEXT:\n" + context + "\n\n" +
			"USER QUERY:\n" + userQuery + "\n\n" +
			"Return a concise, well-structured markdown answer."

	return s.gemini.Generate(prompt)
}

type AnswerWithConfidence struct {
	Answer            string  `json:"answer"`
	Confidence        string  `json:"confidence"`         // high|medium|low
	ConfidenceScore   float64 `json:"confidence_score"`   // 0.0 - 1.0 (LLM raw)
	EvidenceCoverage  float64 `json:"evidence_coverage"`  // 0.0 - 1.0
	ScopeAdherence    float64 `json:"scope_adherence"`    // 0.0 - 1.0
	ContradictionRisk float64 `json:"contradiction_risk"` // 0.0 - 1.0
	Ambiguity         float64 `json:"ambiguity"`          // 0.0 - 1.0
}

type QueryClassDecision struct {
	Class              string  `json:"class"` // operational_data_query | general_product_or_greeting | out_of_scope
	Confidence         float64 `json:"confidence"`
	NeedsCitation      bool    `json:"needs_citation"`
	NeedsVisualization bool    `json:"needs_visualization"`
}

func (s *LLMService) GenerateFromContextScopedWithConfidence(userQuery string, context string, wantsVisualization bool) (AnswerWithConfidence, error) {
	visRule := "Do not include visualization section."
	if wantsVisualization {
		visRule = "Include a small visualization-ready section (text summary only)."
	}

	prompt :=
		"You are Zord Prompt Layer assistant.\n" +
			"Rules:\n" +
			"1) Use only CONTEXT. Do not infer facts that are not present in CONTEXT.\n" +
			"2) If CONTEXT is insufficient, clearly say what is missing in plain language.\n" +
			"3) Use plain, simple language suitable for any user, even without a finance or technical background.\n" +
			"4) Talk like a helpful teammate or friend, not like a system log.\n" +
			"5) Translate technical states into everyday language. Examples: pending/queued/received -> in process, success/completed/canonicalized -> done, failed/rejected/dlq -> did not go through.\n" +
			"6) Never say words like context, evidence, tenant-scoped, idempotency, envelope, trace, schema, outbox, projection, canonicalized, or dlq in the answer field.\n" +
			"7) If the records only show upload or intake progress, say that the payments were received or uploaded, but final payout progress is not visible yet.\n" +
			"8) Answer only what is asked. Keep it short, direct, and to the point.\n" +
			"9) The answer field must contain clean markdown, not plain prose.\n" +
			"10) Preferred structure inside answer:\n" +
			"   - Start with a bold one-line takeaway.\n" +
			"   - Follow with 2 to 5 short bullet points.\n" +
			"   - Add a tiny markdown table only when comparing values helps.\n" +
			"11) Avoid long, monotonous paragraphs. Use short sections and crisp lines.\n" +
			"12) Keep paragraphs to at most 2 sentences.\n" +
			"13) Do not use jargon like SQL or infrastructure internals.\n" +
			"14) Do not mention table names, schema names, SQL, pipelines, or infrastructure internals.\n" +
			"15) Never reveal identifiers or sensitive fields (tenant_id, intent_id, trace_id, envelope_id, outbox_id, idempotency_key, account_number, iban, ifsc, swift, pan, hashes, signatures, encrypted fields, api keys, tokens, secrets).\n" +
			"16) Do NOT include recommendations, action items, or mitigation steps in answer text.\n" +
			"17) " + visRule + "\n" +
			"18) Return strict JSON only with keys: answer, confidence, confidence_score, evidence_coverage, scope_adherence, contradiction_risk, ambiguity.\n" +
			"19) The answer field should contain markdown-formatted text only.\n" +
			"20) confidence must be one of high|medium|low.\n" +
			"21) All numeric scores must be between 0 and 1.\n" +
			"22) confidence_score must reflect reliability based only on provided context.\n\n" +
			"CONTEXT:\n" + context + "\n\n" +
			"USER QUERY:\n" + userQuery + "\n\n" +
			"Return strict JSON with the answer field in markdown format."

	raw, err := s.gemini.Generate(prompt)
	if err != nil {
		return AnswerWithConfidence{}, err
	}

	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var out AnswerWithConfidence
	if err := json.Unmarshal([]byte(clean), &out); err != nil {
		return AnswerWithConfidence{}, err
	}
	out.ConfidenceScore = clamp01(out.ConfidenceScore)
	out.EvidenceCoverage = clamp01(out.EvidenceCoverage)
	out.ScopeAdherence = clamp01(out.ScopeAdherence)
	out.ContradictionRisk = clamp01(out.ContradictionRisk)
	out.Ambiguity = clamp01(out.Ambiguity)

	if out.Confidence != "high" && out.Confidence != "medium" && out.Confidence != "low" {
		out.Confidence = "medium"
	}

	return out, nil
}
func (s *LLMService) ClassifyQueryIntent(userQuery string) (QueryClassDecision, error) {
	prompt := "You are a strict classifier for Zord prompt-layer.\n" +
		"Return JSON only with keys: class, confidence, needs_citation, needs_visualization.\n" +
		"Allowed class values: operational_data_query, general_product_or_greeting, out_of_scope.\n" +
		"Rules:\n" +
		"- operational_data_query: asks about tenant operations, intents, failures, retries, SLA, payouts, status, trends.\n" +
		"- general_product_or_greeting: greetings, basic product questions like what is zord/how it works.\n" +
		"- out_of_scope: unrelated personal/general chatter not relevant to project context.\n" +
		"- confidence must be 0..1.\n" +
		"- needs_citation true only for operational_data_query.\n" +
		"- needs_visualization true only if user explicitly asks chart/graph/trend/visualization and class is operational_data_query.\n\n" +
		"USER QUERY:\n" + userQuery

	raw, err := s.gemini.Generate(prompt)
	if err != nil {
		return QueryClassDecision{}, err
	}

	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var out QueryClassDecision
	if err := json.Unmarshal([]byte(clean), &out); err != nil {
		return QueryClassDecision{}, err
	}

	out.Confidence = clamp01(out.Confidence)
	switch out.Class {
	case "operational_data_query", "general_product_or_greeting", "out_of_scope":
	default:
		out.Class = "general_product_or_greeting"
	}
	return out, nil
}
func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
