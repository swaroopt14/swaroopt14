'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Glyph, LiveDataHint } from '../shared'
import { CommandCenterCardGlow } from '../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_MD,
  HOME_BODY_IMPERIAL_SM,
  HOME_INSIGHT_PROSE,
  HOME_INSIGHT_PROSE_STRONG,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { LeakageKpiResolved, AmbiguityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'

/**
 * LeakageSurface — CFO / finance: "How much of your payment volume is bleeding — and where?"
 * KPIs 1–6 from /api/prod/intelligence/leakage. Bridge to Ambiguity without mixing buyer narratives.
 */

function formatINR(minorStr: string | number | undefined): string {
  if (minorStr == null || minorStr === '') return '—'
  const minor = typeof minorStr === 'number' ? minorStr : Number(minorStr)
  if (!Number.isFinite(minor) || minor === 0) return '₹0'
  const rupees = minor / 100
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)} Cr`
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(2)} L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)} K`
  return `₹${rupees.toFixed(0)}`
}

function pctOfIntended(partMinor: string | undefined, totalMinor: string | undefined): string {
  const p = Number(partMinor) || 0
  const t = Number(totalMinor) || 0
  if (t <= 0) return '—'
  return `${((p / t) * 100).toFixed(1)}% of intended`
}

function leakagePctColor(leakageFrac: number): { bar: string; label: string } {
  if (leakageFrac < 0.02) return { bar: 'bg-emerald-500', label: 'text-emerald-800' }
  if (leakageFrac <= 0.05) return { bar: 'bg-amber-500', label: 'text-amber-900' }
  return { bar: 'bg-red-600', label: 'text-red-900' }
}

function riskTierExplainer(tier: string): string {
  if (tier === 'HIGH' || tier === 'CRITICAL')
    return 'HIGH / CRITICAL means your leakage rate exceeds the common 2% industry safety threshold for high-volume rails.'
  if (tier === 'MEDIUM') return 'MEDIUM indicates elevated leakage vs peers — prioritise unmatched and under-settlement buckets this month.'
  return 'LOW means leakage is within a typical operating band — still review unmatched monthly.'
}

/** Overlap of value-at-risk (ambiguity) vs implied leakage rupees — directional, same-period overlay. */
function ambiguityDrivenLeakageShare(leak: LeakageKpiResolved, amb: AmbiguityKpiResolved): number | null {
  const intended = Number(leak.total_intended_amount_minor)
  const leakAmt = intended * (leak.leakage_percentage || 0)
  const varMinor = Number(amb.value_at_risk_minor)
  if (!Number.isFinite(leakAmt) || leakAmt <= 0 || !Number.isFinite(varMinor) || varMinor < 0) return null
  return Math.min(100, Math.round((varMinor / leakAmt) * 100))
}

function leakageActionNarrative(leak: LeakageKpiResolved): { headline: string; body: string } {
  const u = Number(leak.unmatched_amount_minor) || 0
  const us = Number(leak.under_settlement_amount_minor) || 0
  const r = Number(leak.reversal_exposure_minor) || 0
  const intended = Number(leak.total_intended_amount_minor) || 1
  if (u >= us && u >= r && u > 0) {
    return {
      headline: 'Unmatched corridor concentration',
      body: `Unmatched is ~${((u / intended) * 100).toFixed(1)}% of intended flow — the highest-risk bucket. IMPS above ₹50,000 after clearing-house cut-off often presents as unmatched until the next settlement window; shifting that corridor to NEFT can close a meaningful monthly slice when partner cut-offs align.`,
    }
  }
  if (us >= u && us >= r && us > 0) {
    return {
      headline: 'Under-settlement pattern',
      body: `Under-settlement is material (~${((us / intended) * 100).toFixed(1)}% of intended). This is usually rail deductions, fee mapping, or silent partial settlement — worth a PSP statement reconciliation pass before month-end close.`,
    }
  }
  if (r > 0) {
    return {
      headline: 'Reversal exposure',
      body: `Reversal exposure is elevated — these are funds that showed settled and then returned. Tighten evidence on those UTRs and shorten dispute detection SLA so capital is not double-counted in close.`,
    }
  }
  return {
    headline: 'Stabilise leakage baseline',
    body: 'Keep weekly leakage under 2% of intended flow; route any new unmatched spikes through the Ambiguity queue so signals can attach before funds move.',
  }
}

