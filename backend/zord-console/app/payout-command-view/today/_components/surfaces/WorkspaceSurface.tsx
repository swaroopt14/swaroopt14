'use client'

import { useMemo } from 'react'
import { workspacePromptCopy, type WorkspaceTab } from '@/services/payout-command/model'
import type { WorkspaceState } from '../hooks/useWorkspaceState'
import { buildGroundedAnswerSnapshot } from '../workspace/buildGroundedAnswerSnapshot'
import { WorkspaceOperationsGrid } from '../workspace/WorkspaceOperationsGrid'
import { WorkspaceIntelligencePanel } from '../workspace/WorkspaceIntelligencePanel'
import { paymentOpsWorkAreas } from '../workspace/paymentOperationsCopy'
import { usePaymentOperationsView } from '../workspace/usePaymentOperationsView'

export function WorkspaceSurface({
  activeTab,
  setActiveTab,
  workspace,
  suggestions,
  selectedPromptLabel,
  batchId,
}: {
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  workspace: WorkspaceState
  suggestions: readonly string[]
  selectedPromptLabel: string | null
  batchId?: string
}) {
  const copy = workspacePromptCopy[activeTab]
  const { viewModel, loading } = usePaymentOperationsView(batchId)

  const groundedAnswer = useMemo(
    () =>
      buildGroundedAnswerSnapshot({
        lifecycle: viewModel.lifecycle,
        hasLiveData: viewModel.hasLiveData,
        matchConfidencePct: viewModel.matchConfidencePct,
        refCompletenessPct: viewModel.refCompletenessPct,
        reviewMinor: viewModel.reviewMinor,
        ambiguousCount: viewModel.ambiguousIntentCount,
        intentMissing: viewModel.hero.showIntentMissing,
        ingestIncomplete:
          viewModel.dataSources.intentStatus === 'missing' &&
          viewModel.dataSources.settlementStatus === 'missing',
      }),
    [viewModel],
  )

  return (
    <div className="-mx-1 sm:-mx-2 lg:-mx-3">
      <div className="mt-2 space-y-4" data-testid="workspace-surface">
        <div className="grid items-stretch gap-4 xl:grid-cols-[1.78fr_1.46fr]">
          <WorkspaceOperationsGrid viewModel={viewModel} loading={loading} />
          <WorkspaceIntelligencePanel
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            workspace={workspace}
            question={copy.question}
            supporting={copy.supporting}
            suggestions={suggestions}
            selectedPromptLabel={selectedPromptLabel}
            workAreas={paymentOpsWorkAreas}
            groundedAnswer={groundedAnswer}
          />
        </div>
      </div>
    </div>
  )
}
