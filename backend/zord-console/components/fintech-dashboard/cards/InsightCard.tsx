'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type InsightChip = {
  label: string
  value: string
  color: string
  width: number
  valueColor?: string
}

type InsightData = {
  score: number
  title: string
  description: string
  updatedLabel: string
  progress: number
  chips: InsightChip[]
}

const DEFAULT_DATA: InsightData = {
  score: 75,
  title: 'Authorization rate increased by 4% compared to last week.',
  description:
    'Signal quality is stable across PSP latency, decline reasons, and retry outcomes for the current cycle.',
  updatedLabel: 'Updated 12s ago',
  progress: 75,
  chips: [
    { label: 'Recovered', value: '$12.4k', color: '#34d399', width: 72 },
    { label: 'Failures', value: '-950', color: '#f87171', width: 45 },
    { label: 'Rate', value: '+4%', color: '#a78bfa', width: 60, valueColor: '#4ade80' },
  ],
}

type InsightCardProps = {
  data?: Partial<InsightData>
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function InsightCard({ data }: InsightCardProps) {
  const [score, setScore] = useState(0)
  const [progress, setProgress] = useState(0)
  const [chipW, setChipW] = useState([0, 0, 0])
  const timerRef = useRef<number | null>(null)

  const view = useMemo<InsightData>(() => {
    return {
      ...DEFAULT_DATA,
      ...data,
      chips: data?.chips ?? DEFAULT_DATA.chips,
    }
  }, [data])

  useEffect(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
    }

    setScore(0)
    setProgress(0)
    setChipW([0, 0, 0])

    let current = 0
    const targetScore = clamp(view.score, 0, 100)
    timerRef.current = window.setInterval(() => {
      current = Math.min(targetScore, current + 2)
      setScore(current)
      if (current >= targetScore && timerRef.current !== null) {
        clearInterval(timerRef.current)
      }
    }, 18)

    const progressTimer = window.setTimeout(() => {
      setProgress(clamp(view.progress, 0, 100))
    }, 180)

    const chipTimer = window.setTimeout(() => {
      const widths = view.chips.map((chip) => clamp(chip.width, 0, 100))
      setChipW([widths[0] ?? 0, widths[1] ?? 0, widths[2] ?? 0])
    }, 220)

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
      }
      clearTimeout(progressTimer)
      clearTimeout(chipTimer)
    }
  }, [view])

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 55%, #0f172a 100%)',
        borderRadius: 20,
        border: '1px solid #E8E5E0',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
        minHeight: 360,
        height: '100%',
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 220,
          height: 220,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 68%)',
          top: -70,
          right: -50,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(249,115,22,0.18) 0%, transparent 68%)',
          bottom: -60,
          left: -40,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52,211,153,0.12) 0%, transparent 68%)',
          bottom: 40,
          right: 30,
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 10,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.85)',
            marginBottom: 14,
            backdropFilter: 'blur(4px)',
            letterSpacing: 0.4,
            width: 'fit-content',
          }}
        >
          ✦ AI INSIGHTS
        </div>

        <div
          style={{
            fontSize: 58,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: -3,
            lineHeight: 1,
            marginBottom: 10,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {score}
          <span style={{ fontSize: 28, color: 'rgba(255,255,255,0.6)', letterSpacing: -1 }}>%</span>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)', marginBottom: 8 }}>{view.updatedLabel}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.94)', marginBottom: 8, lineHeight: 1.45 }}>
          {view.title}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.66)', lineHeight: 1.55, marginBottom: 14 }}>
          {view.description}
        </div>

        <div
          style={{
            height: 3,
            background: 'rgba(255,255,255,0.12)',
            borderRadius: 2,
            overflow: 'hidden',
            marginBottom: 18,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #60a5fa, #a78bfa, #34d399)',
              borderRadius: 2,
              transition: 'width 1.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 'auto' }}>
          {view.chips.map((chip, idx) => (
            <div
              key={chip.label}
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 10,
                padding: '10px 12px',
                position: 'relative',
                overflow: 'hidden',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.4)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                {chip.label}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: chip.valueColor ?? '#fff',
                  fontFamily: "'IBM Plex Mono', monospace",
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {chip.value}
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  height: 2,
                  width: `${chipW[idx] ?? 0}%`,
                  background: chip.color,
                  borderRadius: '0 0 10px 10px',
                  transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
