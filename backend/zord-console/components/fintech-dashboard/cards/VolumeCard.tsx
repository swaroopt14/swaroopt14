'use client'

import { useEffect, useState } from 'react'

type RowItem = {
  label: string
  amt: string
  pct: number
  color: string
}

type VolumeData = {
  total: string
  pct: string
  rows: RowItem[]
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', sans-serif"

const DATA: VolumeData = {
  total: '$41,540',
  pct: '15%',
  rows: [
    { label: 'Online Payments', amt: '$26,800', pct: 65, color: '#22C55E' },
    { label: 'Subscriptions', amt: '$10,400', pct: 40, color: '#3B82F6' },
    { label: 'In-Store Sales', amt: '$4,340', pct: 20, color: '#EF4444' },
  ],
}

function HatchBar({ pct, color }: { pct: number; color: string }) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    setWidth(0)
    const timeout = window.setTimeout(() => setWidth(pct), 80)
    return () => window.clearTimeout(timeout)
  }, [pct])

  return (
    <div
      style={{
        height: 14,
        borderRadius: 100,
        background: '#EFF2F4',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          borderRadius: 100,
          background: color,
          backgroundImage:
            'repeating-linear-gradient(-45deg, rgba(255,255,255,0.30) 0, rgba(255,255,255,0.30) 3px, transparent 3px, transparent 8px)',
          transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
    </div>
  )
}

function Row({ row }: { row: RowItem }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 9,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 400,
            color: '#8A8A8A',
            fontFamily: FONT_STACK,
          }}
        >
          {row.label}
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: '#0A0A0A',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: FONT_STACK,
          }}
        >
          {row.amt}
        </span>
      </div>
      <HatchBar pct={row.pct} color={row.color} />
    </div>
  )
}

export function VolumeCard() {
  return (
    <div
      style={{
        background: '#FFFFFF',
        borderRadius: 20,
        border: '1px solid #E8E5E0',
        padding: 0,
        height: '100%',
        fontFamily: FONT_STACK,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'box-shadow .2s',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#6366F1',
              background: '#EEF2FF',
              borderRadius: 6,
              padding: '3px 8px',
              textTransform: 'uppercase',
              letterSpacing: '.5px',
            }}
          >
            Volume
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: '#0F0F0F',
              fontFamily: FONT_STACK,
            }}
          >
            Gross Volume
          </h2>
        </div>
        <button
          type="button"
          aria-label="More options"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid #ECEAE6',
            background: '#F5F4F2',
            cursor: 'pointer',
            fontSize: 14,
            color: '#C4C4C4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ...
        </button>
      </div>

      <div
        style={{
          padding: '18px 24px 14px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          marginBottom: 20,
        }}
      >
        <span
          style={{
            fontSize: 'clamp(54px, 5.8vw, 72px)',
            fontWeight: 700,
            letterSpacing: '-2px',
            color: '#0A0A0A',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 0.95,
            fontFamily: FONT_STACK,
          }}
        >
          {DATA.total}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F0FDF4',
            border: '1px solid rgba(34,197,94,0.20)',
            borderRadius: 100,
            padding: '6px 12px',
            fontSize: 15,
            fontWeight: 600,
            color: '#16A34A',
            fontFamily: FONT_STACK,
          }}
        >
          {DATA.pct}
        </span>
      </div>

      <div style={{ height: 1, background: '#EEF1F4', margin: '0 24px 18px' }} />

      <div style={{ padding: '0 24px 8px' }}>
        {DATA.rows.map((row) => (
          <Row key={row.label} row={row} />
        ))}
      </div>
    </div>
  )
}
