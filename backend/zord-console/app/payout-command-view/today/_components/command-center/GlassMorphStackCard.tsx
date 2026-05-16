'use client'

import type { ReactNode } from 'react'
import { Glyph } from '../shared'
import type { GlyphName } from '@/services/payout-command/model'

/** Brand Imperial Blue #002395 — RGB for translucent glass glow */
const IMPERIAL_RGB = '0, 35, 149'

export type GlassMorphStackCardProps = {
  className?: string
  title?: string
  titleIcon?: GlyphName
  /** Overrides default decorative arrow when `title` is set. */
  headerRight?: ReactNode
  children: ReactNode
}

/**
 * Stacked frosted-glass card with Imperial Blue top glow (matches trend / insight reference).
 */
export function GlassMorphStackCard({
  className,
  title,
  titleIcon = 'zap',
  headerRight,
  children,
}: GlassMorphStackCardProps) {
  const showHeader = Boolean(title || headerRight)

  return (
    <div className={`relative isolate w-full ${className ?? ''}`.trim()}>
      <div
        className="pointer-events-none absolute inset-0 z-[1] translate-x-[11px] translate-y-[11px] rounded-2xl border border-slate-200/35 bg-white/40 shadow-[6px_10px_28px_rgba(15,23,42,0.07)] backdrop-blur-[2px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[2] translate-x-[5px] translate-y-[5px] rounded-2xl border border-white/55 bg-white/50 shadow-[3px_6px_20px_rgba(15,23,42,0.06)] backdrop-blur-sm"
        aria-hidden
      />
      <article className="relative z-10 overflow-hidden rounded-2xl border border-white/90 bg-white/35 shadow-[0_16px_48px_rgba(15,23,42,0.1),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-52 w-[135%] -translate-x-1/2 opacity-[0.92]"
          style={{
            background: `radial-gradient(ellipse 65% 55% at 50% 0%, rgba(${IMPERIAL_RGB}, 0.40) 0%, rgba(${IMPERIAL_RGB}, 0.14) 44%, transparent 72%)`,
          }}
          aria-hidden
        />
        <div className="relative px-4 py-4 sm:px-5 sm:py-[1.125rem]">
          {showHeader ? (
            title ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Glyph name={titleIcon} className="h-[18px] w-[18px] shrink-0 text-neutral-900" aria-hidden />
                  <span className="text-[15px] font-medium tracking-tight text-neutral-900 sm:text-[16px]">{title}</span>
                </div>
                {headerRight ?? (
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-800"
                    aria-hidden
                  >
                    <Glyph name="arrow-up-right" className="h-4 w-4" />
                  </span>
                )}
              </div>
            ) : (
              <div className="flex justify-end">{headerRight}</div>
            )
          ) : null}
          {children}
        </div>
      </article>
    </div>
  )
}
