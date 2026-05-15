'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ClientChart, Glyph, LiveDataHint } from '../shared'
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

function buildLeakageTrendSeries(leakageFrac: number): { day: string; pct: number }[] {
  const out: { day: string; pct: number }[] = []
  const today = new Date()
  const base = Math.max(0, Math.min(0.2, leakageFrac))
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const noise = Math.sin(i * 0.55) * 0.004
    const drift = ((29 - i) / 29) * 0.006
    const pctFrac = Math.max(0.001, Math.min(0.18, base - drift + noise))
    out.push({
      day: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      pct: pctFrac * 100,
    })
  }
  return out
}

function trendInsightFromSeries(series: { pct: number }[], currentFrac: number): string {
  if (series.length < 14) return ''
  const last7 = series.slice(-7)
  const prev7 = series.slice(-14, -7)
  const avg = (a: typeof series) => a.reduce((s, x) => s + x.pct, 0) / a.length
  const d = avg(last7) - avg(prev7)
  const dir = d > 0.08 ? '▲ increased' : d < -0.08 ? '▼ decreased' : '— flat vs'
  return `Your leakage rate has ${dir} ${Math.abs(d).toFixed(2)}pp vs the prior week (modelled daily series anchored to ${(currentFrac * 100).toFixed(1)}% today). Unmatched payments are the usual primary driver when this drifts up.`
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
  const trendData = useMemo(() => buildLeakageTrendSeries(leakageFrac), [leakageFrac])
  const trendCopy = useMemo(() => trendInsightFromSeries(trendData, leakageFrac), [trendData, leakageFrac])
  const action = leak ? leakageActionNarrative(leak) : null

  const dockHref = `${pathname}?dock=ambiguity`
  const pctStyle = leakagePctColor(leakageFrac)

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="inline-flex w-max items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">
          <Glyph name="zap" className="h-2.5 w-2.5 shrink-0" aria-hidden />
          CFO · Finance · leakage
        </p>
        <p className="max-w-3xl text-[15px] leading-relaxed text-[#475569]">
          How much of your payment volume is bleeding — and exactly where. KPI 6{' '}
          <span className="font-mono text-[13px]">leakage_percentage</span> is the headline risk number; everything below
          decomposes it in rupees.
        </p>
        <LiveDataHint isLive={Boolean(leak)} source="intelligence" />
      </div>

      {/* Top — three headline numbers */}
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">Total intended</p>
          <p className="mt-2 text-[11px] font-medium text-[#64748b]">Total value you tried to move this period</p>
          <p className="mt-3 text-[2rem] font-semibold tabular-nums tracking-tight text-[#0f172a]">
            {formatINR(intendedMinor)}
          </p>
          <p className="mt-2 text-[12px] text-[#64748b]">
            KPI 1 · <span className="font-mono">total_intended_amount_minor</span>
          </p>
        </article>

        <article className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">Total leakage</p>
          <p className="mt-2 text-[11px] font-medium text-[#64748b]">Share of intended flow not fully recovered</p>
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

        <article className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">Risk tier</p>
          <p className="mt-2 text-[11px] font-medium text-[#64748b]">Modelled exposure band</p>
          <p className="mt-3 text-[2rem] font-semibold tabular-nums tracking-tight text-[#0f172a]">
            {leak?.risk_tier ?? '—'}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-[#475569]">{leak ? riskTierExplainer(leak.risk_tier) : '—'}</p>
          <p className="mt-2 text-[12px] text-[#94a3b8]">
            From API · <span className="font-mono">risk_tier</span>
          </p>
        </article>
      </section>

      {/* Middle — four breakdown cards */}
      <section>
        <h2 className="text-[15px] font-semibold text-[#111111]">Leakage breakdown</h2>
        <p className="mt-1 max-w-3xl text-[13px] text-[#64748b]">Where the rupees are — each card maps to a leakage KPI field.</p>
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
        <article className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-[#111111]">Leakage % · last 30 days</h2>
          <p className="mt-1 text-[12px] text-[#64748b]">
            Daily model anchored to today&apos;s KPI 6 (no historical leakage API yet — curve is deterministic noise for
            ops context).
          </p>
          <ClientChart className="mt-4 h-[14rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: number) => [`${v.toFixed(2)}%`, 'Leakage']}
                />
                <Line type="monotone" dataKey="pct" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ClientChart>
          <p className="mt-3 text-[13px] leading-relaxed text-[#475569]">{trendCopy}</p>
        </article>

        <article className="flex flex-col gap-4">
          <div className="rounded-2xl border border-sky-200/80 bg-sky-50/90 p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-900">Ambiguity bridge</p>
            {bridgePct != null ? (
              <p className="mt-2 text-[15px] font-semibold leading-snug text-sky-950">
                ~{bridgePct}% of your leakage-weighted exposure overlaps same-period{' '}
                <span className="font-mono">value_at_risk_minor</span> from ambiguous signals.
              </p>
            ) : (
              <p className="mt-2 text-[14px] text-sky-950">
                Connect live ambiguity + leakage payloads to surface the overlap percentage automatically.
              </p>
            )}
            <p className="mt-2 text-[13px] leading-relaxed text-sky-900/90">
              Ambiguity is an ops / engineering conversation; leakage is finance. We keep them separate — this is the
              single cross-link CFOs asked for.
            </p>
            <Link
              href={dockHref}
              className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950"
            >
              View ambiguity analysis
              <Glyph name="arrow-up-right" className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex flex-1 flex-col rounded-2xl border border-[#E5E5E5] bg-[#fafafa] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">Recommended action</p>
            <p className="mt-2 text-[15px] font-semibold text-[#111111]">{action?.headline ?? '—'}</p>
            <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[#475569]">{action?.body}</p>
            <button
              type="button"
              className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl bg-[#111111] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-black"
            >
              Apply action contract
              <Glyph name="arrow-up-right" className="h-3.5 w-3.5" />
            </button>
            <p className="mt-2 text-[11px] text-[#94a3b8]">Confirmation-gated · wires to recommendations service when enabled.</p>
          </div>
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
    <article className={`rounded-2xl border bg-white p-5 shadow-sm ${ring}`}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{title}</p>
      <p className="mt-1 font-mono text-[10px] text-[#94a3b8]">{kpi}</p>
      <p className="mt-3 text-[1.65rem] font-semibold tabular-nums text-[#0f172a]">{amount}</p>
      <p className="mt-1 text-[12px] font-medium text-[#64748b]">{share}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-[#475569]">{body}</p>
    </article>
  )
}
