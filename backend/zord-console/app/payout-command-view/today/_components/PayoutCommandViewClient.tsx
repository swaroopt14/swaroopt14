'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildSimulatedHomeOverviewSnapshot,
  DASHBOARD_FONT_STACK,
  dockItems,
  HOME_QUARTERS,
  HOME_SIMULATION_INTERVAL_MS,
  resolveHomeQuarterFromPrompt,
  resolveHomeTimeframeFromPrompt,
  resolveHomeYearFromPrompt,
  resolvePromptScenario,
  workspacePromptCopy,
  workspaceSimulationScenarios,
  type DockId,
  type GlyphName,
  type HomeCommandResponse,
  type HomeCommandStatus,
  type HomeSimulation,
  type HomeTimeframe,
  type WorkspaceSimulation,
  type WorkspaceTab,
  homeSimulationScenarios,
} from './model'
import { Glyph } from './shared'
import {
  HomeSurface,
  LiveSyncSurface,
  OperationsGridSurface,
  ProofSurface,
  RecoverySurface,
  WorkspaceSurface,
} from './surfaces'

type AskZordResponse = {
  title: string
  body: string
}

type PromptLayerCitation = {
  source_type?: string
  record_id?: string
  chunk_id?: string
  snippet?: string
  score?: number
}

type WorkspaceLiveAnswer = {
  title: string
  body: string
  confidence: string | null
  citations: PromptLayerCitation[]
  visualization: unknown
}

type WorkspaceConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  body: string
  timestamp: string
  status: 'typing' | 'done' | 'error'
  confidence?: string | null
  citationSnippet?: string | null
  hasVisualization?: boolean
}

const PROMPT_LAYER_DEMO_TENANT_ID = '11111111-1111-4111-8111-111111111111'
const WORKSPACE_LIVE_ANSWER_TITLE = 'Latest answer'

function formatChatTimestamp() {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date())
}

function buildWorkspaceIntroConversation(tab: WorkspaceTab): WorkspaceConversationMessage[] {
  const copy = workspacePromptCopy[tab]
  return [
    {
      id: `${tab}-intro-question`,
      role: 'assistant',
      body: copy.question,
      timestamp: '11:32 AM',
      status: 'done',
    },
    {
      id: `${tab}-intro-supporting`,
      role: 'assistant',
      body: copy.supporting,
      timestamp: '11:32 AM',
      status: 'done',
    },
  ]
}

function mapWorkspaceLiveAnswer(raw: unknown): WorkspaceLiveAnswer | null {
  if (!raw || typeof raw !== 'object') return null

  const root = (raw as { response?: unknown }).response ?? raw
  if (!root || typeof root !== 'object') return null

  const response = root as Record<string, unknown>
  const answer = typeof response.answer === 'string' ? response.answer.trim() : ''
  if (!answer) return null

  const confidence = typeof response.confidence === 'string' ? response.confidence : null
  const citations = Array.isArray(response.citations) ? (response.citations as PromptLayerCitation[]) : []
  const visualization = 'visualization' in response ? response.visualization : null

  return {
    title: WORKSPACE_LIVE_ANSWER_TITLE,
    body: answer,
    confidence,
    citations,
    visualization,
  }
}

const askZordQuickPrompts = [
  'Why is this payout still pending?',
  'Show all payouts stuck due to PSP issues in last 24h and total amount at risk.',
  'Generate an auditor-friendly explanation for contract X.',
] as const

