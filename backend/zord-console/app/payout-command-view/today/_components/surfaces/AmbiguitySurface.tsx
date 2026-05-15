'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ClientChart, Glyph, LiveDataHint } from '../shared'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { FinalityStatus, IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'

/**
 * AmbiguitySurface — Ops / engineering: "Why can't Zord close certain intents — and what's it costing?"
 * KPIs 7–10 + batch list. Companion to LeakageSurface (rupees); link back without mixing narratives.
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

function ambiguityRateColor(rate: number): { bar: string; text: string } {
  if (rate < 0.03) return { bar: 'bg-emerald-500', text: 'text-emerald-900' }
  if (rate <= 0.08) return { bar: 'bg-amber-500', text: 'text-amber-950' }
  return { bar: 'bg-red-600', text: 'text-red-950' }
}

function confidenceZoneLabel(conf: number): string {
  if (conf < 0.5) return 'Low confidence — signals are conflicting or missing.'
  if (conf < 0.8) return 'Moderate confidence — some signals resolved, some uncertain.'
  return 'High confidence — multi-signal attachment largely confirmed.'
}

function batchOpsAmbiguityRate(b: IntelligenceBatchRow): number {
  const t = Math.max(1, b.total_count)
  return ((b.failed_count + b.pending_count) / t) * 100
}

const FINALITY_FILTERS: Array<{ value: '' | FinalityStatus; label: string }> = [
  { value: '', label: 'All batches' },
  { value: 'REQUIRES_REVIEW', label: 'REQUIRES_REVIEW' },
  { value: 'PARTIALLY_SETTLED', label: 'PARTIALLY_SETTLED' },
  { value: 'FAILED', label: 'FAILED' },
  { value: 'PENDING', label: 'PENDING' },
  { value: 'SETTLED', label: 'SETTLED' },
]

export function AmbiguitySurface() {
  const pathname = usePathname()
  const { tenantId, tenantReady } = useSessionTenant()
  const { ambiguity } = useIntelligenceKpis({ tenantReady })
  const amb = isDataAvailable(ambiguity) ? ambiguity : null

  const [finalityFilter, setFinalityFilter] = useState<'' | FinalityStatus>('')
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadBatches = useCallback(async () => {
    const tid = tenantId.trim()
    if (!tid) {
      setBatches([])
      return
    }
    setBatchesLoading(true)
    try {
      const res = await getIntelligenceBatches(tid, {
        status: finalityFilter || undefined,
        limit: 80,
      })
      setBatches(res?.batches ?? [])
    } catch {
      setBatches([])
    } finally {
      setBatchesLoading(false)
    }
  }, [tenantId, finalityFilter])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const ambRate = amb?.ambiguity_rate ?? 0
  const rateStyle = ambiguityRateColor(ambRate)
  const dockLeakageHref = `${pathname}?dock=leakage`

  const dragBarData = useMemo(
    () => [
      { label: 'Ambiguity rate (KPI 8)', pct: amb ? amb.ambiguity_rate * 100 : 0, color: '#f97316' },
      { label: 'Low confidence (1 − KPI 9)', pct: amb ? (1 - amb.avg_attachment_confidence) * 100 : 0, color: '#a855f7' },
      { label: 'Missing refs (KPI 10)', pct: amb ? amb.provider_ref_missing_rate * 100 : 0, color: '#dc2626' },
    ],
    [amb],
  )

  const watchBatches = useMemo(() => batches.slice(0, 14), [batches])

  return (
    <div className="space-y-6">
      {/* Title + primary actions live in <PageHeader>; keep surface intro only to avoid duplicate headings. */}
      <div className="space-y-3">
        <p className="inline-flex w-max items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">
          <Glyph name="zap" className="h-2.5 w-2.5 shrink-0" aria-hidden />
          Ops · Engineering · signal quality
        </p>
        <p className="max-w-3xl text-[15px] leading-relaxed text-[#475569]">
          Why certain intents cannot be closed cleanly — and the rupee uncertainty that creates. For CFO-scale leakage
          rupees, use{' '}
          <Link href={dockLeakageHref} className="font-semibold text-[#2563eb] underline decoration-sky-200 underline-offset-2">
            Leakage
          </Link>
          .
        </p>
        <LiveDataHint isLive={Boolean(amb)} source="ambiguity" />
      </div>

      {/* Hero row — KPI rail + dominant chart (layout inspired by portfolio overview UIs) */}
      <section className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
        <div className="flex flex-col gap-3 lg:col-span-4">
          <article className="flex min-h-0 gap-3 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
            <div className="w-1 shrink-0 rounded-full bg-[#cbd5e1]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">Ambiguous intent count</p>
              <p className="mt-2 text-[11px] text-[#64748b]">Intents where signal attachment could not be fully resolved</p>
              <p className="mt-3 text-[2rem] font-semibold tabular-nums text-[#0f172a]">
                {amb ? amb.ambiguous_intent_count.toLocaleString('en-IN') : '—'}
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-[#475569]">
                These are not confirmed failures — they are not confirmed successes either. KPI 7 ·{' '}
                <span className="font-mono">ambiguous_intent_count</span>
              </p>
            </div>
          </article>

          <article className="flex min-h-0 gap-3 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
            <div className={`w-1 shrink-0 rounded-full ${rateStyle.bar}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">Ambiguity rate</p>
              <p className="mt-2 text-[11px] text-[#64748b]">Share of payment decisions with unresolved ambiguity</p>
              <p className={`mt-3 text-[2rem] font-semibold tabular-nums ${rateStyle.text}`}>
                {amb ? `${(amb.ambiguity_rate * 100).toFixed(2)}%` : '—'}
              </p>
              <p className="mt-1 text-[11px] font-medium text-[#64748b]">Green &lt;3% · Amber 3–8% · Red &gt;8%</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
                <div className={`h-full rounded-full ${rateStyle.bar}`} style={{ width: `${Math.min(100, ambRate * 100 * 5)}%` }} />
              </div>
              <p className="mt-2 text-[12px] text-[#94a3b8]">
                KPI 8 · <span className="font-mono">ambiguity_rate</span>
              </p>
            </div>
          </article>

          <article className="flex min-h-0 gap-3 rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
            <div className="w-1 shrink-0 rounded-full bg-[#94a3b8]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">Value at risk</p>
              <p className="mt-2 text-[11px] text-[#64748b]">Rupee exposure sitting on unresolved ambiguity</p>
              <p className="mt-3 text-[2rem] font-semibold tabular-nums text-[#0f172a]">{formatINR(amb?.value_at_risk_minor)}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-[#475569]">
                The finance anchor on this page — ties ops noise to balance-sheet language. KPI from{' '}
                <span className="font-mono">value_at_risk_minor</span>.
              </p>
            </div>
          </article>
        </div>

        <article className="relative flex min-h-[16rem] flex-col overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-b from-[#fafafa] to-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)] ring-1 ring-neutral-200/70 lg:col-span-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.45]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, rgba(148,163,184,0.12) 0px, rgba(148,163,184,0.12) 1px, transparent 1px, transparent 10px)',
            }}
            aria-hidden
          />
          <div className="relative z-[1] flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-[#111111]">Signal drag stack</h2>
              <p className="mt-1 text-[12px] text-[#64748b]">Three rates that slow clean attachment — lower is better.</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-white/90 px-2 py-1 shadow-sm">
              <Glyph name="chart" className="h-3.5 w-3.5 text-[#64748b]" aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">Live window</span>
            </div>
          </div>
          <ClientChart className="relative z-[1] mt-4 min-h-[12rem] flex-1 lg:min-h-[14rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160}>
              <BarChart data={dragBarData} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(248,250,252,0.85)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, '']}
                />
                <Bar dataKey="pct" radius={[10, 10, 0, 0]} barSize={40}>
                  {dragBarData.map((d) => (
                    <Cell key={d.label} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ClientChart>
        </article>
      </section>

      {/* Horizontal “watchlist” strip — recent batches at a glance */}
      <section className="rounded-2xl border border-black/10 bg-gradient-to-b from-[#f8fafc] to-white p-4 shadow-sm ring-1 ring-neutral-200/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">Batch watchlist</p>
          <p className="text-[12px] text-[#64748b]">Scroll for more · proxy ambiguity % per batch</p>
        </div>
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          {batchesLoading ? (
            <p className="py-4 text-[13px] text-[#64748b]">Loading batches…</p>
          ) : watchBatches.length === 0 ? (
            <p className="py-4 text-[13px] text-[#64748b]">No batches yet — adjust the table filter or ingest a batch.</p>
          ) : (
            watchBatches.map((b) => {
              const proxy = batchOpsAmbiguityRate(b)
              const tone =
                proxy < 15 ? 'border-emerald-200/80 bg-emerald-50/50' : proxy < 35 ? 'border-amber-200/80 bg-amber-50/40' : 'border-red-200/80 bg-red-50/40'
              const barTone = proxy < 15 ? 'bg-emerald-500' : proxy < 35 ? 'bg-amber-500' : 'bg-red-500'
              return (
                <div
                  key={b.batch_id}
                  className={`flex min-w-[10.5rem] shrink-0 flex-col gap-2 rounded-2xl border px-3 py-2.5 shadow-sm ${tone}`}
                >
                  <p className="truncate font-mono text-[12px] font-semibold text-[#0f172a]" title={b.batch_id}>
                    {b.batch_id}
                  </p>
                  <p className="text-[2rem] font-semibold tabular-nums leading-none text-[#0f172a]">{proxy.toFixed(1)}%</p>
                  <p className="text-[11px] font-medium text-[#64748b]">{b.finality_status}</p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/80">
                    <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, proxy)}%` }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* Bottom analytics row — three balanced cards */}
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-[#111111]">Avg attachment confidence</h2>
          <p className="mt-1 text-[12px] text-[#64748b]">
            KPI 9 · <span className="font-mono">avg_attachment_confidence</span> (0–1) shown as a gauge, not a raw
            decimal.
          </p>
          <ConfidenceGauge value={amb?.avg_attachment_confidence ?? 0} />
          <p className="mt-4 text-[13px] leading-relaxed text-[#475569]">
            {amb ? confidenceZoneLabel(amb.avg_attachment_confidence) : '—'}
          </p>
          <p className="mt-2 text-[13px] text-[#334155]">
            On average Zord has{' '}
            <span className="font-semibold tabular-nums">
              {amb ? `${(amb.avg_attachment_confidence * 100).toFixed(1)}%` : '—'}
            </span>{' '}
            certainty that settlement signals line up with the original intent for decisions in this window.
          </p>
        </article>

        <article className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-[#111111]">Provider reference missing rate</h2>
          <p className="mt-1 text-[12px] text-[#64748b]">
            KPI 10 · <span className="font-mono">provider_ref_missing_rate</span>
          </p>
          <p className="mt-4 text-[2rem] font-semibold tabular-nums text-[#0f172a]">
            {amb ? `${(amb.provider_ref_missing_rate * 100).toFixed(2)}%` : '—'}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-[#475569]">
            In this share of decisions, no carrier reference (UTR / RRN) was present. A payment without a traceable
            reference cannot be disputed or evidenced cleanly.
          </p>
        </article>

        <article className="relative overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br from-[#fafafa] via-white to-[#f1f5f9] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <Glyph name="shield" className="h-5 w-5 shrink-0 text-[#64748b]" aria-hidden />
            <span className="rounded-full border border-[#E5E5E5] bg-white/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
              Benchmark
            </span>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-[#475569]">
            Industry expectation is <span className="font-mono">provider_ref_missing_rate</span> &lt; 2%. Your current
            rate:{' '}
            <span className="font-semibold tabular-nums text-[#0f172a]">
              {amb ? `${(amb.provider_ref_missing_rate * 100).toFixed(2)}%` : '—'}
            </span>
            . Every point above 2% is volume you cannot defend in a chargeback.
          </p>
          <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-[12px] leading-relaxed text-amber-950">
            <span className="font-semibold">Ops note:</span> pair missing refs with the Intent Journal for the same
            batch id to see whether UTR gaps cluster on a corridor or a partner.
          </div>
        </article>
      </section>

      {/* Bottom — batch-level table */}
      <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111111]">Batch-level ambiguity</h2>
            <p className="mt-1 max-w-2xl text-[12px] text-[#64748b]">
              From Intelligence batches list. &quot;Ambiguity %&quot; is an ops proxy:{' '}
              <span className="font-mono">(failed + pending) / total</span> until per-batch ambiguity counts ship.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
            Filter finality
            <select
              value={finalityFilter}
              onChange={(e) => setFinalityFilter(e.target.value as '' | FinalityStatus)}
              className="h-9 min-w-[12rem] rounded-lg border border-[#E5E5E5] bg-white px-2 text-[13px] font-medium text-[#0f172a]"
            >
              {FINALITY_FILTERS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e2e8f0] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
                <th className="py-2 pr-3">Batch ID</th>
                <th className="py-2 pr-3">Total intents</th>
                <th className="py-2 pr-3">Open intents</th>
                <th className="py-2 pr-3">Ambiguity % (proxy)</th>
                <th className="py-2 pr-3">Confidence / batch</th>
                <th className="py-2 pr-3">Finality</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {batchesLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#64748b]">
                    Loading batches…
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#64748b]">
                    No batches for this filter, or Intelligence returned an empty list.
                  </td>
                </tr>
              ) : (
                batches.map((b) => {
                  const proxy = batchOpsAmbiguityRate(b)
                  const open = b.failed_count + b.pending_count
                  const expanded = expandedId === b.batch_id
                  return (
                    <Fragment key={b.batch_id}>
                      <tr className="border-b border-[#f1f5f9]">
                        <td className="py-2.5 pr-3 font-mono text-[12px] text-[#0f172a]">{b.batch_id}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{b.total_count.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{open.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{proxy.toFixed(1)}%</td>
                        <td
                          className="py-2.5 pr-3 tabular-nums text-[#64748b]"
                          title="Per-batch attachment confidence when patterns-by-batch is available"
                        >
                          —
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 text-[11px] font-semibold text-[#475569]">
                            {b.finality_status}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : b.batch_id)}
                              className="rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1 text-[12px] font-medium text-[#334155] hover:bg-[#f8fafc]"
                            >
                              {expanded ? 'Hide detail' : 'Why ambiguous'}
                            </button>
                            <Link
                              href={`${pathname}?dock=grid`}
                              className="inline-flex items-center rounded-lg bg-[#111111] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-black"
                            >
                              Open journal
                            </Link>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr key={`${b.batch_id}-detail`} className="border-b border-[#f1f5f9] bg-[#fafafa]">
                          <td colSpan={7} className="px-3 py-3 text-[12px] leading-relaxed text-[#475569]">
                            <span className="font-semibold text-[#0f172a]">Heuristic detail · </span>
                            Batch has {b.pending_count.toLocaleString('en-IN')} pending bank confirmations and{' '}
                            {b.failed_count.toLocaleString('en-IN')} failed / review intents. Per-intent ambiguity
                            reasons (missing UTR vs conflicting webhook vs late settlement) require batch drill-down APIs
                            — use Intent Journal with this batch id selected.
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#94a3b8]">
          Tenant-wide avg attachment confidence (KPI 9) is shown in the gauge above. Per-batch confidence scores will
          populate this column once batch-scoped patterns are exposed.
        </p>
      </section>
    </div>
  )
}

function ConfidenceGauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value))
  const pct = v * 100
  const cx = 100
  const cy = 92
  const r = 72
  // Semicircle from left (π) to right (0), opening upward — inspired by compact risk gauges.
  const describeArc = (start: number, end: number) => {
    const x1 = cx + r * Math.cos(start)
    const y1 = cy - r * Math.sin(start)
    const x2 = cx + r * Math.cos(end)
    const y2 = cy - r * Math.sin(end)
    const large = start - end > Math.PI ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }
  const start = Math.PI
  const end = 0
  const arcLen = Math.PI * r
  const dash = `${v * arcLen} ${arcLen}`
  const needle = Math.PI * (1 - v)
  const nx = cx + (r - 10) * Math.cos(needle)
  const ny = cy - (r - 10) * Math.sin(needle)
  const stroke =
    v < 0.5 ? '#f87171' : v < 0.8 ? '#fbbf24' : '#34d399'

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-[2rem] font-semibold tabular-nums leading-none text-[#0f172a]">{pct.toFixed(0)}</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">/ 100</p>
      </div>
      <div className="relative mx-auto mt-2 max-w-[14rem]">
        <svg viewBox="0 0 200 108" className="w-full" aria-hidden>
          <defs>
            <linearGradient id="amb-gauge-zones" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fecaca" />
              <stop offset="50%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#bbf7d0" />
            </linearGradient>
          </defs>
          <path
            d={describeArc(start, end)}
            fill="none"
            stroke="url(#amb-gauge-zones)"
            strokeWidth={14}
            strokeLinecap="round"
            opacity={0.85}
          />
          <path
            d={describeArc(start, end)}
            fill="none"
            stroke={stroke}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={dash}
          />
          <circle cx={nx} cy={ny} r={6} fill="#ffffff" stroke="#0f172a" strokeWidth={2} />
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-semibold uppercase tracking-[0.06em] text-[#64748b]">
        <span>0.0 · red</span>
        <span>0.5 · amber</span>
        <span>1.0 · green</span>
      </div>
    </div>
  )
}
