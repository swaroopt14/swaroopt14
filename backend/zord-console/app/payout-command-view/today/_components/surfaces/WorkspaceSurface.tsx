'use client'

import { useEffect, useRef } from 'react'
import type { WorkspaceSimulation, WorkspaceTab } from '../model'
import { workspaceTabs, workspaceTiles } from '../model'
import { Glyph } from '../shared'

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

function connectionBadgeCopy(connectionState: 'idle' | 'connected' | 'error') {
  if (connectionState === 'connected') return 'Live operating context · Connected'
  if (connectionState === 'error') return 'Live operating context · Fallback mode'
  return 'Live operating context'
}

function messageRoleCopy(role: WorkspaceConversationMessage['role']) {
  return role === 'user' ? 'Operator' : 'Zord'
}

function messageBubbleClass(message: WorkspaceConversationMessage) {
  if (message.role === 'user') {
    return 'bg-[#111111] text-white shadow-[0_18px_30px_rgba(0,0,0,0.14)]'
  }

  if (message.status === 'error') {
    return 'border border-[#f6cbd1] bg-[linear-gradient(180deg,#fff7f8_0%,#fff2f4_100%)] text-[#8f1736]'
  }

  return 'border border-[#ecece7] bg-[linear-gradient(180deg,#ffffff_0%,#fbfbf8_100%)] text-[#40413d] shadow-[0_8px_18px_rgba(0,0,0,0.04)]'
}

