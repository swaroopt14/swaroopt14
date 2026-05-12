'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Stage {
  label: string
  full: string
  display: string
  value: number
  conv: number
  drop: number
}

interface BarGeometry {
  fx: number
  fFlY: number
  fTopY: number
  bx: number
  bFlY: number
  bTopY: number
  bh: number
  s: Stage
  i: number
}

const STAGES: Stage[] = [
  { label: 'Initiated', full: 'Initiated Payments', display: '65.2k', value: 65200, conv: 100, drop: 0 },
  { label: 'Authorized', full: 'Authorized Payments', display: '54.8k', value: 54800, conv: 84, drop: -16 },
  { label: 'Successful', full: 'Successful Payments', display: '48.6k', value: 48600, conv: 89, drop: -11 },
  { label: 'Payouts', full: 'Payouts to Merchants', display: '38.3k', value: 38300, conv: 79, drop: -21 },
  { label: 'Completed', full: 'Completed Transactions', display: '32.9k', value: 32900, conv: 86, drop: -14 },
]

const MAX_VAL = 70000
const CH = 200
const PT = 52
const DX = 30
const DY = 16
const Y_COL_OFFSET = 50
const GRID_TICKS = [0, 0.143, 0.286, 0.429, 0.571]
const Y_LABELS = ['70k', '60k', '50k', '40k', '30k']

const NS = 'http://www.w3.org/2000/svg'
const NEO_BASE = '#F0F4F8'
const NEO_PANEL = '#F7FAFC'
const NEO_LIGHT = '#FFFFFF'
const NEO_DARK = '#D4DCE8'
const NEO_TEXT = '#1E293B'
const NEO_MUTED = '#64748B'
const NEO_ACCENT = '#2563EB'
const NEO_ACCENT_SOFT = '#E9F0FF'
const NEO_BORDER = '1px solid rgba(255,255,255,0.78)'
const SHELL_SHADOW =
  '16px 16px 32px rgba(212,220,232,0.92), -14px -14px 30px rgba(255,255,255,0.96), inset 0 1px 0 rgba(255,255,255,0.82)'
const CARD_SHADOW = '12px 12px 24px #D4DCE8, -12px -12px 24px #FFFFFF'
const RAISED_SHADOW = '4px 4px 10px #D4DCE8, -4px -4px 10px #FFFFFF'
const INSET_SHADOW = 'inset 6px 6px 12px #D4DCE8, inset -6px -6px 12px #FFFFFF'
const ACTIVE_SHADOW = '0 10px 24px rgba(37,99,235,0.18), inset 0 1px 0 rgba(255,255,255,0.24)'

function mk<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v))
  }
  if (parent) parent.appendChild(el)
  return el
}

