'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Glyph, LiveDataHint } from '../shared'
import { CommandCenterCardGlow } from '../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../command-center/homeCommandCenterTokens'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  intelligenceBatchesForSelector,
  pickEvidenceBatchId,
} from '@/services/payout-command/prod-api/evidenceBatchScope'
import { getEvidencePackFull, listEvidencePacks } from '@/services/payout-command/prod-api/getEvidencePacks'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import type {
  AmbiguityKpiResolved,
  DefensibilityKpiResolved,
  DefensibilityTier,
  LeakageKpiResolved,
  PatternsKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'

/** Surface tokens aligned with `layout/AskZordPanel.tsx` (Ask Zord). */
const ASK = {
  canvas: 'bg-[#f7f7f4]',
  inset: 'bg-[#fcfcfa]',
  field: 'bg-[#f8f8f6]',
  muted: 'text-[#8a8a86]',
  border: 'border-[#E5E5E5]',
  shadow: 'shadow-[0_18px_44px_rgba(0,0,0,0.10)]',
  radius: 'rounded-[1.25rem]',
} as const

/**
 * EvidenceSurface — Page 4: Defensibility & Evidence.
 *
 * Visual contract: Home command center palette + Ask Zord panel surfaces
 * (`#f7f7f4` canvas, `#fcfcfa` insets, `#f8f8f6` fields) so cards read like the Ask drawer.
 */

type PackProofStatus = 'certified' | 'partial' | 'pending'

/** One row in the evidence pack table (API + optional hydrated item count). */
type EvidencePackRow = {
  summary: EvidencePackSummaryRow
  itemCount?: number
}

function formatIsoDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function formatMinorInrLabel(minor: string | number | undefined | null): string {
  const s = apiTrimmedString(minor)
  if (!s) return '—'
  const n = BigInt(s.replace(/\D/g, '') || '0')
  const rupees = Number(n) / 100
  if (!Number.isFinite(rupees)) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    rupees,
  )
}

function packProofStatusFromSummary(s: EvidencePackSummaryRow, itemCount?: number): PackProofStatus {
  const st = (s.pack_status || '').toUpperCase()
  if (st === 'ACTIVE' || st === 'SEALED') {
    if (itemCount !== undefined && itemCount < 8) return 'partial'
    return 'certified'
  }
  if (st === 'SUPERSEDED') return 'partial'
  return 'pending'
}

function summaryLabel(s: EvidencePackSummaryRow): string {
  const parts = [s.mode, s.contract_id, s.intent_id].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Evidence pack'
}

function tierChipLabel(tier: DefensibilityTier): string {
  switch (tier) {
    case 'EXCELLENT':
      return 'Tier · Excellent'
    case 'GOOD':
      return 'Tier · Good'
    case 'FAIR':
      return 'Tier · Fair'
    case 'POOR':
      return 'Tier · Poor'
    default:
      return 'Tier'
  }
}

