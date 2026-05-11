'use client'

import { useCallback, useRef, useState } from 'react'
import {
  resolvePromptScenario,
  workspacePromptCopy,
  workspaceSimulationScenarios,
  type HomeCommandStatus,
  type WorkspaceSimulation,
  type WorkspaceTab,
} from '@/services/payout-command/model'
import type {
  WorkspaceConversationMessage,
  WorkspaceLiveAnswer,
} from '@/services/payout-command/types'
import {
  postPromptLayerQuery,
  PROMPT_LAYER_DEMO_TENANT_ID,
} from '@/services/payout-command/prompt-layer/postPromptLayerQuery'
import { parsePromptLayerAnswer } from '@/services/payout-command/prompt-layer/parsePromptLayerResponse'

// ── Prompt-layer API constants ───────────────────────────────────────────────
const WORKSPACE_LIVE_ANSWER_TITLE = 'Latest answer'

// ── Module-private helpers ───────────────────────────────────────────────────
function formatChatTimestamp(): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date())
}

function buildIntroConversation(tab: WorkspaceTab): WorkspaceConversationMessage[] {
  const copy = workspacePromptCopy[tab]
  return [
    { id: `${tab}-intro-question`, role: 'assistant', body: copy.question, timestamp: '11:32 AM', status: 'done' },
    { id: `${tab}-intro-supporting`, role: 'assistant', body: copy.supporting, timestamp: '11:32 AM', status: 'done' },
  ]
}

// ── Public types ─────────────────────────────────────────────────────────────
export type WorkspaceState = {
  scenario: WorkspaceSimulation
  promptInput: string
  setPromptInput: (value: string) => void
  answerStatus: HomeCommandStatus
  liveAnswer: WorkspaceLiveAnswer | null
  connectionState: 'idle' | 'connected' | 'error'
  conversation: WorkspaceConversationMessage[]
  runSimulation: (prompt: string) => Promise<void>
  resetForTab: (tab: WorkspaceTab) => void
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useWorkspaceState(
  activeTab: WorkspaceTab,
  setSelectedSuggestion: (label: string | null) => void,
): WorkspaceState {
  const [scenario, setScenario] = useState<WorkspaceSimulation>(
    () => workspaceSimulationScenarios[activeTab][0],
  )
  const [promptInput, setPromptInput] = useState('')
  const [answerStatus, setAnswerStatus] = useState<HomeCommandStatus>('idle')
  const [liveAnswer, setLiveAnswer] = useState<WorkspaceLiveAnswer | null>(null)
  const [connectionState, setConnectionState] = useState<'idle' | 'connected' | 'error'>('idle')
  const [conversation, setConversation] = useState<WorkspaceConversationMessage[]>(
    () => buildIntroConversation(activeTab),
  )
  const requestIdRef = useRef(0)

  const resetForTab = useCallback((tab: WorkspaceTab) => {
    setScenario(workspaceSimulationScenarios[tab][0])
    setPromptInput('')
    setAnswerStatus('idle')
    setLiveAnswer(null)
    setConnectionState('idle')
    setConversation(buildIntroConversation(tab))
  }, [])

  const runSimulation = useCallback(
    async (prompt: string) => {
      const cleaned = prompt.trim()
      if (!cleaned) return

      const scenarios = workspaceSimulationScenarios[activeTab]
      const nextScenario = resolvePromptScenario(cleaned, scenarios, scenarios[0])
      setScenario(nextScenario)

      const suggestions = workspacePromptCopy[activeTab].suggestions as readonly string[]
      setSelectedSuggestion(suggestions.includes(cleaned) ? cleaned : null)

      setPromptInput('')
      setConnectionState('idle')
      setAnswerStatus('loading')

      const requestId = ++requestIdRef.current
      const assistantMessageId = `assistant-${requestId}`
      const timestamp = formatChatTimestamp()

      setConversation((prev) => [
        ...prev,
        { id: `user-${requestId}`, role: 'user', body: cleaned, timestamp, status: 'done' },
        {
          id: assistantMessageId,
          role: 'assistant',
          body: 'Reading routed value, callback timing, and proof readiness from prompt-layer evidence…',
          timestamp,
          status: 'typing',
        },
      ])

      try {
        const { ok, payload } = await postPromptLayerQuery({
          query: cleaned,
          tenant_id: PROMPT_LAYER_DEMO_TENANT_ID,
          top_k: 6,
        })
        if (requestIdRef.current !== requestId) return

        if (!ok) {
          const details =
            payload && typeof payload === 'object' && 'details' in payload && typeof (payload as { details?: unknown }).details === 'string'
              ? (payload as { details: string }).details
              : 'Prompt-layer request failed'
          throw new Error(details)
        }

        const mapped = parsePromptLayerAnswer(payload)
        if (!mapped) {
          throw new Error('Prompt-layer returned an empty or invalid answer')
        }
        const finalBody = mapped.body
        const citationSnippet = mapped.citations[0]?.snippet ?? null
        const hasVisualization = mapped.visualization != null

        setConversation((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  body: finalBody,
                  status: 'done',
                  confidence: mapped.confidence ?? null,
                  citationSnippet,
                  hasVisualization,
                  visualization: mapped.visualization,
                }
              : msg,
          ),
        )
        setLiveAnswer(mapped)
        setConnectionState('connected')
        setAnswerStatus('complete')
      } catch {
        if (requestIdRef.current !== requestId) return

        const fallbackBody = `Prompt-layer was unavailable, so showing simulation insight.\n\n${nextScenario.assistant}`
        setConversation((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  body: fallbackBody,
                  status: 'error',
                  confidence: null,
                  citationSnippet: null,
                  hasVisualization: false,
                }
              : msg,
          ),
        )
        setLiveAnswer({
          title: WORKSPACE_LIVE_ANSWER_TITLE,
          body: nextScenario.assistant,
          confidence: null,
          citations: [],
          visualization: null,
        })
        setConnectionState('error')
        setAnswerStatus('complete')
      }
    },
    [activeTab, setSelectedSuggestion],
  )

  return {
    scenario,
    promptInput,
    setPromptInput,
    answerStatus,
    liveAnswer,
    connectionState,
    conversation,
    runSimulation,
    resetForTab,
  }
}
