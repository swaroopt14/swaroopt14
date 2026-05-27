'use client'

import type { ReactNode } from 'react'
import type { AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'
import { formatAmbiguityInr } from '../utils/formatAmbiguityInr'
import { getKpiDeltas } from '../utils/ambiguityApiMappers'

const HERO_BG = 'linear-gradient(140deg,#4a6fe6 0%,#103a9e 28%,#00239c 52%,#5c7ec9 100%)'
const HERO_GLOW = 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)'
const NEON = '#3dff82'

type KpiCardConfig = {
  label: string
  value: string
  pill: string | null
  icon: ReactNode
}

function KpiCard({ label, value, pill, icon }: KpiCardConfig) {
  return (
    <article
      className="relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-5 shadow-sm"
      style={{ background: HERO_BG }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full blur-3xl"
        style={{ background: HERO_GLOW }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          {icon}
        </div>
        {pill ? (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#000000]"
            style={{ background: NEON }}
          >
            {pill}
          </span>
        ) : (
          <span className="h-[26px]" aria-hidden />
        )}
      </div>
      <div className="relative mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
        <p className="mt-1 text-[1.75rem] font-bold tabular-nums leading-none text-white">{value}</p>
      </div>
    </article>
  )
}

type Props = { amb: AmbiguityKpiResolved | null; loading?: boolean; scopeHint?: string }

export function MatchingConfidenceKpiStrip({ amb, loading, scopeHint }: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[140px] animate-pulse rounded-2xl bg-slate-300/50" />
        ))}
      </div>
    )
  }

  const deltas = getKpiDeltas(amb)
  const rate = amb?.ambiguity_rate
  const missingRate = amb?.provider_ref_missing_rate

  const cards: KpiCardConfig[] = [
    {
      label: 'Ambiguous Intents',
      value:
        amb?.ambiguous_intent_count != null
          ? amb.ambiguous_intent_count.toLocaleString('en-IN')
          : '—',
      pill: deltas.ambiguousIntents,
      icon: (
        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
    },
    {
      label: 'Ambiguity Rate',
      value: rate != null ? `${(rate * 100).toFixed(1)}%` : '—',
      pill: deltas.ambiguityRate,
      icon: (
        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: 'Missing Ref Rate',
      value: missingRate != null ? `${(missingRate * 100).toFixed(1)}%` : '—',
      pill: deltas.missingRefRate,
      icon: (
        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      label: 'Value at Risk',
      value: formatAmbiguityInr(amb?.value_at_risk_minor),
      pill: deltas.valueAtRisk,
      icon: (
        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="space-y-2">
      {scopeHint ? (
        <p className="text-[12px] font-medium text-slate-600">{scopeHint}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>
    </div>
  )
}
