'use client'

import { useCallback, useEffect, useState } from 'react'
import { getIntelligenceBatchDetail } from '@/services/payout-command/prod-api/getIntelligenceKpis'
import type { BatchDetailResponse } from '@/services/payout-command/prod-api/intelligenceTypes'
import { LIVE_JOURNAL_POLL_MS } from '../journalConstants'

export function useJournalIntelligenceBatch(batchId: string, enabled: boolean, pollMs = LIVE_JOURNAL_POLL_MS) {
  const [detail, setDetail] = useState<BatchDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const bid = batchId.trim()
    if (!bid || !enabled) {
      setDetail(null)
      return
    }
    setLoading(true)
    try {
      const res = await getIntelligenceBatchDetail(bid)
      setDetail(res)
    } catch {
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [batchId, enabled])

  useEffect(() => {
    if (!enabled) {
      setDetail(null)
      return
    }
    void load()
    const id = window.setInterval(() => void load(), pollMs)
    return () => window.clearInterval(id)
  }, [enabled, load, pollMs])

  return { detail, loading, refetch: load }
}
