'use client'

import { useCallback, useEffect, useState } from 'react'
import { getDisbursementTrend } from './getDisbursementTrend'
import type { DisbursementTrendRange, DisbursementTrendResponse } from './disbursementTrendTypes'

export function useDisbursementTrend(tenantId: string, range: DisbursementTrendRange) {
  const [data, setData] = useState<DisbursementTrendResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const tid = tenantId.trim()
    if (!tid) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const res = await getDisbursementTrend(tid, range)
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [tenantId, range])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, loading, refresh }
}
