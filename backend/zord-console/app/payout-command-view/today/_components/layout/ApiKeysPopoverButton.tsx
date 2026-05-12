'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import { SANDBOX_API_KEYS, SANDBOX_DOCS_LINKS } from '@/services/payout-command/sandbox-data'
import { Glyph } from '../shared'

export function ApiKeysPopoverButton() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const publishable = SANDBOX_API_KEYS.find((k) => k.type === 'publishable' && k.mode === 'sandbox')!
  const secret = SANDBOX_API_KEYS.find((k) => k.type === 'secret' && k.mode === 'sandbox')!

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-9 items-center gap-1.5 rounded-[8px] border px-2.5 text-[14px] font-semibold transition ${
          open
            ? 'border-[#111111] bg-[#f4f4f2] text-[#111111]'
            : 'border-black/10 bg-white text-[#111111] hover:bg-[#fafafa]'
        }`}
      >
        <Glyph name="key" className="h-3.5 w-3.5 opacity-90" />
        API keys
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[90] cursor-default bg-black/10 sm:hidden"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-[calc(100%+0.5rem)] z-[100] w-[min(calc(100vw-1.25rem),20.5rem)] rounded-xl border border-black/10 bg-white p-4 shadow-[0_16px_48px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.04)]"
            role="dialog"
            aria-label="Sandbox API keys"
          >
            <div className="flex items-start justify-between gap-2 border-b border-black/8 pb-3">
              <div>
                <p className="text-[14px] font-semibold text-[#111111]">API keys</p>
                <p className="mt-0.5 text-[12px] text-[#64748b]">Sandbox · test mode only</p>
              </div>
              <a
                href={SANDBOX_DOCS_LINKS.apiReference}
                target="_blank"
                rel="noreferrer noopener"
                className="shrink-0 text-[12px] font-medium text-[#166534] underline decoration-[#86efac] underline-offset-2 hover:decoration-[#166534]"
              >
                Docs
              </a>
            </div>

            <CompactKeyRow label="Publishable" value={publishable.value} />
            <CompactKeyRow label="Secret" value={secret.value} masked />

            <Link
              href="/payout-command-view/settings/api-keys"
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-[#fafaf8] py-2 text-[13px] font-medium text-[#111111] transition hover:bg-[#f0f0ed]"
              onClick={() => setOpen(false)}
            >
              Manage keys
              <Glyph name="arrow-up-right" className="h-3 w-3" />
            </Link>
          </div>
        </>
      ) : null}
    </div>
  )
}

function CompactKeyRow({ label, value, masked }: { label: string; value: string; masked?: boolean }) {
  const [revealed, setRevealed] = useState(!masked)
  const [copied, setCopied] = useState(false)

  const display =
    revealed || !masked ? value : `${value.slice(0, 10)}${'•'.repeat(6)}${value.slice(-4)}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{label}</span>
        <div className="flex items-center gap-0.5">
          {masked ? (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="rounded-md p-1 text-[#64748b] transition hover:bg-black/5"
              aria-label={revealed ? 'Hide key' : 'Reveal key'}
            >
              <Glyph name={revealed ? 'eye-off' : 'eye'} className="h-3 w-3" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[#166534] transition hover:bg-[#ecfdf3]"
          >
            <Glyph name={copied ? 'check' : 'copy'} className="h-3 w-3" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <code className="block max-w-full overflow-x-auto rounded-lg border border-black/8 bg-[#fafaf8] px-2.5 py-2 font-mono text-[12px] leading-relaxed text-[#0f172a]">
        {display}
      </code>
    </div>
  )
}
