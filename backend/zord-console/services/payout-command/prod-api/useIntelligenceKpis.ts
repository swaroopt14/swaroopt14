'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAmbiguityKpis,
  getDefensibilityKpis,
  getLeakageKpis,
  getPatternsKpis,
  getRecommendationsKpis,
} from './getIntelligenceKpis'
import type {
  AmbiguityKpiResponse,
  DefensibilityKpiResponse,
  LeakageKpiResponse,
  PatternsKpiResponse,
  RecommendationsKpiResponse,
} from './intelligenceTypes'

/**
 * Single hook that fans out the 5 KPI dashboard endpoints for the current tenant
 * and polls every `intervalMs` (default 30s). Surfaces consume the slice they care
 * about — null while loading, a typed envelope (with `data_available: false`) once
 * the network returns. Cached across surfaces via React's per-tree memoization.
 */
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

export function useIntelligenceKpis(
  tenantId: string,
  options: { batchId?: string; intervalMs?: number } = {},
): IntelligenceKpis {
  const { batchId, intervalMs = DEFAULT_POLL_MS } = options

  const [leakage, setLeakage] = useState<LeakageKpiResponse | null>(null)
  const [ambiguity, setAmbiguity] = useState<AmbiguityKpiResponse | null>(null)
  const [defensibility, setDefensibility] = useState<DefensibilityKpiResponse | null>(null)
  const [patterns, setPatterns] = useState<PatternsKpiResponse | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationsKpiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)

  const cancelledRef = useRef(false)

  const refresh = useCallback(async () => {
    const tid = tenantId.trim()
    if (!tid) return
    setLoading(true)
    try {
      const [lk, am, df, pt, rc] = await Promise.all([
        getLeakageKpis(tid),
        getAmbiguityKpis(tid),
        getDefensibilityKpis(tid),
        getPatternsKpis(tid, batchId?.trim() || undefined),
        getRecommendationsKpis(tid),
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
  }, [tenantId, batchId])

  useEffect(() => {
    cancelledRef.current = false
    if (!tenantId.trim()) {
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
  }, [tenantId, refresh, intervalMs])

  return { leakage, ambiguity, defensibility, patterns, recommendations, loading, lastFetchedAt, refresh }
}
