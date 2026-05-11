'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DASHBOARD_FONT_STACK,
  dockItems,
  SANDBOX_DOCK_IDS,
  workspacePromptCopy,
  workspaceSimulationScenarios,
  type DockId,
  type WorkspaceTab,
} from '@/services/payout-command/model'
import { EnvironmentProvider, useEnvironment } from '@/services/auth/EnvironmentProvider'
import { useHomeState } from './hooks/useHomeState'
import { useWorkspaceState } from './hooks/useWorkspaceState'
import { useAskZordState } from './hooks/useAskZordState'
import { AskZordPanel } from './layout/AskZordPanel'
import { DockNav } from './layout/DockNav'
import { HomeCommandFiltersForm } from './layout/HomeCommandFiltersForm'
import { AlertStrip } from './command-center/AlertStrip'
import ConnectorIntelligenceClient from '../../connector-intelligence/ConnectorIntelligenceClient'
import { homeCommandCenterAlertStrip, homeCommandCenterInboxAlerts } from './layout/homeCommandCenterData'
import { PageHeader } from './layout/PageHeader'
import { SandboxBanner } from './sandbox/SandboxBanner'
import { ActivateLiveWizard } from './sandbox/ActivateLiveWizard'
import { BillingSurface } from './surfaces/BillingSurface'
import { SandboxConnectorsSurface } from './surfaces/SandboxConnectorsSurface'
import { EvidenceSurface } from './surfaces/EvidenceSurface'
import { AmbiguityLeakageSurface } from './surfaces/AmbiguityLeakageSurface'
import { SystemsIntegrationSurface } from './surfaces/SystemsIntegrationSurface'
import {
  HomeSurface,
  IntentJournalSurface,
  LiveSyncSurface,
  ProofSurface,
  WorkspaceSurface,
} from './surfaces'

const WORKSPACE_LIVE_ANSWER_TITLE = 'Latest answer'

/**
 * Outer wrapper provides EnvironmentProvider; the inner client reads it.
 * Split this way so child components can call `useEnvironment()` reliably
 * (provider must be ancestor, not sibling).
 */
export default function PayoutCommandViewClient({ forceMode }: { forceMode?: 'sandbox' | 'live' } = {}) {
  return (
    <EnvironmentProvider routeMode={forceMode}>
      <PayoutCommandViewInner />
    </EnvironmentProvider>
  )
}

