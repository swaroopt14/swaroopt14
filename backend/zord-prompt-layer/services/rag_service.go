package services

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
	"zord-prompt-layer/client"
	"zord-prompt-layer/dto"
	"zord-prompt-layer/model"
	"zord-prompt-layer/utils"
)

type RAGService interface {
	Query(req dto.QueryRequest) (dto.QueryResponse, error)
}

var sensitiveQueryRe = regexp.MustCompile(`(?i)\b(tenant[_\s]?id|intent[_\s]?id|trace[_\s]?id|envelope[_\s]?id|idempotency[_\s]?key|account[_\s]?(id|number)|iban|ifsc|swift|pan|api[_\s-]?key|token|secret|password)\b`)

type DefaultRAGService struct {
	model        string
	retriever    EvidenceRetriever
	llm          *LLMService
	defaultK     int
	intelligence *client.IntelligenceClient
}

func NewDefaultRAGService(model string, defaultK int, retriever EvidenceRetriever, llm *LLMService, intelligence *client.IntelligenceClient) *DefaultRAGService {

	return &DefaultRAGService{
		model:        model,
		defaultK:     defaultK,
		retriever:    retriever,
		llm:          llm,
		intelligence: intelligence,
	}
}

func (s *DefaultRAGService) Query(req dto.QueryRequest) (dto.QueryResponse, error) {
	topK := req.TopK
	if topK <= 0 {
		topK = s.defaultK
	}
	if sensitiveQueryRe.MatchString(req.Query) {
		return dto.QueryResponse{
			Answer:        "I can’t provide sensitive identifiers or secret fields. I can help with non-sensitive operational status and trends.",
			Confidence:    "low",
			EntitiesFound: dto.EntitiesFound{},
			Citations:     []dto.Citation{},
			NextActions:   []string{},
		}, nil
	}

	intentID := req.IntentID
	traceID := req.TraceID
	if intentID == "" {
		intentID = utils.ExtractIntentID(req.Query)
	}
	if traceID == "" {
		traceID = utils.ExtractTraceID(req.Query)
	}
	rawScope, err := s.llm.ExtractQueryScope(req.Query)
	if err != nil {
		rawScope = utils.QueryScope{}
	}

	// Use heuristic only when LLM did not provide explicit time window AND no phrase.
	if !rawScope.HasExplicitTime && strings.TrimSpace(rawScope.TimePhrase) == "" {
		rawScope.TimePhrase = utils.ExtractTimePhraseHeuristic(req.Query)
	}

	scope := utils.NormalizeScope(rawScope, time.Now(), time.Local)

	chunks, err := s.retriever.Retrieve(req, intentID, traceID, topK, scope)
	if err != nil {
		return dto.QueryResponse{}, fmt.Errorf("retrieval failed: %w", err)
	}

	// Retry once with heuristic scope only when LLM explicit scope produced no evidence.
	if len(chunks) == 0 && rawScope.HasExplicitTime {
		fallbackRaw := rawScope
		fallbackRaw.HasExplicitTime = false
		fallbackRaw.StartUTC = time.Time{}
		fallbackRaw.EndUTC = time.Time{}
		fallbackRaw.TimePhrase = utils.ExtractTimePhraseHeuristic(req.Query)

		if strings.TrimSpace(fallbackRaw.TimePhrase) != "" {
			fallbackScope := utils.NormalizeScope(fallbackRaw, time.Now(), time.Local)
			if fallbackScope.HasExplicitTime {
				retryChunks, retryErr := s.retriever.Retrieve(req, intentID, traceID, topK, fallbackScope)
				if retryErr == nil && len(retryChunks) > 0 {
					chunks = retryChunks
					scope = fallbackScope
				}
			}
		}
	}

	entities := dto.EntitiesFound{}
	citations := toCitations(chunks)
	citations = utils.SanitizeCitations(citations)
	conf := "medium"
	confScore := 0.5

	nextActions := []string{}
	if s.intelligence != nil {
		if na, err := s.intelligence.FetchNextActions(req.TenantID, 3); err == nil {
			nextActions = na
		}
	}

	nextActions = utils.SanitizeActions(nextActions)

	if len(chunks) == 0 {
		return dto.QueryResponse{
			Answer:        "I could not find reliable evidence for this query in the current data window.",
			Confidence:    "low",
			EntitiesFound: entities,
			Citations:     []dto.Citation{},
			NextActions:   nextActions,
		}, nil
	}

	context := buildContext(chunks)
	llmOut, err := s.llm.GenerateFromContextScopedWithConfidence(req.Query, context, scope.WantsVisualization)
	if err != nil {
		return dto.QueryResponse{}, fmt.Errorf("generation failed: %w", err)
	}

	answer := utils.SanitizeAnswerText(llmOut.Answer)
	answer = utils.StripActionLikeSections(answer)

	conf, confScore = calibrateConfidence(llmOut, chunks)
	rounded := round2(confScore)
	for i := range citations {
		citations[i].Score = rounded
	}

	return dto.QueryResponse{
		Answer:        answer,
		Confidence:    conf,
		EntitiesFound: entities,
		Citations:     citations,
		NextActions:   nextActions,
	}, nil

}

