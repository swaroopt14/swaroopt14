'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { DisbursementTrendRange } from '@/services/payout-command/prod-api/disbursementTrendTypes'
import { GlassMorphStackCard } from './GlassMorphStackCard'
import {
  HOME_INSIGHT_EDITORIAL,
  HOME_INSIGHT_PROSE,
  HOME_NEON,
} from './homeCommandCenterTokens'
import {
  emphasizeInsightPercentages,
  HeroMetricWithSuperPercent,
} from '../homeDashboardTypography'

const RANGE_FILTERS: readonly { id: DisbursementTrendRange; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
] as const

const CARD_SHELL =
  'relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_10px_44px_rgba(15,23,42,0.07)] ring-1 ring-black/[0.03]'

function CardGlow() {
  return (
    <div
      className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full blur-3xl"
      style={{ background: 'radial-gradient(circle, rgba(61,255,130,0.2) 0%, transparent 72%)' }}
      aria-hidden
    />
  )
}

function CardMenuButton() {
  return (
    <button
      type="button"
      className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      aria-label="Card options"
    >
      <span className="flex flex-col gap-[3px]" aria-hidden>
        <span className="h-[3px] w-[3px] rounded-full bg-current" />
        <span className="h-[3px] w-[3px] rounded-full bg-current" />
        <span className="h-[3px] w-[3px] rounded-full bg-current" />
      </span>
    </button>
  )
}

function IconStackedSquares() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[#000000]" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="9" y="9" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </span>
  )
}

function IconCard() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[#000000]" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 9h10M7 13h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function IconNodes() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[#000000]" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="8" r="2.2" fill="currentColor" />
        <circle cx="18" cy="8" r="2.2" fill="currentColor" />
        <circle cx="12" cy="17" r="2.2" fill="currentColor" />
        <path d="M7.2 9.2l4.2 5.6M16.8 9.2l-4.2 5.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function StatPairRow({
  leftValue,
  leftLabel,
  rightValue,
  rightLabel,
}: {
  leftValue: string
  leftLabel: string
  rightValue: string
  rightLabel: string
}) {
  return (
    <div className="mt-5 flex items-start justify-between gap-3 border-t border-slate-100/90 pt-4">
      <div>
        <div className="text-[16px] font-semibold leading-none tracking-[-0.02em] text-[#000000] tabular-nums">
          {leftValue}
        </div>
        <div className="mt-1 text-[11px] font-normal leading-snug text-[#888888]">{leftLabel}</div>
      </div>
      <div className="text-right">
        <div className="text-[16px] font-semibold leading-none tracking-[-0.02em] text-[#000000] tabular-nums">
          {rightValue}
        </div>
        <div className="mt-1 text-[11px] font-normal leading-snug text-[#888888]">{rightLabel}</div>
      </div>
    </div>
  )
}

