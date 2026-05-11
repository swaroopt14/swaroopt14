// Shared types for the payout command view — conversation, AI responses, and
// prompt-layer API shapes. Kept separate from model.ts (simulation data) so
// each file has a single clear responsibility.

export type WorkspaceConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  body: string
  timestamp: string
  status: 'typing' | 'done' | 'error'
  confidence?: string | null
  citationSnippet?: string | null
  hasVisualization?: boolean
  visualization?: PromptLayerVisualization | null
}

export type PromptLayerCitation = {
  source_type?: string
  record_id?: string
  chunk_id?: string
  snippet?: string
  score?: number
}

export type WorkspaceLiveAnswer = {
  title: string
  body: string
  confidence: string | null
  citations: PromptLayerCitation[]
  visualization: PromptLayerVisualization | null
}

export type AskZordResponse = {
  title: string
  body: string
  confidence?: string | null
  citationSnippet?: string | null
  visualization?: PromptLayerVisualization | null
}

export type PromptLayerTimelineVisualization = {
  type: 'timeline'
  series: Array<{
    t: string
    v: number
  }>
}

export type PromptLayerBarsVisualization = {
  type: 'bars' | 'bar'
  items: Array<{
    label: string
    value: number
  }>
}

export type PromptLayerCardsVisualization = {
  type: 'cards'
  cards: Array<{
    title: string
    value: string
  }>
}

export type PromptLayerVisualization =
  | PromptLayerTimelineVisualization
  | PromptLayerBarsVisualization
  | PromptLayerCardsVisualization