export function LeakageSurface() {
  const pathname = usePathname()
  const { tenantId, tenantReady } = useSessionTenant()
  const { leakage, ambiguity } = useIntelligenceKpis({ tenantReady })
  const leak = isDataAvailable(leakage) ? leakage : null
  const amb = isDataAvailable(ambiguity) ? ambiguity : null

  const intendedMinor = leak?.total_intended_amount_minor
  const leakageFrac = leak?.leakage_percentage ?? 0
  const totalLeakageMinor =
    intendedMinor && Number.isFinite(Number(intendedMinor))
      ? Math.round(Number(intendedMinor) * (Number.isFinite(leakageFrac) ? leakageFrac : 0))
      : null

  const bridgePct = leak && amb ? ambiguityDrivenLeakageShare(leak, amb) : null
  const action = leak ? leakageActionNarrative(leak) : null

  const dockHref = `${pathname}?dock=ambiguity`
  const pctStyle = leakagePctColor(leakageFrac)

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className={COMMAND_CENTER_LABEL_GREEN}>CFO · Finance · leakage</p>
        <p className={`max-w-3xl ${HOME_BODY_IMPERIAL}`}>
          How much of your payment volume is bleeding — and exactly where. KPI 6{' '}
          <span className="font-mono text-[13px]">leakage_percentage</span> is the headline risk number; everything below
          decomposes it in rupees.
        </p>
        <LiveDataHint isLive={Boolean(leak)} source="intelligence" />
      </div>

      {/* Top — three headline numbers */}
      <section className="grid gap-4 lg:grid-cols-3">
        <article className={COMMAND_CENTER_KPI_CARD}>
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Total intended</p>
          <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>Total value you tried to move this period</p>
          <p className={`relative mt-3 text-[2.5rem] font-extrabold tabular-nums tracking-[-0.03em] leading-none ${HOME_TITLE_BLACK}`}>
            {formatINR(intendedMinor)}
          </p>
          <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>KPI 1 · total_intended_amount_minor</p>
        </article>

        <article className={COMMAND_CENTER_KPI_CARD}>
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Total leakage</p>
          <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>Share of intended flow not fully recovered</p>
          <div className="mt-3 flex items-baseline gap-2">
            <p className={`text-[2rem] font-semibold tabular-nums tracking-tight ${pctStyle.label}`}>
              {(leakageFrac * 100).toFixed(2)}%
            </p>
            <span className="text-[12px] font-medium text-[#64748b]">
              {leakageFrac < 0.02 ? 'Green' : leakageFrac <= 0.05 ? 'Amber' : 'Red'} band
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
            <div
              className={`h-full rounded-full transition-all ${pctStyle.bar}`}
              style={{ width: `${Math.min(100, leakageFrac * 100 * 8)}%` }}
            />
          </div>
          <p className="mt-3 text-[1.35rem] font-semibold tabular-nums text-[#0f172a]">
            You lost {formatINR(totalLeakageMinor ?? undefined)}
          </p>
          <p className="mt-1 text-[12px] text-[#64748b]">
            KPI 6 · <span className="font-mono">leakage_percentage</span> × intended
          </p>
        </article>

        <article className={COMMAND_CENTER_KPI_CARD}>
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Risk tier</p>
          <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>Modelled exposure band</p>
          <p className={`relative mt-3 text-[2.5rem] font-extrabold tabular-nums tracking-[-0.03em] leading-none ${HOME_TITLE_BLACK}`}>
            {leak?.risk_tier ?? '—'}
          </p>
          <p className={`relative mt-3 ${HOME_BODY_IMPERIAL_SM}`}>{leak ? riskTierExplainer(leak.risk_tier) : '—'}</p>
        </article>
      </section>

      {/* Middle — four breakdown cards */}
      <section>
        <h2 className={`text-[1.1rem] font-semibold tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>Leakage breakdown</h2>
        <p className={`mt-1 max-w-3xl ${HOME_BODY_IMPERIAL_SM}`}>Where the rupees are — each card maps to a leakage KPI field.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <BreakdownMoneyCard
            title="Unmatched payments"
            kpi="KPI 2 · unmatched_amount_minor"
            amount={formatINR(leak?.unmatched_amount_minor)}
            share={pctOfIntended(leak?.unmatched_amount_minor, intendedMinor)}
            body="Money you sent with zero settlement match. These left your account; we have no proof they arrived. Highest-risk leakage."
            tone="danger"
          />
          <BreakdownMoneyCard
            title="Under-settlement"
            kpi="KPI 3 · under_settlement_amount_minor"
            amount={formatINR(leak?.under_settlement_amount_minor)}
            share={pctOfIntended(leak?.under_settlement_amount_minor, intendedMinor)}
            body="Money that arrived short — fee errors, rail deductions, or silent partial settlement vs intent."
            tone="warn"
          />
          <BreakdownMoneyCard
            title="Reversal exposure"
            kpi="KPI 5 · reversal_exposure_minor"
            amount={formatINR(leak?.reversal_exposure_minor)}
            share={pctOfIntended(leak?.reversal_exposure_minor, intendedMinor)}
            body="Money reversed after it showed as successfully settled — hardest to catch manually."
            tone="purple"
          />
          <BreakdownMoneyCard
            title="Orphan credits"
            kpi="KPI 4 · orphan_amount_minor"
            amount={formatINR(leak?.orphan_amount_minor)}
            share={pctOfIntended(leak?.orphan_amount_minor, intendedMinor)}
            body="Settlements arrived with no matching intent — could be legitimate top-ups or ghost credits. Informational; not in leakage rate."
            tone="neutral"
          />
        </div>
      </section>

      {/* Bottom — trend + bridge / action */}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className={COMMAND_CENTER_KPI_CARD}>
          <CommandCenterCardGlow />
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Time series</p>
          <h2 className={`mt-2 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>Leakage trend</h2>
          <p className={`mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
            Historical leakage time series is not exposed by the intelligence API yet. Use the headline KPIs above for
            this period; when upstream adds a daily series endpoint, this card will chart it automatically.
          </p>
          {leak ? (
            <p className="mt-4 text-[1.35rem] font-semibold tabular-nums text-[#0f172a]">
              Current window: {(leakageFrac * 100).toFixed(2)}% · {leak.risk_tier} risk
            </p>
          ) : (
            <p className="mt-4 text-[14px] text-slate-600">No leakage snapshot for this tenant yet.</p>
          )}
        </article>

        <article className="flex flex-col gap-4">
          <div className={COMMAND_CENTER_KPI_CARD}>
            <CommandCenterCardGlow />
            <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Ambiguity bridge</p>
            {bridgePct != null ? (
              <p className={`relative mt-2 text-[15px] font-semibold leading-snug ${HOME_TITLE_BLACK}`}>
                ~{bridgePct}% of your leakage-weighted exposure overlaps same-period value_at_risk_minor from ambiguous
                signals.
              </p>
            ) : (
              <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
                Connect live ambiguity + leakage payloads to surface the overlap percentage automatically.
              </p>
            )}
            <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>
              Ambiguity is an ops / engineering conversation; leakage is finance. We keep them separate — this is the
              single cross-link CFOs asked for.
            </p>
            <Link
              href={dockHref}
              className={`relative mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold underline decoration-[#d0d0cc] underline-offset-4 hover:decoration-[#000000] ${HOME_TITLE_BLACK}`}
            >
              View ambiguity analysis
              <Glyph name="arrow-up-right" className="h-3.5 w-3.5" />
            </Link>
          </div>

          <article className={`${COMMAND_CENTER_KPI_CARD} flex flex-1 flex-col`}>
            <CommandCenterCardGlow />
            <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Recommended action</p>
            <p className={`relative mt-2 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>{action?.headline ?? '—'}</p>
            <p className={`relative mt-2 flex-1 ${HOME_BODY_IMPERIAL_SM}`}>{action?.body}</p>
            <button
              type="button"
              className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl bg-[#111111] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-black"
            >
              Apply action contract
              <Glyph name="arrow-up-right" className="h-3.5 w-3.5" />
            </button>
            <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>Confirmation-gated · wires to recommendations service when enabled.</p>
          </article>
        </article>
      </section>
    </div>
  )
}

function BreakdownMoneyCard({
  title,
  kpi,
  amount,
  share,
  body,
  tone,
}: {
  title: string
  kpi: string
  amount: string
  share: string
  body: string
  tone: 'danger' | 'warn' | 'purple' | 'neutral'
}) {
  const ring =
    tone === 'danger'
      ? 'border-red-200/80'
      : tone === 'warn'
        ? 'border-amber-200/80'
        : tone === 'purple'
          ? 'border-violet-200/80'
          : 'border-slate-200/80'
  return (
    <article className={`${COMMAND_CENTER_KPI_CARD} ${ring}`}>
      <CommandCenterCardGlow />
      <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{title}</p>
      <p className={`relative mt-1 font-mono text-[10px] ${HOME_BODY_IMPERIAL_SM}`}>{kpi}</p>
      <p className={`relative mt-3 text-[1.65rem] font-semibold tabular-nums ${HOME_TITLE_BLACK}`}>{amount}</p>
      <p className={`relative mt-1 ${HOME_BODY_IMPERIAL_MD}`}>{share}</p>
      <p className={`relative mt-3 ${HOME_BODY_IMPERIAL_SM}`}>{body}</p>
    </article>
  )
}
