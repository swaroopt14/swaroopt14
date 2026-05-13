'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Glyph, LiveDataHint } from '../shared'
import { useSessionTenantId } from '@/services/auth/useSessionTenantId'
import { getEvidencePackFull, listEvidencePacks } from '@/services/payout-command/prod-api/getEvidencePacks'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
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

function formatMinorInrLabel(minor: string | undefined): string {
  if (!minor?.trim()) return '—'
  const n = BigInt(minor.replace(/\D/g, '') || '0')
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
    <div
      className={`flex w-full max-w-md flex-col rounded-[0.85rem] border ${ASK.border} bg-white px-4 py-3 shadow-sm lg:ml-auto`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${ASK.border} ${ASK.field} text-[#111111]`}
        >
          <Glyph name="shield" className="h-4 w-4 opacity-80" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#111111]">Tier appears when data is live</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6f716d]">
            <span className="font-medium text-[#111111]">Excellent → Poor</span> is derived from your tenant&apos;s
            defensibility KPIs. Ingest a batch or connect intelligence so this badge can update in real time.
          </p>
        </div>
      </div>
    </div>
  )
}

export function EvidenceSurface() {
  const [search, setSearch] = useState('')
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [batchId, setBatchId] = useState<string>('')
  const [packRows, setPackRows] = useState<EvidencePackRow[]>([])
  const [packListError, setPackListError] = useState<string | null>(null)
  const [packsLoading, setPacksLoading] = useState(false)

  const tenantId = useSessionTenantId().trim()
  const { leakage, ambiguity, defensibility, patterns, recommendations } = useIntelligenceKpis(tenantId, {
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
    if (!tenantId) {
      setBatches([])
      setBatchId('')
      return
    }
    let cancelled = false
    void getIntelligenceBatches(tenantId, { limit: 80 }).then((res) => {
      if (cancelled) return
      if (!res?.batches?.length) {
        setBatches([])
        setBatchId('')
        return
      }
      setBatches(res.batches)
      setBatchId((prev) => (res.batches.some((b) => b.batch_id === prev) ? prev : res.batches[0].batch_id))
    })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  useEffect(() => {
    if (!tenantId || !batchId) {
      setPackRows([])
      setPackListError(null)
      setPacksLoading(false)
      return
    }
    let cancelled = false
    setPacksLoading(true)
    setPackListError(null)
    void listEvidencePacks(tenantId, { batchId }).then(async (list) => {
      if (cancelled) return
      if (!list) {
        setPackListError(
          'Evidence packs list failed. Confirm zord-evidence GET /v1/evidence/packs accepts tenant_id + batch_id (or intent_id per service contract).',
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
          const full = await getEvidencePackFull(tenantId, s.evidence_pack_id)
          return { id: s.evidence_pack_id, itemCount: full?.items?.length }
        }),
      )
      if (cancelled) return
      const countMap = new Map(enriched.map((e) => [e.id, e.itemCount]))
      setPackRows((prev) =>
        prev.map((row) => ({
          ...row,
          itemCount: countMap.get(row.summary.evidence_pack_id) ?? row.itemCount,
        })),
      )
      setPacksLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tenantId, batchId])

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

  const filteredPacks = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return packRows
    return packRows.filter(
      (r) =>
        r.summary.evidence_pack_id.toLowerCase().includes(q) ||
        (r.summary.intent_id || '').toLowerCase().includes(q) ||
        (r.summary.batch_id || '').toLowerCase().includes(q) ||
        (r.summary.merkle_root || '').toLowerCase().includes(q) ||
        summaryLabel(r.summary).toLowerCase().includes(q),
    )
  }, [packRows, search])

  return (
    <div
      className={`-mx-4 space-y-5 ${ASK.canvas} px-4 pb-10 pt-0.5 sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6`}
    >
      {/* ── Hero (white shell — matches Ask / command cards) ───────── */}
      <header className={`overflow-hidden ${ASK.radius} border ${ASK.border} bg-white ${ASK.shadow}`}>
        <div className="p-5 sm:p-6">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border ${ASK.border} bg-white px-2.5 py-0.5 text-[14px] font-semibold uppercase tracking-[0.1em] ${ASK.muted}`}
          >
            <Glyph name="shield" className="h-2.5 w-2.5 text-[#111111]" />
            Compliance · Legal
          </span>
          <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-[#111111]">
            Defensibility & Evidence
          </h1>
          <p className="mt-2 max-w-2xl text-[17px] leading-relaxed text-[#6f716d]">
            Every intent that is cryptographically proven, and every one that isn&apos;t. Pull, download, and submit
            evidence in seconds — no screenshots, no chasing PSP logs.
          </p>
        </div>
        <div className={`border-t ${ASK.border} ${ASK.inset} px-5 py-4 sm:px-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${ASK.muted}`}>Data source</p>
              <div className="mt-2">
                <LiveDataHint isLive={anyKpiLive} source="intelligence + evidence" variant="command" />
              </div>
            </div>
            <div className="min-w-0 lg:max-w-[26rem] lg:text-right">
              <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${ASK.muted}`}>Defensibility tier</p>
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
      <section className={`overflow-hidden ${ASK.radius} border ${ASK.border} bg-white ${ASK.shadow}`}>
        <div className={`border-b ${ASK.border} ${ASK.inset} px-5 py-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${ASK.border} ${ASK.field} text-[#111111]`}
              >
                <Glyph name="chart" className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[17px] font-semibold text-[#111111]">Defensibility breakdown</p>
                <p className="mt-0.5 max-w-xl text-[15px] leading-relaxed text-[#6f716d]">
                  The gap between dispatched and fully evidenced is the live exposure Zord is closing.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 pt-4">
          <Waterfall
            defensibility={defensibilityData}
            patterns={patternsData}
            leakage={leakageData}
            ambiguity={ambiguityData}
          />
        </div>
      </section>

      {/* ── Evidence pack browser ───────────────────────────────────── */}
      <section className={`overflow-hidden ${ASK.radius} border ${ASK.border} bg-white ${ASK.shadow}`}>
        <div className={`border-b ${ASK.border} ${ASK.inset} px-5 py-4`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${ASK.border} ${ASK.field} text-[#111111]`}
              >
                <Glyph name="folder" className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-[#111111]">Evidence pack browser</p>
                <p className="mt-0.5 max-w-xl text-[15px] leading-relaxed text-[#6f716d]">
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
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 lg:max-w-[24rem] lg:items-end">
              <label className={`flex w-full flex-col gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.1em] ${ASK.muted} lg:items-end`}>
                Intelligence batch
                <select
                  value={batchId}
                  disabled={!tenantId || batches.length === 0}
                  onChange={(e) => setBatchId(e.target.value)}
                  className={`h-10 w-full rounded-[0.85rem] border ${ASK.border} ${ASK.field} px-3 font-mono text-[14px] font-semibold text-[#111111] outline-none lg:max-w-[20rem]`}
                >
                  {!tenantId ? (
                    <option value="">Sign in (tenant)</option>
                  ) : batches.length === 0 ? (
                    <option value="">No batches from /v1/intelligence/batches</option>
                  ) : (
                    batches.map((b) => (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.batch_id} · {b.finality_status}
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
                            : 'Pick a batch with intelligence data, or confirm GET /v1/evidence/packs returns rows for tenant_id + batch_id.'
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

      {/* ── Backend gaps (Ask Zord) ─────────────────────────────────── */}
      <section className={`overflow-hidden ${ASK.radius} border ${ASK.border} bg-white ${ASK.shadow}`}>
        <div className={`border-b ${ASK.border} ${ASK.inset} px-5 py-4`}>
          <p className="text-[17px] font-semibold text-[#111111]">Ask backend / Zord</p>
          <p className="mt-0.5 max-w-xl text-[15px] leading-relaxed text-[#6f716d]">
            Surfaces we still cannot fill from the browser alone — copy the contract below into your service tracker.
          </p>
        </div>
        <div className="space-y-4 p-5">
          <AskBackendCallout
            title="Per-tenant dispute ledger"
            body="This page removed mock dispute rows. We need a disputes (or chargeback) API keyed by tenant_id with evidence attachment status and aging."
            method="GET"
            path="/v1/disputes?tenant_id={uuid}&status=OPEN"
            exampleResponse={`{
  "disputes": [
    {
      "dispute_id": "dsp_…",
      "amount_minor": "1480000",
      "evidence_pack_id": "bep_…",
      "evidence_status": "COMPLETE | PARTIAL | INSUFFICIENT",
      "days_open": 2
    }
  ],
  "total": 1
}`}
          />
          <AskBackendCallout
            title="Evidence list filter parity"
            body="OpenAPI in repo lists GET /v1/evidence/packs with tenant_id + intent_id. Your console forwards batch_id as well — confirm zord-evidence persists batch_id on packs and implements ListByBatch, or keep intent_id as the required secondary key."
            method="GET"
            path="/v1/evidence/packs?tenant_id={uuid}&batch_id=444"
            exampleResponse={`{
  "packs": [
    {
      "evidence_pack_id": "bep_…",
      "tenant_id": "…",
      "batch_id": "444",
      "mode": "BATCH_ATTACH",
      "pack_status": "ACTIVE",
      "merkle_root": "sha256:…",
      "ruleset_version": "v1",
      "created_at": "2026-05-12T10:13:51.744562Z"
    }
  ],
  "total": 1
}`}
          />
        </div>
      </section>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function AskBackendCallout({
  title,
  body,
  method,
  path,
  exampleResponse,
}: {
  title: string
  body: string
  method: string
  path: string
  exampleResponse: string
}) {
  return (
    <article className={`rounded-[0.95rem] border ${ASK.border} ${ASK.inset} p-4`}>
      <p className="text-[16px] font-semibold text-[#111111]">{title}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-[#6f716d]">{body}</p>
      <p className="mt-3 font-mono text-[13px] font-semibold text-[#111111]">
        {method} <span className="text-[#475569]">{path}</span>
      </p>
      <pre className="mt-2 max-h-48 overflow-auto rounded-[8px] border border-[#E5E5E5] bg-[#111111] p-3 font-mono text-[12px] leading-relaxed text-[#e2e8f0]">
        {exampleResponse.trim()}
      </pre>
    </article>
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
    <article className={`${ASK.radius} border ${ASK.border} bg-white p-5 ${ASK.shadow}`}>
      <div className="flex items-center gap-2">
        {accent ? <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" aria-hidden /> : null}
        <p className={`text-[14px] font-semibold uppercase tracking-[0.1em] ${ASK.muted}`}>{label}</p>
      </div>
      <p className="mt-2 text-[36px] font-light leading-none tracking-[-0.02em] tabular-nums text-[#111111]">
        {value}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-[#6f716d]">{sub}</p>
    </article>
  )
}

function PackTableRow({
  row,
  tenantDefensibilityScore,
}: {
  row: EvidencePackRow
  tenantDefensibilityScore: number | null
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
        <p className="mt-0.5 font-mono text-[13px] font-semibold text-[#111111]">{s.intent_id?.trim() || '—'}</p>
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
          href={`/payout-command-view/evidence-pack/${encodeURIComponent(s.evidence_pack_id)}`}
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
