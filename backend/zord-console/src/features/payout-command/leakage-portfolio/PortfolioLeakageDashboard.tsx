'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { LiveDataHint } from '../shared'
import { LeakageKpiStrip } from '../leakage/components/LeakageKpiStrip'
import { LeakageBatchWatchlistTable } from '../leakage/components/LeakageBatchWatchlistTable'
import { usePortfolioLeakageData } from './hooks/usePortfolioLeakageData'
import { PortfolioHeader } from './components/PortfolioHeader'
import { RiskAdjustedLeakageCard } from './components/RiskAdjustedLeakageCard'
import { BatchScoreHealthCard } from './components/BatchScoreHealthCard'
import { LeakageZordInsightsCard } from './components/LeakageZordInsightsCard'
import { LeakageWidgetChrome } from './components/LeakageWidgetChrome'
import {
  type LeakageFilterValues,
  LeakageFiltersForm,
} from './components/LeakageFiltersForm'
import {
  DEFAULT_LEAKAGE_WIDGET_ORDER,
  LEAKAGE_WIDGET_LABELS,
  loadLeakageWidgetLayout,
  resetLeakageWidgetLayout,
  saveLeakageWidgetLayout,
  type LeakageWidgetId,
} from './leakageWidgetLayout'
import { useBatchSelectWithUrl } from '../hooks/useIntelligenceBatchUrlSync'
import { useRegisterPayoutPageActions } from '../layout/PayoutPageActionsContext'

type PortfolioLeakageDashboardProps = {
  tenantReady: boolean
  initialBatchId?: string
}

