'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchJournalBatchDetail } from '../journalBatchCache'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'
import {
  mapDlqToFailureRow,
  type JournalFailureRow,
} from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import type { IntentEnginePagination } from '@/services/payout-command/prod-api/getProdIntentEngineBatches'

export function useJournalFailureRows(batchId: string, enabled: boolean, pollMs = LIVE_JOURNAL_POLL_MS) {
  const [rows, setRows] = useState<JournalFailureRow[]>([])
  const [pagination, setPagination] = useState<IntentEnginePagination | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const bid = batchId.trim()
    if (!bid || !enabled) {
      setRows([])
      setPagination(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchJournalBatchDetail(bid)
      if (!res?.batchDetails || res.batchDetails.batchId !== bid) {
        setError('Could not load DLQ rows for this batch.')
        setRows([])
        setPagination(null)
        return
      }
      setRows((res.batchDetails.dlqItems?.items ?? []).map(mapDlqToFailureRow))
      setPagination(res.batchDetails.dlqItems?.pagination ?? null)
    } catch {
      setError('Could not load DLQ rows.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [batchId, enabled])

  useEffect(() => {
    if (!enabled) {
      setRows([])
      setPagination(null)
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, load, pollMs])

  return { rows, pagination, loading, error, refetch: load }
}
