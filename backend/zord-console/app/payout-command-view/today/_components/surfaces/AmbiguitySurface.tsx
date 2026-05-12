'use client'

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ClientChart, Glyph, LiveDataHint } from '../shared'
import { EntityLogo } from '../entity-logo'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'

/**
 * AmbiguitySurface — Ops / Engineering view (§8.2 of the KPI doc).
 *
 * Split from the former AmbiguityLeakageSurface per product-north-star.md Sprint A.
 * Count-denominated view: how many signals are open, how confident are our attachments,
 * which connectors / rails are causing the noise. Companion to LeakageSurface (rupees).
 *
 * BACKEND-BLOCKED per next-iteration-gaps.md §I.5 — these 5 fields are not yet in
 * /v1/intelligence/dashboard/ambiguity:
 *   - ambiguous_amount_rate, low_confidence_attachment_rate, candidate_collision_rate,
 *     carrier_completeness_rate, ambiguity_severity
 * Until those land, the affected sections render a LiveDataHint amber pill.
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

export function AmbiguitySurface() {
  const tenantId = useSessionTenantId()
  const { ambiguity } = useIntelligenceKpis(tenantId)
  const ambData = isDataAvailable(ambiguity) ? ambiguity : null

  // 4 KPIs are LIVE today on /v1/intelligence/dashboard/ambiguity:
  //   - ambiguous_intent_count, ambiguity_rate, avg_attachment_confidence, provider_ref_missing_rate
  // 5 more KPIs (§8.2 #3, 5, 6, 9, 10) are backend-blocked — see top-of-file.
  const heroStats = [
    {
      label: 'Open signals',
      value: ambData ? ambData.ambiguous_intent_count.toLocaleString('en-IN') : '—',
      sub: ambData ? `${ambData.risk_tier} risk` : 'awaiting data',
    },
    {
      label: 'Ambiguity rate',
      value: ambData ? `${(ambData.ambiguity_rate * 100).toFixed(1)}%` : '—',
      sub: 'Across all attachment decisions',
    },
    {
      label: 'Avg attachment confidence',
      value: ambData ? `${(ambData.avg_attachment_confidence * 100).toFixed(1)}%` : '—',
      sub: 'Running average · 0–100',
    },
    {
      label: 'Missing references',
      value: ambData ? `${(ambData.provider_ref_missing_rate * 100).toFixed(1)}%` : '—',
      sub: 'Carrier identifiers (UTR/RRN) absent',
    },
  ]

  return (
    <div className="space-y-5">
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">
          <Glyph name="zap" className="h-2.5 w-2.5" />
          Ops · daily triage
        </span>
        <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.02em] text-[#111111]">
          Ambiguity
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-[#6f716d]">
          Which signals are open, which intents are unresolved, where attachment confidence is low. The ops queue for closing the gap.
        </p>
        <div className="mt-3">
          <LiveDataHint isLive={Boolean(ambData)} source="ambiguity" />
        </div>
      </header>

      {/* 4 live KPI tiles */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {heroStats.map((s) => (
          <div key={s.label} className="rounded-[12px] border border-[#E5E5E5] bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">{s.label}</div>
            <div className="mt-1 text-[24px] font-semibold tabular-nums text-[#111111]">{s.value}</div>
            <div className="mt-0.5 text-[12px] text-[#6f716d]">{s.sub}</div>
          </div>
        ))}
      </section>

      {/* Graphs row — drag factors + carrier completeness donut */}
      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* Drag factors — the 3 negative rates that prevent clean attachment */}
        <article className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
          <div className="mb-3">
            <p className="text-[14px] font-semibold text-[#111111]">Drag factors</p>
            <p className="mt-0.5 text-[12px] text-[#6f716d]">
              The three rates that pull attachment quality down. Lower bars = better.
            </p>
          </div>
          <ClientChart className="h-[12rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={140}>
              <BarChart
                data={[
                  {
                    label: 'Ambiguity (KPI 8)',
                    pct: ambData ? ambData.ambiguity_rate * 100 : 8,
                    color: '#f97316',
                  },
                  {
                    label: 'Low confidence',
                    pct: ambData ? (1 - ambData.avg_attachment_confidence) * 100 : 27,
                    color: '#a855f7',
                  },
                  {
                    label: 'Missing refs (KPI 10)',
                    pct: ambData ? ambData.provider_ref_missing_rate * 100 : 5,
                    color: '#dc2626',
                  },
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
                  formatter={(value) => [`${(typeof value === 'number' ? value : Number(value)).toFixed(1)}%`, 'Drag']}
                />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]} barSize={36}>
                  <Cell fill="#f97316" />
                  <Cell fill="#a855f7" />
                  <Cell fill="#dc2626" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ClientChart>
        </article>

        {/* Attachment confidence as a horizontal progress bar (0–100%) — KPI 9 */}
        <article className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
          <p className="text-[14px] font-semibold text-[#111111]">Attachment confidence</p>
          <p className="mt-0.5 text-[12px] text-[#6f716d]">
            Running average across all attachment decisions (KPI 9). Higher = stronger settlement matches.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="text-[42px] font-semibold tabular-nums text-[#111111]">
              {ambData ? `${(ambData.avg_attachment_confidence * 100).toFixed(1)}%` : '—'}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#f4f4f1]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: ambData ? `${ambData.avg_attachment_confidence * 100}%` : '73%',
                }}
              />
            </div>
            <div className="mt-1 flex w-full justify-between text-[10px] uppercase tracking-[0.08em] text-[#94a3b8]">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </article>
      </section>

      {/* By-connector and by-rail breakdowns (static — covered by endpoint group A in next-iteration-gaps.md). */}
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

      {/* Recommendations — list is static; needs §D endpoint to render real contracts. */}
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

// ─── Subcomponents (extracted from former AmbiguityLeakageSurface) ─────────────

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
