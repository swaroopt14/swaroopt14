'use client'

import { useState, useEffect } from 'react'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { LiveDataHint } from '../shared'
import { LeakageActionBar } from '../leakage/components/LeakageActionBar'
import { LeakageKpiStrip } from '../leakage/components/LeakageKpiStrip'
import { ReviewWatchlist } from '../leakage/components/ReviewWatchlist'
import { usePortfolioLeakageData } from './hooks/usePortfolioLeakageData'
import { PortfolioHeader } from './components/PortfolioHeader'
import { RiskAdjustedLeakageCard } from './components/RiskAdjustedLeakageCard'
import { AllocationPerformanceCard } from './components/AllocationPerformanceCard'
import { RiskScoreGauge } from './components/RiskScoreGauge'
import { SystemInsightsCard } from './components/SystemInsightsCard'
import type { PortfolioLeakageViewModel } from './normalizeLeakagePayload'

type PortfolioLeakageDashboardProps = {
  tenantReady: boolean
}

const EMPTY_PLACEHOLDER: PortfolioLeakageViewModel = {
  totalSettledMinor: 0,
  intendedMinor: 0,
  underSettlementMinor: 0,
  unmatchedMinor: 0,
  orphanMinor: 0,
  reversalMinor: 0,
  ambiguousRiskMinor: 0,
  riskAdjustedMinor: 0,
  valueNeedingReviewMinor: 0,
  paymentGapRate: 0,
  leakageFraction: 0,
  riskTier: 'N/A',
  tenantId: '—',
  snapshotId: '—',
  computedAt: '',
  windowStart: '',
  windowEnd: '',
}

export function PortfolioLeakageDashboard({ tenantReady }: PortfolioLeakageDashboardProps) {
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>()
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  
  const { viewModel, defensibility, loading, refresh, hasData } =
    usePortfolioLeakageData(tenantReady, selectedBatchId)

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

  const data = viewModel ?? EMPTY_PLACEHOLDER

  return (
    <div className="space-y-6 rounded-2xl bg-[#e8eef5] p-4 sm:p-6 min-h-screen">
      <PortfolioHeader
        onRefresh={() => void refresh()}
        refreshing={loading}
        riskTier={data.riskTier}
        batches={batches}
        selectedBatchId={selectedBatchId}
        onSelectBatch={setSelectedBatchId}
      />
      <LiveDataHint isLive={hasData} source="intelligence" />

      {!tenantReady ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-[14px] text-slate-500 shadow-sm">
          Sign in to load payment gap intelligence for your tenant.
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <LeakageKpiStrip data={data} loading={loading && !viewModel} />
            </div>
            <div className="lg:col-span-2">
              <RiskAdjustedLeakageCard
                data={data}
                loading={loading && !viewModel}
                batchId={selectedBatchId}
              />
            </div>
          </div>

          <ReviewWatchlist 
            tenantReady={tenantReady} 
            data={data} 
            batches={batches}
            selectedBatchId={selectedBatchId}
            onSelectBatch={setSelectedBatchId}
          />

          <section className="grid gap-4 lg:grid-cols-3">
            <AllocationPerformanceCard data={data} />
            <RiskScoreGauge data={data} defensibility={defensibility} />
            <SystemInsightsCard data={data} />
          </section>
        </>
      )}
    </div>
  )
}
