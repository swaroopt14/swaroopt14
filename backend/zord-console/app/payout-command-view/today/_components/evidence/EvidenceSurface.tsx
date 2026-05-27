'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  getDefensibilityKpis,
  getIntelligenceBatches,
  getLeakageKpis,
} from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type {
  DefensibilityKpiResolved,
  IntelligenceBatchRow,
  LeakageKpiResolved,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { listEvidencePacksForBatch } from '@/services/payout-command/prod-api/listEvidencePacksForBatch'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { EvidencePageTabs } from './components/EvidencePageTabs'
import { EvidenceHeroBanner } from './components/EvidenceHeroBanner'
import { EvidenceKpiStrip } from './components/EvidenceKpiStrip'
import { ProofBreakdownSection } from './components/ProofBreakdownSection'
import { EvidencePackBrowser } from './components/EvidencePackBrowser'
import { DisputeResolverPanel } from './components/DisputeResolverPanel'
import { EvidenceQuickActions } from './components/EvidenceQuickActions'
import { EvidencePackBreakdownChart } from './components/EvidencePackBreakdownChart'
import { EvidencePackTrendChart } from './components/EvidencePackTrendChart'
import { EvidenceExportCenter } from './components/export/EvidenceExportCenter'
import { mapPackTableRow } from './mappers/mapPackTableRow'
import { deriveEvidenceKpis } from './selectors/deriveEvidenceKpis'
import { deriveProofBreakdown } from './selectors/deriveProofBreakdown'
import { deriveEvidenceAnalytics } from './selectors/deriveEvidenceAnalytics'
import type { EvidencePageTab, PackTableRowVm } from './types/evidenceViewModels'
import { evidenceCopy } from './copy/evidenceCopy'
import { MerkleGraphSurface } from '../surfaces/MerkleGraphSurface'

const INTENT_FILTER_BATCH_ONLY = '__batch_only__'

function resolveGraphPackId(tableRows: PackTableRowVm[], intentId: string): string {
  if (intentId && intentId !== INTENT_FILTER_BATCH_ONLY) {
    const match = tableRows.find((r) => r.intentId === intentId)
    if (match) return match.packId
  }
  if (intentId === INTENT_FILTER_BATCH_ONLY) {
    const batchRow = tableRows.find((r) => r.scope === 'batch')
    return batchRow?.packId ?? ''
  }
  const batchRow = tableRows.find((r) => r.scope === 'batch')
  if (batchRow) return batchRow.packId
  return tableRows[0]?.packId ?? ''
}

/**
 * APIs (5 on workspace load):
 * 1. GET /api/prod/intelligence/defensibility
 * 2. GET /api/prod/intelligence/leakage?batch_id=
 * 3. GET /api/prod/intelligence/batches
 * 4. GET /api/prod/evidence/packs (+ intent journal for full batch list)
 * Export tab: GET /api/prod/evidence/packs/{packId} on demand
 */
export function EvidenceSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const [pageTab, setPageTab] = useState<EvidencePageTab>('workspace')
  const [search, setSearch] = useState('')
  const [batchId, setBatchId] = useState<string>(() => apiTrimmedString(initialBatchId))
  const [intentId, setIntentId] = useState('')
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [packSummaries, setPackSummaries] = useState<EvidencePackSummaryRow[]>([])
  const [packListError, setPackListError] = useState<string | null>(null)
  const [packsLoading, setPacksLoading] = useState(false)
  const [defensibility, setDefensibility] = useState<DefensibilityKpiResolved | null>(null)
  const [leakage, setLeakage] = useState<LeakageKpiResolved | null>(null)
  const [kpisLoading, setKpisLoading] = useState(false)

  const { tenantReady } = useSessionTenant()

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
      const list = res?.batches ?? []
      setBatches(list)
      setBatchId((prev) => {
        const pinned = apiTrimmedString(prev) || apiTrimmedString(initialBatchId)
        if (pinned && list.some((b) => b.batch_id === pinned)) return pinned
        return list[0]?.batch_id ?? ''
      })
    })
    return () => {
      cancelled = true
    }
  }, [tenantReady, initialBatchId])

  useEffect(() => {
    if (!tenantReady) {
      setDefensibility(null)
      setLeakage(null)
      return
    }
    const bid = apiTrimmedString(batchId) || undefined
    let cancelled = false
    setKpisLoading(true)
    void Promise.all([getDefensibilityKpis(), getLeakageKpis(undefined, bid)]).then(([def, leak]) => {
      if (cancelled) return
      setDefensibility(isDataAvailable(def) ? def : null)
      setLeakage(isDataAvailable(leak) ? leak : null)
      setKpisLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tenantReady, batchId])

  useEffect(() => {
    const bid = apiTrimmedString(batchId)
    setIntentId('')
    if (!tenantReady || !bid) {
      setPackSummaries([])
      setPackListError(null)
      setPacksLoading(false)
      return
    }
    let cancelled = false
    setPacksLoading(true)
    setPackListError(null)
    void listEvidencePacksForBatch(bid).then((packs) => {
      if (cancelled) return
      if (!packs.length) {
        setPackListError('No evidence packs for this batch.')
        setPackSummaries([])
      } else {
        setPackListError(null)
        setPackSummaries(packs)
      }
      setPacksLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tenantReady, batchId])

  const packRows = useMemo(
    () =>
      packSummaries.map((summary) => ({
        summary,
        itemCount: summary.artifact_count ?? summary.leaf_count ?? undefined,
      })),
    [packSummaries],
  )

  const tableRows = useMemo(
    () =>
      packRows.map((row) =>
        mapPackTableRow(row.summary, row.itemCount, defensibility?.defensibility_score ?? null),
      ),
    [packRows, defensibility],
  )

  const intentOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { intentId: string; paymentRef: string }[] = []
    for (const row of tableRows) {
      const id = apiTrimmedString(row.intentId)
      if (!id || id === '—' || seen.has(id)) continue
      seen.add(id)
      out.push({ intentId: id, paymentRef: row.paymentRef })
    }
    return out
  }, [tableRows])

  const graphPackId = useMemo(
    () => resolveGraphPackId(tableRows, intentId),
    [tableRows, intentId],
  )

  const scopedTableRows = useMemo(() => {
    if (!intentId) return tableRows
    if (intentId === INTENT_FILTER_BATCH_ONLY) {
      return tableRows.filter((row) => row.scope === 'batch')
    }
    return tableRows.filter((row) => row.intentId === intentId)
  }, [tableRows, intentId])

  const filteredTableRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scopedTableRows
    return scopedTableRows.filter(
      (row) =>
        row.packId.toLowerCase().includes(q) ||
        row.paymentRef.toLowerCase().includes(q) ||
        row.intentId.toLowerCase().includes(q) ||
        row.proofRoot.toLowerCase().includes(q),
    )
  }, [scopedTableRows, search])

  const kpiCards = useMemo(
    () => deriveEvidenceKpis({ defensibility, leakage, packRows }),
    [defensibility, leakage, packRows],
  )

  const breakdownRows = useMemo(
    () =>
      deriveProofBreakdown({
        defensibility,
        patterns: null,
        packCount: packRows.length,
      }),
    [defensibility, packRows.length],
  )

  const analytics = useMemo(() => deriveEvidenceAnalytics(tableRows), [tableRows])
  const batchOptions = useMemo(() => batches.map((b) => ({ batch_id: b.batch_id })), [batches])

  const dataLoading = packsLoading || kpisLoading

  if (pageTab === 'export') {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-slate-500">Export structured proof for audit and disputes</p>
          <EvidencePageTabs active={pageTab} onChange={setPageTab} />
        </div>
        <EvidenceExportCenter defaultPackId={tableRows[0]?.packId} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <EvidencePageTabs active={pageTab} onChange={setPageTab} />
      </div>

      {!tenantReady ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-[14px] font-medium text-slate-500 shadow-sm">
          Sign in to load evidence for your tenant.
        </p>
      ) : (
        <>
          <EvidenceHeroBanner
            search={search}
            onSearchChange={setSearch}
            batchId={batchId}
            onBatchChange={setBatchId}
            batchOptions={batchOptions}
          />

          <EvidenceKpiStrip cards={kpiCards} loading={dataLoading} />

          <ProofBreakdownSection rows={breakdownRows} />

          <div className="grid gap-4 lg:grid-cols-2">
            <EvidencePackBreakdownChart
              segments={analytics.segments}
              mixArea={analytics.mixArea}
              mixSeries={analytics.mixSeries}
              preview={analytics.usingMock}
            />
            <EvidencePackTrendChart trend={analytics.trend} preview={analytics.usingMock} />
          </div>

          {batchId ? (
            <section data-testid="evidence-batch-graph" className="space-y-3">
              <div>
                <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
                  {evidenceCopy.graph.title}
                </h2>
                <p className="mt-1 max-w-2xl text-[14px] text-slate-500">{evidenceCopy.graph.subtitle}</p>
              </div>
              {packsLoading ? (
                <p className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-[14px] font-medium text-slate-500">
                  Loading proof lineage for batch {batchId}…
                </p>
              ) : graphPackId ? (
                <MerkleGraphSurface
                  embedMode
                  hideScopePickers
                  controlledBatchId={batchId}
                  controlledPackId={graphPackId}
                  initialPackId={graphPackId}
                  intentOptionsSource="table"
                />
              ) : (
                <p className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-5 py-6 text-[14px] font-medium text-amber-900">
                  {packListError ?? 'Select a batch with evidence packs to view the lineage graph.'}
                </p>
              )}
            </section>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5 min-w-0">
              <EvidencePackBrowser
                rows={filteredTableRows}
                search={search}
                onSearchChange={setSearch}
                batchId={batchId}
                onBatchChange={setBatchId}
                batchOptions={batchOptions}
                intelBatches={batches}
                intentId={intentId}
                onIntentChange={setIntentId}
                intentOptions={intentOptions}
                tenantReady={tenantReady}
                packsLoading={dataLoading}
                packListError={packListError}
                filteredCount={filteredTableRows.length}
                totalCount={scopedTableRows.length}
              />
              <EvidenceQuickActions
                batchId={batchId}
                firstPackId={tableRows[0]?.packId}
                onExportTab={() => setPageTab('export')}
              />
            </div>

            <DisputeResolverPanel packRows={tableRows} />
          </div>
        </>
      )}
    </div>
  )
}
