'use client'

import type { ReactNode } from 'react'

export type NavyHeroBucket = {
  label: string
  value: string
  sub: string
}

type NavyMetricHeroProps = {
  eyebrow: string
  value: string
  /** Shown smaller after value, e.g. `/mo` */
  valueSuffix?: string
  deltaPill: string
  subcopy: string
  buckets?: readonly NavyHeroBucket[]
  footer?: ReactNode
  className?: string
}

/**
 * Shared dark navy hero — matches Ambiguity & Leakage “Total ambiguity cost” card.
 * Use across Connector Intelligence and related finance surfaces.
 */
export function NavyMetricHero({
  eyebrow,
  value,
  valueSuffix,
  deltaPill,
  subcopy,
  buckets,
  footer,
  className = '',
}: NavyMetricHeroProps) {
  return (
    <section
      className={`overflow-hidden rounded-[20px] bg-[#0f172a] p-6 text-white shadow-[0_16px_48px_-12px_rgba(15,23,42,0.45)] ring-1 ring-white/[0.08] ${className}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">{eyebrow}</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <p className="text-[53px] font-light leading-none tracking-[-0.03em] tabular-nums">
          {value}
          {valueSuffix ? (
            <span className="ml-1.5 text-[27px] font-light tracking-[-0.02em] text-white/45">{valueSuffix}</span>
          ) : null}
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[12px] font-medium text-white/75">
          {deltaPill}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-white/65">{subcopy}</p>
      {footer ? <div className="mt-4 flex flex-wrap gap-2">{footer}</div> : null}
      {buckets && buckets.length > 0 ? (
        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {buckets.map((b) => (
            <NavyHeroBucketCard key={b.label} {...b} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function NavyHeroBucketCard({ label, value, sub }: NavyHeroBucket) {
  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.06] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">{label}</p>
      <p className="mt-1.5 text-[25px] font-semibold tabular-nums tracking-[-0.02em]">{value}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-white/60">{sub}</p>
    </div>
  )
}
