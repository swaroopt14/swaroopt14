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

export const JOURNAL_BATCHES_BFF_PATH = '/api/prod/intents/batches'

export type JournalFeedFetchMeta = {
  ok: boolean
  status: number
  sidebarCount: number
  bffPath: string
}

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
  feedMeta: JournalFeedFetchMeta | null
  intentPage: number
  selectBatch: (batchId: string) => void
  setIntentPage: (page: number) => void
  refreshFeed: () => Promise<void>
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
  const [feedMeta, setFeedMeta] = useState<JournalFeedFetchMeta | null>(null)
  const [intentPage, setIntentPageState] = useState(1)

  const selectedBatchIdRef = useRef(selectedBatchId)
  selectedBatchIdRef.current = selectedBatchId
  const intentPageRef = useRef(intentPage)
  intentPageRef.current = intentPage

  const refreshSidebar = useCallback(async () => {
    const tid = tenantId.trim()
    const fetchRes = tid
      ? await getProdIntentEngineBatches(tid)
      : await getProdIntentEngineBatchesForSession()

    setFeedMeta({
      ok: fetchRes.ok,
      status: fetchRes.status,
      sidebarCount: fetchRes.data?.items?.length ?? 0,
      bffPath: JOURNAL_BATCHES_BFF_PATH,
    })

    if (!fetchRes.ok || !fetchRes.data) {
      const statusHint = fetchRes.status === 401 ? ' Sign in required.' : fetchRes.status === 502 ? ' Intent-engine unreachable.' : ''
      setFeedError(
        (tid
          ? 'Could not load batches for this tenant (check session or intent-engine).'
          : 'Could not load batches — sign in so the BFF can resolve your session tenant.') + statusHint,
      )
      setSidebarBatches([])
      return
    }

    setFeedError(null)
    let batchRows = (fetchRes.data.items ?? []).map(mapSidebarItemToBatchRecord)

    if (batchRows.length === 0 && tid) {
      try {
        const batchesRes = await getIntelligenceBatches({ limit: 100 })
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
          setFeedError(
            res
              ? 'Batch detail response did not match selected batch — check batch_id matches your DB rows.'
              : 'Could not load batch details from BFF.',
          )
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

  const refreshFeed = useCallback(async () => {
    await refreshSidebar()
    const bid = selectedBatchIdRef.current.trim()
    if (bid) await loadBatchDetail(bid, intentPageRef.current)
    setSyncAt(new Date())
  }, [refreshSidebar, loadBatchDetail])

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
        if (!cancelled) {
          const bid = selectedBatchIdRef.current.trim()
          if (bid) await loadBatchDetail(bid, intentPageRef.current)
        }
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
  }, [enabled, tenantReady, tenantId, refreshSidebar, loadBatchDetail, pollMs])

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
    feedMeta,
    intentPage,
    selectBatch,
    setIntentPage: setIntentPageAndFetch,
    refreshFeed,
  }
}
