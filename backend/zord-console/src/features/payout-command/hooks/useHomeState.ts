'use client'

import { useCallback, useState } from 'react'
import { resolveHomeTimeframeFromPrompt, type HomeTimeframe } from '@/services/payout-command/model'

export type HomeState = {
  timeframe: HomeTimeframe
  setTimeframe: (timeframe: HomeTimeframe) => void
  applyScopeFromPrompt: (prompt: string) => void
}

const API_TIMEFRAMES: HomeTimeframe[] = ['Week', 'Month', 'Year']

export function useHomeState(_isActive: boolean): HomeState {
  const [timeframe, setTimeframeRaw] = useState<HomeTimeframe>('Month')

  const setTimeframe = useCallback((tf: HomeTimeframe) => {
    if (!API_TIMEFRAMES.includes(tf)) return
    setTimeframeRaw(tf)
  }, [])

  const applyScopeFromPrompt = useCallback(
    (prompt: string) => {
      const cleaned = prompt.trim()
      if (!cleaned) return
      const next = resolveHomeTimeframeFromPrompt(cleaned, timeframe)
      if (API_TIMEFRAMES.includes(next)) setTimeframeRaw(next)
    },
    [timeframe],
  )

  return {
    timeframe,
    setTimeframe,
    applyScopeFromPrompt,
  }
}
