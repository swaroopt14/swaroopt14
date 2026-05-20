'use client'

import { LiveDataHint } from '../shared'
import { usePortfolioLeakageData } from './hooks/usePortfolioLeakageData'
import { PortfolioHeader } from './components/PortfolioHeader'
import { MetricsStack } from './components/MetricsStack'
import { RiskAdjustedLeakageCard } from './components/RiskAdjustedLeakageCard'
import { WatchlistStrip } from './components/WatchlistStrip'
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
  leakageFraction: 0,
  riskTier: 'N/A',
  tenantId: '—',
  snapshotId: '—',
  computedAt: '',
  windowStart: '',
  windowEnd: '',
}

export function PortfolioLeakageDashboard({ tenantReady }: PortfolioLeakageDashboardProps) {
  const { viewModel, defensibility, loading, refresh, hasData, emptyReason } =
    usePortfolioLeakageData(tenantReady)

  const showEmpty = tenantReady && !loading && !hasData
  const showDashboard = hasData || (loading && tenantReady)
  const data = viewModel ?? EMPTY_PLACEHOLDER

  return (
    <div className="space-y-6 rounded-2xl bg-[#F8FAFC] p-4 sm:p-6">
      <PortfolioHeader onRefresh={() => void refresh()} refreshing={loading} />
      <LiveDataHint isLive={hasData} source="intelligence" />

      {showEmpty ? (
        <EmptyState reason={emptyReason} onRefresh={() => void refresh()} />
      ) : showDashboard ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(360px,1.4fr)]">
            <MetricsStack data={data} loading={loading && !viewModel} />
            <RiskAdjustedLeakageCard data={data} loading={loading && !viewModel} />
          </section>

          <WatchlistStrip />

          <section className="grid gap-4 lg:grid-cols-3">
            <AllocationPerformanceCard data={data} />
            <RiskScoreGauge data={data} defensibility={defensibility} />
            <SystemInsightsCard data={data} />
          </section>
        </>
      ) : !tenantReady ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-[14px] text-slate-500 shadow-sm">
          Sign in to load portfolio leakage intelligence for your tenant.
        </p>
      ) : null}
    </div>
  )
}

function EmptyState({ reason, onRefresh }: { reason?: string; onRefresh: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
      <p className="text-[15px] font-semibold text-slate-900">No leakage snapshot for this tenant yet</p>
      <p className="mt-2 max-w-md text-[14px] text-slate-500">
        {reason ?? 'Upload intents and settlement observations, then refresh once intelligence has computed a LEAKAGE snapshot.'}
      </p>
      <button
        type="button"
        onClick={onRefresh}
        className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-slate-800"
      >
        Refresh
      </button>
    </div>
  )
}
