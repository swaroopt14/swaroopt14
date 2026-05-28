'use client'

import { evidenceCopy } from '../copy/evidenceCopy'
import type { EvidenceKpiCard } from '../types/evidenceViewModels'
import {
  EVIDENCE_BLUE_GRADIENT,
  EVIDENCE_BLUE_GLOW,
  EVIDENCE_GREEN_GLOW,
  EVIDENCE_NEON,
} from '../evidencePageTokens'

const KPI_MIN_H = 'min-h-[118px]'

type EvidenceKpiStripProps = {
  cards: EvidenceKpiCard[]
  loading?: boolean
}

function HeroKpiCard({ card }: { card: EvidenceKpiCard }) {
  return (
    <article
      className={`relative flex ${KPI_MIN_H} flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-4 shadow-[0_8px_24px_rgba(0,35,156,0.15)]`}
      style={{ background: EVIDENCE_BLUE_GRADIENT }}
      title={evidenceCopy.proofReadinessHelper}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-14 h-32 w-32 rounded-full blur-3xl"
        style={{ background: EVIDENCE_BLUE_GLOW }}
        aria-hidden
      />
      <p className="relative line-clamp-2 text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] text-white/75">
        {card.label}
      </p>
      <div className="relative">
        <p className="text-[1.5rem] font-bold tabular-nums leading-none text-white xl:text-[1.65rem]">
          {card.value}
        </p>
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-white/75">{card.sub}</p>
      </div>
    </article>
  )
}

function MetricKpiCard({ card }: { card: EvidenceKpiCard }) {
  return (
    <article
      className={`relative flex ${KPI_MIN_H} flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] ring-1 ring-black/[0.02]`}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl"
        style={{ background: EVIDENCE_GREEN_GLOW }}
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 h-3 w-1 shrink-0 rounded-full" style={{ background: EVIDENCE_NEON }} />
          <p className="line-clamp-2 text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] text-slate-500">
            {card.label}
          </p>
        </div>
        <p className="mt-2 text-[1.35rem] font-bold tabular-nums leading-none tracking-tight text-[#00239C]">
          {card.value}
        </p>
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{card.sub}</p>
      </div>
    </article>
  )
}

const GRID_CLASS =
  'grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-6'

export function EvidenceKpiStrip({ cards, loading }: EvidenceKpiStripProps) {
  if (loading) {
    return (
      <div className={GRID_CLASS}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${KPI_MIN_H} animate-pulse rounded-2xl bg-slate-100`} />
        ))}
      </div>
    )
  }

  const readiness = cards.find((c) => c.id === 'readiness')
  const metrics = cards.filter((c) => c.id !== 'readiness')
  const ordered = readiness ? [readiness, ...metrics] : cards

  return (
    <section className={GRID_CLASS}>
      {ordered.map((card) =>
        card.id === 'readiness' ? (
          <HeroKpiCard key={card.id} card={card} />
        ) : (
          <MetricKpiCard key={card.id} card={card} />
        ),
      )}
    </section>
  )
}
