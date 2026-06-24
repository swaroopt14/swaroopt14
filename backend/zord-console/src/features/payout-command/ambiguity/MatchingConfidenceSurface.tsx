'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useAmbiguityHeatmap } from '@/services/payout-command/prod-api/useAmbiguityHeatmap'
import { getAmbiguityKpis, getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { AmbiguityKpiResponse, FinalityStatus, IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { MatchingConfidenceKpiStrip } from './components/MatchingConfidenceKpiStrip'
import { AmbiguityVelocityChart } from './components/AmbiguityVelocityChart'
import { MatchingExecutionLog } from './components/MatchingExecutionLog'
import { BatchesNeedingReviewTable } from './components/BatchesNeedingReviewTable'
import { SignalClarityBar } from './components/SignalClarityBar'
import { ZordInsightsPanel } from '../shared/ZordInsightsPanel'
import { buildMatchReviewInsightItems } from '../insights/buildPageZordInsightItems'
import { useBatchSelectWithUrl } from '../hooks/useIntelligenceBatchUrlSync'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'
import { LiveDataHint } from '../shared'
import { intelligenceKpiScopeLabel } from '../shared/batchKpiScope'

const POLL_MS = 30_000

export function MatchingConfidenceSurface({ initialBatchId }: { initialBatchId?: string } = {}) {
  const { tenantReady } = useSessionTenant()

  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(() =>
    initialBatchId?.trim() || undefined,
  )
  const handleSelectBatch = useBatchSelectWithUrl('ambiguity', setSelectedBatchId)

  // Only fetch ambiguity — leakage, patterns, rca, defensibility, recommendations not needed here.
  const [ambiguity, setAmbiguity] = useState<AmbiguityKpiResponse | null>(null)
  const [kpiLoading, setKpiLoading] = useState(false)
  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!tenantReady) return
    setKpiLoading(true)
    try {
      const am = await getAmbiguityKpis(undefined, apiTrimmedString(selectedBatchId) || undefined)
      if (!cancelledRef.current) setAmbiguity(am)
    } finally {
      if (!cancelledRef.current) setKpiLoading(false)
    }
  }, [tenantReady, selectedBatchId])

  useEffect(() => {
    cancelledRef.current = false
    if (!tenantReady) { setAmbiguity(null); return }
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => { cancelledRef.current = true; window.clearInterval(id) }
  }, [tenantReady, refresh])

  const {
    heatmap: matchingHeatmap,
    loading: heatmapLoading,
    refresh: refreshHeatmap,
  } = useAmbiguityHeatmap(tenantReady)
  const amb = isDataAvailable(ambiguity) ? ambiguity : null

  useEffect(() => {
    const pinned = initialBatchId?.trim()
    if (pinned) setSelectedBatchId(pinned)
  }, [initialBatchId])

  const handlePageRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshHeatmap()])
  }, [refresh, refreshHeatmap])

  useRegisterPayoutPageActions({
    refresh: tenantReady ? handlePageRefresh : undefined,
    refreshing: kpiLoading || heatmapLoading,
  })

  const kpiScopeHint = intelligenceKpiScopeLabel(selectedBatchId)
  const stripLoading = kpiLoading && !amb

  const [finalityFilter, setFinalityFilter] = useState<'' | FinalityStatus>('')
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)

  const loadBatches = useCallback(async () => {
    if (!tenantReady) {
      setBatches([])
      return
    }
    setBatchesLoading(true)
    try {
      const res = await getIntelligenceBatches({
        status: finalityFilter || undefined,
        limit: 80,
      })
      setBatches(res?.batches ?? [])
    } catch {
      setBatches([])
    } finally {
      setBatchesLoading(false)
    }
  }, [tenantReady, finalityFilter])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const zordInsights = useMemo(
    () =>
      buildMatchReviewInsightItems({
        ambiguity: isDataAvailable(ambiguity) ? ambiguity : null,
        leakage: null,
        patterns: null,
      }),
    [ambiguity],
  )

  return (
    <div className="min-h-screen space-y-4 bg-[#f4f4f1] p-4 text-slate-900 sm:p-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={selectedBatchId ?? ''}
          onChange={(e) => handleSelectBatch(e.target.value || undefined)}
          className="h-9 appearance-none rounded-full border border-slate-200 bg-white pl-4 pr-8 text-[13px] font-medium text-slate-700 shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          aria-label="Scope batch"
        >
          <option value="">All batches (tenant)</option>
          {batches.map((b) => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.source_reference?.trim() || b.batch_id}
            </option>
          ))}
        </select>
      </div>

      <LiveDataHint isLive={Boolean(tenantReady && amb)} source="intelligence" />

      <MatchingConfidenceKpiStrip amb={amb} loading={stripLoading} scopeHint={kpiScopeHint} />

      <SignalClarityBar amb={amb} loading={stripLoading} />

      <MatchingExecutionLog
        amb={amb}
        heatmap={matchingHeatmap}
        heatmapLoading={heatmapLoading && !matchingHeatmap}
      />

      <AmbiguityVelocityChart
        amb={amb}
        batchId={selectedBatchId}
        selectedBatchId={selectedBatchId}
        onSelectBatch={handleSelectBatch}
      />

      <BatchesNeedingReviewTable
        batches={batches}
        loading={batchesLoading}
        finalityFilter={finalityFilter}
        onFilterChange={setFinalityFilter}
        highlightedBatchId={selectedBatchId}
        onRowSelect={handleSelectBatch}
        scopedValueAtRisk={selectedBatchId ? (amb?.value_at_risk_minor ?? null) : null}
      />

            <ZordInsightsPanel
        insights={zordInsights}
        sourcePage="match-review"
        sectionTitle="Batches needing review"
        batchId={selectedBatchId}
      />
    </div>
  )
}
