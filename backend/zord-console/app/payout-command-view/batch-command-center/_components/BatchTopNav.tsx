'use client'

import Link from 'next/link'
import { ZordLogo } from '@/components/ZordLogo'
import { dockItems, type DockId } from '@/services/payout-command/model'
import { Glyph } from '../../today/_components/shared'

/**
 * Link-driven version of the /today DockNav, used by /batch-command-center so
 * the page feels stitched to the rest of the console. Clicking any dock item
 * navigates to /payout-command-view/today?dock=<id>; PayoutCommandViewClient
 * picks that up on mount and renders the matching surface.
 *
 * Visual contract mirrors DockNav (header sticky, brand on the left, dock rail,
 * batch-active state) but it's intentionally simpler — no alerts/search/desk
 * controls since this page is task-focused, not workspace-wide.
 */
export function BatchTopNav() {
  // 'batch-command-center' isn't a DockId; we only highlight the brand-side
  // breadcrumb and dim all dock pills to make the active context unambiguous.
  const visibleItems = dockItems.filter((d) => d.id !== 'sandbox' && d.id !== 'billing')

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-3.5">
            <Link
              href="/final-landing"
              className="flex h-14 shrink-0 items-center justify-start rounded-md pl-1 pr-2 transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30"
              aria-label="Arealis Zord home"
            >
              <ZordLogo fitToHeight variant="light" />
            </Link>
            <span className="hidden h-8 w-px shrink-0 bg-black/10 sm:block" aria-hidden />
            <div className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-[#f5f5f5] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0f172a]">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              Batch Command Center
            </div>
          </div>

          <nav
            className="flex w-fit max-w-full items-center gap-0.5 rounded-lg bg-[#f5f5f5] p-1 ring-1 ring-black/5"
            aria-label="Primary navigation"
          >
            {visibleItems.map((item) => (
              <Link
                key={item.id}
                href={`/payout-command-view/today?dock=${item.id satisfies DockId}`}
                className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition text-slate-600 hover:bg-white/85 hover:text-[#0f172a]"
                aria-label={item.label}
                title={item.title}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-[#334155] ring-1 ring-slate-300/80">
                  <Glyph name={item.icon} className="h-4 w-4" />
                </span>
                <span className="hidden min-w-0 pr-1 lg:block">
                  <span className="block truncate text-[13px] font-semibold leading-tight tracking-[-0.01em] text-[#0f172a]">
                    {item.label}
                  </span>
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/payout-command-view/today"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-black/10 bg-white px-3 text-[13px] font-semibold text-[#0f172a] transition hover:bg-[#f5f5f5]"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M10 12 6 8l4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Today
          </Link>
        </div>
      </div>
    </header>
  )
}
