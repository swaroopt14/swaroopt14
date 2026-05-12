'use client'

import { useEffect, useRef } from 'react'

const PEAK_DAY = 'Thu'

export function CustomersCard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const waveT = useRef(0)
  const liqCur = useRef(0)

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const size = 140
      const radius = 68
      const cx = 70
      const cy = 70

      ctx.clearRect(0, 0, size, size)
      liqCur.current += (0.72 - liqCur.current) * 0.026

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.clip()

      ctx.fillStyle = '#eff6ff'
      ctx.fillRect(0, 0, size, size)

      const fillY = cy + radius - liqCur.current * 2 * radius

      ctx.beginPath()
      ctx.moveTo(0, fillY)
      for (let x = 0; x <= size; x += 1) {
        const y = fillY + Math.sin((x / size) * Math.PI * 2 * 2 + waveT.current) * 5 + Math.sin((x / size) * Math.PI * 2 * 3 + waveT.current * 1.3) * 2.5
        ctx.lineTo(x, y)
      }
      ctx.lineTo(size, size)
      ctx.lineTo(0, size)
      ctx.closePath()

      const grad = ctx.createLinearGradient(0, fillY, 0, size)
      grad.addColorStop(0, 'rgba(96,165,250,0.9)')
      grad.addColorStop(0.5, 'rgba(37,99,235,0.85)')
      grad.addColorStop(1, 'rgba(30,64,175,0.95)')
      ctx.fillStyle = grad
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(0, fillY + 4)
      for (let x = 0; x <= size; x += 1) {
        ctx.lineTo(x, fillY + 4 + Math.sin((x / size) * Math.PI * 2 * 2 + waveT.current + 1) * 4)
      }
      ctx.lineTo(size, size)
      ctx.lineTo(0, size)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fill()

      const shine = ctx.createRadialGradient(cx - 20, cy - 20, 3, cx - 14, cy - 14, radius * 0.65)
      shine.addColorStop(0, 'rgba(255,255,255,0.32)')
      shine.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = shine
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()

      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = '#bfdbfe'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      ctx.font = "800 24px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      ctx.fillStyle = '#fff'
      ctx.shadowColor = 'rgba(30,64,175,0.45)'
      ctx.shadowBlur = 8
      ctx.fillText('1,284', cx, cy - 5)
      ctx.shadowBlur = 0

      ctx.font = "600 11px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      ctx.fillStyle = 'rgba(255,255,255,0.72)'
      ctx.fillText('customers', cx, cy + 14)

      waveT.current += 0.022
      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        border: '1px solid #E8E5E0',
        padding: 14,
        height: '100%',
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow .2s',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0F0F0F', lineHeight: 1.1 }}>Customers</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>Active users</div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e', letterSpacing: -0.3 }}>+320</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <canvas ref={canvasRef} width={140} height={140} style={{ borderRadius: '50%', display: 'block' }} />
      </div>

      <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: '#F8F5F1', border: '1px solid #EDE8E0', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>Peak Day</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0D1117', lineHeight: 1 }}>{PEAK_DAY}</div>
        </div>

        <div style={{ background: '#F8F5F1', border: '1px solid #EDE8E0', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>VS Period</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>+320</div>
        </div>
      </div>
    </div>
  )
}
