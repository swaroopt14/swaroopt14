package services

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
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
	model     string
	retriever EvidenceRetriever
	llm       *LLMService
	defaultK  int
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
func NewDefaultRAGService(model string, defaultK int, retriever EvidenceRetriever, llm *LLMService) *DefaultRAGService {

	return &DefaultRAGService{
		model:     model,
		defaultK:  defaultK,
		retriever: retriever,
		llm:       llm,
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
		viz, vizNarrative = s.buildDetailedVisualizationFromChunks(chunks, req, scope, kind, conf)
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
func (s *DefaultRAGService) buildDetailedVisualizationFromChunks(
	chunks []model.RetrievedChunk,
	req dto.QueryRequest,
	scope utils.QueryScope,
	kind vizKind,
	confidence string,
) (*dto.Visualization, string) {
	statusCounts := map[string]float64{}
	sourceCounts := map[string]float64{}

	for _, c := range chunks {
		src := sourceGroup(c.SourceType)
		if src != "" {
			sourceCounts[strings.Title(src)]++
		}
		status := extractStatusToken(c.Text)
		if status != "" {
			statusCounts[status]++
		}
	}

	series := make([]dto.VisualizationPoint, 0)
	title := "Operational Distribution"
	subtitle := "Tenant-scoped operational status from current evidence"
	description := "This view summarizes operational patterns for the selected tenant in business-friendly terms."
	xAxis := "Category"
	yAxis := "Count"
	legend := []string{"Higher bars indicate more observed events in current evidence."}

	switch kind {
	case vizTopFailures:
		title = "Top Failure Categories"
		subtitle = "Most frequent failure-type observations for this tenant"
		description = "This chart highlights where operational issues are concentrating, so teams can prioritize impact."
		xAxis = "Failure Category"
		for k, v := range statusCounts {
			if strings.Contains(strings.ToUpper(k), "FAIL") || strings.Contains(strings.ToUpper(k), "ERROR") {
				series = append(series, dto.VisualizationPoint{Label: utils.SanitizeAnswerText(k), Value: v})
			}
		}
		if len(series) == 0 {
			for k, v := range statusCounts {
				series = append(series, dto.VisualizationPoint{Label: utils.SanitizeAnswerText(k), Value: v})
			}
		}
	case vizSLABreach:
		title = "SLA Breach Risk Snapshot"
		subtitle = "Observed delayed/breached patterns in current tenant evidence"
		description = "This chart gives a business view of likely SLA pressure based on recent processing outcomes."
		xAxis = "SLA State"
		breached := 0.0
		onTime := 0.0
		for k, v := range statusCounts {
			up := strings.ToUpper(k)
			if strings.Contains(up, "FAIL") || strings.Contains(up, "DELAY") || strings.Contains(up, "BREACH") {
				breached += v
			} else {
				onTime += v
			}
		}
		series = append(series, dto.VisualizationPoint{Label: "Breach/Delayed", Value: breached})
		series = append(series, dto.VisualizationPoint{Label: "On Track", Value: onTime})
	case vizApprovalMix:
		title = "Pending Approval Mix"
		subtitle = "Severity-like distribution inferred from current action/evidence context"
		description = "This chart shows relative concentration of pending work to support prioritization."
		xAxis = "Priority Bucket"
		high := 0.0
		medium := 0.0
		low := 0.0
		for k, v := range statusCounts {
			up := strings.ToUpper(k)
			switch {
			case strings.Contains(up, "HIGH"):
				high += v
			case strings.Contains(up, "MEDIUM"):
				medium += v
			default:
				low += v
			}
		}
		series = append(series, dto.VisualizationPoint{Label: "High", Value: high})
		series = append(series, dto.VisualizationPoint{Label: "Medium", Value: medium})
		series = append(series, dto.VisualizationPoint{Label: "Low", Value: low})
	default:
		title = "Source-Wise Evidence Coverage"
		subtitle = "How evidence is distributed across operational domains"
		description = "This chart explains where the current answer evidence is coming from."
		xAxis = "Operational Domain"
		for k, v := range sourceCounts {
			series = append(series, dto.VisualizationPoint{Label: utils.SanitizeAnswerText(k), Value: v})
		}
	}

	if len(series) == 0 {
		return &dto.Visualization{
			VisualizationID:   "viz-" + strings.ToLower(string(kind)),
			ChartType:         "bar",
			Title:             title,
			Subtitle:          subtitle,
			Description:       description,
			XAxis:             xAxis,
			YAxis:             yAxis,
			Series:            []dto.VisualizationPoint{},
			Legend:            legend,
			Insights:          []string{"No sufficient tenant-scoped data was found for a reliable visualization."},
			SummaryMetrics:    []dto.VisualizationMetric{{Key: "Tenant", Value: utils.SanitizeAnswerText(req.TenantID)}, {Key: "Data points", Value: "0"}},
			TimeWindow:        buildVisualizationWindow(scope),
			Confidence:        "low",
			EmptyStateMessage: "No sufficient tenant-scoped data is available for visualization right now.",
		}, "I could not find enough tenant-scoped data to render a detailed visualization right now."
	}

	sort.Slice(series, func(i, j int) bool { return series[i].Value > series[j].Value })

	total := 0.0
	for _, p := range series {
		total += p.Value
	}
	topLabel := series[0].Label
	topValue := series[0].Value

	insight := fmt.Sprintf("The highest concentration is in %s with %.0f observations.", topLabel, topValue)
	insight = utils.SanitizeAnswerText(insight)

	metrics := []dto.VisualizationMetric{
		{Key: "Tenant", Value: utils.SanitizeAnswerText(req.TenantID)},
		{Key: "Data points", Value: fmt.Sprintf("%.0f", total)},
		{Key: "Top category", Value: utils.SanitizeAnswerText(topLabel)},
	}

	return &dto.Visualization{
		VisualizationID: "viz-" + strings.ToLower(string(kind)),
		ChartType:       "bar",
		Title:           title,
		Subtitle:        subtitle,
		Description:     utils.SanitizeAnswerText(description),
		XAxis:           xAxis,
		YAxis:           yAxis,
		Series:          sanitizeVisualizationSeries(series),
		Legend:          sanitizeStringList(legend),
		Insights:        sanitizeStringList([]string{insight}),
		SummaryMetrics:  sanitizeMetrics(metrics),
		TimeWindow:      buildVisualizationWindow(scope),
		Confidence:      confidence,
	}, insight
}

func extractStatusToken(text string) string {
	up := strings.ToUpper(text)
	switch {
	case strings.Contains(up, "STATUS=FAILED"), strings.Contains(up, "STATUS=FAIL"), strings.Contains(up, "ERROR"):
		return "FAILED"
	case strings.Contains(up, "STATUS=PENDING"), strings.Contains(up, "PENDING"):
		return "PENDING"
	case strings.Contains(up, "STATUS=SUCCESS"), strings.Contains(up, "SUCCESS"):
		return "SUCCESS"
	case strings.Contains(up, "RETRY"):
		return "RETRY"
	default:
		return ""
	}
}

func sanitizeVisualizationSeries(in []dto.VisualizationPoint) []dto.VisualizationPoint {
	out := make([]dto.VisualizationPoint, 0, len(in))
	for _, p := range in {
		label := utils.SanitizeAnswerText(p.Label)
		if strings.TrimSpace(label) == "" || uuidLeakRe.MatchString(label) {
			continue
		}
		out = append(out, dto.VisualizationPoint{Label: label, Value: p.Value})
	}
	return out
}

func sanitizeStringList(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		v := utils.SanitizeAnswerText(s)
		if strings.TrimSpace(v) != "" && !uuidLeakRe.MatchString(v) {
			out = append(out, v)
		}
	}
	return out
}

func sanitizeMetrics(in []dto.VisualizationMetric) []dto.VisualizationMetric {
	out := make([]dto.VisualizationMetric, 0, len(in))
	for _, m := range in {
		k := utils.SanitizeAnswerText(m.Key)
		v := utils.SanitizeAnswerText(m.Value)
		if strings.TrimSpace(k) == "" || strings.TrimSpace(v) == "" {
			continue
		}
		if uuidLeakRe.MatchString(k) || uuidLeakRe.MatchString(v) {
			continue
		}
		out = append(out, dto.VisualizationMetric{Key: k, Value: v})
	}
	return out
}

func buildVisualizationWindow(scope utils.QueryScope) *dto.VisualizationWindow {
	if !scope.HasExplicitTime {
		if strings.TrimSpace(scope.TimePhrase) == "" {
			return nil
		}
		return &dto.VisualizationWindow{Label: scope.TimePhrase}
	}
	return &dto.VisualizationWindow{
		FromUTC: scope.StartUTC.UTC().Format(time.RFC3339),
		ToUTC:   scope.EndUTC.UTC().Format(time.RFC3339),
		Label:   scope.TimePhrase,
	}
}
