'use client'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HEIGHTS = [2, 3, 4, 5, 6, 4, 3]
const PEAK_INDEX = 2
const DOT_LIGHT = '#86efac'
const DOT_DARK = '#16a34a'

function drawDotMatrix(canvas: HTMLCanvasElement, hoverCol: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const radius = 4
  const pad = 4
  const cellW = (width - pad) / HEIGHTS.length

  ctx.clearRect(0, 0, width, height)

  HEIGHTS.forEach((h, col) => {
    const isPeak = col === PEAK_INDEX
    const isHovered = col === hoverCol
    const cx = col * cellW + radius + pad / 2

    for (let row = 0; row < h; row += 1) {
      const cy = height - row * (radius * 2 + pad) - radius - pad
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)

      if (isPeak || isHovered) {
        ctx.fillStyle = DOT_DARK
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = DOT_LIGHT
        ctx.globalAlpha = 0.45 + 0.4 * (row / Math.max(1, h))
      }

      ctx.fill()
      ctx.globalAlpha = 1
    }

    if (isHovered && !isPeak) {
      const topCy = height - (h - 1) * (radius * 2 + pad) - radius - pad
      ctx.beginPath()
      ctx.arc(cx, topCy, radius + 2.5, 0, Math.PI * 2)
      ctx.strokeStyle = DOT_DARK
      ctx.lineWidth = 1.2
      ctx.globalAlpha = 0.35
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  })
}

export function TransactionsCard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hoverCol, setHoverCol] = useState(-1)
  const activeDay = hoverCol >= 0 ? DAYS[hoverCol] : DAYS[PEAK_INDEX]

  useEffect(() => {
    if (!canvasRef.current) return
    drawDotMatrix(canvasRef.current, hoverCol)
  }, [hoverCol])

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const mx = (e.clientX - rect.left) * scaleX
    const cellW = (canvas.width - 4) / HEIGHTS.length
    const col = Math.floor(mx / cellW)

    if (col >= 0 && col < HEIGHTS.length) {
      setHoverCol(col)
    }
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 20,
        border: '1px solid #E8E5E0',
        padding: 14,
        height: '100%',
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow .2s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
        setHoverCol(-1)
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0F0F0F', lineHeight: 1.1 }}>Transactions</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>Realtime throughput</div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 11,
            color: '#166534',
            fontWeight: 600,
          }}
        >
          Peak: <strong>{activeDay}</strong>
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: '#0F172A', lineHeight: 1, letterSpacing: -1 }}>106k</div>

        <canvas
          ref={canvasRef}
          width={180}
          height={80}
          style={{ display: 'block', cursor: 'pointer' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverCol(-1)}
        />

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>vs last period</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', letterSpacing: -0.4 }}>+34,002</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 'auto' }}>
        {DAYS.map((day, idx) => {
          const isActive = idx === PEAK_INDEX || idx === hoverCol
          return (
            <span
              key={day}
              style={{
                fontSize: 10,
                color: isActive ? DOT_DARK : '#D1D5DB',
                fontWeight: idx === PEAK_INDEX ? 700 : 500,
                transition: 'color .15s',
              }}
            >
              {day[0]}
            </span>
          )
        })}
      </div>
    </div>
  )
}
