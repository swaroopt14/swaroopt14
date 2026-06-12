'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchSettlementObservations } from '../settlementBatchCache'
import { LIVE_SETTLEMENT_POLL_MS } from '../settlementConstants'
import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'

/** Loads canonical observation rows for one client_batch_id (deduped via settlementBatchCache). */
export function useSettlementObservationRows(
  clientBatchId: string,
  enabled: boolean,
  pollMs = LIVE_SETTLEMENT_POLL_MS,
) {
  const [rows, setRows] = useState<SettlementObservationTableRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const bid = clientBatchId.trim()
    if (!bid || !enabled) {
      setRows([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSettlementObservations(bid)
      setRows(data)
    } catch {
      setError('Could not load settlement observations.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [clientBatchId, enabled])

  useEffect(() => {
    if (!enabled || !clientBatchId.trim()) {
      setRows([])
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, clientBatchId, load, pollMs])

  return { rows, loading, error, refetch: load }
}
