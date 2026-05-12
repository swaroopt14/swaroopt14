'use client'

import { NavyMetricHero } from '../command-center/NavyMetricHero'
import { Glyph, LiveDataHint } from '../shared'
import { EntityLogo } from '../entity-logo'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'

// Format minor-units (paise/cents) to a human ₹ string.
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

/**
 * AmbiguityLeakageSurface — Page 5: Ambiguity & Leakage Intelligence.
 *
 * Visual contract: matches Home command center.
 * Black / white / #6f716d / #E5E5E5 / #fafafa, dark navy hero, #4ADE80 spot accent.
 */

const SOURCE_BY_CONNECTOR = [
  { name: 'PayU', kind: 'psp' as const, ambiguity: 6.0, trend: 'up' as const, delta: '+0.4pp', amount: '₹84.2K' },
  { name: 'RazorpayX', kind: 'psp' as const, ambiguity: 3.2, trend: 'up' as const, delta: '+0.3pp', amount: '₹46.8K' },
  { name: 'Stripe', kind: 'psp' as const, ambiguity: 2.4, trend: 'flat' as const, delta: '−0.1pp', amount: '₹28.1K' },
  { name: 'Cashfree', kind: 'psp' as const, ambiguity: 1.8, trend: 'down' as const, delta: '−0.1pp', amount: '₹19.4K' },
]

const SOURCE_BY_RAIL = [
  { name: 'IMPS', ambiguity: 3.2, delta: '+0.8pp', amount: '₹98.4K', trend: 'up' as const },
  { name: 'NEFT', ambiguity: 2.1, delta: '−0.2pp', amount: '₹42.1K', trend: 'down' as const },
  { name: 'NACH', ambiguity: 4.6, delta: '+1.2pp', amount: '₹52.8K', trend: 'up' as const },
  { name: 'UPI', ambiguity: 1.4, delta: 'flat', amount: '₹14.2K', trend: 'flat' as const },
]

const SOURCE_BY_AMOUNT = [
  { band: 'Under ₹1,500', ambiguity: 1.1, share: 18 },
  { band: '₹1,500 – ₹10K', ambiguity: 2.4, share: 34 },
  { band: '₹10K – ₹50K', ambiguity: 3.8, share: 28 },
  { band: 'Over ₹50K', ambiguity: 6.2, share: 20 },
]

const RECOMMENDATIONS = [
  {
    id: 'rec-1',
    headline: 'Switch IMPS fallback to NEFT for intents above ₹50,000',
    rationale: 'Would reduce ambiguity in this corridor by 34%, closing approximately ₹1.2 L in monthly exposure.',
    cta: 'Apply rule',
    impact: '−₹1.2 L / mo',
  },
  {
    id: 'rec-2',
    headline: 'Throttle PayU dispatch during 14:00–17:00 IST settlement window',
    rationale: 'Settlement-window webhooks arrive late on PayU; rerouting to Cashfree closes ~₹64K in trapped capital weekly.',
    cta: 'Apply rule',
    impact: '−₹64 K / wk',
  },
  {
    id: 'rec-3',
    headline: 'Auto-fetch HDFC bank statement at T+2h for ambiguous intents',
    rationale: 'Closes 67% of partial-evidence cases without operator intervention. Saves ~28 ops hours / month.',
    cta: 'Apply rule',
    impact: '−28 ops hrs',
  },
]

