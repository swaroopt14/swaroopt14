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

	prompt := "" +
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

	prompt := "" +
		"You are Zord Prompt Layer assistant.\n" +
		"Rules:\n" +
		"1) Use only CONTEXT. Do not infer facts that are not present in CONTEXT.\n" +
		"2) If CONTEXT is insufficient, clearly say: \"I don't have enough information in current data to answer that confidently.\"\n" +
		"3) Write in plain, simple, non-technical language for business users.\n" +
		"4) Do not mention table names, schema names, SQL, pipelines, or infrastructure internals.\n" +
		"5) Never reveal identifiers or sensitive fields (tenant_id, intent_id, trace_id, envelope_id, outbox_id, idempotency_key, account_number, iban, ifsc, swift, pan, api keys, tokens, secrets).\n" +
		"6) Do NOT include recommendations, action items, or mitigation steps in answer text.\n" +

		"7) " + visRule + "\n\n" +
		"CONTEXT:\n" + context + "\n\n" +
		"USER QUERY:\n" + userQuery + "\n\n" +
		"Return concise operational answer."

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

func (s *LLMService) GenerateFromContextScopedWithConfidence(userQuery string, context string, wantsVisualization bool) (AnswerWithConfidence, error) {
	visRule := "Do not include visualization section."
	if wantsVisualization {
		visRule = "Include a small visualization-ready section (text summary only)."
	}

	prompt := "" +
		"You are Zord Prompt Layer assistant.\n" +
		"Rules:\n" +
		"1) Use only CONTEXT. Do not infer facts that are not present in CONTEXT.\n" +
		"2) If CONTEXT is insufficient, clearly say: \"I don't have enough information in current data to answer that confidently.\"\n" +
		"3) Write in plain, simple, non-technical language for business users.\n" +
		"4) Do not mention table names, schema names, SQL, pipelines, or infrastructure internals.\n" +
		"5) Never reveal identifiers or sensitive fields (tenant_id, intent_id, trace_id, envelope_id, outbox_id, idempotency_key, account_number, iban, ifsc, swift, pan, api keys, tokens, secrets).\n" +
		"6) Do NOT include recommendations, action items, or mitigation steps in answer text.\n" +
		"7) " + visRule + "\n" +
		"8) Return strict JSON only with keys: answer, confidence, confidence_score, evidence_coverage, scope_adherence, contradiction_risk, ambiguity.\n" +
		"9) confidence must be one of high|medium|low.\n" +
		"10) All numeric scores must be between 0 and 1.\n" +
		"11) confidence_score must reflect how reliable the answer is based only on the provided context.\n\n" +

		"CONTEXT:\n" + context + "\n\n" +
		"USER QUERY:\n" + userQuery

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
func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
