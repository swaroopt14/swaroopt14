'use client'

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { NavyMetricHero } from '../command-center/NavyMetricHero'
import { ClientChart, Glyph, LiveDataHint } from '../shared'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'

/**
 * LeakageSurface — CFO / Finance view (§8.1 of the KPI doc).
 *
 * Split from the former AmbiguityLeakageSurface per product-north-star.md Sprint A.
 * This file is the rupee-denominated view: where money is leaking (KPIs 3, 5, 6, 8)
 * and how big the leakage rate (KPI 6 in the leakage section) actually is.
 *
 * Ops-side counterpart lives in AmbiguitySurface (count-denominated view).
 */

function formatINR(minorStr: string | number | undefined): string {
  if (!minorStr) return '—'
  const minor = typeof minorStr === 'number' ? minorStr : Number(minorStr)
  if (!Number.isFinite(minor) || minor === 0) return '₹0'
  const rupees = minor / 100
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)} Cr`
  if (rupees >= 100_000) return `₹${(rupees / 100_000).toFixed(2)} L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)} K`
  return `₹${rupees.toFixed(0)}`
}

const SOURCE_BY_AMOUNT = [
  { band: 'Under ₹1,500', ambiguity: 1.1, share: 18 },
  { band: '₹1,500 – ₹10K', ambiguity: 2.4, share: 34 },
  { band: '₹10K – ₹50K', ambiguity: 3.8, share: 28 },
  { band: 'Over ₹50K', ambiguity: 6.2, share: 20 },
]

export function LeakageSurface() {
  const tenantId = useSessionTenantId()
  const { leakage, ambiguity, defensibility } = useIntelligenceKpis(tenantId)
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const ambiguityData = isDataAvailable(ambiguity) ? ambiguity : null
  const defData = isDataAvailable(defensibility) ? defensibility : null

  // Graph data — 4-component breakdown of leakage (₹). Each segment is one KPI.
  // Total intended is the implicit denominator (shown as the chart x-axis range).
  const leakageBars = [
    {
      label: 'Unmatched (3)',
      minor: leakageData ? Number(leakageData.unmatched_amount_minor) : 500_000,
      color: '#dc2626', // red — worst exposure (no settlement at all)
    },
    {
      label: 'Under-settled (5)',
      minor: leakageData ? Number(leakageData.under_settlement_amount_minor) : 200_000,
      color: '#f97316', // orange — partial settlement
    },
    {
      label: 'Reversal (8)',
      minor: leakageData ? Number(leakageData.reversal_exposure_minor) : 120_000,
      color: '#a855f7', // purple — dispute-flavored
    },
    {
      label: 'Orphan (6)',
      minor: leakageData ? Number(leakageData.orphan_amount_minor) : 50_000,
      color: '#94a3b8', // grey — informational, excluded from leakage rate
    },
  ]
  const leakageChartTooltip = (value: number | string) => {
    const minor = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(minor) || minor === 0) return ['₹0', 'Exposure']
    const rupees = minor / 100
    if (rupees >= 100_000) return [`₹${(rupees / 100_000).toFixed(2)} L`, 'Exposure']
    if (rupees >= 1000) return [`₹${(rupees / 1000).toFixed(1)} K`, 'Exposure']
    return [`₹${rupees.toFixed(0)}`, 'Exposure']
  }

  // Hero: leakage_amount = leakage_percentage × total_intended_amount_minor.
  const totalIntendedMinor = leakageData?.total_intended_amount_minor
  const leakagePct = leakageData?.leakage_percentage ?? 0
  const leakageAmountMinor =
    totalIntendedMinor && leakagePct ? Math.round(Number(totalIntendedMinor) * leakagePct) : null
  const heroValue = leakageAmountMinor !== null ? formatINR(leakageAmountMinor) : '₹4.82 L'
  const heroDelta = leakageData
    ? `${(leakagePct * 100).toFixed(1)}% leakage · ${leakageData.risk_tier} risk`
    : '↑ ₹38K vs last 30 days'

  // Buckets: KPI 3 unmatched, KPI 4 value-at-risk (from ambiguity endpoint), KPI 8 reversal.
  const trappedValue = leakageData ? formatINR(leakageData.unmatched_amount_minor) : '₹2.84 L'
  const disputeValue = ambiguityData ? formatINR(ambiguityData.value_at_risk_minor) : '₹1.46 L'
  const reversalValue = leakageData ? formatINR(leakageData.reversal_exposure_minor) : '₹52 K'
  // KPI 6 — orphan settlements (informational, excluded from leakage_rate).
  const orphanValue = leakageData ? formatINR(leakageData.orphan_amount_minor) : null

  return (
    <div className="space-y-5">
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">
          <Glyph name="zap" className="h-2.5 w-2.5" />
          CFO · Finance · monthly close
        </span>
        <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.02em] text-[#111111]">
          Leakage
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-[#6f716d]">
          Where money is leaking — quantified in rupees so you can attribute it, defend it, and close it.
        </p>
        <div className="mt-3">
          <LiveDataHint isLive={Boolean(leakageData || ambiguityData)} source="intelligence" />
        </div>
      </header>

      <NavyMetricHero
        eyebrow="Total leakage · this period"
        value={heroValue}
        deltaPill={heroDelta}
        subcopy="Three exposure types driving the total — orphan settlements shown below for context."
        buckets={[
          {
            label: 'Trapped capital',
            value: trappedValue,
            sub: 'Unmatched intents — funds open in unconfirmed signal state',
          },
          {
            label: 'Dispute exposure',
            value: disputeValue,
            sub: 'Value at risk on ambiguous intents — likely to enter dispute',
          },
          {
            label: 'Reversal exposure',
            value: reversalValue,
            sub: 'Amount reversed after a successful settlement — direct dispute risk',
          },
        ]}
      />

      {/* KPI 6 — orphan settlements. Informational only (excluded from leakage_rate). */}
      {orphanValue ? (
        <div className="flex items-baseline justify-between gap-3 rounded-[12px] border border-[#E5E5E5] bg-white px-4 py-2.5 text-[13px]">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
              Orphan settlements
            </span>
            <span className="font-semibold tabular-nums text-[#0f172a]">{orphanValue}</span>
          </div>
          <span className="text-[12px] text-[#64748b]">
            PSP confirmed money that has no matching intent on our side. Informational only — not added to leakage rate.
          </span>
        </div>
      ) : null}

      {/* Graphs row — leakage components bar + defensibility composition */}
      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* Leakage components — horizontal bars showing which KPI is biggest */}
        <article className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
          <div className="mb-3">
            <p className="text-[14px] font-semibold text-[#111111]">Leakage components</p>
            <p className="mt-0.5 text-[12px] text-[#6f716d]">
              Where each rupee of leakage is coming from. Orphan settlements are shown for context only.
            </p>
          </div>
          <ClientChart className="h-[12rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={140}>
              <BarChart data={leakageBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#8a8a86', fontSize: 11 }}
                  tickFormatter={(v) => {
                    const r = Number(v) / 100
                    if (r >= 100_000) return `₹${(r / 100_000).toFixed(1)}L`
                    if (r >= 1000) return `₹${(r / 1000).toFixed(0)}K`
                    return `₹${r.toFixed(0)}`
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 12 }}
                  width={110}
                />
                <Tooltip
                  cursor={{ fill: '#f5f5f5' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid #E5E5E5', fontSize: 12 }}
                  formatter={(value) => leakageChartTooltip(typeof value === 'number' ? value : Number(value))}
                />
                <Bar dataKey="minor" radius={[0, 6, 6, 0]} barSize={18}>
                  {leakageBars.map((b) => (
                    <Cell key={b.label} fill={b.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ClientChart>
        </article>

        {/* Defensibility composition (KPIs 11–13) — vertical bars 0–100% */}
        <article className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#111111]">Defensibility composition</p>
            {defData ? (
              <span className="text-[11px] font-semibold tabular-nums text-emerald-700">
                {defData.defensibility_score.toFixed(1)}% · {defData.defensibility_tier}
              </span>
            ) : null}
          </div>
          <ClientChart className="h-[12rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={140}>
              <BarChart
                data={[
                  { label: 'Evidence packs', pct: defData ? defData.evidence_pack_rate * 100 : 85 },
                  { label: 'Governance', pct: defData ? defData.governance_coverage_pct * 100 : 91 },
                  { label: 'Replayable', pct: defData ? defData.replayability_pct * 100 : 78 },
                ]}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
              >
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#8a8a86', fontSize: 11 }}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  cursor={{ fill: '#f5f5f5' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid #E5E5E5', fontSize: 12 }}
                  formatter={(value) => [`${(typeof value === 'number' ? value : Number(value)).toFixed(1)}%`, 'Coverage']}
                />
                <Bar dataKey="pct" fill="#10b981" radius={[6, 6, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </ClientChart>
        </article>
      </section>

      <section className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
        <div className="mb-3">
          <p className="text-[14px] font-semibold text-[#111111]">By amount band</p>
          <p className="mt-0.5 text-[12px] text-[#6f716d]">Larger intents tend to carry higher ambiguity — settlement window effects.</p>
        </div>
        <ul className="space-y-2.5">
          {SOURCE_BY_AMOUNT.map((b) => (
            <li key={b.band}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-medium text-[#111111]">{b.band}</span>
                <span className="flex items-baseline gap-2 tabular-nums">
                  <span className="font-semibold text-[#111111]">{b.ambiguity.toFixed(1)}%</span>
                  <span className="text-[11px] uppercase tracking-[0.08em] text-[#94a3b8]">ambiguity</span>
                  <span className="text-[#cfcfcf]">·</span>
                  <span className="text-[#6f716d]">1 in {Math.max(1, Math.round(100 / b.share))} intents</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f4f4f1]">
                <div
                  className="h-full rounded-full bg-[#111111]"
                  style={{ width: `${(b.ambiguity / 7) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* What Zord closed — ROI proof. Static for now; needs §E (ROI summary) endpoint. */}
      <section className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" aria-hidden />
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">
            What Zord closed · this period
          </p>
        </div>
        <h3 className="mt-1.5 text-[17px] font-semibold text-[#111111]">ROI proof</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ClosedStat label="Ambiguity closed" value="₹1.94 L" sub="signals reconciled into evidence packs" />
          <ClosedStat label="Disputes won" value="14" sub="resolved with downloadable cert" />
          <ClosedStat label="Capital released" value="₹1.18 L" sub="back into cash forecast" />
        </div>
      </section>
    </div>
  )
}

function ClosedStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[10px] border border-[#E5E5E5] bg-[#fafafa] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f716d]">{label}</p>
      <p className="mt-1.5 text-[23px] font-semibold tabular-nums text-[#111111]">{value}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-[#475569]">{sub}</p>
    </div>
  )
}