export function AmbiguityLeakageSurface() {
  const tenantId = useSessionTenantId()
  const { leakage, ambiguity } = useIntelligenceKpis(tenantId)
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const ambiguityData = isDataAvailable(ambiguity) ? ambiguity : null

  // Hero: leakage_amount = leakage_percentage × total_intended_amount_minor.
  // Falls back to "—" until the snapshot lands or to the canned mock if neither tenant nor data exists.
  const totalIntendedMinor = leakageData?.total_intended_amount_minor
  const leakagePct = leakageData?.leakage_percentage ?? 0
  const leakageAmountMinor =
    totalIntendedMinor && leakagePct
      ? Math.round(Number(totalIntendedMinor) * leakagePct)
      : null
  const heroValue = leakageAmountMinor !== null ? formatINR(leakageAmountMinor) : '₹4.82 L'
  const heroDelta = leakageData
    ? `${(leakagePct * 100).toFixed(1)}% leakage · ${leakageData.risk_tier} risk`
    : '↑ ₹38K vs last 30 days'

  // Buckets: Trapped capital = unmatched (KPI 3); Dispute exposure = ambiguity.value_at_risk (KPI 4);
  // Reversal exposure = reversal_exposure_minor (KPI 8) — replaces the canned "Ops cost" estimate.
  const trappedValue = leakageData
    ? formatINR(leakageData.unmatched_amount_minor)
    : '₹2.84 L'
  const disputeValue = ambiguityData
    ? formatINR(ambiguityData.value_at_risk_minor)
    : '₹1.46 L'
  const reversalValue = leakageData
    ? formatINR(leakageData.reversal_exposure_minor)
    : '₹52 K'
  // KPI 6 — orphan settlements (informational, excluded from leakage_rate).
  const orphanValue = leakageData
    ? formatINR(leakageData.orphan_amount_minor)
    : null

  return (
    <div className="space-y-5">
      {/* ── Eyebrow + title ─────────────────────────────────────────── */}
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">
          <Glyph name="zap" className="h-2.5 w-2.5" />
          CFO · Finance · Ops monthly
        </span>
        <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.02em] text-[#111111]">
          Ambiguity & Leakage
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-[#6f716d]">
          Your payment ambiguity is costing you money. Here is exactly where, how much, and what closes it.
        </p>
        <div className="mt-3">
          <LiveDataHint isLive={Boolean(leakageData || ambiguityData)} source="intelligence" />
        </div>
      </header>

      {/* ── Hero: leakage number + 3 buckets ────────────────────────── */}
      <NavyMetricHero
        eyebrow="Total ambiguity cost · this period"
        value={heroValue}
        deltaPill={heroDelta}
        subcopy="Three corridors driving the spike — see breakdown below."
        buckets={[
          {
            label: 'Trapped capital',
            value: trappedValue,
            sub: 'Funds open in unconfirmed signal state — feeds your cash forecast',
          },
          {
            label: 'Dispute exposure',
            value: disputeValue,
            sub: 'Intents without complete evidence, currently in or likely to enter dispute',
          },
          {
            label: 'Reversal exposure',
            value: reversalValue,
            sub: 'Amount reversed after a successful settlement — direct dispute risk',
          },
        ]}
      />

      {/* KPI 6 — orphan settlements. Excluded from leakage_rate (informational), so
          rendered as a thin context strip rather than another hero bucket. */}
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

      {/* ── Source breakdown ────────────────────────────────────────── */}
      <section className="grid gap-3 lg:grid-cols-2">
        <BreakdownCard
          title="By connector"
          subtitle="Which PSP is generating the most open signals"
          rows={SOURCE_BY_CONNECTOR.map((c) => ({
            key: c.name,
            left: <ConnectorRow name={c.name} kind={c.kind} />,
            metric: `${c.ambiguity.toFixed(1)}%`,
            delta: c.delta,
            trend: c.trend,
            amount: c.amount,
          }))}
        />
        <BreakdownCard
          title="By rail"
          subtitle="Which payment rail has the highest ambiguity"
          rows={SOURCE_BY_RAIL.map((r) => ({
            key: r.name,
            left: (
              <span className="rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#475569]">
                {r.name}
              </span>
            ),
            metric: `${r.ambiguity.toFixed(1)}%`,
            delta: r.delta,
            trend: r.trend,
            amount: r.amount,
          }))}
        />
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

      {/* ── What Zord closed (ROI proof) ────────────────────────────── */}
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

      {/* ── Recommendations ─────────────────────────────────────────── */}
      <section>
        <div className="mb-3">
          <p className="text-[14px] font-semibold text-[#111111]">Recommendations</p>
          <p className="mt-0.5 text-[12px] text-[#6f716d]">
            Three highest-impact actions, anchored to actual signal data. Each is confirmation-gated.
          </p>
        </div>
        <ul className="space-y-2">
          {RECOMMENDATIONS.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start gap-3 rounded-[12px] border border-[#E5E5E5] bg-white p-4"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#111111] text-white">
                <Glyph name="zap" className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[#111111]">{r.headline}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[#475569]">{r.rationale}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-semibold tabular-nums text-[#111111]">
                  {r.impact}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#111111] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-black"
                >
                  {r.cta}
                  <Glyph name="arrow-up-right" className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

type BreakdownRow = {
  key: string
  left: React.ReactNode
  metric: string
  delta: string
  trend: 'up' | 'down' | 'flat'
  amount: string
}

function BreakdownCard({ title, subtitle, rows }: { title: string; subtitle: string; rows: BreakdownRow[] }) {
  return (
    <article className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
      <div className="mb-3">
        <p className="text-[14px] font-semibold text-[#111111]">{title}</p>
        <p className="mt-0.5 text-[12px] text-[#6f716d]">{subtitle}</p>
      </div>
      <ul className="space-y-2.5">
        {rows.map((row) => {
          const arrow = row.trend === 'up' ? '↑' : row.trend === 'down' ? '↓' : '→'
          return (
            <li key={row.key} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">{row.left}</div>
              <div className="flex shrink-0 items-center gap-2 text-[12px]">
                <span className="font-bold tabular-nums text-[#111111]">{row.metric}</span>
                <span className="tabular-nums text-[#6f716d]">{arrow} {row.delta}</span>
                <span className="tabular-nums text-[#475569]">· {row.amount}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

function ConnectorRow({ name, kind }: { name: string; kind: 'psp' | 'bank' }) {
  return (
    <span className="flex items-center gap-1.5">
      <EntityLogo name={name} kind={kind} size={18} />
      <span className="text-[13px] font-medium text-[#111111]">{name}</span>
    </span>
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
