'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fmtInrFromMinorExact } from './commandCenterFormat'
import { paymentTrendBarWidthPx } from './paymentTrendChartConfig'

export type PaymentTrendChartPoint = {
  label: string
  intendedMinor: number
  confirmedMinor: number
  reviewMinor: number
}

type Props = {
  points: PaymentTrendChartPoint[]
  activeIndex: number | null
  onActiveIndexChange: (index: number | null) => void
  className?: string
}

const W = 2400
const H = 460
const PAD = { top: 24, right: 88, bottom: 88, left: 16 }
const PLOT = {
  x: PAD.left,
  y: PAD.top,
  w: W - PAD.left - PAD.right,
  h: H - PAD.top - PAD.bottom,
}
const BRUSH_RES = 132
const MAX_LABELS = 9

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function resampleSeries(values: number[], targetLen: number): number[] {
  if (!values.length) return []
  if (values.length === 1) return Array.from({ length: targetLen }, () => values[0])
  const out: number[] = []
  for (let j = 0; j < targetLen; j += 1) {
    const t = j / Math.max(1, targetLen - 1)
    const idx = t * (values.length - 1)
    const lo = Math.floor(idx)
    const hi = Math.min(values.length - 1, lo + 1)
    const frac = idx - lo
    out.push(values[lo] * (1 - frac) + values[hi] * frac)
  }
  return out
}

function brushAreaPath(values: number[], xFn: (i: number) => number, y0: number, y1: number) {
  const vmax = Math.max(...values, 1)
  let d = `M ${PLOT.x} ${y1}`
  values.forEach((v, j) => {
    const x = xFn(j)
    const norm = clamp(v / vmax, 0, 1)
    d += ` L ${x.toFixed(1)} ${(y1 - norm * (y1 - y0)).toFixed(1)}`
  })
  d += ` L ${PLOT.x + PLOT.w} ${y1} Z`
  return d
}

/** Tighter Y scale so daily smoke values fill the plot height. */
function chartPeakMaxThousands(peakThousands: number): number {
  const padded = peakThousands * 1.06
  return Math.max(10, Math.ceil(padded / 5) * 5)
}

