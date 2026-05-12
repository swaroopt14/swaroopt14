'use client'

import Link from 'next/link'

function ChevronRight({ className = 'text-neutral-400' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export type HomeCommandCenterKpiCardProps = {
  title: string
  value: string
  /** Secondary line under the big value */
  detail?: string
  dockHref: string
  dockEyebrow: string
  dockLine: string
}

/**
 * Black “Insight”-style KPI tile — same structure as {@link HomeHeroInsightCard} / {@link OutcomeCard}:
 * neutral gradient shell, masked dot field, light accent bar, bottom dock pill.
 */
export function HomeCommandCenterKpiCard({
  title,
  value,
  detail,
  dockHref,
  dockEyebrow,
  dockLine,
}: HomeCommandCenterKpiCardProps) {
  return (
    <article
      className="group relative flex min-h-[188px] flex-col overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-br from-neutral-800 via-neutral-950 to-black p-4 text-white shadow-[0_10px_36px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-black/80 sm:min-h-[198px] sm:rounded-[20px] sm:p-4"
    >
      <div
        className="pointer-events-none absolute -right-6 top-0 h-[85%] w-[55%] bg-[length:11px_11px] opacity-[0.18] transition-opacity duration-300 group-hover:opacity-[0.24]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1.5px, transparent 0)`,
          maskImage: `radial-gradient(ellipse 72% 85% at 92% 38%, black 22%, transparent 72%)`,
          WebkitMaskImage: `radial-gradient(ellipse 72% 85% at 92% 38%, black 22%, transparent 72%)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 100% 15%, rgba(255,255,255,0.07), transparent 55%)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-4 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full bg-gradient-to-br from-white/10 to-transparent blur-2xl"
        aria-hidden
      />

      <div className="relative mb-2.5 h-1 w-10 rounded-full bg-gradient-to-r from-white via-white/70 to-white/30 sm:w-11" />

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col text-left">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-400">{title}</h3>
        <p className="mt-1.5 text-[26px] font-bold leading-none tracking-[-0.04em] text-white sm:text-[28px]">{value}</p>
        {detail ? <p className="mt-1.5 text-[12px] leading-snug text-neutral-400">{detail}</p> : null}

        <div className="mt-auto pt-3">
          <Link
            href={dockHref}
            className="flex w-full items-center justify-between gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2.5 text-left text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-white/25 hover:bg-white/10"
          >
            <span className="min-w-0 leading-snug">
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">
                {dockEyebrow}
              </span>
              <span className="mt-0.5 block text-[12px] font-medium text-neutral-300">{dockLine}</span>
            </span>
            <ChevronRight />
          </Link>
        </div>
      </div>
    </article>
  )
}