function buildAskZordResponse(prompt: string, activeSurfaceTitle: string): AskZordResponse {
  const lowerPrompt = prompt.toLowerCase()

  if (lowerPrompt.includes('pending')) {
    return {
      title: 'Pending payout diagnosis',
      body:
        '• PSP callback is delayed for one lane in the current cycle.\n• Bank statement confirmation has not arrived for the same payout set.\n• Owner routing is active, with ops follow-up already queued.\n\nRecommended next move: keep traffic on healthy routes and re-check statement confirmation window.',
    }
  }

  if (lowerPrompt.includes('psp') || lowerPrompt.includes('24h') || lowerPrompt.includes('amount at risk')) {
    return {
      title: 'PSP delay concentration (last 24h)',
      body:
        '• 27 payouts are still waiting on PSP-side completion signals.\n• Total amount at risk in this bucket is approximately ₹11.2L.\n• Most concentration is in one overflow lane, while two lanes remain stable.\n\nRecommended next move: prioritize PSP escalation on the highest-value bucket first.',
    }
  }

  if (lowerPrompt.includes('auditor') || lowerPrompt.includes('contract')) {
    return {
      title: 'Auditor-friendly contract explanation',
      body:
        'Contract status summary:\n• Intent was accepted and routed successfully.\n• Provider and bank confirmation signals were matched in sequence.\n• Remaining residual checks are documented with clear owner actions.\n\nThis explanation is generated from the same deterministic evidence layer used by trace, failure intelligence, and reconciliation views.',
    }
  }

  return {
    title: `${activeSurfaceTitle} analysis`,
    body:
      'Zord is reading the same evidence-backed operating state shown on this page and returning outcome-focused guidance for payout quality, owner routing, and reconciliation readiness.',
  }
}