export function WorkspaceSurface({
  activeTab,
  setActiveTab,
  scenario,
  selectedPromptLabel,
  suggestions,
  onSuggestionClick,
  promptInput,
  onPromptInputChange,
  onPromptSubmit,
  latestAnswerStatus,
  latestAnswerTitle,
  latestAnswerBody,
  latestAnswerConfidence,
  latestAnswerCitationSnippet,
  latestAnswerHasVisualization,
  connectionState,
  conversation,
}: {
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  scenario: WorkspaceSimulation
  selectedPromptLabel: string | null
  suggestions: readonly string[]
  onSuggestionClick: (suggestion: string) => void
  promptInput: string
  onPromptInputChange: (value: string) => void
  onPromptSubmit: () => void
  latestAnswerStatus: 'idle' | 'loading' | 'typing' | 'complete'
  latestAnswerTitle: string
  latestAnswerBody: string
  latestAnswerConfidence: string | null
  latestAnswerCitationSnippet: string | null
  latestAnswerHasVisualization: boolean
  connectionState: 'idle' | 'connected' | 'error'
  conversation: readonly WorkspaceConversationMessage[]
}) {
  const heroBars = [0.14, 0.18, 0.22, 0.28, 0.4, 0.56, 0.72, 0.86, 1, 0.9, 0.8, 0.68, 0.56, 0.44, 0.36, 0.42, 0.48, 0.44, 0.36, 0.3]
  const heroActiveStart = 4
  const heroActiveEnd = 15
  const previousCycleBars = scenario.heroBars.slice(0, 6)
  const currentCycleBars = scenario.heroBars.slice(-6)
  const hasUserConversation = conversation.some((message) => message.role === 'user')
  const chatContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [conversation])

  const latestMessage = conversation[conversation.length - 1]

  return (
    <div className="mt-8 rounded-[2.2rem] border border-[#E5E5E5] bg-[#f4f4f1] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.08)] sm:p-5">
      <div className="grid items-stretch gap-4 xl:grid-cols-[1.78fr_1.46fr]">
        <div className="grid gap-4 xl:grid-cols-[0.98fr_0.84fr] xl:grid-rows-[1fr_auto]">
          <article className="flex min-h-[33.5rem] flex-col overflow-hidden rounded-[1.7rem] border border-[#cfdaea] bg-[#DDE8F8] shadow-[0_12px_28px_rgba(0,0,0,0.05)]">
            <div className="relative px-6 pt-6">
              <div className="max-w-[12rem] text-[13px] font-medium leading-8 tracking-[0.01em] text-[#5c7194]">
                {scenario.heroLabel}
              </div>
              <div className="mt-5 text-[4.35rem] font-light tracking-[-0.06em] text-[#111111]">{scenario.heroValue}</div>
              <div className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/70 text-[#5b76a1]">
                <Glyph name="document" className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-6 flex flex-1 items-end px-5 pb-6">
              <div className="flex h-[16.5rem] w-full items-end justify-between">
                {heroBars.map((height, index) => (
                  <span
                    key={`hero-bar-${index}`}
                    className="block w-[0.62rem] shrink-0 rounded-[999px] sm:w-[0.72rem]"
                    style={{
                      height: `${Math.max(10, Math.round(height * 100))}%`,
                      background: index >= heroActiveStart && index <= heroActiveEnd ? '#101726' : '#93ABCB',
                    }}
                  />
                ))}
              </div>
            </div>
          </article>

          <div className="flex h-full flex-col gap-4 xl:row-span-2">
            <article className="rounded-[1.6rem] border border-[#E5E5E5] bg-white p-5 shadow-[0_8px_22px_rgba(0,0,0,0.05)]">
              <div className="text-[13px] font-medium tracking-[0.01em] text-[#6f716d]">{scenario.listTitle}</div>
              <div className="mt-7 space-y-4">
                {scenario.listRows.map(([label, value]) => (
                  <div key={label}>
                    <div className="flex items-center justify-between gap-3 text-[#111111]">
                      <span className="text-[15px]">{label}</span>
                      <span className="text-[15px] font-medium">{value}</span>
                    </div>
                    <div className="mt-3 h-px bg-black/8" />
                  </div>
                ))}
              </div>
              <div className="mt-8 flex items-center justify-between gap-4">
                <div className="text-[13px] text-[#7a7a76]">{scenario.listFooter}</div>
                <button type="button" className="rounded-[1rem] border border-black/15 bg-[#f7f7f4] px-4 py-2.5 text-[13px] text-[#111111]">
                  {scenario.listAction}
                </button>
              </div>
            </article>

            <article className="rounded-[1.6rem] border border-[#E5E5E5] bg-white p-5 shadow-[0_8px_22px_rgba(0,0,0,0.05)]">
              <div className="text-[13px] font-medium tracking-[0.01em] text-[#6f716d]">{scenario.statTitle}</div>
              <div className="mt-5 text-[3.6rem] font-light tracking-[-0.06em] text-[#111111]">{scenario.statValue}</div>
              <div className="mt-2 text-[13px] leading-6 text-[#7a7a76]">{scenario.statNote}</div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-[0.95rem] border border-black/10 bg-[#f8f8f6] px-3 py-3">
                  <div
                    className="flex h-[5.2rem] items-end gap-1 rounded-[0.7rem] border border-black/8 px-2 pb-2"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(135deg, rgba(121,130,146,0.22) 0px, rgba(121,130,146,0.22) 12px, rgba(121,130,146,0.1) 12px, rgba(121,130,146,0.1) 24px)',
                    }}
                  >
                    {previousCycleBars.map((height, index) => (
                      <span
                        key={`previous-${index}`}
                        className="flex-1 rounded-[0.35rem] bg-[#7f8795]"
                        style={{ height: `${Math.max(24, (height / Math.max(...scenario.heroBars)) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 text-center text-[13px] text-[#7a7a76]">{scenario.compareLabels[0]}</div>
                </div>
                <div className="rounded-[0.95rem] border border-[#cfdaea] bg-[#bdd0ea] px-3 py-3">
                  <div className="flex h-[5.2rem] items-end gap-1 rounded-[0.7rem] border border-[#b3c8e4] bg-[#bdd0ea] px-2 pb-2">
                    {currentCycleBars.map((height, index) => (
                      <span
                        key={`current-${index}`}
                        className="flex-1 rounded-[0.35rem] bg-[#3e5f98]"
                        style={{ height: `${Math.max(26, (height / Math.max(...scenario.heroBars)) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 text-center text-[13px] text-[#446ea7]">{scenario.compareLabels[1]}</div>
                </div>
              </div>
            </article>

            <article className="flex flex-1 flex-col rounded-[1.6rem] border border-[#d9e3f1] bg-gradient-to-br from-white via-[#f8fbff] to-[#eef4fc] p-5 shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#61789b]">Recovery lane brief</div>
                  <p className="mt-3 text-[13px] leading-6 text-[#5f6f85]">
                    Overflow cleared through healthier partner lanes while maintaining callback trust and finance-proof continuity.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4ADE80]/35 bg-[#4ADE80]/14 px-2.5 py-1 text-[11px] font-medium text-[#166534]">
                  <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
                  Live
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-[0.9rem] border border-[#d4dfef] bg-white px-3 py-2.5">
                  <div className="text-[11px] text-[#7f8da2]">Stable</div>
                  <div className="mt-1 text-[15px] font-semibold text-[#27456f]">3 PSPs</div>
                </div>
                <div className="rounded-[0.9rem] border border-[#d4dfef] bg-white px-3 py-2.5">
                  <div className="text-[11px] text-[#7f8da2]">Lag risk</div>
                  <div className="mt-1 text-[15px] font-semibold text-[#27456f]">Low</div>
                </div>
                <div className="rounded-[0.9rem] border border-[#d4dfef] bg-white px-3 py-2.5">
                  <div className="text-[11px] text-[#7f8da2]">Proof-ready</div>
                  <div className="mt-1 text-[15px] font-semibold text-[#27456f]">142</div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  ['Razorpay overflow', 88],
                  ['Stripe callbacks', 72],
                  ['Proof packet assembly', 94],
                ].map(([label, progress]) => (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-[#6f7f96]">
                      <span>{label}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/80">
                      <div className="h-2 rounded-full bg-[#9db7db]" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="rounded-[1.6rem] border border-[#E5E5E5] bg-white p-5 shadow-[0_8px_22px_rgba(0,0,0,0.05)]">
            <div className="text-[13px] font-medium tracking-[0.01em] text-[#6f716d]">{scenario.bottomTitle}</div>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div className="text-[3.1rem] font-light tracking-[-0.05em] text-[#111111]">{scenario.bottomValue}</div>
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-black/12 bg-[#f7f7f4] text-[#7a7a76]">
                <Glyph name="arrow-up-right" className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 max-w-[30rem] text-[13px] leading-7 text-[#6f716d]">
              {scenario.bottomMeta}
            </div>
          </article>
        </div>

        <article className="flex min-h-[48rem] flex-col rounded-[1.85rem] border border-[#E5E5E5] bg-white p-4 text-[#111111] shadow-[0_16px_36px_rgba(0,0,0,0.07)] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {workspaceTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full border px-4 py-2.5 text-[13px] font-medium transition ${
                    activeTab === tab ? 'border-[#bcd4f1] bg-[#bcd4f1] text-[#111111]' : 'border-[#E5E5E5] bg-[#f5f5f3] text-[#6f716d]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#E5E5E5] bg-white text-[#6f716d]" aria-label="Workspace documents">
              <Glyph name="document" className="h-[18px] w-[18px]" />
            </button>
          </div>

          <div className="mt-5 flex flex-1 flex-col rounded-[1.5rem] border border-[#E5E5E5] bg-white px-4 py-5 sm:px-5">
            <div className="border-b border-[#E5E5E5] pb-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-[28rem]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">AI Intelligence Layer</div>
                  <div className="mt-2 text-[1.1rem] font-medium tracking-[-0.03em] text-[#111111]">
                    Route posture, owner handoff, and proof readiness in one reasoning layer.
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#4ADE80]/28 bg-[#4ADE80]/14 px-3 py-2 text-[12px] font-medium text-[#14532d]">
                  <span className={`h-2.5 w-2.5 rounded-full ${connectionState === 'error' ? 'bg-[#e11d48]' : 'bg-[#4ADE80]'}`} />
                  {connectionBadgeCopy(connectionState)}
                </div>
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-[#ebeae4] bg-[linear-gradient(180deg,#fcfcfa_0%,#f8f8f5_100%)] p-4 sm:p-5">
                <div className="flex flex-col gap-3 border-b border-[#ebeae4] pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#166534]">
                      <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
                      Live reasoning thread
                    </div>
                    <div className="mt-2 text-[13px] leading-6 text-[#6f716d]">
                      Use the workspace like a shared ops conversation. Zord responds from payout posture, callback timing, and proof-readiness context.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-[#7d7e79]">
                    <span className="rounded-full border border-[#e8e7e2] bg-white px-3 py-1.5">Context retained per tab</span>
                    <span className="rounded-full border border-[#e8e7e2] bg-white px-3 py-1.5">Citations on live answers</span>
                  </div>
                </div>

                <div
                  ref={chatContainerRef}
                  className={`mt-4 space-y-4 overflow-y-auto pr-1 ${
                    hasUserConversation ? 'max-h-[31rem] min-h-[22rem]' : 'max-h-[18rem]'
                  }`}
                >
                  {conversation.map((message, index) => (
                    <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {message.role === 'assistant' ? (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] border border-[#d8ead7] bg-[#ecfdf3] text-[#166534]">
                          <Glyph name="zap" className="h-3.5 w-3.5" />
                        </div>
                      ) : null}

                      <div className={`${message.role === 'user' ? 'max-w-[88%]' : 'max-w-[92%]'}`}>
                        <div className={`mb-2 flex items-center gap-2 text-[11px] ${message.role === 'user' ? 'justify-end text-[#8a8a86]' : 'text-[#8a8a86]'}`}>
                          <span className="font-medium text-[#676863]">{messageRoleCopy(message.role)}</span>
                          <span>{message.timestamp}</span>
                          {message.status === 'typing' ? <span className="text-[#166534]">Thinking…</span> : null}
                        </div>

                        <div className={`rounded-[18px] px-4 py-3.5 text-[14px] leading-7 ${messageBubbleClass(message)}`}>
                          {message.body}
                        </div>

                        {message.role === 'assistant' && message.citationSnippet ? (
                          <div className="mt-2 rounded-[12px] border border-[#dce5ef] bg-[#f5f9ff] px-3 py-2.5 text-[12px] leading-5 text-[#5d6e87]">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6f85a7]">Supporting context</div>
                            {message.citationSnippet}
                          </div>
                        ) : null}

                        {message.role === 'assistant' && (message.confidence || message.hasVisualization) ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {message.confidence ? (
                              <div className="inline-flex rounded-full border border-[#4ADE80]/35 bg-[#4ADE80]/16 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#166534]">
                                {message.confidence}
                              </div>
                            ) : null}
                            {message.hasVisualization ? (
                              <div className="inline-flex rounded-full border border-[#d4deec] bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#5d6e87]">
                                Chart payload ready
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {message.role === 'user' ? (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-[#111111] text-[11px] font-semibold text-white shadow-[0_10px_18px_rgba(0,0,0,0.14)]">
                          OP
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {!hasUserConversation && latestMessage ? (
                    <div className="rounded-[16px] border border-dashed border-[#e6e4de] bg-white/70 px-4 py-3 text-[12px] leading-6 text-[#8a8a86]">
                      Start with one of the suggested prompts below or ask a specific payout question. Zord will keep the thread scoped to the active workspace tab.
                    </div>
                  ) : null}
                </div>
              </div>

              {!hasUserConversation ? (
                <>
                  <div className="mt-5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">Suggested Questions</div>
                    <div className="mt-3 flex flex-wrap gap-2.5">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => onSuggestionClick(suggestion)}
                          className={`rounded-full border px-4 py-2.5 text-[13px] transition ${
                            selectedPromptLabel === suggestion
                              ? 'border-[#4ADE80]/35 bg-[#effcf3] text-[#14532d] shadow-[0_8px_18px_rgba(74,222,128,0.08)]'
                              : 'border-[#E5E5E5] bg-[#f7f7f4] text-[#6f716d] hover:border-[#4ADE80]/30 hover:bg-white hover:text-[#14532d]'
                          }`}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1.2rem] border border-[#cfdaea] bg-[#eaf1fc] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5c7194]">{latestAnswerTitle}</div>
                      {latestAnswerConfidence ? (
                        <span className="rounded-full border border-[#4ADE80]/35 bg-[#4ADE80]/16 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#166534]">
                          {latestAnswerConfidence}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 text-[14px] leading-7 text-[#243550]">
                      {latestAnswerStatus === 'loading' ? 'Reading prompt-layer evidence…' : latestAnswerBody}
                    </div>
                    {latestAnswerCitationSnippet ? (
                      <div className="mt-3 rounded-[10px] border border-[#d4deec] bg-white/70 px-3 py-2 text-[12px] leading-5 text-[#5d6e87]">
                        {latestAnswerCitationSnippet}
                      </div>
                    ) : null}
                    {latestAnswerHasVisualization ? (
                      <div className="mt-2 text-[11px] text-[#5c7194]">Visualization payload detected and ready for chart rendering.</div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            {!hasUserConversation ? (
              <div className="mt-5 flex-1">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">Operator Modules</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {workspaceTiles.map((tile, index) => (
                    <article key={tile.title} className="rounded-[1.25rem] border border-[#E5E5E5] bg-[#F7F7F4] px-5 py-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#4ADE80]/18 text-[#166534]">
                          <Glyph name={tile.icon} className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[1.05rem] font-medium tracking-[-0.03em] text-[#111111]">{tile.title}</div>
                          <p className="mt-3 text-[13px] leading-6 text-[#6f716d]">{scenario.moduleBodies[index] ?? tile.body}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-[1.5rem] border border-black/5 bg-[#1F1F1F] p-3 shadow-[0_10px_32px_rgba(0,0,0,0.14)]">
            <div className="flex flex-col gap-3 rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,#242424_0%,#202020_100%)] p-3 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[0.95rem] bg-[#4ADE80] text-[#111111] shadow-[0_10px_24px_rgba(74,222,128,0.22)]">
                <Glyph name="zap" className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="rounded-[1rem] border border-[#3b82f6]/80 bg-[#1d1d1d] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.18)]">
                  <input
                    value={promptInput}
                    onChange={(event) => onPromptInputChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onPromptSubmit()
                    }}
                    placeholder="Ask anything about payouts, callbacks, owners, or proof readiness"
                    className="w-full bg-transparent text-[18px] font-medium tracking-[-0.02em] text-white/92 outline-none placeholder:text-white/52 sm:text-[20px]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onPromptSubmit} className="flex h-12 w-12 items-center justify-center rounded-[0.95rem] border border-white/8 bg-transparent text-white transition hover:bg-white/6" aria-label="Run workspace prompt">
                  <Glyph name="arrow-up-right" className="h-[18px] w-[18px]" />
                </button>
                <button type="button" className="flex h-12 w-12 items-center justify-center rounded-[0.95rem] border border-white/8 bg-transparent text-white transition hover:bg-white/6" aria-label="Workspace tools">
                  <Glyph name="grid" className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
