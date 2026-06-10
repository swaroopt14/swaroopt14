'use client'

import { useState, useEffect, useMemo } from 'react'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { LiveDataHint } from '../shared'
import { LeakageActionBar } from '../leakage/components/LeakageActionBar'
import { LeakageKpiStrip } from '../leakage/components/LeakageKpiStrip'
import { ReviewWatchlist } from '../leakage/components/ReviewWatchlist'
import { usePortfolioLeakageData } from './hooks/usePortfolioLeakageData'
import { mergeBatchHealthWithTenantLeakage } from '@/services/payout-command/prod-api/mapBatchHealthKpis'
import { useIntelligenceBatchHealth } from '@/services/payout-command/prod-api/useIntelligenceBatchHealth'
import { PortfolioHeader } from './components/PortfolioHeader'
import { RiskAdjustedLeakageCard } from './components/RiskAdjustedLeakageCard'
import { AllocationPerformanceCard } from './components/AllocationPerformanceCard'
import { RiskScoreGauge } from './components/RiskScoreGauge'
import { SystemInsightsCard } from './components/SystemInsightsCard'

type PortfolioLeakageDashboardProps = {
  tenantReady: boolean
  initialBatchId?: string
}

export function PortfolioLeakageDashboard({ tenantReady, initialBatchId }: PortfolioLeakageDashboardProps) {
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(() =>
    initialBatchId?.trim() || undefined,
  )
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])

  const { batchHealth, loading: batchHealthLoading } = useIntelligenceBatchHealth(
    tenantReady,
    selectedBatchId,
  )

  const { viewModel, ambiguity, defensibility, loading, refresh, hasData, leak } =
    usePortfolioLeakageData(tenantReady, selectedBatchId)

  useEffect(() => {
    const pinned = initialBatchId?.trim()
    if (pinned) setSelectedBatchId(pinned)
  }, [initialBatchId])

  useEffect(() => {
    if (!tenantReady) return
    let cancelled = false
    void getIntelligenceBatches({ limit: 20 }).then((res) => {
      if (!cancelled) setBatches(res?.batches ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [tenantReady])

  const batchScopedData = useMemo(() => {
    if (!selectedBatchId || !batchHealth) return null
    return mergeBatchHealthWithTenantLeakage(
      batchHealth,
      selectedBatchId,
      leak,
      leak?.tenant_id,
    )
  }, [batchHealth, selectedBatchId, leak])

  const displayData = batchScopedData ?? viewModel
  const kpiLoading = (loading && !viewModel && !batchScopedData) || (Boolean(selectedBatchId) && batchHealthLoading)
  const showLiveHint = Boolean(batchScopedData) || hasData

  return (
    <div className="min-h-screen space-y-6 rounded-2xl bg-[#f4f4f1] p-4 sm:p-6">
      <PortfolioHeader
        onRefresh={() => void refresh()}
        refreshing={loading}
        riskTier={displayData?.riskTier ?? 'N/A'}
        batches={batches}
        selectedBatchId={selectedBatchId}
        onSelectBatch={setSelectedBatchId}
      />
      <LiveDataHint isLive={showLiveHint} source="intelligence" />

      {!tenantReady ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-[14px] text-slate-500 shadow-sm">
          Sign in to load payment gap intelligence for your tenant.
        </p>
      ) : !displayData ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-[14px] text-slate-500 shadow-sm">
          {selectedBatchId
            ? 'No batch health projection yet for this batch. Run matching/settlement to populate payment gaps.'
            : 'No tenant-wide leakage snapshot yet. Select a batch or wait for intelligence projections.'}
        </p>
      ) : (
        <>
          {selectedBatchId && batchScopedData ? (
            <p className="text-[12px] font-medium text-slate-600">
              Batch variance projection for <span className="font-mono">{selectedBatchId}</span>
              {leak ? ' · leakage breakdown from tenant snapshot' : ''}
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <LeakageKpiStrip data={displayData} loading={kpiLoading} />
            </div>
            <div className="lg:col-span-2">
              <RiskAdjustedLeakageCard
                data={displayData}
                loading={kpiLoading}
                batchId={selectedBatchId}
              />
            </div>
          </div>

          <ReviewWatchlist
            tenantReady={tenantReady}
            batches={batches}
            selectedBatchId={selectedBatchId}
            onSelectBatch={setSelectedBatchId}
          />

          <section className="grid gap-4 lg:grid-cols-3">
            <AllocationPerformanceCard data={displayData} />
            <RiskScoreGauge data={displayData} defensibility={defensibility} />
            <SystemInsightsCard data={displayData} />
          </section>
        </>
      )}
    </div>
  )
}