/** Horizontal bar: black sliver + neon fill + neutral track + end cap (reference “Processed / Anomalies”). */
function NeonProgressBar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct))
  const blackW = Math.min(3, p * 0.05)
  const greenW = Math.max(0, p - blackW)
  return (
    <div className="mt-auto pt-5">
      <div className="relative h-[11px] w-full overflow-hidden rounded-full bg-[#ecece9]">
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-[#000000]" style={{ width: `${blackW}%` }} />
        <div
          className="absolute inset-y-0 rounded-none bg-[#3dff82]"
          style={{ left: `${blackW}%`, width: `${greenW}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[#3dff82]"
          style={{ boxShadow: '0 0 0 1px rgba(61,255,130,0.35)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-1 right-2 w-6 opacity-50"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #b4b4b0 0 1px, transparent 1px 4px)',
          }}
          aria-hidden
        />
      </div>
    </div>
  )
}

function MiniBars({ values }: { values: number[] }) {
  if (!values.length) {
    return <div className="mt-4 h-16 rounded-xl bg-slate-50" aria-hidden />
  }
  const max = Math.max(...values, 1)
  return (
    <div className="mt-4 flex h-16 items-end gap-1" role="img" aria-label="Volume sparkline">
      {values.map((v, i) => {
        const h = Math.max(8, Math.round((v / max) * 56))
        return (
          <div
            key={`bar-${i}`}
            className="min-w-0 flex-1 rounded-t-sm bg-[#3dff82] transition-[height] duration-300"
            style={{ height: `${h}px`, opacity: 0.35 + (i / Math.max(values.length - 1, 1)) * 0.55 }}
          />
        )
      })}
    </div>
  )
}

/** Semicircular gauge: gray track + black fill by pct (reference “Synced Records”). */
function SemiGauge({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className="relative mx-auto mt-2 w-full max-w-[220px]" aria-hidden>
      <svg viewBox="0 0 120 72" className="w-full" preserveAspectRatio="xMidYMax meet">
        <path
          d="M 18 58 A 42 42 0 0 1 102 58"
          fill="none"
          stroke="#ecece9"
          strokeWidth="10"
          strokeLinecap="round"
          pathLength={100}
        />
        <path
          d="M 18 58 A 42 42 0 0 1 102 58"
          fill="none"
          stroke="#000000"
          strokeWidth="10"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${p} ${100 - p}`}
        />
      </svg>
    </div>
  )
}

function InsightRing({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div
      className="relative h-14 w-14 shrink-0 rounded-full bg-slate-200"
      style={{
        background: `conic-gradient(${HOME_NEON} ${p * 3.6}deg, #e2e8f0 0deg)`,
      }}
      aria-hidden
    >
      <div className="absolute inset-[5px] rounded-full bg-white/95 backdrop-blur-sm" />
    </div>
  )
}

export type HomeCommandCenterLightBandProps = {
  recoveryValue: string
  recoverySub: string
  liveWindowLabel: string
  sparkBars: number[]
  recoveryFooter: string
  trendRange: DisbursementTrendRange
  onTrendRangeChange: (r: DisbursementTrendRange) => void
  recoveryStatPair: { leftValue: string; leftLabel: string; rightValue: string; rightLabel: string }
  recoveryProgressPct: number

  exceptionValue: string
  exceptionSub: string
  exceptionLegend: Array<{ dot: string; label: string }>
  exceptionFooter: string
  exceptionStatPair: { leftValue: string; leftLabel: string; rightValue: string; rightLabel: string }
  exceptionRiskPct: number
  exceptionHeroPct: number | null

  liftValue: string
  liftSub: string
  liftIntensity: number
  liftFooter: string
  liftStatPair: { leftValue: string; leftLabel: string; rightValue: string; rightLabel: string }
  liftPct: number | null

  insightBody: string
  insightMetric: string
  insightMetricSub: string
  insightRingPct: number
  insightHref?: string
  /** When set, replaces the static fourth-column Insight card (Today · command center). */
  insightCarousel?: ReactNode
}

export function HomeCommandCenterLightBand({
  recoveryValue,
  recoverySub,
  liveWindowLabel,
  sparkBars,
  recoveryFooter,
  trendRange,
  onTrendRangeChange,
  recoveryStatPair,
  recoveryProgressPct,
  exceptionValue,
  exceptionSub,
  exceptionLegend,
  exceptionFooter,
  exceptionStatPair,
  exceptionRiskPct,
  exceptionHeroPct,
  liftValue,
  liftSub,
  liftIntensity,
  liftFooter,
  liftStatPair,
  liftPct,
  insightBody,
  insightMetric,
  insightMetricSub,
  insightRingPct,
  insightHref = '/payout-command-view/today?dock=grid',
  insightCarousel,
}: HomeCommandCenterLightBandProps) {
  const exceptionHero =
    exceptionHeroPct !== null ? `${exceptionHeroPct.toFixed(2).replace('.', ',')}%` : exceptionValue

  const liftHero =
    liftPct !== null ? `${liftPct.toFixed(2).replace('.', ',')}%` : liftValue

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {/* 1 — Payout recovery */}
      <article className={CARD_SHELL}>
        <CardGlow />
        <div className="relative z-[1] flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <IconStackedSquares />
            <div className="min-w-0">
              <h3 className="text-[14px] font-medium tracking-[0] text-[#000000]">Payout recovery</h3>
              <p className="mt-1 text-[11px] font-normal uppercase tracking-[0.06em] text-[#888888]">Primary metric</p>
            </div>
          </div>
          <CardMenuButton />
        </div>
        <p className="relative z-[1] mt-4 text-center text-[42px] leading-none">
          <HeroMetricWithSuperPercent text={recoveryValue} />
        </p>
        <p className="relative z-[1] mt-2 text-center text-[14px] font-medium tracking-[0] text-[#000000]">{recoverySub}</p>
        <p className="relative z-[1] mt-2 text-center text-[11px] font-normal uppercase tracking-[0.06em] text-[#888888]">
          {liveWindowLabel}
        </p>
        <div className="relative z-[1] mt-3 flex flex-wrap justify-center gap-3 border-b border-slate-100 pb-3">
          {RANGE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onTrendRangeChange(f.id)}
              className={`rounded-none border-b-2 px-0.5 pb-1 text-[14px] font-medium transition ${
                trendRange === f.id
                  ? 'border-[#3dff82] text-[#000000]'
                  : 'border-transparent text-[#888888] hover:text-[#000000]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <MiniBars values={sparkBars} />
        <StatPairRow
          leftValue={recoveryStatPair.leftValue}
          leftLabel={recoveryStatPair.leftLabel}
          rightValue={recoveryStatPair.rightValue}
          rightLabel={recoveryStatPair.rightLabel}
        />
        <NeonProgressBar pct={recoveryProgressPct} />
        <p className={`relative z-[1] mt-4 ${HOME_INSIGHT_PROSE}`}>{recoveryFooter}</p>
      </article>

      {/* 2 — Exception exposure */}
      <article className={CARD_SHELL}>
        <CardGlow />
        <div className="relative z-[1] flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <IconNodes />
            <h3 className="pt-1 text-[14px] font-medium tracking-[0] text-[#000000]">Exception exposure</h3>
          </div>
          <CardMenuButton />
        </div>
        <p className="relative z-[1] mt-4 text-center text-[42px] leading-none">
          <HeroMetricWithSuperPercent text={exceptionHero} />
        </p>
        <p className="relative z-[1] mt-2 text-center text-[14px] font-medium tracking-[0] text-[#000000]">{exceptionSub}</p>
        <StatPairRow
          leftValue={exceptionStatPair.leftValue}
          leftLabel={exceptionStatPair.leftLabel}
          rightValue={exceptionStatPair.rightValue}
          rightLabel={exceptionStatPair.rightLabel}
        />
        <div className="relative z-[1] mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[14px] font-medium tracking-[0] text-[#000000]">
          {exceptionLegend.map((row) => (
            <span key={row.label} className="inline-flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.dot }} />
              {row.label}
            </span>
          ))}
        </div>
        <NeonProgressBar pct={exceptionRiskPct} />
        <p className={`relative z-[1] mt-4 ${HOME_INSIGHT_PROSE}`}>{exceptionFooter}</p>
      </article>

      {/* 3 — Lift vs baseline */}
      <article className={CARD_SHELL}>
        <CardGlow />
        <div className="relative z-[1] flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <IconCard />
            <h3 className="pt-1 text-[14px] font-medium tracking-[0] text-[#000000]">Recovery lift vs baseline</h3>
          </div>
          <CardMenuButton />
        </div>
        <StatPairRow
          leftValue={liftStatPair.leftValue}
          leftLabel={liftStatPair.leftLabel}
          rightValue={liftStatPair.rightValue}
          rightLabel={liftStatPair.rightLabel}
        />
        <p className="relative z-[1] mt-2 text-center text-[42px] leading-none">
          <HeroMetricWithSuperPercent text={liftHero} />
        </p>
        <p className="relative z-[1] mt-2 text-center text-[14px] font-medium tracking-[0] text-[#000000]">{liftSub}</p>
        <div className="relative z-[1] mt-2 flex flex-wrap justify-center gap-5 text-[14px] font-medium tracking-[0] text-[#000000]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#a78bfa]" /> Baseline
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#3dff82]" /> Observed
          </span>
        </div>
        <SemiGauge pct={liftIntensity * 100} />
        <p className={`relative z-[1] mt-4 ${HOME_INSIGHT_PROSE}`}>{liftFooter}</p>
      </article>

      {/* 4 — Intelligence carousel or static Insight (stretch to row height like other band cards) */}
      <div className="flex h-full min-h-[300px] min-w-0 flex-col">
        {insightCarousel ? (
          <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">{insightCarousel}</div>
        ) : (
          <GlassMorphStackCard
            title="Insight"
            headerRight={
              <Link
                href={insightHref}
                className="shrink-0 rounded-lg p-1.5 text-neutral-600 transition hover:bg-white/45 hover:text-neutral-900"
                aria-label="Open intent journal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M7 17L17 7M17 7H9M17 7V15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            }
          >
            <div className="mt-3 flex min-h-[220px] flex-col justify-between gap-4">
              <p className={HOME_INSIGHT_EDITORIAL}>{emphasizeInsightPercentages(insightBody)}</p>
              <div className="flex items-end justify-between gap-3 border-t border-white/40 pt-4">
                <div>
                  <p className="text-[16px] font-semibold tabular-nums tracking-tight text-[#000000]">{insightMetric}</p>
                  <p className={`mt-0.5 ${HOME_INSIGHT_PROSE}`}>{insightMetricSub}</p>
                </div>
                <InsightRing pct={insightRingPct} />
              </div>
            </div>
          </GlassMorphStackCard>
        )}
      </div>
    </div>
  )
}