export function PortfolioLeakageDashboard({ tenantReady, initialBatchId }: PortfolioLeakageDashboardProps) {
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(() =>
    initialBatchId?.trim() || undefined,
  )
  const [batches, setBatches] = useState<IntelligenceBatchRow[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addWidgetOpen, setAddWidgetOpen] = useState(false)
  const [filters, setFilters] = useState<LeakageFilterValues>({
    status: '',
    fromDate: '',
    toDate: '',
    batchId: '',
  })
  const [widgetOrder, setWidgetOrder] = useState<LeakageWidgetId[]>(DEFAULT_LEAKAGE_WIDGET_ORDER)
  const handleSelectBatch = useBatchSelectWithUrl('leakage', setSelectedBatchId)

  const scopedBatchId = filters.batchId.trim() || selectedBatchId

  const { viewModel, leak, ambiguity, patterns, loading, refresh } = usePortfolioLeakageData(
    tenantReady,
    scopedBatchId,
  )

  const displayData = viewModel
  const kpiLoading = loading && !displayData
  const showLiveHint = Boolean(displayData)

  useEffect(() => {
    setWidgetOrder(loadLeakageWidgetLayout())
  }, [])

  const loadBatches = useCallback(async () => {
    if (!tenantReady) {
      setBatches([])
      return
    }
    const res = await getIntelligenceBatches({
      limit: 20,
      status: filters.status || undefined,
    })
    setBatches(res?.batches ?? [])
  }, [tenantReady, filters.status])

  const handlePageRefresh = useCallback(async () => {
    await refresh()
    await loadBatches()
  }, [refresh, loadBatches])

  useRegisterPayoutPageActions({
    refresh: tenantReady ? handlePageRefresh : undefined,
    refreshing: loading,
  })

  useEffect(() => {
    const pinned = initialBatchId?.trim()
    if (pinned) setSelectedBatchId(pinned)
  }, [initialBatchId])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const hideWidget = useCallback((id: LeakageWidgetId) => {
    setWidgetOrder((order) => {
      const next = order.filter((w) => w !== id)
      saveLeakageWidgetLayout(next)
      return next
    })
  }, [])

  const moveWidget = useCallback((id: LeakageWidgetId, direction: 'up' | 'down') => {
    setWidgetOrder((order) => {
      const idx = order.indexOf(id)
      if (idx < 0) return order
      const swap = direction === 'up' ? idx - 1 : idx + 1
      if (swap < 0 || swap >= order.length) return order
      const next = [...order]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      saveLeakageWidgetLayout(next)
      return next
    })
  }, [])

  const addWidget = useCallback((id: LeakageWidgetId) => {
    setWidgetOrder((order) => {
      if (order.includes(id)) return order
      const next = [...order, id]
      saveLeakageWidgetLayout(next)
      return next
    })
    setAddWidgetOpen(false)
  }, [])

  const widgetNodes = useMemo(
    () => ({
      kpiHero: displayData ? (
        <LeakageWidgetChrome widgetId="kpiHero" onHide={hideWidget} onMove={moveWidget} batchId={scopedBatchId}>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <LeakageKpiStrip data={displayData} loading={kpiLoading} />
            </div>
            <div className="lg:col-span-2">
              <RiskAdjustedLeakageCard data={displayData} loading={kpiLoading} batchId={scopedBatchId} />
            </div>
          </div>
        </LeakageWidgetChrome>
      ) : null,
      trendChart: displayData ? (
        <LeakageWidgetChrome widgetId="trendChart" onHide={hideWidget} onMove={moveWidget} batchId={scopedBatchId}>
          <RiskAdjustedLeakageCard data={displayData} loading={kpiLoading} batchId={scopedBatchId} />
        </LeakageWidgetChrome>
      ) : null,
      watchlistTable: (
        <LeakageWidgetChrome widgetId="watchlistTable" onHide={hideWidget} onMove={moveWidget} batchId={scopedBatchId}>
          <LeakageBatchWatchlistTable
            batches={batches}
            loading={loading && batches.length === 0}
            selectedBatchId={selectedBatchId}
            onSelectBatch={handleSelectBatch}
          />
        </LeakageWidgetChrome>
      ),
      batchScoreHealth: (
        <LeakageWidgetChrome widgetId="batchScoreHealth" onHide={hideWidget} onMove={moveWidget} batchId={scopedBatchId}>
          <BatchScoreHealthCard patterns={patterns} loading={loading && !patterns} />
        </LeakageWidgetChrome>
      ),
      zordInsight: displayData ? (
        <LeakageWidgetChrome widgetId="zordInsight" onHide={hideWidget} onMove={moveWidget} batchId={scopedBatchId}>
          <LeakageZordInsightsCard leakage={leak} ambiguity={ambiguity} patterns={patterns} />
        </LeakageWidgetChrome>
      ) : null,
      exposureSegmentBar: null,
    }),
    [
      displayData,
      hideWidget,
      moveWidget,
      scopedBatchId,
      kpiLoading,
      batches,
      loading,
      selectedBatchId,
      handleSelectBatch,
      leak,
      patterns,
      ambiguity,
    ],
  )

  return (
    <div className="min-h-screen space-y-6 rounded-2xl bg-[#f4f4f1] p-4 sm:p-6">
      <div className="relative">
        <PortfolioHeader
          batches={batches}
          selectedBatchId={selectedBatchId}
          onSelectBatch={handleSelectBatch}
        />
        <LeakageFiltersForm
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          value={filters}
          onApply={(next) => {
            setFilters(next)
            if (next.batchId.trim()) setSelectedBatchId(next.batchId.trim())
          }}
        />
        {addWidgetOpen ? (
          <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {(Object.keys(LEAKAGE_WIDGET_LABELS) as LeakageWidgetId[])
              .filter((id) => !widgetOrder.includes(id))
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                  onClick={() => addWidget(id)}
                >
                  {LEAKAGE_WIDGET_LABELS[id]}
                </button>
              ))}
          </div>
        ) : null}
      </div>
      <LiveDataHint isLive={showLiveHint} source="intelligence" />

      {!tenantReady ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-[14px] text-slate-500 shadow-sm">
          Sign in to load payment gap intelligence for your workspace.
        </p>
      ) : (
        <div className="space-y-4">
          {!displayData ? (
            <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-[14px] text-slate-500 shadow-sm">
              {selectedBatchId
                ? loading
                  ? 'Loading batch payment gap data…'
                  : 'No leakage data for this batch yet.'
                : 'No workspace-wide leakage snapshot yet. Select a batch or wait for intelligence projections.'}
            </p>
          ) : null}
          {widgetOrder.map((id) => {
            const node = widgetNodes[id]
            if (!node) return null
            if (id === 'batchScoreHealth' || id === 'zordInsight') {
              return null
            }
            return <div key={id}>{node}</div>
          })}
          <div className="grid gap-4 lg:grid-cols-2">
            {widgetOrder.includes('batchScoreHealth') ? (
              <div>{widgetNodes.batchScoreHealth}</div>
            ) : null}
            {widgetOrder.includes('zordInsight') ? <div>{widgetNodes.zordInsight}</div> : null}
          </div>
        </div>
      )}
    </div>
  )
}
