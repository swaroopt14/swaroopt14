'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Bar, BarChart, Line, LineChart, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { workspacePromptCopy, workspaceTabs, type WorkspaceTab } from '@/services/payout-command/model'
import type { WorkspaceConversationMessage, WorkspaceLoadingPhase } from '@/services/payout-command/types'
import type { WorkspaceState } from '../hooks/useWorkspaceState'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { Glyph } from '../shared'

const PHASE_SPINNER_LABEL: Record<WorkspaceLoadingPhase, string> = {
  understanding: 'Thinking',
  fetching: 'Fetching evidence',
  listing: 'Listing records',
  checking: 'Checking signals',
  summarizing: 'Summarizing',
}

function formatThreadDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso))
  } catch {
    return ''
  }
}

function ZordAvatar({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#39E07E] text-[#0A0A0A] shadow-sm ring-1 ring-[#39E07E]/40 ${className}`}
      aria-hidden
    >
      <Glyph name="zap" className="h-[18px] w-[18px]" />
    </span>
  )
}

function UserAvatar() {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700"
      aria-hidden
    >
      You
    </span>
  )
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 pl-1 align-middle" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  )
}

function AssistantLoadingIndicator({ phase }: { phase?: WorkspaceLoadingPhase | null }) {
  const label = phase ? PHASE_SPINNER_LABEL[phase] : 'Thinking'
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
      {label}
      <ThinkingDots />
    </span>
  )
}