function PayoutCommandViewInner() {
  const { mode } = useEnvironment()
  const [activateOpen, setActivateOpen] = useState(false)
  const router = useRouter()
  const syncedDockFromUrl = useRef(false)

  // ── Navigation state ───────────────────────────────────────────────────────
  // Always start on Home; live routes must never stick on `sandbox` from a stale first paint.
  const [activeDock, setActiveDock] = useState<DockId>('home')
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Today')
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const [homeFiltersOpen, setHomeFiltersOpen] = useState(false)
  const [homeSystemKnowledgeFlow, setHomeSystemKnowledgeFlow] = useState(false)
  /** Set when the URL contains `?batch=XYZ`. Forwarded to IntentJournalSurface for auto-select. */
  const [initialBatchId, setInitialBatchId] = useState<string | null>(null)

  const activeSurface =
    dockItems.find((item) => item.id === activeDock) ?? dockItems.find((d) => d.id === 'home')!
  const activePrompt = useMemo(() => workspacePromptCopy[activeTab], [activeTab])

  // ── Feature hooks ──────────────────────────────────────────────────────────
  const home = useHomeState(activeDock === 'home')
  const workspace = useWorkspaceState(activeTab, setSelectedSuggestion)
  const askZord = useAskZordState(activeSurface.title)

  // Shared bridge used by sibling surfaces that invoke `window.sendPrompt(...)`.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const win = window as Window & {
      sendPrompt?: (msg: string) => void | Promise<void>
    }
    win.sendPrompt = (msg: string) => workspace.runSimulation(msg)
    return () => {
      delete win.sendPrompt
    }
  }, [workspace])

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
      } else {
        setHomeFiltersOpen(false)
        setHomeSystemKnowledgeFlow(false)
      }
    },
    [home, workspace],
  )

  /** Live hides sandbox/billing docks; sandbox hides live-only docks — drop invalid selection after mode or URL sync. */
  useEffect(() => {
    if (mode === 'sandbox') {
      if (!SANDBOX_DOCK_IDS.includes(activeDock)) setActiveDock('home')
      return
    }
    if (activeDock === 'sandbox' || activeDock === 'billing') setActiveDock('home')
  }, [mode, activeDock])

  useEffect(() => {
    if (syncedDockFromUrl.current || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const dockRaw = params.get('dock')
    const batchRaw = params.get('batch')
    const path = window.location.pathname

    const stripDockAndReplace = () => {
      params.delete('dock')
      const qs = params.toString()
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false })
    }

    // Legacy `?dock=command` → Home.
    if (dockRaw === 'command') {
      syncedDockFromUrl.current = true
      stripDockAndReplace()
      handleDockChange('home')
      if (batchRaw) setInitialBatchId(batchRaw)
      return
    }

    // Retired Sandbox rail — `?dock=sandbox` is the same as Home.
    if (dockRaw === 'sandbox') {
      syncedDockFromUrl.current = true
      stripDockAndReplace()
      handleDockChange('home')
      if (batchRaw) setInitialBatchId(batchRaw)
      return
    }

    if (dockRaw && dockItems.some((d) => d.id === dockRaw)) {
      syncedDockFromUrl.current = true
      handleDockChange(dockRaw as DockId)
    }
    if (batchRaw) setInitialBatchId(batchRaw)
  }, [handleDockChange, router])

  const openProblemWorkspace = useCallback(() => {
    handleDockChange('recoveries')
    const path = typeof window !== 'undefined' ? window.location.pathname : '/payout-command-view/today'
    router.replace(`${path}?dock=recoveries`, { scroll: false })
  }, [handleDockChange, router])

  const handleTabChange = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab)
      setSelectedSuggestion(null)
      workspace.resetForTab(tab)
    },
    [workspace],
  )

  // Memoized so the surfaceBody useMemo below has a stable dependency.
  const homeSurfaceElement = useMemo(
    () => (
      <HomeSurface
        scenario={home.scenario}
        snapshot={home.snapshot}
        timeframe={home.timeframe}
        onTimeframeChange={home.setTimeframe}
        onYearChange={home.setYear}
        onQuarterChange={(qi) => {
          home.setQuarterIndex(qi)
          if (home.timeframe !== 'Custom') home.setTimeframe('Custom')
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
        onOpenProblemWorkspace={openProblemWorkspace}
      />
    ),
    [home, openProblemWorkspace],
  )

  // ── Active surface body ────────────────────────────────────────────────────
  const surfaceBody = useMemo(() => {
    if (activeDock === 'home') {
      if (homeSystemKnowledgeFlow) {
        return <LiveSyncSurface />
      }
      return homeSurfaceElement
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
          latestAnswerVisualization={workspace.liveAnswer?.visualization ?? null}
          connectionState={workspace.connectionState}
          conversation={workspace.conversation}
        />
      )
    }

    // Sandbox dock = the same Home command center; sandbox-specific chrome
    // (banner, right rail) is layered above by parent components, not here.
    if (activeDock === 'sandbox') return homeSurfaceElement

    if (activeDock === 'billing') return <BillingSurface onActivateClick={() => setActivateOpen(true)} />

    // Page 5 — Ambiguity & Leakage Intelligence (CFO + Finance + Ops monthly).
    // Replaces the legacy Reconciliation & Finality view; vocabulary explicitly
    // moves from "reconciliation" to "ambiguity costing you money".
    if (activeDock === 'recoveries') return <AmbiguityLeakageSurface />

    if (activeDock === 'grid') return <IntentJournalSurface initialBatchId={initialBatchId ?? undefined} />

    // Connectors: sandbox gets the simpler "connect a provider" surface;
    // live keeps the full Connector Intelligence dashboard.
    if (activeDock === 'connectors') {
      return mode === 'sandbox' ? <SandboxConnectorsSurface /> : <ConnectorIntelligenceClient />
    }

    if (activeDock === 'sync') return <SystemsIntegrationSurface />

    // Page 4 — Defensibility & Evidence (Compliance + Legal + dispute work).
    // Replaces the legacy Failure Intelligence view.
    if (activeDock === 'proof') return <EvidenceSurface />

    // Fallback — any unknown dock id. Should not normally happen.
    return <ProofSurface />
  }, [
    activeDock,
    activePrompt.suggestions,
    activeTab,
    handleTabChange,
    homeSurfaceElement,
    homeSystemKnowledgeFlow,
    initialBatchId,
    mode,
    selectedSuggestion,
    workspace,
  ])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main
      className="min-h-screen bg-[#f5f5f5] text-[15px] leading-[1.55] antialiased"
      style={{ fontFamily: DASHBOARD_FONT_STACK }}
    >
      {/* overflow-y visible so home AlertStrip (below dock) isn’t clipped; sticky also needs no overflow-hidden ancestor */}
      <div className="w-full border border-black/5 bg-white">
        <SandboxBanner onActivateClick={() => setActivateOpen(true)} />
        <DockNav
          activeDock={activeDock}
          onDockChange={handleDockChange}
          alerts={homeCommandCenterInboxAlerts}
          onActivateClick={() => setActivateOpen(true)}
        />

        <section
          className={
            activeDock === 'home'
              ? 'relative p-0'
              : 'relative px-3 py-4 sm:px-4 lg:px-5'
          }
        >
          <div
            className={
              activeDock === 'home'
                ? 'border-b border-black/5 px-3 py-3 sm:px-4 sm:py-4 lg:px-5'
                : 'border-b border-black/5 pb-3 sm:pb-4'
            }
          >
            <PageHeader
              pageEyebrow={activeSurface.label}
              pageTitle={activeSurface.title}
              pageSubtitle={activeDock === 'workspace' ? activeTab : undefined}
              showUtilityIconButtons
              onAskZordToggle={askZord.toggle}
              homeCommandFilters={
                activeDock === 'home'
                  ? {
                      open: homeFiltersOpen,
                      onToggle: () => setHomeFiltersOpen((o) => !o),
                      panel: (
                        <HomeCommandFiltersForm
                          timeframe={home.timeframe}
                          onTimeframeChange={home.setTimeframe}
                          commandFilters={home.commandFilters}
                          setCommandFilters={home.setCommandFilters}
                        />
                      ),
                    }
                  : undefined
              }
              homeSystemKnowledgeFlow={
                activeDock === 'home'
                  ? {
                      enabled: homeSystemKnowledgeFlow,
                      onChange: (next) => {
                        setHomeSystemKnowledgeFlow(next)
                        if (next) setHomeFiltersOpen(false)
                      },
                    }
                  : undefined
              }
            />
          </div>

          {activeDock === 'home' && !homeSystemKnowledgeFlow ? (
            <AlertStrip
              {...homeCommandCenterAlertStrip}
              dismissible
              actionAnchorId="home-action-panel"
              actionAnchorLabel="View action panel"
            />
          ) : null}

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

      {activateOpen ? <ActivateLiveWizard onClose={() => setActivateOpen(false)} /> : null}
    </main>
  )
}
