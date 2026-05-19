'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { ZordLogo } from '@/components/ZordLogo'
import { dockItems, SANDBOX_DOCK_IDS, type DockId } from '@/services/payout-command/model'
import { Glyph } from '../../today/_components/shared'

export type BatchTopNavShell = 'live' | 'sandbox'

/**
 * Batch Command Center top bar — same grid + scroll contract as DockNav
 * so dock links never overlap the trailing actions.
 *
 * `sandbox`: dock links go to `/sandbox?dock=…` and match the reduced sandbox rail.
 */
export function BatchTopNav({ shell = 'live' }: { shell?: BatchTopNavShell }) {
  const visibleItems = useMemo(() => {
    if (shell === 'sandbox') {
      return SANDBOX_DOCK_IDS.map((id) => dockItems.find((d) => d.id === id)).filter(
        (d): d is (typeof dockItems)[number] => Boolean(d),
      )
    }
    return dockItems.filter((d) => d.id !== 'sandbox' && d.id !== 'billing')
  }, [shell])

  const consoleBase = shell === 'sandbox' ? '/sandbox' : '/payout-command-view/today'

  return (
    <header className="payout-command-nav sticky top-0 z-40">
      <div className="mx-auto grid w-full max-w-[1920px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-x-3 sm:px-5 sm:py-3 lg:gap-x-4 lg:px-8">
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5">
          <Link
            href="/"
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg pr-0.5 transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 sm:h-11 sm:gap-2.5"
            aria-label="Arealis Zord home"
          >
            <ZordLogo size="sm" variant="light" className="!w-auto max-w-[6rem] [&_img]:max-h-9 sm:max-w-[7rem] sm:[&_img]:max-h-10" />
            <span className="hidden text-[15px] font-semibold tracking-tight text-neutral-900 md:inline">Zord</span>
          </Link>
          <span
            className="inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-full border border-neutral-200/90 bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-700 shadow-sm sm:max-w-none sm:px-3 sm:py-1.5 sm:text-[11px]"
            title="Batch Command Center"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
            {shell === 'sandbox' ? 'Sandbox · batch' : 'Batch center'}
          </span>
        </div>

        <div className="relative min-w-0 overflow-x-auto overflow-y-visible [-webkit-overflow-scrolling:touch] py-0.5 [scrollbar-width:thin]">
          <nav
            className="pc-nav-scroll mx-auto flex w-max flex-nowrap items-center gap-1 rounded-2xl bg-gradient-to-b from-neutral-100 to-neutral-50/95 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] ring-1 ring-neutral-200/80 sm:gap-1.5 sm:p-2"
            aria-label="Primary navigation"
          >
            {visibleItems.map((item) => (
              <Link
                key={item.id}
                href={`${consoleBase}?dock=${item.id satisfies DockId}`}
                title={`${item.navLabel} — ${item.title}`}
                aria-label={`${item.navLabel}. ${item.title}`}
                className="group relative flex h-9 max-w-[9rem] shrink-0 items-center overflow-hidden rounded-xl border border-neutral-200/90 bg-white text-left text-neutral-800 shadow-sm outline-none transition-[max-width] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-neutral-900/35 focus-visible:ring-offset-1 hover:border-neutral-300 hover:bg-neutral-50 sm:h-10 md:max-w-[2.5rem] md:hover:max-w-[9rem] md:focus-visible:max-w-[9rem]"
              >
                <span className="relative z-[1] mx-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 sm:mx-0.5 sm:h-8 sm:w-8">
                  <Glyph name={item.icon} className="h-4 w-4 sm:h-[17px] sm:w-[17px]" />
                </span>
                <span className="overflow-hidden whitespace-nowrap pr-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-900 opacity-100 transition-[max-width,opacity,padding] duration-200 ease-out sm:text-[11px] md:max-w-0 md:pr-0 md:opacity-0 md:group-hover:max-w-[7rem] md:group-hover:pr-1.5 md:group-hover:opacity-100 md:group-focus-visible:max-w-[7rem] md:group-focus-visible:pr-1.5 md:group-focus-visible:opacity-100 max-md:max-w-[7rem]">
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="relative z-20 flex shrink-0 justify-end bg-white/95 pl-1.5 backdrop-blur-sm sm:pl-2 lg:pl-3">
          <Link
            href={consoleBase}
            className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-neutral-200/90 bg-white px-3 text-[13px] font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50 hover:shadow sm:h-11 sm:px-4 sm:text-[14px]"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10 12 6 8l4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Command center
          </Link>
        </div>
      </div>
    </header>
  )
}
