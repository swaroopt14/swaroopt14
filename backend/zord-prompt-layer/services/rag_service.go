package services

import (
	"fmt"
	"math"
	"regexp"
	"sort"
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

var uuidLeakRe = regexp.MustCompile(`(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`)

var sensitiveExtractionRe = regexp.MustCompile(`(?i)\b(api[_\s-]?key|password|secret|access[_\s-]?token|private[_\s-]?key)\b`)
var corridorIDRe = regexp.MustCompile(`(?i)\bcorridor[_\s-]?id\s*[:=]?\s*([A-Za-z0-9._-]+)\b`)

type DefaultRAGService struct {
	model        string
	retriever    EvidenceRetriever
	llm          *LLMService
	defaultK     int
	intelligence *client.IntelligenceClient
}
type vizKind string

const (
	vizCorridorHealth vizKind = "corridor_health"
	vizTopFailures    vizKind = "top_failures"
	vizSLABreach      vizKind = "sla_breach"
	vizApprovalMix    vizKind = "approval_mix"
)

func detectVizKind(q string) vizKind {
	s := strings.ToLower(q)
	switch {
	case strings.Contains(s, "failure") || strings.Contains(s, "error"):
		return vizTopFailures
	case strings.Contains(s, "sla") || strings.Contains(s, "breach"):
		return vizSLABreach
	case strings.Contains(s, "approval") || strings.Contains(s, "severity") || strings.Contains(s, "pending action"):
		return vizApprovalMix
	default:
		return vizCorridorHealth
	}
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
	if sensitiveExtractionRe.MatchString(req.Query) {
		return dto.QueryResponse{
			Answer:        "I cannot provide secrets or credential material. I can still help with safe operational status and trends.",
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
	if uuidLeakRe.MatchString(answer) || strings.TrimSpace(answer) == "" {

		return dto.QueryResponse{
			Answer:        "I can share a safe operational summary, but I cannot expose sensitive identifiers or secure values.",
			Confidence:    "low",
			EntitiesFound: dto.EntitiesFound{},
			Citations:     []dto.Citation{},
			NextActions:   []string{},
		}, nil
	}

	conf, confScore = calibrateConfidence(llmOut, chunks)
	rounded := round2(confScore)
	for i := range citations {
		citations[i].Score = rounded
	}
	var viz *dto.Visualization
	if scope.WantsVisualization {
		kind := detectVizKind(req.Query)
		var vizNarrative string
		viz, vizNarrative = s.buildDetailedVisualizationFromIntelligence(req, kind)
		if strings.TrimSpace(vizNarrative) != "" {
			answer = strings.TrimSpace(answer + " " + vizNarrative)
		}
	}

	return dto.QueryResponse{
		Answer:        answer,
		Confidence:    conf,
		EntitiesFound: entities,
		Citations:     citations,
		NextActions:   nextActions,
		Visualization: viz,
	}, nil

}

func buildContext(chunks []model.RetrievedChunk) string {
	var b strings.Builder
	for i, c := range chunks {
		b.WriteString(fmt.Sprintf("[%d] source=%s score=%.4f\n%s\n\n", i+1, c.SourceType, c.Score, c.Text))
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
		group := sourceGroup(c.SourceType)
		if group != "" {
			seen[group] = struct{}{}
		}
	}
	v := float64(len(seen)) / 5.0 // edge, intent, relay, intelligence, evidence
	if v > 1 {
		return 1
	}
	if v < 0 {
		return 0
	}
	return v
}

func sourceGroup(sourceType string) string {
	s := strings.ToLower(strings.TrimSpace(sourceType))
	switch {
	case strings.HasPrefix(s, "edge_"):
		return "edge"
	case strings.HasPrefix(s, "intent_"):
		return "intent"
	case strings.HasPrefix(s, "relay_"):
		return "relay"
	case strings.HasPrefix(s, "intelligence_"):
		return "intelligence"
	case strings.HasPrefix(s, "evidence_"):
		return "evidence"
	default:
		return ""
	}
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func extractCorridorID(q string) string {
	m := corridorIDRe.FindStringSubmatch(q)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}
func (s *DefaultRAGService) buildDetailedVisualizationFromIntelligence(req dto.QueryRequest, kind vizKind) (*dto.Visualization, string) {
	if s.intelligence == nil || strings.TrimSpace(req.TenantID) == "" {
		return nil, ""
	}
	corridorID := extractCorridorID(req.Query)

	switch kind {
	case vizTopFailures:
		rows, err := s.intelligence.FetchTopFailures(req.TenantID, corridorID)
		if err != nil || len(rows) == 0 {
			return nil, "I could not find enough failure distribution data to render a chart right now."
		}
		series := make([]dto.VisualizationPoint, 0, len(rows))
		for _, r := range rows {
			label := utils.SanitizeAnswerText(r.ReasonCode)
			if strings.TrimSpace(label) == "" {
				continue
			}
			series = append(series, dto.VisualizationPoint{Label: label, Value: float64(r.Count)})
		}
		if len(series) == 0 {
			return nil, "I could not find enough failure distribution data to render a chart right now."
		}
		top := rows[0]
		insight := fmt.Sprintf("The largest failure contributor is %s with %d cases.", utils.SanitizeAnswerText(top.ReasonCode), top.Count)
		return &dto.Visualization{
			Title:    "Top Failure Reasons",
			XAxis:    "Reason",
			YAxis:    "Count",
			Series:   series,
			Subtitle: "Distribution of most frequent failure categories",
			Insights: []string{insight},
		}, insight

	case vizSLABreach:
		sla, err := s.intelligence.FetchSLABreach(req.TenantID)
		if err != nil || sla == nil || sla.TotalProcessed == 0 {
			return nil, "I could not find enough SLA breach data to render a chart right now."
		}
		series := []dto.VisualizationPoint{
			{Label: "Breached", Value: float64(sla.Breached)},
			{Label: "On Time", Value: float64(sla.OnTime)},
			{Label: "Breach Rate (%)", Value: round2(sla.BreachRate * 100)},
		}
		insight := fmt.Sprintf("SLA breach rate is %.2f%% across %d processed cases.", sla.BreachRate*100, sla.TotalProcessed)
		return &dto.Visualization{
			Title:    "SLA Breach Overview",
			XAxis:    "SLA Metric",
			YAxis:    "Count / Rate",
			Series:   series,
			Subtitle: "Current SLA breach distribution for the tenant",
			Insights: []string{insight},
		}, insight

	case vizApprovalMix:
		summary, err := s.intelligence.FetchPendingApprovalSummary(req.TenantID)
		if err != nil || summary == nil {
			return nil, "I could not find pending approval severity data to render a chart right now."
		}
		series := []dto.VisualizationPoint{
			{Label: "High", Value: float64(summary.HighSeverity)},
			{Label: "Medium", Value: float64(summary.MediumSeverity)},
			{Label: "Low", Value: float64(summary.LowSeverity)},
		}
		insight := fmt.Sprintf("There are %d pending approvals; %d are expiring within 1 hour.", summary.TotalPending, summary.ExpiringIn1h)
		return &dto.Visualization{
			Title:    "Pending Approval Severity Mix",
			XAxis:    "Severity",
			YAxis:    "Count",
			Series:   series,
			Subtitle: "Current pending approval workload by severity",
			Insights: []string{insight},
		}, insight

	default:
		rows, err := s.intelligence.FetchCorridorHealth(req.TenantID)
		if err != nil || len(rows) == 0 {
			return nil, "I could not find enough corridor health data to render a chart right now."
		}

		filtered := rows
		if strings.TrimSpace(corridorID) != "" {
			tmp := make([]client.CorridorHealthRow, 0, len(rows))
			for _, r := range rows {
				if strings.EqualFold(strings.TrimSpace(r.CorridorID), strings.TrimSpace(corridorID)) {
					tmp = append(tmp, r)
				}
			}
			if len(tmp) > 0 {
				filtered = tmp
			}
		}

		sort.Slice(filtered, func(i, j int) bool { return filtered[i].SuccessRate > filtered[j].SuccessRate })

		series := make([]dto.VisualizationPoint, 0, len(filtered))
		for _, r := range filtered {
			label := utils.SanitizeAnswerText(r.CorridorID)
			if strings.TrimSpace(label) == "" || uuidLeakRe.MatchString(label) {
				continue
			}
			series = append(series, dto.VisualizationPoint{
				Label: label,
				Value: round2(r.SuccessRate * 100),
			})
		}
		if len(series) == 0 {
			return nil, "I could not find enough corridor health data to render a chart right now."
		}

		worst := filtered[0]
		for _, r := range filtered {
			if r.SuccessRate < worst.SuccessRate {
				worst = r
			}
		}
		insight := fmt.Sprintf("Lowest corridor performance is %s at %.2f%% success.", utils.SanitizeAnswerText(worst.CorridorID), worst.SuccessRate*100)

		return &dto.Visualization{
			Title:    "Corridor Success Rate",
			XAxis:    "Corridor",
			YAxis:    "Success (%)",
			Series:   series,
			Subtitle: "Success-rate comparison across available corridors",
			Insights: []string{insight},
		}, insight
	}
}
