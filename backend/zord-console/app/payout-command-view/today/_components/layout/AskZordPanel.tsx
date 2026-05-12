'use client'

import { ASK_ZORD_QUICK_PROMPTS, type AskZordState } from '../hooks/useAskZordState'
import { Glyph } from '../shared'

type AskZordPanelProps = Pick<
  AskZordState,
  'isOpen' | 'close' | 'input' | 'setInput' | 'status' | 'response' | 'run'
>

export function AskZordPanel({ isOpen, close, input, setInput, status, response, run }: AskZordPanelProps) {
  return (
    <aside
      className={`fixed right-4 top-[7rem] z-[70] w-[22.5rem] max-w-[calc(100vw-2rem)] rounded-[1.25rem] border border-[#E5E5E5] bg-white p-4 shadow-[0_18px_44px_rgba(0,0,0,0.14)] transition ${
        isOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[110%] opacity-0'
      }`}
      aria-hidden={!isOpen}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a8a86]">Ask Zord</div>
          <div className="mt-1 text-[15px] font-medium text-[#111111]">AI analyst on evidence stack</div>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded-[10px] border border-[#E5E5E5] bg-[#f7f7f4] px-2 py-1 text-[12px] text-[#6f716d]"
        >
          Close
        </button>
      </div>

      {/* Quick prompts */}
      <div className="mt-3 space-y-2">
        {ASK_ZORD_QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => run(prompt)}
            className="w-full rounded-[0.9rem] border border-[#E5E5E5] bg-[#f8f8f6] px-3 py-2.5 text-left text-[12px] leading-5 text-[#6f716d] transition hover:border-[#4ADE80]/30 hover:text-[#111111]"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Answer panel */}
      <div className="mt-3 rounded-[0.95rem] border border-[#E5E5E5] bg-[#fcfcfa] p-3">
        <div className="text-[11px] font-medium text-[#111111]">{response?.title ?? 'Latest answer'}</div>
        <div className="mt-2 whitespace-pre-line text-[12px] leading-5 text-[#6f716d]">
          {status === 'loading'
            ? 'Reading payout evidence…'
            : response?.body ?? 'Ask about any payment or pattern.'}
        </div>
      </div>

      {/* Input row */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run(input)
          }}
          placeholder="Ask Zord about any payment or pattern"
          className="h-10 min-w-0 flex-1 rounded-[0.85rem] border border-[#E5E5E5] bg-[#f8f8f6] px-3 text-[12px] text-[#111111] outline-none placeholder:text-[#8a8a86]"
        />
        <button
          type="button"
          onClick={() => run(input)}
          className="flex h-10 w-10 items-center justify-center rounded-[0.85rem] bg-[#111111] text-white"
          aria-label="Run Ask Zord query"
        >
          <Glyph name="arrow-up-right" className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}
