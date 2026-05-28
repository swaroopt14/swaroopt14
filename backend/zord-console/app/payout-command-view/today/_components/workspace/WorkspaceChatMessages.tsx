'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { WorkspaceConversationMessage, WorkspaceLoadingPhase } from '@/services/payout-command/types'
import { Glyph } from '../shared'

export function MarkdownMessage({ body }: { body: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ node, ...props }) => <p className="mt-2" {...props} />,
        ul: ({ node, ...props }) => <ul className="mt-2 list-disc pl-5" {...props} />,
        ol: ({ node, ...props }) => <ol className="mt-2 list-decimal pl-5" {...props} />,
        li: ({ node, ...props }) => <li className="mt-1" {...props} />,
        strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
        em: ({ node, ...props }) => <em className="italic" {...props} />,
        table: ({ node, ...props }) => (
          <table className="mt-4 min-w-full divide-y divide-slate-200 border border-slate-200 text-sm" {...props} />
        ),
        th: ({ node, ...props }) => (
          <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold" {...props} />
        ),
        td: ({ node, ...props }) => (
          <td className="border border-slate-200 px-2 py-1" {...props} />
        ),
        pre: ({ node, ...props }) => (
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 text-[13px] text-slate-100" {...props} />
        ),
        code: ({ node, inline, className, ...props }) =>
          inline ? (
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px] text-slate-900" {...props} />
          ) : (
            <code className="block rounded bg-slate-950 p-2 text-[13px] text-slate-100" {...props} />
          ),
      }}
    >
      {body}
    </ReactMarkdown>
  )
}

const PHASE_SPINNER_LABEL: Record<WorkspaceLoadingPhase, string> = {
  understanding: 'Thinking',
  fetching: 'Fetching evidence',
  listing: 'Listing records',
  checking: 'Checking signals',
  summarizing: 'Summarizing',
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

export function ZordAvatar({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#39E07E] text-[#0A0A0A] shadow-sm ring-1 ring-[#39E07E]/40 ${className}`}
      aria-hidden
    >
      <Glyph name="zap" className="h-[18px] w-[18px]" />
    </span>
  )
}

export function ConnectionPill({ state }: { state: 'idle' | 'connected' | 'error' }) {
  if (state === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live operating context
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#eef1f5] px-2.5 py-1 text-[11px] font-medium text-[#111111]">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      Ready
    </span>
  )
}

export function MessageBubble({ message }: { message: WorkspaceConversationMessage }) {
  const isUser = message.role === 'user'
  const isLoading = message.status === 'typing'
  const isError = message.status === 'error'

  if (isUser) {
    return (
      <div className="flex gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700"
          aria-hidden
        >
          You
        </span>
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
          {!isLoading ? <span className="text-[12px] text-slate-400">{message.timestamp}</span> : null}
        </div>
        <div
          className={`mt-1 text-[15px] leading-relaxed ${
            isError ? 'text-red-800' : isLoading ? 'text-slate-500' : 'text-slate-700'
          }`}
        >
          {isLoading ? null : <MarkdownMessage body={message.body} />}
          {isLoading ? <AssistantLoadingIndicator phase={message.loadingPhase} /> : null}
        </div>
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
