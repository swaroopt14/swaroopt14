'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { Glyph } from '../shared'

/**
 * ModeTogglePill — Stripe-style mode picker that lives in the dock nav.
 * Click to drop down a 2-row menu (Sandbox / Live). Live is locked unless
 * `canSwitchToLive` is true; the locked option points at the activate wizard.
 *
 * Sandbox + live live at separate URLs (`/sandbox` and `/payout-command-view/today`).
 * Switching mode = navigating between routes, not flipping local state.
 */
export function ModeTogglePill({ onActivateClick }: { onActivateClick: () => void }) {
  const { mode, canSwitchToLive, liveActivationStatus } = useEnvironment()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isSandbox = mode === 'sandbox'

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-11 items-center gap-2 rounded-xl border px-3.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.85)] transition ${
          isSandbox
            ? 'border-amber-400/70 bg-gradient-to-b from-[#fff7ed] to-[#ffedd5] text-[#9A3412]'
            : 'border-violet-400/75 bg-gradient-to-b from-[#f5f3ff] to-[#ede9fe] text-[#5b21b6] shadow-[0_3px_12px_-2px_rgba(91,33,182,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] hover:border-violet-500/85'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex flex-col items-start leading-none">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] opacity-70">Mode</span>
          <span className="mt-0.5 text-[15px] font-bold tracking-[-0.02em]">{isSandbox ? 'Sandbox' : 'Live'}</span>
        </span>
        <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-[60] mt-1.5 w-[18rem] origin-top-left rounded-[12px] border border-[#E5E5E5] bg-white p-1.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
        >
          {/* Sandbox row */}
          <button
            type="button"
            onClick={() => {
              router.push('/sandbox')
              setOpen(false)
            }}
            className={`flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition ${
              isSandbox ? 'bg-[#FFF7ED]' : 'hover:bg-[#fafafa]'
            }`}
            role="option"
            aria-selected={isSandbox}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F59E0B] text-white">
              <Glyph name="terminal" className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[13px] font-semibold text-[#0f172a]">Sandbox</p>
                {isSandbox ? (
                  <Glyph name="check" className="h-3 w-3 text-[#F59E0B]" />
                ) : null}
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-[#64748b]">
                Test mode · pk_test_… keys · no real funds
              </p>
            </div>
          </button>

          {/* Live row */}
          {canSwitchToLive ? (
            <button
              type="button"
              onClick={() => {
                router.push('/payout-command-view/today')
                setOpen(false)
              }}
              className={`mt-1 flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition ${
                !isSandbox ? 'bg-violet-50 ring-1 ring-violet-200/80' : 'hover:bg-[#fafafa]'
              }`}
              role="option"
              aria-selected={!isSandbox}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-600 text-white shadow-sm">
                <Glyph name="home" className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-semibold text-violet-950">Live</p>
                  {!isSandbox ? <Glyph name="check" className="h-3 w-3 text-violet-600" /> : null}
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[#64748b]">
                  Production · pk_live_… keys · real funds
                </p>
              </div>
            </button>
          ) : (
            <div className="mt-1 flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 opacity-70">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#94a3b8] text-white">
                <Glyph name="lock" className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-semibold text-[#0f172a]">Live</p>
                  <span className="rounded-full bg-[#94a3b8]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#475569]">
                    {liveActivationStatus === 'in_review' ? 'In review' : 'Locked'}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[#64748b]">
                  {liveActivationStatus === 'in_review'
                    ? 'Activation submitted · estimated 24h'
                    : 'Complete activation to issue live keys'}
                </p>
                {liveActivationStatus !== 'in_review' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onActivateClick()
                    }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#0f172a] underline-offset-2 hover:underline"
                  >
                    Activate now
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M3 9 9 3M5 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
