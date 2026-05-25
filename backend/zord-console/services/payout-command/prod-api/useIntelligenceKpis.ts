'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAmbiguityKpis,
  getDefensibilityKpis,
  getLeakageKpis,
  getPatternsKpis,
  getRecommendationsKpis,
  type IntelligenceDateQuery,
} from './getIntelligenceKpis'
import type {
  AmbiguityKpiResponse,
  DefensibilityKpiResponse,
  LeakageKpiResponse,
  PatternsKpiResponse,
  RecommendationsKpiResponse,
} from './intelligenceTypes'
import { apiTrimmedString } from './coerceApiField'

export type IntelligenceKpis = {
  leakage: LeakageKpiResponse | null
  ambiguity: AmbiguityKpiResponse | null
  defensibility: DefensibilityKpiResponse | null
  patterns: PatternsKpiResponse | null
  recommendations: RecommendationsKpiResponse | null
  loading: boolean
  lastFetchedAt: Date | null
  refresh: () => Promise<void>
}

const DEFAULT_POLL_MS = 30_000

export type UseIntelligenceKpisOptions = {
  /** When true, polls BFF routes (tenant from session cookies). */
  tenantReady: boolean
  /** Optional — scopes patterns KPI to a batch; other KPIs are tenant-wide. */
  batchId?: string
  /** Optional date window forwarded to intelligence dashboards (from_date / to_date). */
  dateQuery?: IntelligenceDateQuery
  intervalMs?: number
}

/**
 * Fans out intelligence dashboard KPIs and polls every `intervalMs` (default 30s).
 * Does not require client `tenant_id` — BFF resolves tenant from session.
 */
export function useIntelligenceKpis(options: UseIntelligenceKpisOptions): IntelligenceKpis {
  const { tenantReady, batchId, dateQuery, intervalMs = DEFAULT_POLL_MS } = options

  const [leakage, setLeakage] = useState<LeakageKpiResponse | null>(null)
  const [ambiguity, setAmbiguity] = useState<AmbiguityKpiResponse | null>(null)
  const [defensibility, setDefensibility] = useState<DefensibilityKpiResponse | null>(null)
  const [patterns, setPatterns] = useState<PatternsKpiResponse | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationsKpiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)

  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!tenantReady) return
    setLoading(true)
    try {
      const [lk, am, df, pt, rc] = await Promise.all([
        getLeakageKpis(dateQuery),
        getAmbiguityKpis(dateQuery),
        getDefensibilityKpis(dateQuery),
        getPatternsKpis(apiTrimmedString(batchId) || undefined),
        getRecommendationsKpis(dateQuery),
      ])
      if (cancelledRef.current) return
      setLeakage(lk)
      setAmbiguity(am)
      setDefensibility(df)
      setPatterns(pt)
      setRecommendations(rc)
      setLastFetchedAt(new Date())
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [tenantReady, batchId, dateQuery?.from_date, dateQuery?.to_date])

  useEffect(() => {
    cancelledRef.current = false
    if (!tenantReady) {
      setLeakage(null)
      setAmbiguity(null)
      setDefensibility(null)
      setPatterns(null)
      setRecommendations(null)
      return
    }
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, intervalMs)
    return () => {
      cancelledRef.current = true
      window.clearInterval(id)
    }
  }, [tenantReady, refresh, intervalMs])

  return { leakage, ambiguity, defensibility, patterns, recommendations, loading, lastFetchedAt, refresh }
}
