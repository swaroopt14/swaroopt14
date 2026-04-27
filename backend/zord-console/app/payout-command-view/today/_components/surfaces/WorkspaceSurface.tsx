'use client'

import type { WorkspaceSimulation, WorkspaceTab } from '../model'
import { workspaceTabs, workspaceTiles } from '../model'
import { Glyph } from '../shared'

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
}) {
  const heroBars = [0.14, 0.18, 0.22, 0.28, 0.4, 0.56, 0.72, 0.86, 1, 0.9, 0.8, 0.68, 0.56, 0.44, 0.36, 0.42, 0.48, 0.44, 0.36, 0.3]
  const heroActiveStart = 4
  const heroActiveEnd = 15
  const previousCycleBars = scenario.heroBars.slice(0, 6)
  const currentCycleBars = scenario.heroBars.slice(-6)

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
                  <span className="h-2.5 w-2.5 rounded-full bg-[#4ADE80]" />
                  Live operating context
                </div>
              </div>

              <div className="mt-5 rounded-[1.35rem] border border-[#E5E5E5] bg-[#fcfcfa] p-4 sm:p-5">
                <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#166534]">
                  <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
                  Live reasoning prompt
                </div>
                <div className="mt-4 space-y-3">
                  <div className="ml-auto max-w-[90%] rounded-[14px] bg-[#111111] px-4 py-3 text-[1.03rem] leading-7 tracking-[-0.02em] text-white">
                    {scenario.question}
                  </div>
                  <div className="ml-auto text-[11px] text-[#8a8a86]">11:32 AM</div>
                  <div className="max-w-[90%] rounded-[14px] bg-[#f7f7f4] px-4 py-3 text-[13px] leading-6 text-[#6f716d]">
                    {scenario.supporting}
                  </div>
                </div>
              </div>

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
                          ? 'border-[#4ADE80]/35 bg-[#effcf3] text-[#14532d]'
                          : 'border-[#E5E5E5] bg-[#f7f7f4] text-[#6f716d] hover:border-[#4ADE80]/30 hover:text-[#14532d]'
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
            </div>

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
          </div>

          <div className="mt-4 rounded-[1.35rem] border border-black/5 bg-[#1F1F1F] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.10)]">
            <div className="flex items-center gap-3 rounded-[1rem] border border-white/10 bg-[#232323] p-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-[0.85rem] bg-[#4ADE80] text-[#111111]">
                <Glyph name="zap" className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <input
                  value={promptInput}
                  onChange={(event) => onPromptInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onPromptSubmit()
                  }}
                  placeholder="Ask anything or search"
                  className="w-full bg-transparent text-center text-[15px] text-white/90 outline-none placeholder:text-white/42"
                />
                <div className="mt-1 text-center text-[11px] text-white/42">Route posture, bank coordination, and proof readiness</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onPromptSubmit} className="flex h-12 w-12 items-center justify-center rounded-[0.85rem] border border-white/8 bg-transparent text-white" aria-label="Run workspace prompt">
                  <Glyph name="arrow-up-right" className="h-[18px] w-[18px]" />
                </button>
                <button type="button" className="flex h-12 w-12 items-center justify-center rounded-[0.85rem] border border-white/8 bg-transparent text-white" aria-label="Workspace tools">
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
