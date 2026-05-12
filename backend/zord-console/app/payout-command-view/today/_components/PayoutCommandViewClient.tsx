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
import { EnvironmentProvider, type EnvMode } from '@/services/auth/EnvironmentProvider'
import { useHomeState } from './hooks/useHomeState'
import { useWorkspaceState } from './hooks/useWorkspaceState'
import { useAskZordState } from './hooks/useAskZordState'
import { AskZordPanel } from './layout/AskZordPanel'
import { DockNav } from './layout/DockNav'
import { PageHeader } from './layout/PageHeader'
import ConnectorIntelligenceClient from '@/app/payout-command-view/connector-intelligence/ConnectorIntelligenceClient'
import {
  AmbiguitySurface,
  BillingSurface,
  EvidenceSurface,
  HomeSurface,
  IntentJournalSurface,
  LeakageSurface,
  LiveSyncSurface,
  ProofSurface,
  SandboxConnectorsSurface,
  WorkspaceSurface,
} from './surfaces'
import { ActivateLiveWizard } from './sandbox/ActivateLiveWizard'

const WORKSPACE_LIVE_ANSWER_TITLE = 'Latest answer'

type PayoutCommandViewClientProps = {
  /** When set, pins sandbox vs live for this route (`/sandbox` vs `/today`). */
  forceMode?: EnvMode
}

export default function PayoutCommandViewClient({ forceMode }: PayoutCommandViewClientProps) {
  // ── Navigation state ───────────────────────────────────────────────────────
  // Allow other pages (e.g. /batch-command-center) to deep-link a surface via
  // ?dock=<id>. Read once on mount; subsequent dock changes stay local.
  const initialDock: DockId = (() => {
    if (typeof window === 'undefined') return 'home'
    const fromQuery = new URLSearchParams(window.location.search).get('dock') as DockId | null
    return fromQuery && dockItems.some((d) => d.id === fromQuery) ? fromQuery : 'home'
  })()
  const [activeDock, setActiveDock] = useState<DockId>(initialDock)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Today')
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const [activateWizardOpen, setActivateWizardOpen] = useState(false)

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

    if (activeDock === 'leakage') return <LeakageSurface />
    if (activeDock === 'ambiguity') return <AmbiguitySurface />
    if (activeDock === 'grid') return <IntentJournalSurface />
    if (activeDock === 'connectors') {
      return forceMode === 'sandbox' ? <SandboxConnectorsSurface /> : <ConnectorIntelligenceClient />
    }
    if (activeDock === 'sync') return <LiveSyncSurface />
    if (activeDock === 'proof') return <EvidenceSurface />
    if (activeDock === 'billing') return <BillingSurface />
    return <ProofSurface />
  }, [
    activeDock,
    activePrompt.suggestions,
    activeTab,
    forceMode,
    handleTabChange,
    home,
    selectedSuggestion,
    workspace,
  ])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <EnvironmentProvider routeMode={forceMode}>
      <main className="min-h-screen bg-[#ebebeb]" style={{ fontFamily: DASHBOARD_FONT_STACK }}>
        <div className="w-full overflow-hidden border border-black/10 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]">
          <DockNav
            activeDock={activeDock}
            onDockChange={handleDockChange}
            onActivateClick={() => setActivateWizardOpen(true)}
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
      {activateWizardOpen ? (
        <ActivateLiveWizard onClose={() => setActivateWizardOpen(false)} />
      ) : null}
    </EnvironmentProvider>
  )
}