function DefensibilityTierPlaceholder() {
  return (
    <div className={`relative flex w-full max-w-md flex-col rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm lg:ml-auto`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-slate-100 bg-slate-50 text-[#111111]">
          <Glyph name="shield" className="h-4 w-4 opacity-80" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>Tier appears when data is live</p>
          <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>
            <span className={HOME_TITLE_BLACK}>Excellent → Poor</span> is derived from your tenant&apos;s defensibility
            KPIs. Ingest a batch or connect intelligence so this badge can update in real time.
          </p>
        </div>
      </div>
    </div>
  )
}

export function EvidenceSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const [search, setSearch] = useState('')
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [batchId, setBatchId] = useState<string>(() => apiTrimmedString(initialBatchId))
  const [packRows, setPackRows] = useState<EvidencePackRow[]>([])
  const [packListError, setPackListError] = useState<string | null>(null)
  const [packsLoading, setPacksLoading] = useState(false)

  const { tenantId, tenantReady } = useSessionTenant()
  const { leakage, ambiguity, defensibility, patterns, recommendations } = useIntelligenceKpis({
    tenantReady,
    batchId: batchId || undefined,
  })

  const defensibilityData = isDataAvailable(defensibility) ? defensibility : null
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const ambiguityData = isDataAvailable(ambiguity) ? ambiguity : null
  const patternsData = isDataAvailable(patterns) ? patterns : null
  const recommendationsData = isDataAvailable(recommendations) ? recommendations : null

  const anyKpiLive = Boolean(
    defensibilityData || leakageData || ambiguityData || patternsData || recommendationsData,
  )

  useEffect(() => {
    const fromUrl = apiTrimmedString(initialBatchId)
    if (fromUrl) setBatchId(fromUrl)
  }, [initialBatchId])

  useEffect(() => {
    if (!tenantReady) {
      setBatches([])
      if (!apiTrimmedString(initialBatchId)) setBatchId('')
      return
    }
    let cancelled = false
    void getIntelligenceBatches({ limit: 80 }).then((res) => {
      if (cancelled) return
      const intelBatches = res?.batches ?? []
      setBatches(intelBatches)
      setBatchId((prev) =>
        pickEvidenceBatchId(intelBatches, apiTrimmedString(prev) || apiTrimmedString(initialBatchId)),
      )
    })
    return () => {
      cancelled = true
    }
  }, [tenantReady, initialBatchId])

  useEffect(() => {
    if (!tenantReady || !batchId) {
      setPackRows([])
      setPackListError(null)
      setPacksLoading(false)
      return
    }
    let cancelled = false
    setPacksLoading(true)
    setPackListError(null)
    void listEvidencePacks({ batchId }).then(async (list) => {
      if (cancelled) return
      if (!list) {
        setPackListError(
          'Evidence packs list failed. Try another batch or confirm your tenant has ingested packs for this batch.',
        )
        setPackRows([])
        setPacksLoading(false)
        return
      }
      const summaries = list.packs ?? []
      setPackRows(summaries.map((s) => ({ summary: s })))
      const sliced = summaries.slice(0, 16)
      const enriched = await Promise.all(
        sliced.map(async (s) => {
          const packId = apiTrimmedString(s.evidence_pack_id)
          const full = await getEvidencePackFull(packId, { batchId })
          return { id: packId, itemCount: full?.items?.length }
        }),
      )
      if (cancelled) return
      const countMap = new Map(enriched.map((e) => [e.id, e.itemCount]))
      setPackRows((prev) =>
        prev.map((row) => ({
          ...row,
          itemCount: countMap.get(apiTrimmedString(row.summary.evidence_pack_id)) ?? row.itemCount,
        })),
      )
      setPacksLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tenantReady, batchId])

  // KPIs 11–13 → hero numbers. defensibility_score is already 0–100 (e.g. 82.4).
  const defScore = defensibilityData ? `${defensibilityData.defensibility_score.toFixed(1)}%` : '—'
  const defSub = defensibilityData
    ? `${(defensibilityData.evidence_pack_rate * 100).toFixed(0)}% have evidence packs · ${(defensibilityData.governance_coverage_pct * 100).toFixed(0)}% governance · ${(defensibilityData.replayability_pct * 100).toFixed(0)}% replayable`
    : 'Ingest intelligence so defensibility KPIs can populate this tile.'
  const auditReadySub = defensibilityData
    ? `${(defensibilityData.audit_ready_pct * 100).toFixed(0)}% audit-ready · ${(defensibilityData.dispute_ready_pct * 100).toFixed(0)}% dispute-ready`
    : 'Audit and dispute readiness require defensibility dashboard data.'

  const exposureValue = leakageData
    ? formatMinorInrLabel(leakageData.unmatched_amount_minor)
    : ambiguityData
      ? formatMinorInrLabel(ambiguityData.value_at_risk_minor)
      : '—'
  const exposureSub = leakageData
    ? `Unmatched vs intended · leakage ${leakageData.leakage_percentage.toFixed(1)}% · tier ${leakageData.risk_tier}`
    : ambiguityData
      ? `Ambiguity value at risk · tier ${ambiguityData.risk_tier}`
      : 'Leakage (1–6) or ambiguity (7–10) KPIs expose monetary risk in minor units.'

  const batchPendingLabel = patternsData ? String(patternsData.pending_count) : '—'
  const batchPendingSub = patternsData
    ? `${patternsData.success_count} settled · ${patternsData.failed_count} failed · finality ${patternsData.finality_status}`
    : recommendationsData
      ? `${recommendationsData.total_actions} actions tracked in recommendations`
      : 'Patterns dashboard (KPI 14) surfaces batch finality and counts.'

  const batchOptions = useMemo(
    () => intelligenceBatchesForSelector(batches, batchId, tenantId),
    [batches, batchId, tenantId],
  )

  const filteredPacks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return packRows
    return packRows.filter((r) => {
      const s = r.summary
      return (
        apiTrimmedString(s.evidence_pack_id).toLowerCase().includes(q) ||
        apiTrimmedString(s.intent_id).toLowerCase().includes(q) ||
        apiTrimmedString(s.batch_id).toLowerCase().includes(q) ||
        apiTrimmedString(s.merkle_root).toLowerCase().includes(q) ||
        summaryLabel(s).toLowerCase().includes(q)
      )
    })
  }, [packRows, search])

  return (
    <div className="space-y-5 pb-6">
      <header className={COMMAND_CENTER_KPI_CARD}>
        <CommandCenterCardGlow />
        <div className="relative p-5 sm:p-6">
          <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Compliance · Legal</p>
          <p className={`relative mt-3 max-w-2xl ${HOME_BODY_IMPERIAL}`}>
            Every intent that is cryptographically proven, and every one that isn&apos;t. Pull, download, and submit
            evidence in seconds — no screenshots, no chasing PSP logs.
          </p>
        </div>
        <div className="relative border-t border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="min-w-0">
              <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Data source</p>
              <div className="mt-2">
                <LiveDataHint isLive={anyKpiLive} source="intelligence + evidence" variant="command" />
              </div>
            </div>
            <div className="min-w-0 lg:max-w-[26rem] lg:text-right">
              <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Defensibility tier</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 lg:justify-end">
                {defensibilityData ? (
                  <TierChip tier={defensibilityData.defensibility_tier} label={tierChipLabel(defensibilityData.defensibility_tier)} />
                ) : (
                  <DefensibilityTierPlaceholder />
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── 3 hero numbers ──────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3">
        <HeroStat label="Defensibility score" value={defScore} sub={defSub} accent />
        <HeroStat label="Exposure (leakage / ambiguity)" value={exposureValue} sub={exposureSub} />
        <HeroStat label="Batch pending (patterns)" value={batchPendingLabel} sub={batchPendingSub} />
      </section>

      {/* ── Defensibility breakdown (funnel) ────────────────────────── */}
      <section className={COMMAND_CENTER_KPI_CARD}>
        <CommandCenterCardGlow />
        <div className={`relative border-b border-slate-100 px-5 py-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={`text-[17px] font-semibold ${HOME_TITLE_BLACK}`}>Defensibility breakdown</p>
              <p className={`mt-0.5 max-w-xl ${HOME_BODY_IMPERIAL_SM}`}>
                  The gap between dispatched and fully evidenced is the live exposure Zord is closing.
                </p>
            </div>
          </div>
        </div>
        <div className="relative p-5 pt-4">
          <Waterfall
            defensibility={defensibilityData}
            patterns={patternsData}
            leakage={leakageData}
            ambiguity={ambiguityData}
          />
        </div>
      </section>

      {/* ── Evidence pack browser ───────────────────────────────────── */}
      <section className={COMMAND_CENTER_KPI_CARD}>
        <CommandCenterCardGlow />
        <div className="relative border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className={`text-[17px] font-semibold ${HOME_TITLE_BLACK}`}>Evidence pack browser</p>
              <p className={`mt-0.5 max-w-xl ${HOME_BODY_IMPERIAL_SM}`}>
                  Pull any pack by Intent ID, beneficiary ref, batch, or Merkle root.
                </p>
                <p className={`mt-2 text-[13px] tabular-nums ${ASK.muted}`}>
                  {packsLoading ? (
                    <span className="font-medium text-[#111111]">Loading packs…</span>
                  ) : search.trim() ? (
                    <>
                      Showing <span className="font-semibold text-[#111111]">{filteredPacks.length}</span> of{' '}
                      {packRows.length} packs
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[#111111]">{packRows.length}</span> packs for batch{' '}
                      <span className="font-mono text-[#111111]">{batchId || '—'}</span>
                    </>
                  )}
                </p>
                {packListError ? <p className="mt-2 text-[13px] font-medium text-amber-800">{packListError}</p> : null}
              </div>
            <div className="flex w-full shrink-0 flex-col gap-2 lg:max-w-[24rem] lg:items-end">
              <label className={`flex w-full flex-col gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.1em] ${ASK.muted} lg:items-end`}>
                Intelligence batch
                <select
                  value={batchId}
                  disabled={!tenantReady || (!batchId && batchOptions.length === 0)}
                  onChange={(e) => setBatchId(e.target.value)}
                  className={`h-10 w-full rounded-[0.85rem] border ${ASK.border} ${ASK.field} px-3 font-mono text-[14px] font-semibold text-[#111111] outline-none lg:max-w-[20rem]`}
                >
                  {!tenantReady ? (
                    <option value="">Sign in (tenant)</option>
                  ) : batchOptions.length === 0 ? (
                    <option value="">No batch — set ?batch_id= or ingest intelligence</option>
                  ) : (
                    batchOptions.map((b) => (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.batch_id}
                        {batches.some((x) => apiTrimmedString(x.batch_id) === apiTrimmedString(b.batch_id))
                          ? ` · ${b.finality_status}`
                          : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <div className="relative w-full">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Intent, batch, Merkle root…"
                className={`h-10 w-full rounded-[0.85rem] border ${ASK.border} ${ASK.field} pl-9 pr-3 text-[15px] text-[#111111] outline-none transition placeholder:text-[#8a8a86] focus:border-[#4ADE80]/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(74,222,128,0.12)]`}
              />
              <Glyph name="search" className={`pointer-events-none absolute left-3 top-3 h-4 w-4 ${ASK.muted}`} />
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full border-separate border-spacing-0 text-left text-[15px]">
            <thead>
              <tr className={`border-b ${ASK.border} ${ASK.inset} text-[11px] font-semibold uppercase tracking-[0.1em] ${ASK.muted}`}>
                <th scope="col" className={`border-b ${ASK.border} px-5 py-3.5 font-semibold`}>
                  Pack
                </th>
                <th scope="col" className={`border-b ${ASK.border} px-4 py-3.5 font-semibold`}>
                  Intent
                </th>
                <th scope="col" className={`border-b ${ASK.border} px-4 py-3.5 font-semibold`}>
                  Merkle · proof
                </th>
                <th scope="col" className={`border-b ${ASK.border} px-4 py-3.5 text-right font-semibold`}>
                  Score
                </th>
                <th scope="col" className={`border-b ${ASK.border} px-4 py-3.5 text-right font-semibold`}>
                  Artifacts
                </th>
                <th scope="col" className={`border-b ${ASK.border} px-4 py-3.5 text-right font-semibold`}>
                  Certified
                </th>
                <th scope="col" className={`border-b ${ASK.border} px-5 py-3.5 text-right font-semibold`}>
                  Open
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5] text-[#111111]">
              {filteredPacks.map((row) => (
                <PackTableRow
                  key={row.summary.evidence_pack_id}
                  row={row}
                  tenantDefensibilityScore={defensibilityData?.defensibility_score ?? null}
                  batchId={batchId}
                />
              ))}
              {filteredPacks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="bg-[#fcfcfa]/90 px-5 py-14 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-full border ${ASK.border} ${ASK.field} ${ASK.muted}`}>
                        <Glyph name="search" className="h-5 w-5" />
                      </span>
                      <p className="text-[16px] font-semibold text-[#111111]">
                        {tenantId ? 'No packs in this view' : 'Sign in to load evidence'}
                      </p>
                      <p className="text-[15px] leading-relaxed text-[#6f716d]">
                        {tenantId
                          ? search.trim()
                            ? `Nothing for "${search}". Try another Merkle prefix or batch.`
                            : 'Pick a batch with intelligence data, or ingest a batch that has evidence packs for your tenant.'
                          : 'Tenant id is required for /api/prod/evidence/packs and intelligence batches.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function TierChip({ tier, label }: { tier: DefensibilityTier; label: string }) {
  const tone =
    tier === 'EXCELLENT'
      ? 'border-[#4ADE80]/50 bg-[#f0fdf4] text-[#166534]'
      : tier === 'GOOD'
        ? `border ${ASK.border} ${ASK.field} text-[#111111]`
        : tier === 'FAIR'
          ? 'border-[#E5E5E5] bg-white text-[#475569]'
          : 'border-[#111111]/20 bg-[#111111] text-white'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${tone}`}>
      <Glyph name="shield" className="h-3 w-3 opacity-80" />
      {label}
    </span>
  )
}

function HeroStat({ label, value, sub, accent = false }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <article className={COMMAND_CENTER_KPI_CARD}>
      <CommandCenterCardGlow />
      <div className="relative flex items-center gap-2">
        {accent ? <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" aria-hidden /> : null}
        <p className={COMMAND_CENTER_LABEL_GREEN}>{label}</p>
      </div>
      <p className={`relative mt-3 text-[2.5rem] font-extrabold tabular-nums tracking-[-0.03em] leading-none ${HOME_TITLE_BLACK}`}>
        {value}
      </p>
      <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>{sub}</p>
    </article>
  )
}

function PackTableRow({
  row,
  tenantDefensibilityScore,
  batchId,
}: {
  row: EvidencePackRow
  tenantDefensibilityScore: number | null
  batchId: string
}) {
  const s = row.summary
  const status = packProofStatusFromSummary(s, row.itemCount)
  const totalArtifacts = 9
  const artifactCount = row.itemCount ?? 0
  const artifactPct = totalArtifacts > 0 ? (artifactCount / totalArtifacts) * 100 : 0
  const certified = formatIsoDate(s.created_at)
  const merkle = s.merkle_root || '—'
  const merkleShort = merkle.length > 22 ? `${merkle.slice(0, 22)}…` : merkle
  const score = tenantDefensibilityScore != null ? Math.round(tenantDefensibilityScore) : null

  return (
    <tr className="group align-top transition-colors hover:bg-[#fcfcfa]">
      <td className="px-5 py-4 align-middle">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border ${ASK.border} ${ASK.field} ${ASK.muted} transition-colors group-hover:border-[#4ADE80]/30 group-hover:text-[#111111]`}
            >
              <Glyph name="document" className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${ASK.muted}`}>Evidence pack</p>
              <p className="font-mono text-[15px] font-semibold tracking-tight text-[#111111]">{s.evidence_pack_id}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <PackStatusChip status={status} />
            <span className={`rounded-full border ${ASK.border} ${ASK.field} px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-[#475569]`}>
              {s.pack_status}
            </span>
            <span className={`rounded-full border ${ASK.border} bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-[#475569]`}>
              {s.mode}
            </span>
          </div>
        </div>
      </td>
      <td className="max-w-[14rem] px-4 py-4 align-middle">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${ASK.muted}`}>Intent</p>
        <p className="mt-0.5 font-mono text-[13px] font-semibold text-[#111111]">{apiTrimmedString(s.intent_id) || '—'}</p>
        <p className="mt-1 text-[14px] leading-snug text-[#6f716d]">{summaryLabel(s)}</p>
      </td>
      <td className="min-w-[12rem] px-4 py-4 align-middle">
        <div className={`rounded-[0.95rem] border ${ASK.border} ${ASK.inset} p-3`}>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] leading-tight text-[#111111]" title={merkle}>
              {merkleShort}
            </code>
            <CopyMerkleButton text={merkle} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`rounded-[6px] border ${ASK.border} ${ASK.field} px-2 py-0.5 font-mono text-[11px] font-medium text-[#475569]`}>
              SHA-256
            </span>
            <span className={`rounded-[6px] border ${ASK.border} ${ASK.field} px-2 py-0.5 font-mono text-[11px] font-medium text-[#475569]`}>
              {s.ruleset_version}
            </span>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-right align-middle">
        <div className="inline-flex flex-col items-end gap-1">
          {score != null ? (
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-[16px] font-bold tabular-nums leading-none ${
                score >= 90
                  ? 'border-[#4ADE80]/60 bg-[#f0fdf4] text-[#166534]'
                  : score >= 80
                    ? 'border-[#E5E5E5] bg-white text-[#111111]'
                    : 'border-[#111111]/25 bg-[#f8f8f6] text-[#111111]'
              }`}
            >
              {score}
            </span>
          ) : (
            <span className="text-[15px] font-semibold text-[#94a3b8]">—</span>
          )}
          <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${ASK.muted}`}>
            Tenant defensibility
          </span>
        </div>
      </td>
      <td className="px-4 py-4 text-right align-middle">
        <div className="inline-flex min-w-[5.5rem] flex-col items-end gap-1.5">
          <span className="text-[15px] font-semibold tabular-nums text-[#111111]">
            {row.itemCount != null ? artifactCount : '—'}
            <span className="font-normal text-[#94a3b8]">/</span>
            {totalArtifacts}
          </span>
          <div className="h-1.5 w-full max-w-[4.5rem] overflow-hidden rounded-full bg-[#f0f0ed] ring-1 ring-[#E5E5E5]/80">
            <div
              className={`h-full rounded-full transition-all ${artifactPct >= 100 ? 'bg-[#4ADE80]' : artifactPct >= 85 ? 'bg-[#111111]' : 'bg-[#888888]'}`}
              style={{ width: `${row.itemCount != null ? artifactPct : 0}%` }}
            />
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-right align-middle">
        <div className="inline-flex flex-col items-end tabular-nums">
          <span className="text-[14px] font-semibold text-[#111111]">{certified}</span>
        </div>
      </td>
      <td className="px-5 py-4 text-right align-middle">
        <Link
          href={`/payout-command-view/evidence-pack/${encodeURIComponent(s.evidence_pack_id)}${batchId ? `?batch_id=${encodeURIComponent(batchId)}` : ''}`}
          className={`inline-flex items-center gap-1.5 rounded-[0.85rem] border ${ASK.border} ${ASK.field} px-3 py-2 text-[14px] font-semibold text-[#111111] transition hover:border-[#4ADE80]/30 hover:text-[#111111] group-hover:border-[#111111]/20 group-hover:bg-[#111111] group-hover:text-white group-hover:shadow-none`}
        >
          <Glyph name="grid" className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100" />
          Graph
          <Glyph name="arrow-up-right" className="h-3 w-3 opacity-60 group-hover:opacity-100" />
        </Link>
      </td>
    </tr>
  )
}

function CopyMerkleButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      title="Copy Merkle root"
      onClick={() => {
        void navigator.clipboard?.writeText(text)
      }}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border ${ASK.border} bg-white text-[#6f716d] transition hover:border-[#4ADE80]/30 hover:text-[#111111] active:scale-[0.98]`}
    >
      <Glyph name="copy" className="h-3.5 w-3.5" />
    </button>
  )
}

function PackStatusChip({ status }: { status: PackProofStatus }) {
  if (status === 'certified') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#4ADE80]/40 bg-[#f0fdf4] px-2 py-0.5 text-[12px] font-semibold text-[#166534]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" aria-hidden />
        Certified
      </span>
    )
  }
  if (status === 'partial') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border ${ASK.border} ${ASK.field} px-2 py-0.5 text-[12px] font-semibold text-[#475569]`}>
        <span className="h-1.5 w-1.5 rounded-full bg-[#888888]" aria-hidden />
        Partial proof
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#111111]/15 bg-white px-2 py-0.5 text-[12px] font-semibold text-[#111111]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#111111]" aria-hidden />
      Pending seal
    </span>
  )
}

type WaterfallStage = {
  name: string
  volume: number
  value: string
  barClass: string
  barShadow?: string
  badge: string
  badgeClass: string
  rowAccent: string
}

function Waterfall({
  defensibility,
  patterns,
  leakage,
  ambiguity,
}: {
  defensibility: DefensibilityKpiResolved | null
  patterns: PatternsKpiResolved | null
  leakage: LeakageKpiResolved | null
  ambiguity: AmbiguityKpiResolved | null
}) {
  const stages = useMemo((): WaterfallStage[] => {
    if (patterns && patterns.total_count > 0) {
      const total = Math.max(patterns.total_count, 1)
      const success = patterns.success_count
      const pending = patterns.pending_count
      const failed = patterns.failed_count
      const other = Math.max(0, total - success - pending - failed)
      const row = (
        name: string,
        volume: number,
        value: string,
        cls: string,
        badge: string,
        accent: string,
        shadow?: string,
      ): WaterfallStage => ({
        name,
        volume,
        value,
        barClass: cls,
        barShadow: shadow,
        badge,
        badgeClass: 'border-[#E5E5E5] bg-white text-[#475569]',
        rowAccent: accent,
      })
      return [
        row('Batch volume', total, `${total.toLocaleString('en-IN')} txns`, 'bg-[#111111]', 'Floor', 'border-l-[3px] border-l-[#111111]', 'shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'),
        row('Settled', success, `${success.toLocaleString('en-IN')}`, 'bg-[#4ADE80]', 'Target', 'border-l-[3px] border-l-[#4ADE80]', 'shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]'),
        row('Pending', pending, `${pending.toLocaleString('en-IN')}`, 'bg-[#888888]', 'Queue', 'border-l-[3px] border-l-[#888888]'),
        row('Failed', failed, `${failed.toLocaleString('en-IN')}`, 'bg-[#bbbbbb]', 'Risk', 'border-l-[3px] border-l-[#bbbbbb]'),
        row('Other', other, `${other.toLocaleString('en-IN')}`, 'bg-[#dddddd]', 'Review', 'border-l-[3px] border-l-[#dddddd]'),
      ]
    }
    if (defensibility) {
      const base = 1000
      const evidenced = Math.round(base * defensibility.evidence_pack_rate)
      const govGap = Math.round(
        base * Math.max(0, defensibility.governance_coverage_pct - defensibility.evidence_pack_rate),
      )
      const replayGap = Math.round(base * Math.max(0, 1 - defensibility.replayability_pct))
      const residual = Math.max(0, base - evidenced - govGap - replayGap)
      return [
        {
          name: 'Modelled intents (relative)',
          volume: base,
          value: '100%',
          barClass: 'bg-[#111111]',
          barShadow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
          badge: 'Floor',
          badgeClass: 'border-[#E5E5E5] bg-[#f8f8f6] text-[#475569]',
          rowAccent: 'border-l-[3px] border-l-[#111111]',
        },
        {
          name: 'Evidence pack coverage',
          volume: evidenced,
          value: `${(defensibility.evidence_pack_rate * 100).toFixed(0)}%`,
          barClass: 'bg-[#4ADE80]',
          barShadow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
          badge: 'Packs',
          badgeClass: 'border-[#4ADE80]/50 bg-[#f0fdf4] text-[#166534]',
          rowAccent: 'border-l-[3px] border-l-[#4ADE80]',
        },
        {
          name: 'Governance beyond packs',
          volume: govGap,
          value: 'Δ gov',
          barClass: 'bg-[#888888]',
          badge: 'Policy',
          badgeClass: 'border-[#E5E5E5] bg-white text-[#475569]',
          rowAccent: 'border-l-[3px] border-l-[#888888]',
        },
        {
          name: 'Replay delta',
          volume: replayGap,
          value: 'Δ replay',
          barClass: 'bg-[#bbbbbb]',
          badge: 'Replay',
          badgeClass: 'border-[#E5E5E5] bg-[#f8f8f6] text-[#6f716d]',
          rowAccent: 'border-l-[3px] border-l-[#bbbbbb]',
        },
        {
          name: 'Residual',
          volume: residual,
          value: 'misc',
          barClass: 'bg-[#dddddd]',
          badge: 'Other',
          badgeClass: 'border-[#E5E5E5] bg-white text-[#94a3b8]',
          rowAccent: 'border-l-[3px] border-l-[#dddddd]',
        },
      ]
    }
    return [
      {
        name: 'Waiting for batch or defensibility KPIs',
        volume: 1,
        value: '—',
        barClass: 'bg-[#dddddd]',
        badge: '—',
        badgeClass: 'border-[#E5E5E5] bg-white text-[#94a3b8]',
        rowAccent: 'border-l-[3px] border-l-[#dddddd]',
      },
    ]
  }, [patterns, defensibility])

  if (stages.length < 2) {
    return (
      <div className="space-y-3 text-[15px] leading-relaxed text-[#6f716d]">
        <p>
          Select a batch so <span className="font-semibold text-[#111111]">patterns</span> can populate volumes, or ingest
          defensibility so we can approximate the waterfall from pack and replay coverage.
        </p>
        {leakage ? (
          <p className="font-mono text-[13px] text-[#475569]">Leakage tier {leakage.risk_tier}</p>
        ) : null}
        {ambiguity ? (
          <p className="font-mono text-[13px] text-[#475569]">Ambiguity tier {ambiguity.risk_tier}</p>
        ) : null}
      </div>
    )
  }

  const totalVol = stages[0].volume
  const maxVol = Math.max(...stages.map((s) => s.volume))
  const fullyPct = (stages[1].volume / totalVol) * 100
  const gapVol = totalVol - stages[1].volume
  const gapPct = (gapVol / totalVol) * 100

  const liveHint = defensibility
    ? `Live mix: ${(defensibility.evidence_pack_rate * 100).toFixed(0)}% packs · ${(defensibility.governance_coverage_pct * 100).toFixed(0)}% governance`
    : patterns
      ? `Batch ${patterns.batch_id ?? 'current'} · finality ${patterns.finality_status}`
      : null

  const stackSegments = stages.slice(1)

  return (
    <div className="space-y-5">
      {liveHint ? (
        <p className="text-[14px] leading-relaxed text-[#6f716d]">
          <span className="font-semibold text-[#111111]">Signals: </span>
          {liveHint}
        </p>
      ) : null}

      {/* Composition of dispatched (single glance) */}
      <div className={`rounded-[12px] border ${ASK.border} ${ASK.inset} p-4`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[#94a3b8]">Composition of dispatched</p>
          <p className="text-[13px] tabular-nums text-[#6f716d]">
            <span className="font-semibold text-[#111111]">{fullyPct.toFixed(1)}%</span> primary slice ·{' '}
            <span className="font-semibold text-[#111111]">{gapPct.toFixed(1)}%</span> remaining states
          </p>
        </div>
        <div
          className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-[#f0f0ed] ring-1 ring-[#E5E5E5]/80"
          role="img"
          aria-label={`Primary slice ${fullyPct.toFixed(1)} percent; remaining ${gapPct.toFixed(1)} percent`}
        >
          {stackSegments.map((s) => {
            const w = (s.volume / totalVol) * 100
            return (
              <div
                key={s.name}
                className={`${s.barClass} min-w-[3px] border-r border-white/40 last:border-r-0`}
                style={{ width: `${w}%` }}
                title={`${s.name}: ${s.volume.toLocaleString('en-IN')} (${w.toFixed(1)}%)`}
              />
            )
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-[#6f716d]">
          {stackSegments.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.barClass}`} aria-hidden />
              <span className="text-[#111111]">{s.name}</span>
              <span className="tabular-nums text-[#94a3b8]">
                {((s.volume / totalVol) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Row cards */}
      <ol className="space-y-2.5">
        {stages.map((s, i) => {
          const pctOfMax = (s.volume / maxVol) * 100
          const pctOfTotal = (s.volume / totalVol) * 100
          const step = String(i + 1).padStart(2, '0')
          return (
            <li key={s.name}>
              <div
                className={`group rounded-[12px] border border-[#E5E5E5] bg-white p-4 transition hover:border-[#111111]/18 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] ${s.rowAccent}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border ${ASK.border} ${ASK.field} font-mono text-[12px] font-bold tabular-nums ${ASK.muted}`}>
                      {step}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[16px] font-semibold text-[#111111]">{s.name}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${s.badgeClass}`}
                        >
                          {s.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-[14px] tabular-nums text-[#6f716d]">
                        <span className="font-semibold text-[#111111]">{s.volume.toLocaleString('en-IN')}</span> units ·{' '}
                        <span className="font-semibold text-[#111111]">{s.value}</span>
                        {i > 0 ? (
                          <span className="text-[#94a3b8]"> · {pctOfTotal.toFixed(1)}% of total</span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="w-full shrink-0 sm:max-w-[min(100%,20rem)] sm:pt-0.5">
                    <div className="mb-1 flex justify-end">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                        vs peak volume {pctOfMax.toFixed(0)}%
                      </span>
                    </div>
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#f4f4f1]">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ease-out ${s.barClass} ${s.barShadow ?? ''}`}
                        style={{ width: `${pctOfMax}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