export function PaymentValueTrendChart({
  points,
  activeIndex,
  onActiveIndexChange,
  className,
}: Props) {
  const n = points.length
  const barsK = useMemo(() => points.map((p) => p.intendedMinor / 1000), [points])
  const confirmedK = useMemo(() => points.map((p) => p.confirmedMinor / 1000), [points])

  const vMax = useMemo(() => {
    const peak = Math.max(0.001, ...barsK, ...confirmedK)
    return chartPeakMaxThousands(peak)
  }, [barsK, confirmedK])

  const yTicks = useMemo(
    () => [0, vMax * 0.25, vMax * 0.5, vMax * 0.75, vMax].map((x) => Math.round(x)),
    [vMax],
  )

  const brushProfile = useMemo(() => resampleSeries(barsK, BRUSH_RES), [barsK])

  const defaultBrush = useMemo(() => {
    if (n <= 1) return { a: 0, b: 1 }
    return { a: 0.18, b: 0.4 }
  }, [n])

  const [range, setRange] = useState(defaultBrush)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ mode: 'move' | 'start' | 'end'; grab: number } | null>(null)

  useEffect(() => {
    setRange(defaultBrush)
  }, [defaultBrush, points])

  const anchorIndex = useMemo(() => clamp(Math.floor(n / 2), 0, Math.max(0, n - 1)), [n])
  const displayIndex = activeIndex ?? anchorIndex
  const activePoint = points[displayIndex]

  const yAt = useCallback((v: number) => PLOT.y + (1 - v / vMax) * PLOT.h, [vMax])
  const xBar = useCallback((i: number) => PLOT.x + (n <= 1 ? PLOT.w / 2 : (i / (n - 1)) * PLOT.w), [n])
  const xBrush = useCallback((j: number) => PLOT.x + (j / Math.max(1, BRUSH_RES - 1)) * PLOT.w, [])

  const spacing = n > 1 ? PLOT.w / (n - 1) : PLOT.w
  const barW = paymentTrendBarWidthPx(spacing)

  const sel = useMemo(() => {
    const a = Math.min(range.a, range.b)
    const b = Math.max(range.a, range.b)
    let lo = Math.round(a * Math.max(0, n - 1))
    let hi = Math.round(b * Math.max(0, n - 1))
    lo = clamp(lo, 0, Math.max(0, n - 1))
    hi = clamp(hi, lo, Math.max(0, n - 1))
    return { lo, hi }
  }, [range, n])

  const tooltipLeftPercent =
    n <= 1 ? 50 : clamp((displayIndex / Math.max(n - 1, 1)) * 100 - 8, 3, 74)

  const fracFromX = useCallback((clientX: number) => {
    const svg = svgRef.current
    if (!svg) return 0
    const r = svg.getBoundingClientRect()
    const px = ((clientX - r.left) / r.width) * W
    return clamp((px - PLOT.x) / PLOT.w, 0, 1)
  }, [])

  const idxFromClientX = useCallback(
    (clientX: number) => {
      if (n <= 0) return 0
      const f = fracFromX(clientX)
      return clamp(Math.round(f * Math.max(0, n - 1)), 0, Math.max(0, n - 1))
    },
    [fracFromX, n],
  )

  const startDrag = (mode: 'move' | 'start' | 'end') => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { mode, grab: fracFromX(e.clientX) }
  }

  const moveDrag = useCallback(
    (e: PointerEvent) => {
      const active = drag.current
      if (!active) return
      const f = fracFromX(e.clientX)
      if (active.mode === 'move') {
        drag.current = { mode: 'move', grab: f }
      }
      setRange((r) => {
        const a = Math.min(r.a, r.b)
        const b = Math.max(r.a, r.b)
        const minW = 0.03
        if (active.mode === 'start') return { a: Math.min(f, b - minW), b }
        if (active.mode === 'end') return { a, b: Math.max(f, a + minW) }
        const d = f - active.grab
        const width = b - a
        const na = clamp(a + d, 0, 1 - width)
        return { a: na, b: na + width }
      })
    },
    [fracFromX],
  )

  const stopDrag = useCallback(() => {
    drag.current = null
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', moveDrag)
    window.addEventListener('pointerup', stopDrag)
    return () => {
      window.removeEventListener('pointermove', moveDrag)
      window.removeEventListener('pointerup', stopDrag)
    }
  }, [moveDrag, stopDrag])

  const brushTop = H - 68
  const brushBot = H - 34
  const bx0 = PLOT.x + Math.min(range.a, range.b) * PLOT.w
  const bx1 = PLOT.x + Math.max(range.a, range.b) * PLOT.w

  const labelStep = Math.max(1, Math.ceil(n / MAX_LABELS))

  return (
    <div
      className={className}
      style={{
        width: '100%',
        position: 'relative',
        height: '22rem',
      }}
    >
      <div
        className="pointer-events-none absolute inset-y-0 z-[8] bg-white/70"
        style={{
          left: `${(sel.lo / Math.max(n - 1, 1)) * 100}%`,
          width: `${((sel.hi - sel.lo) / Math.max(n - 1, 1)) * 100}%`,
          opacity: 0.06,
        }}
        aria-hidden
      />

      <div
        className="pointer-events-none absolute top-1/2 z-20 w-[15rem] max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-lg border-[0.5px] border-[#E0E0DE] bg-white px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] sm:w-[16.5rem]"
        style={{ left: `clamp(0.5rem, ${tooltipLeftPercent}%, calc(100% - 17rem))` }}
      >
        <div className="text-[11px] font-normal uppercase tracking-[0.06em] text-[#888888]">
          Date: {activePoint?.label ?? '—'}
        </div>
        <div className="mt-2 space-y-1 text-[13px] font-medium leading-relaxed text-[#00239C]">
          <p>Intended payments: {activePoint ? fmtInrFromMinorExact(activePoint.intendedMinor) : '—'}</p>
          <p>Bank-confirmed: {activePoint ? fmtInrFromMinorExact(activePoint.confirmedMinor) : '—'}</p>
          <p>Needs review: {activePoint ? fmtInrFromMinorExact(activePoint.reviewMinor) : '—'}</p>
        </div>
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-[#00239C]">
          Zord compares your payment instructions with bank/settlement records for this date.
        </p>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        className="relative z-[1] block overflow-visible touch-none"
        role="img"
        aria-label="Payment value intended versus bank confirmed trend chart"
      >
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PLOT.x}
              x2={PLOT.x + PLOT.w}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke={v === 0 ? '#dfe2e4' : '#e8eaeb'}
              strokeWidth={v === 0 ? 1.2 : 0.8}
            />
            <text x={PLOT.x + PLOT.w + 12} y={yAt(v) + 5} fontSize="18" fill="#999999" textAnchor="start">
              {v === 0 ? '0' : `₹${v}k`}
            </text>
          </g>
        ))}

        {confirmedK.map((v, i) => {
          const inRange = i >= sel.lo && i <= sel.hi
          const x = xBar(i)
          const top = yAt(v)
          const base = yAt(0)
          return (
            <rect
              key={`confirmed-${i}`}
              x={x - barW / 2}
              y={Math.min(top, base)}
              width={barW}
              height={Math.max(1.5, Math.abs(base - top))}
              rx={Math.min(2, barW / 3)}
              fill="#7C7C7C"
              opacity={inRange ? 0.72 : 0.35}
            />
          )
        })}

        {barsK.map((v, i) => {
          const inRange = i >= sel.lo && i <= sel.hi
          const highlighted = i === displayIndex
          const x = xBar(i)
          const top = yAt(v)
          const base = yAt(0)
          return (
            <rect
              key={`intended-${i}`}
              x={x - barW / 2}
              y={Math.min(top, base)}
              width={barW}
              height={Math.max(1.5, Math.abs(base - top))}
              rx={Math.min(2, barW / 3)}
              fill={inRange ? '#1A1A1A' : '#000000'}
              opacity={highlighted ? 1 : inRange ? 0.88 : 0.28}
            />
          )
        })}

        {points.map((p, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null
          return (
            <text
              key={`lbl-${p.label}-${i}`}
              x={xBar(i)}
              y={brushTop - 8}
              fontSize="18"
              fill="#999999"
              textAnchor="middle"
            >
              {p.label}
            </text>
          )
        })}

        <rect
          x={PLOT.x}
          y={PLOT.y}
          width={PLOT.w}
          height={PLOT.h}
          fill="transparent"
          onPointerMove={(e) => onActiveIndexChange(idxFromClientX(e.clientX))}
          onPointerLeave={() => onActiveIndexChange(null)}
        />

        <rect x={PLOT.x} y={brushTop} width={PLOT.w} height={brushBot - brushTop} rx={4} fill="#EBEBEA" />
        <path d={brushAreaPath(brushProfile, xBrush, brushTop + 4, brushBot - 3)} fill="#C5C5C2" opacity={0.85} />
        <rect
          x={bx0}
          y={brushTop}
          width={Math.max(2, bx1 - bx0)}
          height={brushBot - brushTop}
          rx={4}
          fill="#C5C5C2"
          style={{ cursor: 'grab' }}
          onPointerDown={startDrag('move')}
        />
        {[
          { x: bx0, mode: 'start' as const },
          { x: bx1, mode: 'end' as const },
        ].map((h) => (
          <g key={h.mode} style={{ cursor: 'ew-resize' }} onPointerDown={startDrag(h.mode)}>
            <rect x={h.x - 12} y={brushTop} width={24} height={brushBot - brushTop} fill="transparent" />
            <rect x={h.x - 1.5} y={brushTop + 2} width={3} height={brushBot - brushTop - 4} rx={1} fill="#444444" />
          </g>
        ))}
      </svg>
    </div>
  )
}