function ConnectionPill({ state }: { state: 'idle' | 'connected' | 'error' }) {
  if (state === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-800">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Unavailable
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Ready
    </span>
  )
}
function PromptVisualization({ viz }: { viz: NonNullable<WorkspaceConversationMessage['visualization']> }) {
  if (!viz || !viz.series || viz.series.length === 0) return null

  const chartType = viz.chart_type || 'bar'
  const data = viz.series.map((p) => ({ name: p.label, value: p.value }))

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[14px] font-semibold text-slate-900">{viz.title}</p>
      {viz.subtitle ? <p className="mt-1 text-[12px] text-slate-500">{viz.subtitle}</p> : null}
      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart data={data}><XAxis dataKey="name" /><YAxis /><Tooltip /><Line dataKey="value" stroke="#0f172a" strokeWidth={2} dot={false} /></LineChart>
          ) : chartType === 'donut' ? (
            <PieChart><Tooltip /><Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>{data.map((_, i) => <Cell key={i} />)}</Pie></PieChart>
          ) : (
            <BarChart data={data}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#111827" radius={[6, 6, 0, 0]} /></BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {viz.insights?.length ? (
        <ul className="mt-3 list-disc pl-5 text-[12px] text-slate-600">
          {viz.insights.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      ) : null}
    </div>
  )
}
function MessageBubble({ message }: { message: WorkspaceConversationMessage }) {
  const isUser = message.role === 'user'
  const isLoading = message.status === 'typing'
  const isError = message.status === 'error'

  if (isUser) {
    return (
      <div className="flex gap-3">
        <UserAvatar />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold text-slate-900">You</p>
            <span className="shrink-0 text-[12px] text-slate-400">{message.timestamp}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{message.body}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <ZordAvatar />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[14px] font-semibold text-slate-900">Zord</p>
          <div className="flex items-center gap-2">
            {!isLoading ? <span className="text-[12px] text-slate-400">{message.timestamp}</span> : null}
          </div>
        </div>

        <p
          className={`mt-1 whitespace-pre-wrap text-[15px] leading-relaxed ${
            isError ? 'text-red-800' : isLoading ? 'text-slate-500' : 'text-slate-700'
          }`}
        >
          {isLoading ? null : message.body}
          {isLoading ? <AssistantLoadingIndicator phase={message.loadingPhase} /> : null}
        </p>

        {!isLoading && message.citations && message.citations.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Sources</p>
            {message.citations.slice(0, 4).map((c, i) => (
              <div
                key={`${c.chunk_id ?? c.record_id ?? i}`}
                className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-[13px] leading-relaxed text-slate-600"
              >
                {(c.source_type || c.record_id) && (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    {[c.source_type, c.record_id].filter(Boolean).join(' · ')}
                  </p>
                )}
                {c.snippet?.trim() || '—'}
              </div>
            ))}
          </div>
        ) : null}

        {!isLoading && message.confidence ? (
          <span className="mt-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-800">
            {message.confidence}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function useAutoResizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])
  return ref
}

export function WorkspaceSurface({
  activeTab,
  setActiveTab,
  workspace,
  suggestions,
  selectedPromptLabel,
}: {
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  workspace: WorkspaceState
  suggestions: readonly string[]
  selectedPromptLabel: string | null
}) {
  const copy = workspacePromptCopy[activeTab]
  const { tenantId, tenantReady } = useSessionTenant()
  const { mode } = useEnvironment()
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useAutoResizeTextarea(workspace.promptInput)
  const hasUserTurn = workspace.conversation.some((m) => m.role === 'user')

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
        : 'Answers are grounded on payout evidence for your signed-in tenant.'

  return (
    <div className="-mx-1 flex flex-col sm:-mx-2 lg:-mx-3">
      {/* Full-page chat shell */}
      <div className="flex h-[min(78vh,720px)] min-h-[480px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.03]">
        {/* Sidebar — history */}
        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-slate-100 bg-[#f7f7f5] md:flex">
          <div className="border-b border-slate-200/80 p-3">
            <button
              type="button"
              onClick={workspace.startNewChat}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="text-lg leading-none text-slate-500">+</span>
              New chat
            </button>
          </div>
          <div className="px-3 pb-2 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">History · {activeTab}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {workspace.threads.length === 0 ? (
              <p className="px-2 py-2 text-[12px] leading-relaxed text-slate-500">No past chats for this tab yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {workspace.threads.map((thread) => (
                  <li key={thread.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => workspace.selectThread(thread.id)}
                      className={`w-full rounded-lg px-3 py-2.5 pr-9 text-left transition ${
                        workspace.activeThreadId === thread.id
                          ? 'bg-white shadow-sm ring-1 ring-slate-200'
                          : 'hover:bg-white/70'
                      }`}
                    >
                      <p className="truncate text-[13px] font-medium text-slate-900">{thread.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{formatThreadDate(thread.updatedAt)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => workspace.deleteThread(thread.id)}
                      className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:block"
                      aria-label="Delete conversation"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* In-chat top bar */}
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ZordAvatar className="!h-8 !w-8" />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-slate-900">Ask Zord</p>
                <p className="truncate text-[12px] text-slate-500">
                  {mode === 'sandbox' ? 'Sandbox' : 'Live'} · {activeTab} context
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ConnectionPill state={workspace.connectionState} />
              <button
                type="button"
                onClick={workspace.startNewChat}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 md:hidden"
              >
                New chat
              </button>
            </div>
          </header>

          {/* Context tabs */}
          <div className="shrink-0 border-b border-slate-100 bg-[#fafafa] px-4 py-2 sm:px-5">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Workspace context">
              {workspaceTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition sm:text-[13px] ${
                    activeTab === tab
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
            {!hasUserTurn ? (
              <div className="mx-auto flex max-w-2xl flex-col items-center pt-6 text-center sm:pt-10">
                <ZordAvatar className="!h-11 !w-11" />
                <h3 className="mt-4 text-[1.35rem] font-semibold tracking-[-0.02em] text-slate-900">{copy.question}</h3>
                <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-slate-500">{copy.supporting}</p>
                <div className="mt-8 flex w-full flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={workspace.isSubmitting}
                      onClick={() => void workspace.submitPrompt(suggestion)}
                      className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-50 ${
                        selectedPromptLabel === suggestion
                          ? 'border-sky-400 bg-sky-50 text-slate-900 ring-1 ring-sky-400/30'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-6">
                {workspace.conversation
                  .filter((m) => !m.id.endsWith('-welcome'))
                  .map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
              </div>
            )}
            <div ref={chatEndRef} className="h-6" />
          </div>

          {/* Composer */}
          <footer className="shrink-0 border-t border-slate-100 bg-[#fafafa] px-4 py-3.5 sm:px-5 sm:py-4">
            {hasUserTurn && suggestions.length > 0 ? (
              <div className="mx-auto mb-3 flex max-w-2xl flex-wrap gap-1.5">
                {suggestions.slice(0, 3).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={workspace.isSubmitting}
                    onClick={() => void workspace.submitPrompt(suggestion)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] text-slate-600 hover:border-slate-300 disabled:opacity-50"
                  >
                    {suggestion.length > 42 ? `${suggestion.slice(0, 39)}…` : suggestion}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mx-auto flex max-w-2xl items-end gap-2">
              <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-200/80">
                <textarea
                  ref={textareaRef}
                  value={workspace.promptInput}
                  onChange={(e) => workspace.setPromptInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Zord about payouts…"
                  rows={1}
                  disabled={workspace.isSubmitting}
                  className="block w-full resize-none bg-transparent text-[15px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
                />
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{footerHint}</p>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={workspace.isSubmitting || !workspace.promptInput.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0A0A0A] text-white shadow-md transition hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-label="Send message"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