export default function PayoutCommandViewClient() {
  const [activeDock, setActiveDock] = useState<DockId>('home')
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Today')
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const [homeScenario, setHomeScenario] = useState<HomeSimulation>(homeSimulationScenarios[0])
  const [homeTimeframe, setHomeTimeframe] = useState<HomeTimeframe>('Month')
  const [homeYear, setHomeYear] = useState<2026 | 2027 | 2028>(2026)
  const [homeQuarterIndex, setHomeQuarterIndex] = useState(0)
  const [homeTick, setHomeTick] = useState(0)
  const [homeActiveChartPoint, setHomeActiveChartPoint] = useState(42)
  const [homeCommandStatus, setHomeCommandStatus] = useState<HomeCommandStatus>('idle')
  const [homePendingResponse, setHomePendingResponse] = useState<HomeCommandResponse | null>(null)
  const [homeCommandResponse, setHomeCommandResponse] = useState<HomeCommandResponse | null>(null)
  const [homePromptInput, setHomePromptInput] = useState('')
  const [workspaceScenario, setWorkspaceScenario] = useState<WorkspaceSimulation>(workspaceSimulationScenarios.Today[0])
  const [workspacePromptInput, setWorkspacePromptInput] = useState('')
  const [workspaceAnswerStatus, setWorkspaceAnswerStatus] = useState<HomeCommandStatus>('idle')
  const [workspaceLiveAnswer, setWorkspaceLiveAnswer] = useState<WorkspaceLiveAnswer | null>(null)
  const [workspaceConnectionState, setWorkspaceConnectionState] = useState<'idle' | 'connected' | 'error'>('idle')
  const [workspaceConversation, setWorkspaceConversation] = useState<WorkspaceConversationMessage[]>(() =>
    buildWorkspaceIntroConversation('Today'),
  )
  const [isAskZordOpen, setIsAskZordOpen] = useState(false)
  const [askZordInput, setAskZordInput] = useState('')
  const [askZordStatus, setAskZordStatus] = useState<HomeCommandStatus>('idle')
  const [askZordPendingResponse, setAskZordPendingResponse] = useState<AskZordResponse | null>(null)
  const [askZordResponse, setAskZordResponse] = useState<AskZordResponse | null>(null)
  const workspaceRequestIdRef = useRef(0)

  const activeSurface = dockItems.find((item) => item.id === activeDock) ?? dockItems[0]
  const activePrompt = useMemo(() => workspacePromptCopy[activeTab], [activeTab])
  const homeSnapshot = useMemo(
    () => buildSimulatedHomeOverviewSnapshot(homeScenario, homeTimeframe, homeTick, homeYear, homeQuarterIndex),
    [homeQuarterIndex, homeScenario, homeTick, homeTimeframe, homeYear],
  )

  useEffect(() => {
    if (activeDock !== 'home') return
    const intervalId = window.setInterval(() => {
      setHomeTick((current) => current + 1)
    }, HOME_SIMULATION_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [activeDock])

  useEffect(() => {
    const [start, end] = homeSnapshot.range
    const midpoint = Math.round((start + end) / 2)
    setHomeActiveChartPoint(midpoint)
  }, [homeSnapshot.range])

  useEffect(() => {
    if (!homePendingResponse) return

    setHomeCommandStatus('loading')
    setHomeCommandResponse({ title: homePendingResponse.title, body: '' })
    let typingTimer: number | undefined

    const loadingTimer = window.setTimeout(() => {
      setHomeCommandStatus('typing')
      let characterIndex = 0
      const targetBody = homePendingResponse.body

      typingTimer = window.setInterval(() => {
        characterIndex += 4
        const nextBody = targetBody.slice(0, characterIndex)
        setHomeCommandResponse({
          title: homePendingResponse.title,
          body: nextBody,
        })

        if (characterIndex >= targetBody.length) {
          if (typingTimer) window.clearInterval(typingTimer)
          setHomeCommandStatus('complete')
          setHomePendingResponse(null)
        }
      }, 28)
    }, 520)

    return () => {
      window.clearTimeout(loadingTimer)
      if (typingTimer) window.clearInterval(typingTimer)
    }
  }, [homePendingResponse])

  useEffect(() => {
    if (!askZordPendingResponse) return

    setAskZordStatus('loading')
    setAskZordResponse({ title: askZordPendingResponse.title, body: '' })
    let typingTimer: number | undefined

    const loadingTimer = window.setTimeout(() => {
      setAskZordStatus('typing')
      let characterIndex = 0
      const targetBody = askZordPendingResponse.body

      typingTimer = window.setInterval(() => {
        characterIndex += 5
        setAskZordResponse({
          title: askZordPendingResponse.title,
          body: targetBody.slice(0, characterIndex),
        })

        if (characterIndex >= targetBody.length) {
          if (typingTimer) window.clearInterval(typingTimer)
          setAskZordStatus('complete')
          setAskZordPendingResponse(null)
        }
      }, 18)
    }, 280)

    return () => {
      window.clearTimeout(loadingTimer)
      if (typingTimer) window.clearInterval(typingTimer)
    }
  }, [askZordPendingResponse])

  const runHomeSimulation = useCallback((prompt: string) => {
    const cleanedPrompt = prompt.trim()
    if (!cleanedPrompt) return
    const nextScenario = resolvePromptScenario(cleanedPrompt, homeSimulationScenarios, homeSimulationScenarios[0])
    const nextTimeframe = resolveHomeTimeframeFromPrompt(cleanedPrompt, homeTimeframe)
    const nextYear = resolveHomeYearFromPrompt(cleanedPrompt, homeYear)
    const nextQuarterIndex = resolveHomeQuarterFromPrompt(cleanedPrompt, homeQuarterIndex)
    setHomeScenario(nextScenario)
    setHomeTimeframe(nextTimeframe)
    setHomeYear(nextYear)
    setHomeQuarterIndex(nextQuarterIndex)
    setHomeTick((current) => current + 1)
    setHomePendingResponse({
      title: nextScenario.title,
      body: `${nextScenario.summary} Current simulation scope: ${nextTimeframe} ${nextTimeframe === 'Quarter' ? HOME_QUARTERS[nextQuarterIndex].name : ''} ${nextYear}.`,
    })
    setHomePromptInput('')
  }, [homeQuarterIndex, homeTimeframe, homeYear])

  const runWorkspaceSimulation = useCallback(async (prompt: string) => {
    const cleanedPrompt = prompt.trim()
    if (!cleanedPrompt) return

    if (typeof window !== 'undefined') {
      const runtimeWindow = window as Window & { sendPrompt?: (message: string) => void | Promise<void> }
      if (typeof runtimeWindow.sendPrompt === 'function') {
        void Promise.resolve(runtimeWindow.sendPrompt(cleanedPrompt)).catch(() => {})
      }
    }

    const scenarios = workspaceSimulationScenarios[activeTab]
    const nextScenario = resolvePromptScenario(cleanedPrompt, scenarios, scenarios[0])
    setWorkspaceScenario(nextScenario)
    const suggestedSet = workspacePromptCopy[activeTab].suggestions
    setSelectedSuggestion(suggestedSet.includes(cleanedPrompt) ? cleanedPrompt : null)
    setWorkspacePromptInput('')
    setWorkspaceConnectionState('idle')
    setWorkspaceAnswerStatus('loading')

    const requestId = workspaceRequestIdRef.current + 1
    workspaceRequestIdRef.current = requestId
    const assistantMessageId = `assistant-${requestId}`
    const timestamp = formatChatTimestamp()

    setWorkspaceConversation((current) => [
      ...current,
      {
        id: `user-${requestId}`,
        role: 'user',
        body: cleanedPrompt,
        timestamp,
        status: 'done',
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        body: 'Reading routed value, callback timing, and proof readiness from prompt-layer evidence…',
        timestamp,
        status: 'typing',
      },
    ])

    try {
      const response = await fetch('/api/prompt-layer/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          query: cleanedPrompt,
          tenant_id: PROMPT_LAYER_DEMO_TENANT_ID,
          top_k: 6,
        }),
      })

      const payload = await response.json()
      const mappedAnswer = mapWorkspaceLiveAnswer(payload)

      if (workspaceRequestIdRef.current !== requestId) return

      if (!response.ok) {
        throw new Error(typeof payload?.details === 'string' ? payload.details : 'Prompt-layer request failed')
      }

      const finalBody = mappedAnswer?.body ?? nextScenario.assistant
      const citationSnippet = mappedAnswer?.citations[0]?.snippet ?? null
      const hasVisualization = mappedAnswer?.visualization != null

      setWorkspaceConversation((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                body: finalBody,
                status: 'done',
                confidence: mappedAnswer?.confidence ?? null,
                citationSnippet,
                hasVisualization,
              }
            : message,
        ),
      )

      setWorkspaceLiveAnswer(
        mappedAnswer ?? {
          title: WORKSPACE_LIVE_ANSWER_TITLE,
          body: nextScenario.assistant,
          confidence: null,
          citations: [],
          visualization: null,
        },
      )
      setWorkspaceConnectionState('connected')
      setWorkspaceAnswerStatus('complete')
    } catch {
      if (workspaceRequestIdRef.current !== requestId) return
      const fallbackBody = `Prompt-layer was unavailable, so showing simulation insight.\n\n${nextScenario.assistant}`
      setWorkspaceConversation((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                body: fallbackBody,
                status: 'error',
                confidence: null,
                citationSnippet: null,
                hasVisualization: false,
              }
            : message,
        ),
      )
      setWorkspaceLiveAnswer({
        title: WORKSPACE_LIVE_ANSWER_TITLE,
        body: nextScenario.assistant,
        confidence: null,
        citations: [],
        visualization: null,
      })
      setWorkspaceConnectionState('error')
      setWorkspaceAnswerStatus('complete')
    }
  }, [activeTab])

  const runAskZord = useCallback((rawPrompt: string) => {
    const cleanedPrompt = rawPrompt.trim()
    if (!cleanedPrompt) return

    if (typeof window !== 'undefined') {
      const runtimeWindow = window as Window & { sendPrompt?: (message: string) => void | Promise<void> }
      if (typeof runtimeWindow.sendPrompt === 'function') {
        void Promise.resolve(runtimeWindow.sendPrompt(cleanedPrompt)).catch(() => {})
      }
    }

    setIsAskZordOpen(true)
    setAskZordInput('')
    setAskZordPendingResponse(buildAskZordResponse(cleanedPrompt, activeSurface.title))
  }, [activeSurface.title])

  const surfaceBody = useMemo(() => {
    if (activeDock === 'home') {
      return (
        <HomeSurface
          scenario={homeScenario}
          snapshot={homeSnapshot}
          timeframe={homeTimeframe}
          onTimeframeChange={(nextTimeframe) => {
            setHomeTimeframe(nextTimeframe)
            setHomeTick((current) => current + 1)
          }}
          onYearChange={(year) => {
            setHomeYear(year)
            setHomeTick((current) => current + 1)
          }}
          onQuarterChange={(quarterIndex) => {
            setHomeQuarterIndex(quarterIndex)
            if (homeTimeframe !== 'Quarter') setHomeTimeframe('Quarter')
            setHomeTick((current) => current + 1)
          }}
          activeChartPoint={homeActiveChartPoint}
          onActiveChartPointChange={setHomeActiveChartPoint}
          promptInput={homePromptInput}
          onPromptInputChange={setHomePromptInput}
          onPromptSubmit={() => runHomeSimulation(homePromptInput)}
          onQuickPrompt={runHomeSimulation}
          commandResponse={homeCommandResponse}
          commandStatus={homeCommandStatus}
          onDismissCommandResponse={() => {
            setHomeCommandStatus('idle')
            setHomePendingResponse(null)
            setHomeCommandResponse(null)
          }}
        />
      )
    }

    if (activeDock === 'workspace') {
      return (
        <WorkspaceSurface
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab)
            setSelectedSuggestion(null)
            setWorkspacePromptInput('')
            setWorkspaceScenario(workspaceSimulationScenarios[tab][0])
            setWorkspaceAnswerStatus('idle')
            setWorkspaceLiveAnswer(null)
            setWorkspaceConnectionState('idle')
            setWorkspaceConversation(buildWorkspaceIntroConversation(tab))
          }}
          scenario={workspaceScenario}
          selectedPromptLabel={selectedSuggestion}
          suggestions={activePrompt.suggestions}
          onSuggestionClick={runWorkspaceSimulation}
          promptInput={workspacePromptInput}
          onPromptInputChange={setWorkspacePromptInput}
          onPromptSubmit={() => runWorkspaceSimulation(workspacePromptInput)}
          latestAnswerStatus={workspaceAnswerStatus}
          latestAnswerTitle={workspaceLiveAnswer?.title ?? WORKSPACE_LIVE_ANSWER_TITLE}
          latestAnswerBody={workspaceLiveAnswer?.body ?? workspaceScenario.assistant}
          latestAnswerConfidence={workspaceLiveAnswer?.confidence ?? null}
          latestAnswerCitationSnippet={workspaceLiveAnswer?.citations[0]?.snippet ?? null}
          latestAnswerHasVisualization={workspaceLiveAnswer?.visualization != null}
          connectionState={workspaceConnectionState}
          conversation={workspaceConversation}
        />
      )
    }

    if (activeDock === 'recoveries') {
      return <RecoverySurface />
    }

    if (activeDock === 'grid') {
      return <OperationsGridSurface />
    }

    if (activeDock === 'sync') {
      return <LiveSyncSurface />
    }

    return <ProofSurface />
  }, [activeDock, activePrompt.suggestions, activeTab, homeActiveChartPoint, homeCommandResponse, homeCommandStatus, homePromptInput, homeScenario, homeSnapshot, homeTimeframe, runHomeSimulation, runWorkspaceSimulation, selectedSuggestion, workspaceAnswerStatus, workspaceConnectionState, workspaceConversation, workspaceLiveAnswer, workspacePromptInput, workspaceScenario])

  return (
    <main className="min-h-screen bg-[#ebebeb]" style={{ fontFamily: DASHBOARD_FONT_STACK }}>
      <div className="w-full overflow-hidden border border-black/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]">
        <div className="flex min-h-[56px] flex-col gap-4 border-b border-[#E5E5E5] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-white">Z</span>
              <div>
                <div className="text-[12px] uppercase tracking-[0.18em] text-[#8a8a86]">Workspace</div>
                <div className="text-[15px] font-medium text-[#111111]">{activeSurface.title}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {dockItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveDock(item.id)
                    setSelectedSuggestion(null)
                    if (item.id === 'workspace') {
                      setActiveTab('Today')
                      setWorkspaceScenario(workspaceSimulationScenarios.Today[0])
                      setWorkspacePromptInput('')
                      setWorkspaceAnswerStatus('idle')
                      setWorkspaceLiveAnswer(null)
                      setWorkspaceConnectionState('idle')
                      setWorkspaceConversation(buildWorkspaceIntroConversation('Today'))
                    }
                    if (item.id === 'home') {
                      setHomePromptInput('')
                    }
                  }}
                  className={`flex h-9 w-9 items-center justify-center rounded-[8px] border transition ${
                    activeDock === item.id ? 'border-[#111111] bg-[#111111] text-white' : 'border-[#E5E5E5] bg-white text-[#111111]'
                  }`}
                  aria-label={item.label}
                  aria-pressed={activeDock === item.id}
                  title={item.label}
                >
                  <Glyph name={item.icon} className="h-[18px] w-[18px]" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-11 min-w-[18rem] items-center gap-3 rounded-[10px] border border-[#E5E5E5] bg-[#F5F5F5] px-3.5 text-[#7a7a76] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <Glyph name="search" className="h-4 w-4 text-[#111111]" />
              <span className="text-sm">Type client name or payout ID...</span>
            </div>
            <div className="flex items-center gap-3 rounded-[10px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-sm font-medium text-white">OS</div>
              <div className="pr-1">
                <div className="text-sm font-medium text-[#111111]">Ops supervisor</div>
                <div className="text-xs text-[#7a7a76]">Payout desk</div>
              </div>
            </div>
          </div>
        </div>

        <section className="relative p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#8a8a86]">
                <span>Workspaces</span>
                <span>/</span>
                <span>Overview</span>
                <span>/</span>
                <span className="text-[#111111]">{activeSurface.title}</span>
              </div>
              <h1 className="mt-3 text-[2.25rem] font-medium tracking-[-0.05em] text-[#111111] md:text-[2.85rem]">{activeSurface.title}</h1>
              <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#6f716d]">{activeSurface.summary}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {['refresh', 'eye', 'menu-dots'].map((icon) => (
                <button
                  key={icon}
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-black/10 bg-white text-[#111111]"
                  aria-label={icon}
                >
                  <Glyph name={icon as GlyphName} className="h-4 w-4" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsAskZordOpen((current) => !current)}
                className="flex items-center gap-2 rounded-[12px] border border-[#111111] bg-[#111111] px-3 py-2.5 text-[13px] font-medium text-white"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[#4ADE80]" />
                Ask Zord
              </button>
              <Link
                href="/payout-command-view/batch-command-center"
                className="inline-flex items-center rounded-[12px] border border-[#111111] bg-white px-3 py-2.5 text-[13px] font-medium text-[#111111]"
              >
                Batch Center
              </Link>
              <button
                type="button"
                className="flex items-center gap-3 rounded-[12px] bg-[#111111] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
              >
                <div className="flex -space-x-2">
                  {['A', 'F', 'E'].map((item, index) => (
                    <span
                      key={item}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/60 text-[11px] font-medium text-[#111111]"
                      style={{ background: ['#d8e6ff', '#dbf7dd', '#edd8f4'][index] }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
                <span>Share</span>
              </button>
            </div>
          </div>

          {surfaceBody}

          <aside
            className={`fixed right-4 top-[7rem] z-[70] w-[22.5rem] max-w-[calc(100vw-2rem)] rounded-[1.25rem] border border-[#E5E5E5] bg-white p-4 shadow-[0_18px_44px_rgba(0,0,0,0.14)] transition ${
              isAskZordOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[110%] opacity-0'
            }`}
            aria-hidden={!isAskZordOpen}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">Ask Zord</div>
                <div className="mt-1 text-[15px] font-medium text-[#111111]">AI analyst on evidence stack</div>
              </div>
              <button
                type="button"
                onClick={() => setIsAskZordOpen(false)}
                className="rounded-[10px] border border-[#E5E5E5] bg-[#f7f7f4] px-2 py-1 text-[12px] text-[#6f716d]"
              >
                Close
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {askZordQuickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => runAskZord(prompt)}
                  className="w-full rounded-[0.9rem] border border-[#E5E5E5] bg-[#f8f8f6] px-3 py-2.5 text-left text-[12px] leading-5 text-[#6f716d] transition hover:border-[#4ADE80]/30 hover:text-[#111111]"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="mt-3 rounded-[0.95rem] border border-[#E5E5E5] bg-[#fcfcfa] p-3">
              <div className="text-[11px] font-medium text-[#111111]">{askZordResponse?.title ?? 'Latest answer'}</div>
              <div className="mt-2 whitespace-pre-line text-[12px] leading-5 text-[#6f716d]">
                {askZordStatus === 'loading' ? 'Reading payout evidence…' : askZordResponse?.body ?? 'Ask about any payment or pattern.'}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                value={askZordInput}
                onChange={(event) => setAskZordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runAskZord(askZordInput)
                }}
                placeholder="Ask Zord about any payment or pattern"
                className="h-10 min-w-0 flex-1 rounded-[0.85rem] border border-[#E5E5E5] bg-[#f8f8f6] px-3 text-[12px] text-[#111111] outline-none placeholder:text-[#8a8a86]"
              />
              <button
                type="button"
                onClick={() => runAskZord(askZordInput)}
                className="flex h-10 w-10 items-center justify-center rounded-[0.85rem] bg-[#111111] text-white"
                aria-label="Run Ask Zord query"
              >
                <Glyph name="arrow-up-right" className="h-4 w-4" />
              </button>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
