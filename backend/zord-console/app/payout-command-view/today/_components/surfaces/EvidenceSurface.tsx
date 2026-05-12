'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Glyph, LiveDataHint } from '../shared'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'

/**
 * EvidenceSurface — Page 4: Defensibility & Evidence.
 *
 * Visual contract: matches Home command center palette.
 * Black / white / #6f716d / #E5E5E5 / #fafafa, with #4ADE80 used sparingly
 * as the brand "good" accent. No emerald/amber/rose flood.
 */

type EvidencePack = {
  id: string
  intentSummary: string
  merkleRoot: string
  certifiedAt: string
  defensibilityScore: number
  artifactCount: number
  totalArtifacts: number
}

type Dispute = {
  id: string
  source: string
  amount: string
  evidenceStatus: 'complete' | 'partial' | 'insufficient'
  evidenceNote: string
  daysOpen: number
  winProbability: number
  uplift?: { probability: number; via: string }
}

const PACKS: EvidencePack[] = [
  { id: 'EP-2026-08742', intentSummary: 'INT-1004 · J••• D•• · ₹2,400 · IMPS', merkleRoot: '0x8a3c7e1f9b4d2056c8f1ae34', certifiedAt: '2026-05-07 14:22', defensibilityScore: 96, artifactCount: 7, totalArtifacts: 7 },
  { id: 'EP-2026-08741', intentSummary: 'INT-1003 · S••• I••• · ₹1,800 · NEFT', merkleRoot: '0x4f8b2c19a73e6850dc91f234', certifiedAt: '2026-05-07 14:18', defensibilityScore: 94, artifactCount: 7, totalArtifacts: 7 },
  { id: 'EP-2026-08740', intentSummary: 'INT-1002 · A••• P••• · ₹3,250 · IMPS', merkleRoot: '0x2d5c8e91f4a73b6087dc1e95', certifiedAt: '2026-05-07 14:14', defensibilityScore: 88, artifactCount: 6, totalArtifacts: 7 },
  { id: 'EP-2026-08739', intentSummary: 'INT-1001 · R••• K••• · ₹1,500 · NACH', merkleRoot: '0x6e1f4c8b29a73d50f8c2914a', certifiedAt: '2026-05-07 14:09', defensibilityScore: 72, artifactCount: 5, totalArtifacts: 7 },
  { id: 'EP-2026-08738', intentSummary: 'INT-0998 · M••• S••• · ₹4,200 · NEFT', merkleRoot: '0x91a5c8e4f2b73d0658c1f9ae', certifiedAt: '2026-05-07 14:02', defensibilityScore: 91, artifactCount: 7, totalArtifacts: 7 },
]

const DISPUTES: Dispute[] = [
  { id: 'DSP-2026-042', source: 'HDFC chargeback', amount: '₹14,800', evidenceStatus: 'complete', evidenceNote: '7 of 7 artifacts · Merkle verified', daysOpen: 2, winProbability: 96 },
  { id: 'DSP-2026-039', source: 'ICICI dispute', amount: '₹8,200', evidenceStatus: 'partial', evidenceNote: 'Missing SFTP signal', daysOpen: 5, winProbability: 67, uplift: { probability: 94, via: 'bank statement signal' } },
  { id: 'DSP-2026-035', source: 'PayU reversal', amount: '₹2,400', evidenceStatus: 'insufficient', evidenceNote: 'Webhook only · no settlement extract', daysOpen: 11, winProbability: 38, uplift: { probability: 72, via: 'manual statement reconcile' } },
]

