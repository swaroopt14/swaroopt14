'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchJournalPaymentIntents } from '../journalBatchCache'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'
import { mapPaymentIntentListItemToRow } from '../mappers/mapIntentTableRow'
import type { JournalIntentRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

export function useJournalIntentRows(batchId: string, enabled: boolean, pollMs = LIVE_JOURNAL_POLL_MS) {
  const [rows, setRows] = useState<JournalIntentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const bid = batchId.trim()
    if (!bid || !enabled) {
      setRows([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetchJournalPaymentIntents(bid)
      if (!res) {
        setError('Could not load payment intents for this batch.')
        setRows([])
        return
      }
      setRows((res.items ?? []).map((item, index) => mapPaymentIntentListItemToRow(item, bid, index)))
    } catch {
      setError('Could not load payment intents.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [batchId, enabled])

  useEffect(() => {
    if (!enabled) {
      setRows([])
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, load, pollMs])

  return { rows, loading, error, refetch: load }
}
