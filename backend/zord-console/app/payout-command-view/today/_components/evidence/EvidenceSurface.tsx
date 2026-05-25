'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  intelligenceBatchesForSelector,
  pickEvidenceBatchId,
} from '@/services/payout-command/prod-api/evidenceBatchScope'
import { getEvidencePackFull } from '@/services/payout-command/prod-api/getEvidencePacks'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import {
  getEvidenceBatchIdsForSession,
  listEvidencePacksForBatch,
} from '@/services/payout-command/prod-api/listEvidencePacksForBatch'
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

const INTENT_FILTER_BATCH_ONLY = '__batch_only__'

export function EvidenceSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const [pageTab, setPageTab] = useState<EvidencePageTab>('workspace')
  const [search, setSearch] = useState('')
  const [sessionBatchIds, setSessionBatchIds] = useState<string[]>([])
  const [intelBatches, setIntelBatches] = useState<IntelligenceBatchRow[]>([])
  const [batchId, setBatchId] = useState<string>(() => apiTrimmedString(initialBatchId))
  const [intentId, setIntentId] = useState<string>('')
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

  const batchesForSelector = useMemo(
    () => intelligenceBatchesForSelector(intelBatches, batchId, tenantId),
    [intelBatches, batchId, tenantId],
  )

  const batchOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { batch_id: string; finality_status?: string }[] = []
    for (const id of sessionBatchIds) {
      if (seen.has(id)) continue
      seen.add(id)
      const intel = intelBatches.find((b) => apiTrimmedString(b.batch_id) === id)
      out.push({ batch_id: id, finality_status: intel?.finality_status ?? 'journal' })
    }
    if (sessionBatchIds.length === 0) {
      for (const b of intelBatches) {
        const id = apiTrimmedString(b.batch_id)
        if (!id || seen.has(id)) continue
        seen.add(id)
        out.push({ batch_id: id, finality_status: b.finality_status })
      }
    }
    return out
  }, [sessionBatchIds, intelBatches])

  useEffect(() => {
    const fromUrl = apiTrimmedString(initialBatchId)
    if (fromUrl) setBatchId(fromUrl)
  }, [initialBatchId])

  useEffect(() => {
    if (!tenantReady) {
      setSessionBatchIds([])
      setIntelBatches([])
      if (!apiTrimmedString(initialBatchId)) setBatchId('')
      return
    }
    let cancelled = false
    void Promise.all([getEvidenceBatchIdsForSession(), getIntelligenceBatches({ limit: 80 })]).then(
      ([batchIds, intelRes]) => {
        if (cancelled) return
        setSessionBatchIds(batchIds)
        const intel = intelRes?.batches ?? []
        setIntelBatches(intel)
        setBatchId((prev) => {
          const pinned = apiTrimmedString(prev) || apiTrimmedString(initialBatchId)
          if (pinned && (batchIds.includes(pinned) || intel.some((b) => b.batch_id === pinned))) {
            return pinned
          }
          if (batchIds[0]) return batchIds[0]
          return pickEvidenceBatchId(intel, pinned)
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [tenantReady, initialBatchId])

  useEffect(() => {
    const bid = apiTrimmedString(batchId)
    setIntentId('')
    if (!tenantReady || !bid) {
      setPackRows([])
      setPackListError(null)
      setPacksLoading(false)
      return
    }
    let cancelled = false
    setPacksLoading(true)
    setPackListError(null)
    void listEvidencePacksForBatch(bid).then(async (summaries) => {
      if (cancelled) return
      if (!summaries.length) {
        setPackListError(
          'No evidence packs for this batch. Confirm batch packs and per-intent packs exist for your tenant.',
        )
        setPackRows([])
        setPacksLoading(false)
        return
      }
      setPackListError(null)
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

  const batchScoreEstimate = defensibilityData?.defensibility_score ?? null

  const tableRows = useMemo(() => {
    const itemById = new Map(packRows.map((r) => [r.summary.evidence_pack_id, r.itemCount]))
    return packRows.map((row) =>
      mapPackTableRow(row.summary, itemById.get(row.summary.evidence_pack_id), batchScoreEstimate),
    )
  }, [packRows, batchScoreEstimate])

  /** Distinct intent IDs that have an intent-scoped pack inside the active batch. */
  const intentOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { intentId: string; paymentRef: string }[] = []
    for (const row of tableRows) {
      if (row.scope !== 'intent') continue
      const id = apiTrimmedString(row.intentId)
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push({ intentId: id, paymentRef: row.paymentRef })
    }
    return out
  }, [tableRows])

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
    return scopedTableRows.filter((row) => {
      return (
        row.packId.toLowerCase().includes(q) ||
        row.intentId.toLowerCase().includes(q) ||
        row.paymentRef.toLowerCase().includes(q) ||
        row.proofRoot.toLowerCase().includes(q) ||
        row.summaryLine.toLowerCase().includes(q)
      )
    })
  }, [scopedTableRows, search])

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
          intelBatches={batchesForSelector}
          intentId={intentId}
          onIntentChange={setIntentId}
          intentOptions={intentOptions}
          tenantReady={tenantReady}
          packsLoading={packsLoading}
          packListError={packListError}
          filteredCount={filteredTableRows.length}
          totalCount={scopedTableRows.length}
        />
        <DisputeResolverPanel packRows={tableRows} />
      </div>
    </div>
  )
}