export function EvidenceSurface() {
  const [search, setSearch] = useState('')

  const tenantId = useSessionTenantId()
  const { defensibility } = useIntelligenceKpis(tenantId)
  const defensibilityData = isDataAvailable(defensibility) ? defensibility : null

  // KPIs 11–13 → hero numbers. defensibility_score is already 0–100 (e.g. 82.4).
  const defScore = defensibilityData
    ? `${defensibilityData.defensibility_score.toFixed(1)}%`
    : '96.4%'
  const defSub = defensibilityData
    ? `${(defensibilityData.evidence_pack_rate * 100).toFixed(0)}% have evidence packs · ${(defensibilityData.governance_coverage_pct * 100).toFixed(0)}% governance · ${(defensibilityData.replayability_pct * 100).toFixed(0)}% replayable`
    : 'of all intents have complete evidence packs'
  const auditReadySub = defensibilityData
    ? `${(defensibilityData.audit_ready_pct * 100).toFixed(0)}% audit-ready · ${(defensibilityData.dispute_ready_pct * 100).toFixed(0)}% dispute-ready`
    : '2 with complete evidence · 1 needs uplift'

  const filteredPacks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return PACKS
    return PACKS.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.intentSummary.toLowerCase().includes(q) ||
        p.merkleRoot.toLowerCase().includes(q),
    )
  }, [search])

  return (
    <div className="space-y-5">
      {/* ── Eyebrow + title ─────────────────────────────────────────── */}
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-0.5 text-[14px] font-semibold uppercase tracking-[0.12em] text-[#6f716d]">
          <Glyph name="shield" className="h-2.5 w-2.5" />
          Compliance · Legal
        </span>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-[#111111]">
          Defensibility & Evidence
        </h1>
        <p className="mt-1 max-w-2xl text-[17px] leading-relaxed text-[#6f716d]">
          Every intent that is cryptographically proven, and every one that isn&apos;t. Pull, download, and submit
          evidence in seconds — no screenshots, no chasing PSP logs.
        </p>
        <div className="mt-3">
          <LiveDataHint isLive={Boolean(defensibilityData)} source="defensibility" />
        </div>
      </header>

      {/* ── 3 hero numbers ──────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3">
        <HeroStat label="Defensibility score" value={defScore} sub={defSub} accent />
        <HeroStat label="Exposure" value="₹2.3 L" sub="value of intents without complete evidence" />
        <HeroStat label="Active disputes" value={defensibilityData ? defensibilityData.defensibility_tier : '3'} sub={auditReadySub} />
      </section>

      {/* ── Waterfall ───────────────────────────────────────────────── */}
      <section className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
        <div className="mb-3">
          <p className="text-[17px] font-semibold text-[#111111]">Defensibility breakdown</p>
          <p className="mt-0.5 text-[15px] text-[#6f716d]">
            The gap between dispatched and fully evidenced is the live exposure Zord is closing.
          </p>
        </div>
        <Waterfall />
      </section>

      {/* ── Evidence pack browser ───────────────────────────────────── */}
      <section className="overflow-hidden rounded-[16px] border border-[#E5E5E5] bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] px-5 py-3">
          <div>
            <p className="text-[17px] font-semibold text-[#111111]">Evidence pack browser</p>
            <p className="mt-0.5 text-[15px] text-[#6f716d]">
              Pull any pack by Intent ID, beneficiary ref, batch, or Merkle root.
            </p>
          </div>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Intent / Batch / Merkle root…"
              className="h-9 w-[18rem] rounded-[8px] border border-[#E5E5E5] bg-white pl-8 pr-3 text-[16px] outline-none transition placeholder:text-[#94a3b8] focus:border-[#111111]/40"
            />
            <Glyph name="search" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[#94a3b8]" />
          </div>
        </header>
        <table className="w-full text-left text-[16px]">
          <thead className="bg-[#fafafa] text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
            <tr>
              <th className="px-4 py-2.5">Pack ID</th>
              <th className="px-4 py-2.5">Intent</th>
              <th className="px-4 py-2.5">Merkle root</th>
              <th className="px-4 py-2.5 text-right">Score</th>
              <th className="px-4 py-2.5 text-right">Artifacts</th>
              <th className="px-4 py-2.5 text-right">Certified</th>
              <th className="px-4 py-2.5 text-right">Export</th>
            </tr>
          </thead>
          <tbody>
            {filteredPacks.map((p) => (
              <tr key={p.id} className="border-t border-[#E5E5E5] hover:bg-[#fafafa]">
                <td className="px-4 py-2.5 font-mono text-[15px] text-[#111111]">{p.id}</td>
                <td className="px-4 py-2.5 text-[#475569]">{p.intentSummary}</td>
                <td className="px-4 py-2.5">
                  <code className="font-mono text-[14px] text-[#6f716d]">{p.merkleRoot}…</code>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="font-semibold tabular-nums text-[#111111]">{p.defensibilityScore}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#475569]">
                  {p.artifactCount}/{p.totalArtifacts}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[14px] text-[#94a3b8]">{p.certifiedAt}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/payout-command-view/evidence-pack/${p.id}`}
                    className="inline-flex items-center gap-1 rounded-[6px] border border-[#E5E5E5] bg-white px-2 py-1 text-[15px] font-medium text-[#111111] transition hover:bg-[#fafafa]"
                  >
                    Graph
                    <Glyph name="arrow-up-right" className="h-2.5 w-2.5" />
                  </Link>
                </td>
              </tr>
            ))}
            {filteredPacks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[16px] text-[#94a3b8]">
                  No packs match &quot;{search}&quot;
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {/* ── Active disputes ─────────────────────────────────────────── */}
      <section className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
        <div className="mb-3">
          <p className="text-[17px] font-semibold text-[#111111]">Active disputes</p>
          <p className="mt-0.5 text-[15px] text-[#6f716d]">
            Live tracker with evidence status and intelligence-layer uplift suggestions.
          </p>
        </div>
        <ul className="space-y-2.5">
          {DISPUTES.map((d) => (
            <DisputeRow key={d.id} dispute={d} />
          ))}
        </ul>
      </section>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function HeroStat({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <article className="rounded-[16px] border border-[#E5E5E5] bg-white p-5">
      <div className="flex items-center gap-2">
        {accent ? <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" aria-hidden /> : null}
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">{label}</p>
      </div>
      <p className="mt-2 text-[36px] font-light leading-none tracking-[-0.02em] tabular-nums text-[#111111]">
        {value}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#6f716d]">{sub}</p>
    </article>
  )
}

function Waterfall() {
  const stages = [
    { name: 'Total dispatched', volume: 8470, value: '₹64.2 L', tone: 'bg-[#111111]' },
    { name: 'Fully evidenced', volume: 8163, value: '₹61.9 L', tone: 'bg-[#4ADE80]' },
    { name: 'Partially evidenced', volume: 218, value: '₹1.6 L', tone: 'bg-[#888888]' },
    { name: 'Signal incomplete', volume: 64, value: '₹52 K', tone: 'bg-[#bbbbbb]' },
    { name: 'Governance only', volume: 25, value: '₹18 K', tone: 'bg-[#dddddd]' },
  ]
  const max = Math.max(...stages.map((s) => s.volume))
  return (
    <ol className="space-y-2.5">
      {stages.map((s) => {
        const pct = (s.volume / max) * 100
        return (
          <li key={s.name}>
            <div className="flex items-baseline justify-between gap-3 text-[16px]">
              <span className="font-medium text-[#111111]">{s.name}</span>
              <span className="tabular-nums text-[#6f716d]">
                {s.volume.toLocaleString('en-IN')} intents ·{' '}
                <span className="font-semibold text-[#111111]">{s.value}</span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#f4f4f1]">
              <div className={`h-full rounded-full ${s.tone}`} style={{ width: `${pct}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function DisputeRow({ dispute }: { dispute: Dispute }) {
  const dot =
    dispute.evidenceStatus === 'complete'
      ? 'bg-[#4ADE80]'
      : dispute.evidenceStatus === 'partial'
        ? 'bg-[#888888]'
        : 'bg-[#111111]'

  return (
    <li>
      <article className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#E5E5E5] bg-white p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[16px] font-semibold text-[#111111]">{dispute.id}</p>
            <span className="text-[15px] text-[#6f716d]">· {dispute.source}</span>
            <span className="text-[15px] font-semibold tabular-nums text-[#111111]">{dispute.amount}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 text-[14px] font-semibold capitalize text-[#475569]">
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
              {dispute.evidenceStatus}
            </span>
            <span className="text-[14px] text-[#94a3b8]">· {dispute.daysOpen} days open</span>
          </div>
          <p className="mt-1 text-[15px] text-[#6f716d]">{dispute.evidenceNote}</p>
          {dispute.uplift ? (
            <div className="mt-2 flex flex-wrap items-start gap-2 rounded-[8px] border border-[#E5E5E5] bg-[#fafafa] px-2.5 py-1.5">
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-[#E5E5E5] bg-white px-1.5 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-[#475569]">
                Intelligence
              </span>
              <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-[#475569]">
                <span className="font-semibold text-[#111111]">{dispute.winProbability}% win probability</span> with current evidence.
                Adding <span className="font-semibold text-[#111111]">{dispute.uplift.via}</span> would raise it to{' '}
                <span className="font-semibold text-[#111111]">{dispute.uplift.probability}%</span>.
              </p>
              <button
                type="button"
                className="rounded-[6px] bg-[#111111] px-2 py-1 text-[14px] font-semibold text-white transition hover:bg-black"
              >
                Trigger uplift
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[14px] uppercase tracking-wide text-[#94a3b8]">Win prob</span>
          <span className="text-[24px] font-semibold tabular-nums text-[#111111]">{dispute.winProbability}%</span>
        </div>
      </article>
    </li>
  )
}
