'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { workspaceTabs, type WorkspaceTab } from '@/services/payout-command/model'
import type { WorkspaceState } from '../hooks/useWorkspaceState'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { Glyph } from '../shared'
import { ConnectionPill, MarkdownMessage, MessageBubble, ZordAvatar } from './WorkspaceChatMessages'
import { PAYMENT_OPERATIONS } from './paymentOperationsCopy'
import {
  WORKSPACE_PANEL_SHELL,
  WORKSPACE_TAB_ACTIVE,
  WORKSPACE_TAB_INACTIVE,
  WORKSPACE_TEXT_MUTED,
  WORKSPACE_TEXT_PRIMARY,
} from './workspaceTokens'

type WorkspaceIntelligencePanelProps = {
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  workspace: WorkspaceState
  question: string
  supporting: string
  groundedAnswer: string
}

function useAutoResizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [value])
  return ref
}

export function WorkspaceIntelligencePanel({
  activeTab,
  setActiveTab,
  workspace,
  question,
  supporting,
  groundedAnswer,
}: WorkspaceIntelligencePanelProps) {
  const { tenantId, tenantReady } = useSessionTenant()
  const { mode } = useEnvironment()
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useAutoResizeTextarea(workspace.promptInput)

  const hasUserTurn = workspace.conversation.some((m) => m.role === 'user')

  const lastUserMessage = useMemo(() => {
    const users = workspace.conversation.filter((m) => m.role === 'user')
    return users[users.length - 1]?.body ?? question
  }, [workspace.conversation, question])

  const latestAnswer = useMemo(() => {
    const assistants = workspace.conversation.filter(
      (m) => m.role === 'assistant' && !m.id.endsWith('-welcome') && m.status === 'done',
    )
    return assistants[assistants.length - 1] ?? null
  }, [workspace.conversation])

  const displayPrompt = hasUserTurn ? lastUserMessage : question
  const initialAnswerBody =
    workspace.initialAnswer.status === 'done' ? workspace.initialAnswer.body : ''
  const answerBody = latestAnswer?.body ?? initialAnswerBody ?? groundedAnswer
  const showLatestAnswer =
    workspace.initialAnswer.status === 'loading' || answerBody.trim().length > 0

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [workspace.conversation, workspace.isSubmitting])

  const handleSubmit = useCallback(() => {
    const text = workspace.promptInput.trim()
    if (!text || workspace.isSubmitting) return
    void workspace.submitPrompt(text)
  }, [workspace])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const footerHint = !tenantReady
    ? 'Resolving session tenant…'
    : !tenantId.trim()
      ? 'Sign in so Ask Zord can scope answers to your tenant.'
      : workspace.isSubmitting
        ? 'Querying prompt-layer for your session tenant…'
        : PAYMENT_OPERATIONS.footerLabel

  return (
    <article className={WORKSPACE_PANEL_SHELL} data-testid="workspace-intelligence-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2" role="tablist" aria-label="Workspace context">
          {workspaceTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2.5 text-[13px] font-medium transition ${
                activeTab === tab ? WORKSPACE_TAB_ACTIVE : WORKSPACE_TAB_INACTIVE
              }`}
            >
              {tab}
            </button>
          ))}
          <span
            className="cursor-not-allowed rounded-full border border-dashed border-black/15 bg-[#fafafa] px-4 py-2.5 text-[13px] font-medium text-[#8a8a86]"
            title={PAYMENT_OPERATIONS.routingTabDisabled}
            data-testid="workspace-routing-tab-disabled"
          >
            {PAYMENT_OPERATIONS.routingTabDisabled}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionPill state={workspace.connectionState} />
          <button
            type="button"
            onClick={workspace.startNewChat}
            className="rounded-[12px] border border-black/10 bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#111111] hover:bg-[#fafafa]"
          >
            New chat
          </button>
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-[1.5rem] border border-black/10 bg-[#fbfbfc]">
        <div className="shrink-0 border-b border-black/8 px-4 py-5 sm:px-5">
          <div className="max-w-[28rem]">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#8a8a86]">
              {PAYMENT_OPERATIONS.askPanelTitle}
            </div>
            <div className={`mt-2 text-[1.05rem] font-medium tracking-[-0.03em] ${WORKSPACE_TEXT_PRIMARY}`}>
              {PAYMENT_OPERATIONS.askPanelSubtitle}
            </div>
            <p className={`mt-1 text-[12px] ${WORKSPACE_TEXT_MUTED}`}>
              {mode === 'sandbox' ? 'Sandbox' : 'Live'} · {activeTab} context
            </p>
          </div>

          <div className="mt-5 rounded-[1.35rem] border border-black/10 bg-white p-4 sm:p-5">
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live reasoning prompt
            </div>
            <div className={`mt-4 max-w-[34rem] text-[1.05rem] leading-7 tracking-[-0.03em] ${WORKSPACE_TEXT_PRIMARY}`}>
              {displayPrompt}
            </div>
            <div className={`mt-3 text-[12px] leading-5 ${WORKSPACE_TEXT_MUTED}`}>{supporting}</div>
          </div>

          {showLatestAnswer ? (
            <div className="mt-5" data-testid="workspace-latest-answer">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8a8a86]">Latest answer</div>
              <div className={`mt-3 text-[14px] leading-relaxed ${WORKSPACE_TEXT_PRIMARY}`}>
                {workspace.initialAnswer.status === 'loading' && !latestAnswer ? (
                  <p className="text-[#8a8a86]">Querying prompt-layer for your session tenant…</p>
                ) : (
                  <MarkdownMessage body={answerBody} />
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
          {hasUserTurn ? (
            <div className="space-y-6">
              {workspace.conversation
                .filter((m) => !m.id.endsWith('-welcome'))
                .map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
            </div>
          ) : null}
          <div ref={chatEndRef} className="h-4" />
        </div>

        <div className="shrink-0 border-t border-black/8 px-4 py-4 sm:px-5">
          <div className="rounded-[1.35rem] border border-black/10 bg-[#eef1f5] p-3">
            <p className={`mb-2 text-center text-[12px] ${WORKSPACE_TEXT_MUTED}`}>{PAYMENT_OPERATIONS.footerLabel}</p>
            <div className="flex items-end gap-2 rounded-[1rem] border border-black/10 bg-white p-3">
              <ZordAvatar className="!h-11 !w-11" />
              <div className="min-w-0 flex-1">
                <textarea
                  ref={textareaRef}
                  value={workspace.promptInput}
                  onChange={(e) => workspace.setPromptInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={PAYMENT_OPERATIONS.composerPlaceholder}
                  rows={1}
                  disabled={workspace.isSubmitting}
                  className="block w-full resize-none bg-transparent text-[15px] leading-relaxed text-[#111111] outline-none placeholder:text-[#8a8a86] disabled:opacity-60"
                />
                <p className="mt-1 text-[11px] leading-snug text-[#8a8a86]">{footerHint}</p>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={workspace.isSubmitting || !workspace.promptInput.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-black/10 bg-[#d7e4f4] text-[#111111] transition hover:bg-[#c5d8eb] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                <Glyph name="arrow-up-right" className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
