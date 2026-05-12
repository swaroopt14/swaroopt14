'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const DATA = [
  { month: 'Jan', values: [28, 29, 30, 28] },
  { month: 'Feb', values: [34, 35, 34, 36] },
  { month: 'Mar', values: [38, 42, 44, 45] },
  { month: 'Apr', values: [45, 44, 43, 44] },
  { month: 'May', values: [38, 36, 32, 34] },
  { month: 'Jun', values: [34, 35, 34, 35] },
]

const POINTS = DATA.flatMap((d) => d.values)
const MONTH_LABELS = DATA.map((d) => d.month)
const NS = 'http://www.w3.org/2000/svg'

function mk<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)))
  if (parent) parent.appendChild(el)
  return el
}

export function RetentionCard() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [hovered, setHovered] = useState<{ x: number; y: number; val: number; idx: number } | null>(null)

  const draw = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    const W = wrapRef.current?.clientWidth ?? svg.clientWidth ?? 560
    if (W === 0) return

    const H = 280
    const padL = 0
    const padR = 0
    const padT = 48
    const n = POINTS.length
    const cW = W - padL - padR
    const cH = H - padT

    const minV = 20
    const maxV = 52

    const sx = (i: number) => padL + (i / (n - 1)) * cW
    const sy = (v: number) => padT + cH - ((v - minV) / (maxV - minV)) * cH

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.innerHTML = ''

    const defs = mk('defs', {}, svg)

    const pat = mk(
      'pattern',
      { id: 'vstripe', patternUnits: 'userSpaceOnUse', width: 6, height: 6 },
      defs,
    )
    mk('rect', { width: 6, height: 6, fill: 'rgba(255,255,255,0)' }, pat)
    mk(
      'line',
      {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 6,
        stroke: 'rgba(255,20,100,0.22)',
        'stroke-width': 1.2,
      },
      pat,
    )

    const fillGrad = mk(
      'linearGradient',
      { id: 'fillGrad', x1: '0', y1: '0', x2: '0', y2: '1', gradientUnits: 'objectBoundingBox' },
      defs,
    )
    const s1 = mk('stop', { offset: '0%' }, fillGrad)
    s1.style.stopColor = 'rgba(255,20,100,0.18)'
    const s2 = mk('stop', { offset: '100%' }, fillGrad)
    s2.style.stopColor = 'rgba(255,255,255,0.0)'

    const clip = mk('clipPath', { id: 'chartClip' }, defs)

    const stepPath = (close: boolean): string => {
      const parts: string[] = []
      for (let i = 0; i < n; i += 1) {
        const x = sx(i)
        const y = sy(POINTS[i])
        if (i === 0) {
          parts.push(`M ${x},${y}`)
        } else {
          parts.push(`H ${x}`)
          parts.push(`V ${y}`)
        }
      }

      if (close) {
        parts.push(`V ${sy(minV) + 2}`)
        parts.push(`H ${sx(0)}`)
        parts.push('Z')
      }

      return parts.join(' ')
    }

    mk('path', { d: stepPath(true) }, clip)

    mk(
      'rect',
      {
        x: padL,
        y: padT,
        width: cW,
        height: cH,
        fill: 'url(#vstripe)',
        'clip-path': 'url(#chartClip)',
      },
      svg,
    )

    mk('path', { d: stepPath(true), fill: 'url(#fillGrad)' }, svg)

    mk(
      'path',
      {
        d: stepPath(false),
        fill: 'none',
        stroke: '#FF1464',
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
      svg,
    )

    POINTS.forEach((val, i) => {
      const x = sx(i)
      const y = sy(val)
      const colW = cW / (n - 1)

      const hit = mk(
        'rect',
        {
          x: x - colW / 2,
          y: padT,
          width: colW,
          height: cH,
          fill: 'transparent',
          style: 'cursor:crosshair',
        },
        svg,
      )

      hit.addEventListener('mouseenter', () => setHovered({ x, y, val, idx: i }))
      hit.addEventListener('mouseleave', () => setHovered(null))
    })

    if (hovered) {
      mk('circle', { cx: hovered.x, cy: hovered.y, r: 9, fill: 'rgba(255,20,100,0.15)' }, svg)
      mk(
        'circle',
        {
          cx: hovered.x,
          cy: hovered.y,
          r: 4.5,
          fill: '#FF1464',
          stroke: '#fff',
          'stroke-width': 2,
        },
        svg,
      )
    }

    mk('line', { x1: padL, y1: H - 1, x2: W - padR, y2: H - 1, stroke: '#F0EBE3', 'stroke-width': 1 }, svg)
  }, [hovered])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const ro = new ResizeObserver(() => {
      setHovered(null)
      draw()
    })
    ro.observe(wrap)

    return () => ro.disconnect()
  }, [draw])

  useEffect(() => {
    draw()
  }, [draw])

  const tooltipW = 72
  const tooltipH = 34
  const wrapWidth = wrapRef.current?.clientWidth ?? 0
  const tooltipLeftPx =
    hovered && wrapWidth > 0 ? Math.min(Math.max(hovered.x - tooltipW / 2, 4), wrapWidth - tooltipW - 4) : 0

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        border: '1px solid #E8E5E0',
        padding: '22px 22px 20px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow .2s',
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0F0F0F', letterSpacing: -0.3 }}>Retention</h2>
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid #ECEAE6',
            background: '#F5F4F2',
            cursor: 'pointer',
            fontSize: 15,
            color: '#C4C4C4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,.04)',
          }}
        >
          ···
        </button>
      </div>

      <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
        <svg ref={svgRef} style={{ width: '100%', display: 'block', overflow: 'visible' }} height={280} />

        {hovered && (
          <div
            style={{
              position: 'absolute',
              left: tooltipLeftPx,
              top: hovered.y,
              transform: 'translateY(-130%)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 50,
                background: 'rgba(0,0,0,0.08)',
                transform: 'translateY(3px) translateX(2px)',
                filter: 'blur(4px)',
              }}
            />
            <div
              style={{
                position: 'relative',
                width: tooltipW,
                height: tooltipH,
                background: 'rgba(255,255,255,0.97)',
                border: '1px solid rgba(220,220,230,0.8)',
                borderRadius: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#0A0A0A',
                  fontFamily: "'Inter', sans-serif",
                  letterSpacing: -0.3,
                }}
              >
                {hovered.val}%
              </span>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 8,
          paddingTop: 4,
          borderTop: '1px solid #F0EBE3',
        }}
      >
        {MONTH_LABELS.map((m) => (
          <div
            key={m}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 400,
              color: '#B0B0B0',
              fontFamily: "'Inter', sans-serif",
              letterSpacing: 0.1,
            }}
          >
            {m}
          </div>
        ))}
      </div>
    </div>
  )
}
