'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { EvidencePageTabs } from './components/EvidencePageTabs'
import { EvidencePageHeader } from './components/EvidencePageHeader'
import { EvidenceTrustNote } from './components/EvidenceTrustNote'
import { EvidenceKpiStrip } from './components/EvidenceKpiStrip'
import { ProofCoverageSection } from './components/ProofCoverageSection'
import { ProofBreakdownSection } from './components/ProofBreakdownSection'
import { EvidencePackBrowser } from './components/EvidencePackBrowser'
import { DisputeResolverPanel } from './components/DisputeResolverPanel'
import { EvidenceExportCenter } from './components/export/EvidenceExportCenter'
import { mapProofCoverageFromDefensibility } from './mappers/mapProofCoverage'
import { mapPackTableRow } from './mappers/mapPackTableRow'
import { deriveEvidenceKpis } from './selectors/deriveEvidenceKpis'
import { deriveProofBreakdown } from './selectors/deriveProofBreakdown'
import type { EvidencePageTab } from './types/evidenceViewModels'

type EvidencePackRow = {
  summary: EvidencePackSummaryRow
  itemCount?: number
}

export function EvidenceSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const [pageTab, setPageTab] = useState<EvidencePageTab>('workspace')
  const [search, setSearch] = useState('')
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [batchId, setBatchId] = useState<string>(() => apiTrimmedString(initialBatchId))
  const [packRows, setPackRows] = useState<EvidencePackRow[]>([])
  const [packListError, setPackListError] = useState<string | null>(null)
  const [packsLoading, setPacksLoading] = useState(false)

  const { tenantId, tenantReady } = useSessionTenant()
  const { leakage, ambiguity, defensibility, patterns } = useIntelligenceKpis({
    tenantReady,
    batchId: batchId || undefined,
  })

  const defensibilityData = isDataAvailable(defensibility) ? defensibility : null
  const leakageData = isDataAvailable(leakage) ? leakage : null
  const ambiguityData = isDataAvailable(ambiguity) ? ambiguity : null
  const patternsData = isDataAvailable(patterns) ? patterns : null

  const anyKpiLive = Boolean(defensibilityData || leakageData || ambiguityData || patternsData)

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
          const full = await getEvidencePackFull(packId)
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

  const batchOptions = useMemo(
    () => intelligenceBatchesForSelector(batches, batchId, tenantId),
    [batches, batchId, tenantId],
  )

  const batchScoreEstimate = defensibilityData?.defensibility_score ?? null

  const tableRows = useMemo(() => {
    return packRows.map((r) =>
      mapPackTableRow(r.summary, r.itemCount, batchScoreEstimate),
    )
  }, [packRows, batchScoreEstimate])

  const filteredTableRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tableRows
    return tableRows.filter((row) => {
      return (
        row.packId.toLowerCase().includes(q) ||
        row.intentId.toLowerCase().includes(q) ||
        row.proofRoot.toLowerCase().includes(q) ||
        row.summaryLine.toLowerCase().includes(q)
      )
    })
  }, [tableRows, search])

  const kpiCards = useMemo(
    () =>
      deriveEvidenceKpis({
        defensibility: defensibilityData,
        leakage: leakageData,
        ambiguity: ambiguityData,
        patterns: patternsData,
        packRows,
      }),
    [defensibilityData, leakageData, ambiguityData, patternsData, packRows],
  )

  const breakdownRows = useMemo(
    () =>
      deriveProofBreakdown({
        defensibility: defensibilityData,
        patterns: patternsData,
        packCount: packRows.length,
      }),
    [defensibilityData, patternsData, packRows.length],
  )

  const coverageTiles = useMemo(
    () => mapProofCoverageFromDefensibility(defensibilityData),
    [defensibilityData],
  )

  if (pageTab === 'export') {
    return (
      <div className="space-y-5 pb-6">
        <EvidencePageTabs active={pageTab} onChange={setPageTab} />
        <EvidenceExportCenter defaultPackId={tableRows[0]?.packId} />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-6">
      <EvidencePageTabs active={pageTab} onChange={setPageTab} />
      <EvidencePageHeader anyKpiLive={anyKpiLive} defensibility={defensibilityData} />
      <EvidenceTrustNote />
      <EvidenceKpiStrip cards={kpiCards} />
      <ProofCoverageSection tiles={coverageTiles} />
      <ProofBreakdownSection rows={breakdownRows} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <EvidencePackBrowser
          rows={filteredTableRows}
          search={search}
          onSearchChange={setSearch}
          batchId={batchId}
          onBatchChange={setBatchId}
          batchOptions={batchOptions}
          intelBatches={batches}
          tenantReady={tenantReady}
          packsLoading={packsLoading}
          packListError={packListError}
          filteredCount={filteredTableRows.length}
          totalCount={tableRows.length}
        />
        <DisputeResolverPanel packRows={tableRows} />
      </div>
    </div>
  )
}