function P(...coords: [number, number][]): string {
  return coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function PaymentsCard() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const hovElRef = useRef<HTMLDivElement | null>(null)

  const [active, setActive] = useState(2)
  const [hovered, setHovered] = useState(-1)

  const hideHoverTip = useCallback(() => {
    if (hovElRef.current) hovElRef.current.style.display = 'none'
  }, [])

  const showHoverTip = useCallback((bar: BarGeometry, barW: number, svgH: number) => {
    if (!hovElRef.current) {
      hovElRef.current = document.createElement('div')
      hovElRef.current.style.cssText = [
        'position:absolute',
        'pointer-events:none',
        'z-index:30',
      ].join(';')
      wrapperRef.current?.appendChild(hovElRef.current)
    }
    const { fx, fTopY, s } = bar
    const dc = s.drop < 0 ? '#EF4444' : '#22C55E'
    const wW = wrapperRef.current?.clientWidth ?? 0
    const tw = Math.min(382, Math.max(260, wW - 12))
    const th = 40
    const txMax = Math.max(4, wW - tw - 4)
    const txMin = Math.min(Math.max(fx, 4), txMax)
    const tx = clamp(fx + barW / 2 - tw / 2, txMin, txMax)
    const tyAbove = fTopY - th - 18
    const tyBelow = fTopY + 12
    const ty = tyAbove < 6 ? tyBelow : tyAbove
    hovElRef.current.style.left = `${tx}px`
    hovElRef.current.style.top = `${ty}px`
    hovElRef.current.style.transform = 'none'
    hovElRef.current.style.display = 'block'
    hovElRef.current.innerHTML = `
      <div style="background:${NEO_PANEL};border:1px solid rgba(255,255,255,.82);
        border-radius:20px;padding:0 18px;width:${tw}px;height:${th}px;line-height:${th}px;
        font-size:12.5px;font-family:'IBM Plex Mono',monospace;white-space:nowrap;
        box-shadow:${RAISED_SHADOW};overflow:hidden;text-overflow:ellipsis">
        <b style="color:${NEO_ACCENT}">${s.display}</b>
        <span style="color:${NEO_MUTED}"> transactions  ·  Conv: </span>
        <b style="color:${NEO_TEXT}">${s.conv}%</b>
        <span style="color:${NEO_MUTED}">  ·  Drop-off: </span>
        <b style="color:${dc}">${s.drop === 0 ? '—' : `${s.drop}%`}</b>
      </div>`
  }, [])

  const draw = useCallback(() => {
    const svg = svgRef.current
    const wrap = wrapperRef.current
    if (!svg || !wrap) return

    const W = wrap.clientWidth
    if (W < 10) return

    const n = STAGES.length
    const BAR_W = Math.floor((W - (n + 1) * DX) / n)
    if (BAR_W <= 0) return
    const STEP = BAR_W + DX
    const BASE_Y = CH + PT
    const SVG_H = CH + PT + 24

    svg.setAttribute('viewBox', `0 0 ${W} ${SVG_H}`)
    svg.innerHTML = ''

    const defs = mk('defs', {}, svg)

    const mkPat = (id: string, bg: string, lc: string, lw: number) => {
      const p = mk(
        'pattern',
        {
          id,
          patternUnits: 'userSpaceOnUse',
          width: 9,
          height: 9,
          patternTransform: 'rotate(45)',
        },
        defs,
      )
      mk('rect', { width: 9, height: 9, fill: bg }, p)
      mk('line', { x1: 0, y1: 0, x2: 0, y2: 9, stroke: lc, 'stroke-width': lw }, p)
    }
    mkPat('hF', 'rgba(185,212,255,.52)', 'rgba(88,130,245,.78)', 3.5)
    mkPat('hS', 'rgba(198,222,255,.36)', 'rgba(108,162,245,.56)', 2.8)

    const mkLG = (
      id: string,
      x1: string,
      y1: string,
      x2: string,
      y2: string,
      stops: [string, string][],
    ) => {
      const g = mk('linearGradient', { id, x1, y1, x2, y2, gradientUnits: 'objectBoundingBox' }, defs)
      stops.forEach(([offset, color]) => {
        const s = mk('stop', { offset }, g)
        s.style.stopColor = color
      })
    }
    mkLG('gFront', '0', '0', '0', '1', [
      ['0%', '#8DB8FF'],
      ['35%', '#5592FF'],
      ['100%', '#2B55D9'],
    ])
    mkLG('gSide', '0', '0', '1', '0', [
      ['0%', '#1A38C2'],
      ['100%', '#0F27A8'],
    ])
    mkLG('gTop', '0', '0', '1', '1', [
      ['0%', '#B0CAFF'],
      ['100%', '#78AAFF'],
    ])
    mkLG('gSheen', '0', '0', '0', '1', [
      ['0%', 'rgba(255,255,255,.42)'],
      ['40%', 'rgba(255,255,255,.06)'],
      ['100%', 'rgba(255,255,255,0)'],
    ])

    const mkGlow = (id: string, blur: number, colorMatrix: string) => {
      const f = mk('filter', { id, x: '-22%', y: '-25%', width: '144%', height: '155%' }, defs)
      mk('feGaussianBlur', { stdDeviation: blur, result: 'bl' }, f)
      mk('feColorMatrix', { in: 'bl', type: 'matrix', values: colorMatrix, result: 'gc' }, f)
      const m = mk('feMerge', {}, f)
      mk('feMergeNode', { in: 'gc' }, m)
      mk('feMergeNode', { in: 'SourceGraphic' }, m)
    }
    mkGlow('glA', 11, '0 0 0 0 0.13  0 0 0 0 0.32  0 0 0 0 1.00  0 0 0 0.88 0')
    mkGlow('glH', 6, '0 0 0 0 0.22  0 0 0 0 0.42  0 0 0 0 1.00  0 0 0 0.54 0')

    GRID_TICKS.forEach((t, idx) => {
      const y = Math.round(t * CH) + PT
      mk(
        'line',
        {
          x1: 0,
          y1: y,
          x2: W,
          y2: y,
          stroke: idx === 0 || idx === GRID_TICKS.length - 1 ? 'rgba(15,23,42,.07)' : 'rgba(15,23,42,.045)',
          'stroke-width': 0.9,
        },
        svg,
      )
      mk('line', { x1: 0, y1: y, x2: 8, y2: y, stroke: 'rgba(100,116,139,.24)', 'stroke-width': 1 }, svg)
    })

    mk('line', { x1: 0, y1: PT - 2, x2: 0, y2: BASE_Y + 2, stroke: 'rgba(100,116,139,.22)', 'stroke-width': 1.2 }, svg)

    const BARS: BarGeometry[] = STAGES.map((s, i) => {
      const bh = Math.round((s.value / MAX_VAL) * CH)
      const fx = i * STEP
      const fFlY = BASE_Y - i * DY
      const fTopY = fFlY - bh
      const bx = fx + DX
      const bFlY = BASE_Y - (i + 1) * DY
      const bTopY = fTopY - DY
      return { fx, fFlY, fTopY, bx, bFlY, bTopY, bh, s, i }
    })

    BARS.forEach(({ fx, fTopY, i }) => {
      const isA = i === active
      mk(
        'line',
        {
          x1: fx.toFixed(1),
          y1: 2,
          x2: fx.toFixed(1),
          y2: fTopY,
          stroke: isA ? 'rgba(37,99,235,.22)' : 'rgba(148,163,184,.24)',
          'stroke-width': isA ? 1.2 : 0.7,
          'stroke-dasharray': isA ? 'none' : '4 4',
        },
        svg,
      )
    })

    ;[...BARS].reverse().forEach(({ fx, fFlY, fTopY, bx, bFlY, bTopY, i }) => {
      const isA = i === active
      const isH = i === hovered
      mk(
        'polygon',
        {
          points: P([fx + BAR_W, fTopY], [bx + BAR_W, bTopY], [bx + BAR_W, bFlY], [fx + BAR_W, fFlY]),
          fill: isA ? 'url(#gSide)' : isH ? 'rgba(142,192,255,.90)' : 'rgba(160,202,255,.55)',
        },
        svg,
      )
      mk(
        'polygon',
        {
          points: P([fx + BAR_W, fTopY], [bx + BAR_W, bTopY], [bx + BAR_W, bFlY], [fx + BAR_W, fFlY]),
          fill: 'url(#hS)',
          opacity: 0.16,
        },
        svg,
      )
      mk(
        'polyline',
        {
          points: P([fx + BAR_W, fTopY], [bx + BAR_W, bTopY], [bx + BAR_W, bFlY], [fx + BAR_W, fFlY]),
          fill: 'none',
          stroke: isA ? 'rgba(50,90,215,.52)' : 'rgba(142,192,255,.38)',
          'stroke-width': 0.7,
        },
        svg,
      )
    })

    ;[...BARS].reverse().forEach(({ fx, fTopY, bx, bTopY, i }) => {
      const isA = i === active
      const isH = i === hovered
      mk(
        'polygon',
        {
          points: P([fx, fTopY], [bx, bTopY], [bx + BAR_W, bTopY], [fx + BAR_W, fTopY]),
          fill: isA ? 'url(#gTop)' : isH ? 'rgba(208,232,255,.97)' : 'rgba(218,235,255,.92)',
        },
        svg,
      )
      mk(
        'polyline',
        {
          points: P([fx, fTopY], [bx, bTopY], [bx + BAR_W, bTopY], [fx + BAR_W, fTopY], [fx, fTopY]),
          fill: 'none',
          stroke: isA ? 'rgba(92,152,255,.68)' : 'rgba(162,210,255,.52)',
          'stroke-width': 0.7,
        },
        svg,
      )
    })

    ;[...BARS].reverse().forEach(({ fx, fFlY, fTopY, bh, s, i }) => {
      const isA = i === active
      const isH = i === hovered
      const g = mk('g', {}, svg)
      g.style.cursor = 'pointer'

      if (isA) {
        mk('rect', { x: fx, y: fTopY, width: BAR_W, height: bh, fill: 'url(#gFront)', rx: 2, filter: 'url(#glA)' }, g)
        mk('rect', { x: fx, y: fTopY, width: BAR_W, height: bh, fill: 'url(#hF)', rx: 2, opacity: 0.34 }, g)
        mk(
          'rect',
          { x: fx + 1, y: fTopY + 1, width: BAR_W - 2, height: Math.min(bh * 0.34, 56), fill: 'url(#gSheen)', rx: 2 },
          g,
        )
      } else {
        mk('rect', { x: fx, y: fTopY, width: BAR_W, height: bh, fill: 'url(#hF)', rx: 2 }, g)
        if (isH) {
          mk('rect', { x: fx, y: fTopY, width: BAR_W, height: bh, fill: 'rgba(255,255,255,.18)', rx: 2 }, g)
          mk(
            'rect',
            { x: fx + BAR_W * 0.12, y: fTopY, width: BAR_W * 0.13, height: bh, fill: 'rgba(255,255,255,.24)', rx: 1 },
            g,
          )
        }
        mk(
          'rect',
          { x: fx + 1, y: fTopY + 1, width: BAR_W - 2, height: Math.min(bh * 0.34, 56), fill: 'url(#gSheen)', rx: 2 },
          g,
        )
      }

      mk('line', { x1: fx, y1: fTopY, x2: fx, y2: fFlY, stroke: 'rgba(255,255,255,.52)', 'stroke-width': 0.9 }, g)
      mk('line', { x1: fx, y1: fFlY, x2: fx + BAR_W, y2: fFlY, stroke: 'rgba(255,255,255,.26)', 'stroke-width': 0.6 }, g)

      if (isH && !isA) g.setAttribute('filter', 'url(#glH)')

      if (!isA) {
        mk(
          'rect',
          {
            x: fx + BAR_W / 2 - 15,
            y: fTopY - 24,
            width: 30,
            height: 8,
            rx: 4,
            fill: isH ? '#82B5FF' : 'rgba(147,197,255,.85)',
            opacity: isH ? 0.96 : 0.7,
          },
          g,
        )
      }

      const hit = mk('rect', { x: fx, y: PT - 10, width: BAR_W, height: CH + 30, fill: 'transparent' }, g)
      hit.style.cursor = 'pointer'
      hit.addEventListener('mouseenter', () => {
        setHovered(i)
        showHoverTip(BARS[i], BAR_W, SVG_H)
      })
      hit.addEventListener('mouseleave', () => {
        setHovered(-1)
        hideHoverTip()
      })
      hit.addEventListener('click', () => {
        setActive(i)
        setHovered(-1)
      })
    })

    const ab = BARS[active]
    const tw = Math.min(382, W - 12)
    const th = 40
    const tx = Math.min(Math.max(ab.fx + BAR_W / 2 - tw / 2, ab.fx), W - tw - 4)
    const tyA = ab.fTopY - th - 18
    const ty = tyA < 4 ? ab.fTopY + 12 : tyA

    const tg = mk('g', {}, svg)
    mk('rect', { x: tx + 1, y: ty + 4, width: tw, height: th, rx: 20, fill: 'rgba(212,220,232,.88)' }, tg)
    mk(
      'rect',
      {
        x: tx,
        y: ty,
        width: tw,
        height: th,
        rx: 20,
        fill: NEO_PANEL,
        stroke: 'rgba(255,255,255,.82)',
        'stroke-width': 0.8,
      },
      tg,
    )
    const tt = mk(
      'text',
      {
        x: tx + tw / 2,
        y: ty + 25,
        'text-anchor': 'middle',
        'font-family': "'IBM Plex Mono', monospace",
        'font-size': 12.5,
      },
      tg,
    )

    const span = (text: string, fill: string, weight: string) => {
      const ts = document.createElementNS(NS, 'tspan')
      ts.setAttribute('fill', fill)
      ts.style.fontWeight = weight
      ts.textContent = text
      tt.appendChild(ts)
    }
    const as = ab.s
    span(as.display, NEO_ACCENT, '700')
    span(' transactions  ·  Conv: ', NEO_MUTED, '400')
    span(`${as.conv}%`, NEO_TEXT, '600')
    span('  ·  Drop-off: ', NEO_MUTED, '400')
    span(as.drop === 0 ? '—' : `${as.drop}%`, as.drop < 0 ? '#EF4444' : '#22C55E', '600')
  }, [active, hideHoverTip, hovered, showHoverTip])

  useEffect(() => {
    const wrap = wrapperRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    return () => {
      if (hovElRef.current?.parentElement) {
        hovElRef.current.parentElement.removeChild(hovElRef.current)
      }
    }
  }, [])

  return (
    <>
      <style>{`
        @keyframes pf-blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      <div
        style={{
          background: NEO_BASE,
          borderRadius: 24,
          border: NEO_BORDER,
          boxShadow: SHELL_SHADOW,
          overflow: 'hidden',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.62)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: NEO_ACCENT,
                background: NEO_ACCENT_SOFT,
                borderRadius: 6,
                padding: '3px 8px',
                textTransform: 'uppercase',
                letterSpacing: '.5px',
                boxShadow: RAISED_SHADOW,
              }}
            >
              Funnel
            </span>
            <span style={{ fontSize: 18, fontWeight: 700, color: NEO_TEXT, letterSpacing: -0.3 }}>
              Payment Flow
            </span>
          </div>
          <button
            type="button"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: NEO_BORDER,
              background: NEO_PANEL,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: NEO_MUTED,
              fontSize: 14,
              boxShadow: RAISED_SHADOW,
            }}
          >
            ...
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            position: 'relative',
            paddingLeft: Y_COL_OFFSET,
            background: NEO_BASE,
            boxShadow: INSET_SHADOW,
          }}
        >
          {STAGES.map((s, i) => {
            const isA = i === active
            return (
              <div
                key={s.full}
                onClick={() => {
                  setActive(i)
                  setHovered(-1)
                }}
                style={{
                  flex: 1,
                  padding: '14px 16px 15px',
                  minHeight: 86,
                  cursor: 'pointer',
                  borderRight: i < STAGES.length - 1 ? '1px solid rgba(255,255,255,0.55)' : 'none',
                  borderBottom: isA ? `2px solid ${NEO_ACCENT}` : '2px solid transparent',
                  transition: 'all .18s',
                  background: isA
                    ? NEO_PANEL
                    : 'transparent',
                  boxShadow: isA ? ACTIVE_SHADOW : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 500,
                    letterSpacing: '.24px',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                    color: isA ? NEO_ACCENT : '#94A3B8',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    transition: 'color .18s',
                  }}
                >
                  {s.full}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    letterSpacing: -0.9,
                    color: isA ? NEO_TEXT : '#A8B4C5',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontVariantNumeric: 'tabular-nums',
                    transition: 'color .18s',
                  }}
                >
                  {s.display}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', padding: 0, marginTop: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
              alignItems: 'center',
              width: Y_COL_OFFSET,
              boxSizing: 'border-box',
              padding: '12px 8px 28px 14px',
              borderRight: '1px solid rgba(255,255,255,0.58)',
              background: NEO_BASE,
              boxShadow: INSET_SHADOW,
            }}
          >
            {Y_LABELS.map((l) => (
              <span
                key={l}
                style={{
                  fontSize: 11,
                  color: NEO_MUTED,
                  textAlign: 'right',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 600,
                  letterSpacing: '.1px',
                }}
              >
                {l}
              </span>
            ))}
          </div>

          <div ref={wrapperRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <svg ref={svgRef} style={{ width: '100%', display: 'block', overflow: 'visible' }} height={CH + PT + 24} />
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            background: NEO_BASE,
            borderTop: '1px solid rgba(255,255,255,0.6)',
            padding: '14px 18px 18px',
            overflow: 'hidden',
            boxShadow: INSET_SHADOW,
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 180,
              height: 180,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 72%)',
              right: -60,
              top: -80,
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 10px',
                borderRadius: 999,
                border: NEO_BORDER,
                background: NEO_PANEL,
                color: NEO_ACCENT,
                fontSize: 11.5,
                fontWeight: 600,
                boxShadow: RAISED_SHADOW,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                <path d="M7 1l1.5 4h4l-3 2.5 1 4L7 9l-3.5 2.5 1-4L1.5 5h4z" fill="#2563EB" />
              </svg>
              What would you like to explore next?
            </div>

            <button
              type="button"
              style={{
                border: NEO_BORDER,
                background: NEO_PANEL,
                color: NEO_TEXT,
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: RAISED_SHADOW,
              }}
            >
              Suggestions
            </button>
          </div>

          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 7,
              background: NEO_PANEL,
              borderRadius: 12,
              padding: '11px 14px',
              border: NEO_BORDER,
              fontSize: 13,
              color: NEO_MUTED,
              boxShadow: INSET_SHADOW,
            }}
          >
            <span style={{ fontWeight: 500 }}>I want to know what caused the drop-off from authorized to</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: NEO_ACCENT_SOFT,
                border: '1px solid rgba(37,99,235,.24)',
                borderRadius: 7,
                padding: '3px 11px',
                color: NEO_ACCENT,
                fontWeight: 600,
                fontSize: 12,
                flexShrink: 0,
                boxShadow: RAISED_SHADOW,
              }}
            >
              /successful payments
            </span>
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 14,
                background: NEO_ACCENT,
                borderRadius: 1,
                verticalAlign: 'middle',
                flexShrink: 0,
                animation: 'pf-blink 1s step-end infinite',
              }}
            />
          </div>

          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {['Compare by bank', 'Show failed cohorts', 'Retry impact'].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                style={{
                  border: NEO_BORDER,
                  background: NEO_PANEL,
                  color: NEO_TEXT,
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  boxShadow: RAISED_SHADOW,
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
