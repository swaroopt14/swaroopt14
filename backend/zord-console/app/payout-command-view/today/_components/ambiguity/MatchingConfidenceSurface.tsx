'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { LiveDataHint } from '../shared'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import { useIntelligenceKpis } from '@/services/payout-command/prod-api/useIntelligenceKpis'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import type { FinalityStatus, IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { ambiguityCopy } from './copy/ambiguityCopy'
import { AmbiguityActionBar } from './components/AmbiguityActionBar'
import { MatchingConfidenceKpiStrip } from './components/MatchingConfidenceKpiStrip'
import { WhyPaymentsNeedReviewChart } from './components/WhyPaymentsNeedReviewChart'
import { TopReasonsForReview } from './components/TopReasonsForReview'
import { AverageMatchConfidenceCard } from './components/AverageMatchConfidenceCard'
import { MissingReferenceRateCard } from './components/MissingReferenceRateCard'
import { BatchesNeedingReviewTable } from './components/BatchesNeedingReviewTable'

export function MatchingConfidenceSurface() {
  const pathname = usePathname()
  const { tenantReady } = useSessionTenant()
  const { ambiguity, loading: kpiLoading } = useIntelligenceKpis({ tenantReady })
  const amb = isDataAvailable(ambiguity) ? ambiguity : null

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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="max-w-3xl text-[14px] leading-relaxed text-slate-600">{ambiguityCopy.pageSubtitle}</p>
        <Link
          href={`${pathname}?dock=leakage`}
          className="text-[14px] font-semibold text-slate-900 underline decoration-sky-300 underline-offset-2"
        >
          {ambiguityCopy.linkPaymentGaps}
        </Link>
        <LiveDataHint isLive={Boolean(amb)} source="ambiguity" />
      </div>

      <AmbiguityActionBar />
      <MatchingConfidenceKpiStrip amb={amb} loading={kpiLoading && !amb} />

      <section className="grid gap-4 lg:grid-cols-2">
        <WhyPaymentsNeedReviewChart amb={amb} />
        <TopReasonsForReview amb={amb} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AverageMatchConfidenceCard amb={amb} />
        <MissingReferenceRateCard amb={amb} />
      </section>

      <BatchesNeedingReviewTable
        batches={batches}
        loading={batchesLoading}
        finalityFilter={finalityFilter}
        onFilterChange={setFinalityFilter}
      />
    </div>
  )
}
