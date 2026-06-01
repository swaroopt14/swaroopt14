'use client'

import { useEffect, useState, type ReactNode } from 'react'

const DEFAULT_LOCALE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
}

/** Renders locale time only after mount — avoids SSR/client clock drift hydration errors. */
export function HydrationSafeLocaleTime({
  date,
  locale = 'en-IN',
  options = DEFAULT_LOCALE_TIME,
}: {
  date: Date
  locale?: string
  options?: Intl.DateTimeFormatOptions
}) {
  const [label, setLabel] = useState('')
  const stamp = date.getTime()

  useEffect(() => {
    setLabel(new Date(stamp).toLocaleString(locale, options))
  }, [stamp, locale, options])

  if (!label) return null
  return <time dateTime={new Date(stamp).toISOString()}>{label}</time>
}

/** Cool blue-grey band (replaces warm beige #f4f4f1 family). */
export const COMMAND_COOL_PAGE_BG = 'bg-[#f4f4f1]'
export const COMMAND_COOL_PANEL_BG = 'bg-[#f1f5f9]'
export const COMMAND_COOL_SUBTLE_BG = 'bg-slate-50'
export const COMMAND_COOL_BORDER = 'border-slate-200/90'

export function noticeDismissed(storageKey: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}

export function dismissNotice(storageKey: string) {
  try {
    sessionStorage.setItem(storageKey, '1')
  } catch {
    /* ignore */
  }
}

export function reopenNotice(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    /* ignore */
  }
}

/** Dismissible black notice — green Recommended chip (home / dispatch / journal parity). */
export function RecommendedBlackCard({
  eyebrow,
  title,
  body,
  bodyBold = false,
  footer,
  onDismiss,
  children,
}: {
  eyebrow?: string
  title: string
  body?: ReactNode
  bodyBold?: boolean
  footer?: ReactNode
  onDismiss: () => void
  children?: ReactNode
}) {
  return (
    <aside className="mb-4 overflow-hidden rounded-xl border border-white/12 bg-[#0A0A0A] shadow-[0_14px_44px_rgba(0,0,0,0.32)] ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#39E07E] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#000000]">
            Recommended
          </span>
          {eyebrow ? <span className="text-[12px] font-medium text-white/50">{eyebrow}</span> : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[20px] font-light leading-none text-white/55 transition hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="px-4 py-3.5">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-white">{title}</h3>
        {body ? (
          <div
            className={`mt-1.5 text-[13px] leading-relaxed ${
              bodyBold ? 'font-bold text-white' : 'font-medium text-white/72'
            }`}
          >
            {body}
          </div>
        ) : null}
        {footer ? <div className="mt-3 text-[12px] font-medium tabular-nums text-white/65">{footer}</div> : null}
        {children ? <div className="mt-4 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </aside>
  )
}
