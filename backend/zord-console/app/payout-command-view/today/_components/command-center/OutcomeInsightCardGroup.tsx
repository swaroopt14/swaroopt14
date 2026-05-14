'use client'

import type { OutcomeInsightCard } from './types'

const HOME_HERO_INSIGHT_LEAD = 'Disbursement value increased this period'
const HOME_HERO_INSIGHT_TAIL = 'due to higher volume and improved confirmation rates.'
const HOME_HERO_INSIGHT_BODY = `${HOME_HERO_INSIGHT_LEAD} ${HOME_HERO_INSIGHT_TAIL}`

function ChevronRight({ className = 'text-neutral-400' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OutcomeCard({ card }: { card: OutcomeInsightCard }) {
  return (
    <article
      className="group relative flex min-h-[280px] flex-col overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br from-neutral-800 via-neutral-950 to-black p-6 text-white shadow-[0_10px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-black/80"
    >
      <div
        className="pointer-events-none absolute -right-6 top-0 h-[85%] w-[55%] bg-[length:11px_11px] opacity-[0.2] transition-opacity duration-300 group-hover:opacity-[0.28]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1.5px, transparent 0)`,
          maskImage: `radial-gradient(ellipse 72% 85% at 92% 38%, black 22%, transparent 72%)`,
          WebkitMaskImage: `radial-gradient(ellipse 72% 85% at 92% 38%, black 22%, transparent 72%)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 100% 15%, rgba(255,255,255,0.08), transparent 55%)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-4 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-gradient-to-br from-white/10 to-transparent blur-2xl"
        aria-hidden
      />

      <div className="relative mb-4 h-1 w-12 rounded-full bg-gradient-to-r from-white via-white/70 to-white/30" />

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col text-left">
        <h3 className="text-[18px] font-bold leading-snug tracking-[-0.02em] text-white">{card.title}</h3>
        <p className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-white sm:text-[32px]">{card.value}</p>
        {card.valueDelta ? (
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-neutral-300">{card.valueDelta}</p>
        ) : null}
        <p className="mt-2 text-[16px] leading-relaxed text-neutral-400">{card.subtext}</p>

        <div className="mt-auto pt-5">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-left text-[16px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-white/25 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
          >
            <span className="min-w-0 leading-snug">
              <span className="block text-[13px] font-bold uppercase tracking-[0.12em] text-neutral-500">Insight</span>
              <span className="mt-0.5 block text-[15px] font-medium text-neutral-300">{card.aiInsight}</span>
            </span>
            <ChevronRight />
          </button>
        </div>
      </div>
    </article>
  )
}

type HomeHeroInsightCardProps = {
  /** When true, spans full content width (e.g. home command center band). */
  fullWidth?: boolean
}

/** Home hero insight — same chrome as {@link OutcomeCard}, green brand tint (#4ADE80 family). */
export function HomeHeroInsightCard({ fullWidth = false }: HomeHeroInsightCardProps) {
  const widthClass = fullWidth ? 'mx-auto flex w-full max-w-none' : 'mx-auto flex max-w-3xl'
  return (
    <article
      className={`group relative flex min-h-[260px] flex-col overflow-hidden rounded-[22px] border border-[#4ADE80]/25 bg-gradient-to-br from-emerald-950 via-green-950 to-black p-6 text-white shadow-[0_10px_40px_rgba(6,78,59,0.4),inset_0_1px_0_rgba(74,222,128,0.14)] ring-1 ring-emerald-900/70 ${widthClass}`}
    >
      <div
        className="pointer-events-none absolute -right-6 top-0 h-[85%] w-[55%] bg-[length:11px_11px] opacity-[0.2] transition-opacity duration-300 group-hover:opacity-[0.28]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1.5px, transparent 0)`,
          maskImage: `radial-gradient(ellipse 72% 85% at 92% 38%, black 22%, transparent 72%)`,
          WebkitMaskImage: `radial-gradient(ellipse 72% 85% at 92% 38%, black 22%, transparent 72%)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 100% 15%, rgba(74,222,128,0.12), transparent 55%)`,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-4 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#4ADE80]/20 to-transparent blur-2xl"
        aria-hidden
      />

      <div className="relative mb-4 h-1 w-12 rounded-full bg-gradient-to-r from-[#4ADE80] via-emerald-400 to-emerald-700" />

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col text-left">
        <h3 className="text-[18px] font-bold leading-snug tracking-[-0.02em] text-white">Insight</h3>
        <p className="mt-2 text-[30px] font-bold leading-snug tracking-[-0.04em] text-white sm:text-[32px]">{HOME_HERO_INSIGHT_LEAD}</p>
        <p className="mt-2 text-[16px] leading-relaxed text-emerald-100/80">{HOME_HERO_INSIGHT_TAIL}</p>

        <div className="mt-auto pt-5">
          <div className="flex w-full items-center justify-between gap-3 rounded-full border border-emerald-300/25 bg-emerald-950/35 px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <span className="min-w-0 leading-snug">
              <span className="block text-[13px] font-bold uppercase tracking-[0.12em] text-[#4ADE80]/90">Insight</span>
              <span className="mt-0.5 block text-[15px] font-medium text-emerald-50/95">{HOME_HERO_INSIGHT_BODY}</span>
            </span>
            <ChevronRight className="text-emerald-400/75" />
          </div>
        </div>
      </div>
    </article>
  )
}

const DEFAULT_HEADING = 'Disbursement overview'
const DEFAULT_DESCRIPTION =
  'Confirmed, recovered, and pending value, items requiring attention, mandate readiness, and value at risk — with AI insight on each.'

export function OutcomeInsightCardGroup({
  cards,
  heading = DEFAULT_HEADING,
  description = DEFAULT_DESCRIPTION,
  xlGridCols = 3,
}: {
  cards: OutcomeInsightCard[]
  heading?: string
  description?: string
  /** Six cards: use 3 for a clean 3×2 layout on xl; 4 for wider dashboards. */
  xlGridCols?: 3 | 4
}) {
  if (cards.length === 0) return null

  const xlClass = xlGridCols === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'

  return (
    <section aria-label={heading}>
      <h2 className="mb-1 text-[16px] font-semibold uppercase tracking-wide text-[#6b7280]">{heading}</h2>
      <p className="mb-4 max-w-3xl text-[15px] leading-relaxed text-[#787872]">{description}</p>
      <div className={`grid gap-5 sm:grid-cols-2 ${xlClass}`}>
        {cards.map((card) => (
          <OutcomeCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  )
}
