'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  DASHBOARD_FONT_STACK,
  dockItems,
  workspacePromptCopy,
  workspaceSimulationScenarios,
  type DockId,
  type WorkspaceTab,
} from '@/services/payout-command/model'
import { useHomeState } from './hooks/useHomeState'
import { useWorkspaceState } from './hooks/useWorkspaceState'
import { useAskZordState } from './hooks/useAskZordState'
import { AskZordPanel } from './layout/AskZordPanel'
import { DockNav } from './layout/DockNav'
import { PageHeader } from './layout/PageHeader'
import {
  HomeSurface,
  LiveSyncSurface,
  OperationsGridSurface,
  ProofSurface,
  RecoverySurface,
  WorkspaceSurface,
} from './surfaces'

const WORKSPACE_LIVE_ANSWER_TITLE = 'Latest answer'

export default function PayoutCommandViewClient() {
  // ── Navigation state ───────────────────────────────────────────────────────
  const [activeDock, setActiveDock] = useState<DockId>('home')
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Today')
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)

  const activeSurface = dockItems.find((item) => item.id === activeDock) ?? dockItems[0]
  const activePrompt = useMemo(() => workspacePromptCopy[activeTab], [activeTab])

  // ── Feature hooks ──────────────────────────────────────────────────────────
  const home = useHomeState(activeDock === 'home')
  const workspace = useWorkspaceState(activeTab, setSelectedSuggestion)
  const askZord = useAskZordState(activeSurface.title)

  // ── Navigation handlers ────────────────────────────────────────────────────
  const handleDockChange = useCallback(
    (id: DockId) => {
      setActiveDock(id)
      setSelectedSuggestion(null)
      if (id === 'workspace') {
        setActiveTab('Today')
        workspace.resetForTab('Today')
      }
      if (id === 'home') {
        home.clearInput()
      }
    },
    [home, workspace],
  )

  const handleTabChange = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab)
      setSelectedSuggestion(null)
      workspace.resetForTab(tab)
    },
    [workspace],
  )

  // ── Active surface body ────────────────────────────────────────────────────
  const surfaceBody = useMemo(() => {
    if (activeDock === 'home') {
      return (
        <HomeSurface
          scenario={home.scenario}
          snapshot={home.snapshot}
          timeframe={home.timeframe}
          onTimeframeChange={home.setTimeframe}
          onYearChange={home.setYear}
          onQuarterChange={(qi) => {
            home.setQuarterIndex(qi)
            if (home.timeframe !== 'Quarter') home.setTimeframe('Quarter')
          }}
          activeChartPoint={home.activeChartPoint}
          onActiveChartPointChange={home.setActiveChartPoint}
          promptInput={home.promptInput}
          onPromptInputChange={home.setPromptInput}
          onPromptSubmit={() => home.runSimulation(home.promptInput)}
          onQuickPrompt={home.runSimulation}
          commandResponse={home.commandResponse}
          commandStatus={home.commandStatus}
          onDismissCommandResponse={home.dismissCommandResponse}
        />
      )
    }

    if (activeDock === 'workspace') {
      return (
        <WorkspaceSurface
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          scenario={workspace.scenario}
          selectedPromptLabel={selectedSuggestion}
          suggestions={activePrompt.suggestions}
          onSuggestionClick={workspace.runSimulation}
          promptInput={workspace.promptInput}
          onPromptInputChange={workspace.setPromptInput}
          onPromptSubmit={() => workspace.runSimulation(workspace.promptInput)}
          latestAnswerStatus={workspace.answerStatus}
          latestAnswerTitle={workspace.liveAnswer?.title ?? WORKSPACE_LIVE_ANSWER_TITLE}
          latestAnswerBody={workspace.liveAnswer?.body ?? workspace.scenario.assistant}
          latestAnswerConfidence={workspace.liveAnswer?.confidence ?? null}
          latestAnswerCitationSnippet={workspace.liveAnswer?.citations[0]?.snippet ?? null}
          latestAnswerHasVisualization={workspace.liveAnswer?.visualization != null}
          connectionState={workspace.connectionState}
          conversation={workspace.conversation}
        />
      )
    }

    if (activeDock === 'recoveries') return <RecoverySurface />
    if (activeDock === 'grid') return <OperationsGridSurface />
    if (activeDock === 'sync') return <LiveSyncSurface />
    return <ProofSurface />
  }, [
    activeDock,
    activePrompt.suggestions,
    activeTab,
    handleTabChange,
    home,
    selectedSuggestion,
    workspace,
  ])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#ebebeb]" style={{ fontFamily: DASHBOARD_FONT_STACK }}>
      <div className="w-full overflow-hidden border border-black/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]">
        <DockNav
          activeDock={activeDock}
          activeSurfaceTitle={activeSurface.title}
          onDockChange={handleDockChange}
        />

        <section className="relative p-4 sm:p-5 lg:p-6">
          <PageHeader
            activeSurface={activeSurface}
            onAskZordToggle={askZord.toggle}
          />

          {surfaceBody}

          <AskZordPanel
            isOpen={askZord.isOpen}
            close={askZord.close}
            input={askZord.input}
            setInput={askZord.setInput}
            status={askZord.status}
            response={askZord.response}
            run={askZord.run}
          />
        </section>
      </div>
    </main>
  )
}
