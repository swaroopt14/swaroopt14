'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionTenant } from '@/services/auth/useSessionTenantId'
import {
  getProdIntentEngineBatchDetail,
  getProdIntentEngineBatches,
  getProdIntentEngineBatchesForSession,
  type IntentEnginePagination,
} from '@/services/payout-command/prod-api/getProdIntentEngineBatches'
import { getIntelligenceBatches } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import {
  mapDlqToFailureRow,
  mapIntelligenceRowToBatchRecord,
  mapPaymentIntentToIntentRow,
  mapSidebarItemToBatchRecord,
  type JournalBatchRecord,
  type JournalFailureRow,
  type JournalIntentRow,
} from '@/services/payout-command/prod-api/mapIntentEngineBatch'

const LIVE_JOURNAL_POLL_MS = 8_000

export type IntentJournalBatchFeed = {
  tenantId: string
  tenantReady: boolean
  sidebarBatches: JournalBatchRecord[]
  selectedBatchId: string
  intentRows: JournalIntentRow[]
  failureRows: JournalFailureRow[]
  intentPagination: IntentEnginePagination | null
  dlqPagination: IntentEnginePagination | null
  feedLoaded: boolean
  detailLoading: boolean
  syncAt: Date | null
  feedError: string | null
  intentPage: number
  selectBatch: (batchId: string) => void
  setIntentPage: (page: number) => void
  refreshSidebar: () => Promise<void>
}

export function useIntentJournalBatchFeed(options: {
  enabled: boolean
  initialBatchId?: string
  pollMs?: number
}): IntentJournalBatchFeed {
  const { enabled, initialBatchId, pollMs = LIVE_JOURNAL_POLL_MS } = options
  const { tenantId, tenantReady } = useSessionTenant()

  const [sidebarBatches, setSidebarBatches] = useState<JournalBatchRecord[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState(() => initialBatchId ?? '')
  const [intentRows, setIntentRows] = useState<JournalIntentRow[]>([])
  const [failureRows, setFailureRows] = useState<JournalFailureRow[]>([])
  const [intentPagination, setIntentPagination] = useState<IntentEnginePagination | null>(null)
  const [dlqPagination, setDlqPagination] = useState<IntentEnginePagination | null>(null)
  const [feedLoaded, setFeedLoaded] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [syncAt, setSyncAt] = useState<Date | null>(null)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [intentPage, setIntentPageState] = useState(1)

  const selectedBatchIdRef = useRef(selectedBatchId)
  selectedBatchIdRef.current = selectedBatchId
  const intentPageRef = useRef(intentPage)
  intentPageRef.current = intentPage

  const refreshSidebar = useCallback(async () => {
    const tid = tenantId.trim()
    const engineRes = tid
      ? await getProdIntentEngineBatches(tid)
      : await getProdIntentEngineBatchesForSession()
    if (!engineRes) {
      setFeedError(
        tid
          ? 'Could not load batches for this tenant (check session or intent-engine).'
          : 'Could not load batches — sign in so the BFF can resolve your session tenant.',
      )
      setSidebarBatches([])
      return
    }
    setFeedError(null)
    let batchRows = (engineRes.items ?? []).map(mapSidebarItemToBatchRecord)

    if (batchRows.length === 0 && tid) {
      try {
        const batchesRes = await getIntelligenceBatches(tid, { limit: 100 })
        batchRows = (batchesRes?.batches ?? []).map(mapIntelligenceRowToBatchRecord)
      } catch {
        /* intelligence fallback optional */
      }
    }

    setSidebarBatches(batchRows)
    setSelectedBatchId((prev) => {
      if (batchRows.length === 0) return ''
      if (initialBatchId && batchRows.some((b) => b.batchId === initialBatchId)) return initialBatchId
      if (prev && batchRows.some((b) => b.batchId === prev)) return prev
      return batchRows[0]!.batchId
    })
  }, [tenantId, initialBatchId])

  const loadBatchDetail = useCallback(
    async (batchId: string, page: number) => {
      const bid = batchId.trim()
      if (!bid) {
        setIntentRows([])
        setFailureRows([])
        setIntentPagination(null)
        setDlqPagination(null)
        return
      }
      setDetailLoading(true)
      setFeedError(null)
      try {
        const res = await getProdIntentEngineBatchDetail(tenantId.trim() || undefined, bid, {
          page,
          pageSize: 20,
        })
        if (!res?.batchDetails || res.batchDetails.batchId !== bid) {
          setIntentRows([])
          setFailureRows([])
          setIntentPagination(null)
          setDlqPagination(null)
          return
        }
        const { batchDetails } = res
        setIntentRows(
          (batchDetails.paymentIntents?.items ?? []).map((it) =>
            mapPaymentIntentToIntentRow(it, bid),
          ),
        )
        setFailureRows((batchDetails.dlqItems?.items ?? []).map(mapDlqToFailureRow))
        setIntentPagination(batchDetails.paymentIntents?.pagination ?? null)
        setDlqPagination(batchDetails.dlqItems?.pagination ?? null)
      } catch {
        setFeedError('Could not load batch details.')
        setIntentRows([])
        setFailureRows([])
      } finally {
        setDetailLoading(false)
      }
    },
    [tenantId],
  )

  const selectBatch = useCallback((batchId: string) => {
    setSelectedBatchId(batchId)
    setIntentPageState(1)
  }, [])

  const setIntentPageAndFetch = useCallback((page: number) => {
    setIntentPageState(page)
  }, [])

  useEffect(() => {
    if (!enabled || !tenantReady) {
      setSidebarBatches([])
      setFeedLoaded(false)
      return
    }

    let cancelled = false
    setFeedLoaded(false)

    const tick = async () => {
      if (cancelled) return
      try {
        await refreshSidebar()
        if (!cancelled) setFeedError(null)
      } catch {
        if (!cancelled) setFeedError('Could not refresh journal feed.')
      }
      if (!cancelled) {
        setFeedLoaded(true)
        setSyncAt(new Date())
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled, tenantReady, tenantId, refreshSidebar, pollMs])

  useEffect(() => {
    if (!enabled || !tenantReady || !selectedBatchId.trim()) {
      setIntentRows([])
      setFailureRows([])
      setIntentPagination(null)
      setDlqPagination(null)
      return
    }
    void loadBatchDetail(selectedBatchId, intentPageRef.current)
  }, [enabled, tenantReady, tenantId, selectedBatchId, intentPage, loadBatchDetail])

  useEffect(() => {
    if (initialBatchId) setSelectedBatchId(initialBatchId)
  }, [initialBatchId])

  return {
    tenantId,
    tenantReady,
    sidebarBatches,
    selectedBatchId,
    intentRows,
    failureRows,
    intentPagination,
    dlqPagination,
    feedLoaded,
    detailLoading,
    syncAt,
    feedError,
    intentPage,
    selectBatch,
    setIntentPage: setIntentPageAndFetch,
    refreshSidebar,
  }
}
