'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildSimulatedHomeOverviewSnapshot,
  defaultHomeCommandFilters,
  HOME_QUARTERS,
  HOME_SIMULATION_INTERVAL_MS,
  homeCommandFilterMultiplier,
  homeSimulationScenarios,
  resolveHomeQuarterFromPrompt,
  resolveHomeTimeframeFromPrompt,
  resolveHomeYearFromPrompt,
  resolvePromptScenario,
  type HomeCommandFilters,
  type HomeCommandResponse,
  type HomeCommandStatus,
  type HomeOverviewSnapshot,
  type HomeSimulation,
  type HomeTimeframe,
} from '@/services/payout-command/model'

export type HomeState = {
  scenario: HomeSimulation
  snapshot: HomeOverviewSnapshot
  timeframe: HomeTimeframe
  year: 2026 | 2027 | 2028
  quarterIndex: number
  activeChartPoint: number
  commandStatus: HomeCommandStatus
  commandResponse: HomeCommandResponse | null
  promptInput: string
  setPromptInput: (value: string) => void
  setTimeframe: (timeframe: HomeTimeframe) => void
  setYear: (year: 2026 | 2027 | 2028) => void
  setQuarterIndex: (index: number) => void
  setActiveChartPoint: (point: number) => void
  runSimulation: (prompt: string) => void
  dismissCommandResponse: () => void
  clearInput: () => void
  commandFilters: HomeCommandFilters
  setCommandFilters: Dispatch<SetStateAction<HomeCommandFilters>>
}

export function useHomeState(isActive: boolean): HomeState {
  const [scenario, setScenario] = useState<HomeSimulation>(homeSimulationScenarios[0])
  const [timeframe, setTimeframeRaw] = useState<HomeTimeframe>('Month')
  const [year, setYearRaw] = useState<2026 | 2027 | 2028>(2026)
  const [quarterIndex, setQuarterIndexRaw] = useState(0)
  const [tick, setTick] = useState(0)
  const [activeChartPoint, setActiveChartPoint] = useState(42)
  const [commandStatus, setCommandStatus] = useState<HomeCommandStatus>('idle')
  const [pendingResponse, setPendingResponse] = useState<HomeCommandResponse | null>(null)
  const [commandResponse, setCommandResponse] = useState<HomeCommandResponse | null>(null)
  const [promptInput, setPromptInput] = useState('')
  const [commandFilters, setCommandFilters] = useState<HomeCommandFilters>(defaultHomeCommandFilters)

  const filterMultiplier = useMemo(() => homeCommandFilterMultiplier(commandFilters), [commandFilters])

  const snapshot = useMemo(
    () => buildSimulatedHomeOverviewSnapshot(scenario, timeframe, tick, year, quarterIndex, filterMultiplier),
    [filterMultiplier, quarterIndex, scenario, tick, timeframe, year],
  )

  // Smart setters that bump the tick so the chart re-renders immediately
  const setTimeframe = useCallback((tf: HomeTimeframe) => {
    setTimeframeRaw(tf)
    setTick((c) => c + 1)
  }, [])

  const setYear = useCallback((y: 2026 | 2027 | 2028) => {
    setYearRaw(y)
    setTick((c) => c + 1)
  }, [])

  const setQuarterIndex = useCallback((qi: number) => {
    setQuarterIndexRaw(qi)
    setTick((c) => c + 1)
  }, [])

  // Advance simulation tick only while the home surface is visible
  useEffect(() => {
    if (!isActive) return
    const id = window.setInterval(() => setTick((c) => c + 1), HOME_SIMULATION_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [isActive])

  // Keep the active chart point at the midpoint of the selected range
  useEffect(() => {
    const [start, end] = snapshot.range
    setActiveChartPoint(Math.round((start + end) / 2))
  }, [snapshot.range])

  // Typing animation for command responses
  useEffect(() => {
    if (!pendingResponse) return

    setCommandStatus('loading')
    setCommandResponse({ title: pendingResponse.title, body: '' })
    let typingTimer: number | undefined

    const loadingTimer = window.setTimeout(() => {
      setCommandStatus('typing')
      let index = 0
      const target = pendingResponse.body

      typingTimer = window.setInterval(() => {
        index += 4
        setCommandResponse({ title: pendingResponse.title, body: target.slice(0, index) })

        if (index >= target.length) {
          window.clearInterval(typingTimer)
          setCommandStatus('complete')
          setPendingResponse(null)
        }
      }, 28)
    }, 520)

    return () => {
      window.clearTimeout(loadingTimer)
      if (typingTimer) window.clearInterval(typingTimer)
    }
  }, [pendingResponse])

  const runSimulation = useCallback(
    (prompt: string) => {
      const cleaned = prompt.trim()
      if (!cleaned) return

      const nextScenario = resolvePromptScenario(cleaned, homeSimulationScenarios, homeSimulationScenarios[0])
      const nextTimeframe = resolveHomeTimeframeFromPrompt(cleaned, timeframe)
      const nextYear = resolveHomeYearFromPrompt(cleaned, year)
      const nextQuarterIndex = resolveHomeQuarterFromPrompt(cleaned, quarterIndex)

      setScenario(nextScenario)
      setTimeframeRaw(nextTimeframe)
      setYearRaw(nextYear)
      setQuarterIndexRaw(nextQuarterIndex)
      setTick((c) => c + 1)
      setPendingResponse({
        title: nextScenario.title,
        body: `${nextScenario.summary} Current simulation scope: ${nextTimeframe} ${
          nextTimeframe === 'Custom' ? HOME_QUARTERS[nextQuarterIndex].name : ''
        } ${nextYear}.`,
      })
      setPromptInput('')
    },
    [quarterIndex, timeframe, year],
  )

  const dismissCommandResponse = useCallback(() => {
    setCommandStatus('idle')
    setPendingResponse(null)
    setCommandResponse(null)
  }, [])

  const clearInput = useCallback(() => setPromptInput(''), [])

  return {
    scenario,
    snapshot,
    timeframe,
    year,
    quarterIndex,
    activeChartPoint,
    commandStatus,
    commandResponse,
    promptInput,
    setPromptInput,
    setTimeframe,
    setYear,
    setQuarterIndex,
    setActiveChartPoint,
    runSimulation,
    dismissCommandResponse,
    clearInput,
    commandFilters,
    setCommandFilters,
  }
}
