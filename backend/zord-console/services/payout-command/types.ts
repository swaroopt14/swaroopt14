// Shared types for the payout command view — conversation, AI responses, and
// prompt-layer API shapes. Kept separate from model.ts (simulation data) so
// each file has a single clear responsibility.

export type WorkspaceLoadingPhase =
  | 'understanding'
  | 'fetching'
  | 'listing'
  | 'checking'
  | 'summarizing'

export type WorkspaceConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  body: string
  timestamp: string
  status: 'typing' | 'done' | 'error'
  loadingPhase?: WorkspaceLoadingPhase | null
  confidence?: string | null
  citationSnippet?: string | null
  citations?: PromptLayerCitation[]
  hasVisualization?: boolean
}

export type WorkspaceChatThread = {
  id: string
  tab: string
  title: string
  createdAt: string
  updatedAt: string
  messages: WorkspaceConversationMessage[]
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
  visualization: unknown
}

export type AskZordResponse = {
  title: string
  body: string
}