func buildContext(chunks []model.RetrievedChunk) string {
	var b strings.Builder
	for i, c := range chunks {
		b.WriteString(fmt.Sprintf("[%d] source=%s record=%s score=%.4f\n%s\n\n", i+1, c.SourceType, c.RecordID, c.Score, c.Text))
	}
	return b.String()
}

func toCitations(chunks []model.RetrievedChunk) []dto.Citation {
	out := make([]dto.Citation, 0, len(chunks))
	for _, c := range chunks {
		out = append(out, dto.Citation{
			SourceType: c.SourceType,
			RecordID:   c.RecordID,
			ChunkID:    c.ChunkID,
			Snippet:    c.Text,
			Score:      c.Score,
		})
	}

	return out
}
func calibrateConfidence(out AnswerWithConfidence, chunks []model.RetrievedChunk) (string, float64) {
	// Retrieval-backed factors
	evidenceCountFactor := clampByCount(len(chunks), 3) // full score at >=3 chunks
	sourceDiversityFactor := sourceDiversity(chunks)    // 0..1

	// LLM signals (already clamped in llm_service)
	base := 0.45*out.ConfidenceScore +
		0.20*out.EvidenceCoverage +
		0.20*out.ScopeAdherence +
		0.10*(1.0-out.ContradictionRisk) +
		0.05*(1.0-out.Ambiguity)

	// Mild objective calibration so score isn't purely self-reported by LLM
	calibrated := base * (0.80 + 0.20*evidenceCountFactor)
	calibrated = calibrated * (0.85 + 0.15*sourceDiversityFactor)
	calibrated = clamp01(calibrated)

	return confidenceLabel(calibrated), calibrated
}

func confidenceLabel(score float64) string {
	if score >= 0.75 {
		return "high"
	}
	if score >= 0.45 {
		return "medium"
	}
	return "low"
}

func clampByCount(n, fullAt int) float64 {
	if fullAt <= 0 {
		return 1
	}
	v := float64(n) / float64(fullAt)
	if v > 1 {
		return 1
	}
	if v < 0 {
		return 0
	}
	return v
}

func sourceDiversity(chunks []model.RetrievedChunk) float64 {
	if len(chunks) == 0 {
		return 0
	}
	seen := map[string]struct{}{}
	for _, c := range chunks {
		if strings.TrimSpace(c.SourceType) != "" {
			seen[c.SourceType] = struct{}{}
		}
	}
	// 3 distinct sources (edge/intent/relay) treated as full diversity
	v := float64(len(seen)) / 3.0
	if v > 1 {
		return 1
	}
	if v < 0 {
		return 0
	}
	return v
}
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
