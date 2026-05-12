'use client'

import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'

import type { ConnectivityGraphProps, Edge, NodeStatus } from './types'
import { formatINRCompact } from './mockOpsCommandCenter'

const VB = { w: 760, h: 600 }
const ZORD = 'zord'
const CARD_W = 220
const CARD_W_PCT = (CARD_W / VB.w) * 100

const LAYOUT: Record<string, { top?: number; left?: number; right?: number; bottom?: number; cx?: boolean }> = {
  loan: { top: 36, left: 12 },
  banks: { top: 298, left: 12 },
  payment: { top: 36, right: 12 },
  mandate: { top: 298, right: 12 },
  other: { bottom: 12, cx: true },
}

function cardStyle(id: string): CSSProperties {
  const L = LAYOUT[id]
  if (!L) return { display: 'none' }
  const s: CSSProperties = { width: `${CARD_W_PCT}%` }
  if (L.cx) {
    s.left = '50%'
    s.transform = 'translateX(-50%)'
    if (L.bottom != null) s.bottom = `${(L.bottom / VB.h) * 100}%`
    return s
  }
  if (L.top != null) s.top = `${(L.top / VB.h) * 100}%`
  if (L.left != null) s.left = `${(L.left / VB.w) * 100}%`
  if (L.right != null) s.right = `${(L.right / VB.w) * 100}%`
  if (L.bottom != null) s.bottom = `${(L.bottom / VB.h) * 100}%`
  return s
}

function nodeAccent(st: NodeStatus) {
  if (st === 'HEALTHY') return { ring: 'ring-emerald-500/25', dot: 'bg-emerald-500', label: 'Healthy' }
  if (st === 'DELAYED') return { ring: 'ring-amber-400/35', dot: 'bg-amber-500', label: 'Delayed' }
  return { ring: 'ring-red-500/35', dot: 'bg-red-500', label: 'Attention' }
}

function edgeOk(edges: Edge[], from: string) {
  const e = edges.find((x) => x.from === from && x.to === ZORD)
  return (e?.status ?? 'NORMAL') === 'NORMAL'
}

function EdgeLayer({ edgeOkFn }: { edgeOkFn: (from: string) => boolean }) {
  const g = (ok: boolean) => (ok ? '#BBF7D0' : '#FDE68A')
  const s = (ok: boolean) => (ok ? '#22C55E' : '#F59E0B')
  const cls = (ok: boolean) => (ok ? 'skg-flow-green' : 'skg-flow-amber')

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="380" cy="292" r="162" fill="none" stroke="#E4E4DE" strokeWidth="1" strokeDasharray="5 7" />
      <circle cx="380" cy="292" r="136" fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="1" />

      <path d="M 224 110 Q 292 168 315 238" fill="none" stroke={g(edgeOkFn('loan'))} strokeWidth="10" strokeLinecap="round" />
      <path d="M 224 110 Q 292 168 315 238" fill="none" stroke={s(edgeOkFn('loan'))} strokeWidth="2" strokeLinecap="round" className={cls(edgeOkFn('loan'))} />

      <path d="M 224 378 Q 290 360 316 338" fill="none" stroke={g(edgeOkFn('banks'))} strokeWidth="10" strokeLinecap="round" />
      <path d="M 224 378 Q 290 360 316 338" fill="none" stroke={s(edgeOkFn('banks'))} strokeWidth="2" strokeLinecap="round" className={cls(edgeOkFn('banks'))} />

      <path d="M 536 110 Q 468 168 445 238" fill="none" stroke={g(edgeOkFn('payment'))} strokeWidth="10" strokeLinecap="round" />
      <path d="M 536 110 Q 468 168 445 238" fill="none" stroke={s(edgeOkFn('payment'))} strokeWidth="2" strokeLinecap="round" className={cls(edgeOkFn('payment'))} />

      <path d="M 536 378 Q 470 360 444 338" fill="none" stroke={g(edgeOkFn('mandate'))} strokeWidth="10" strokeLinecap="round" />
      <path d="M 536 378 Q 470 360 444 338" fill="none" stroke={s(edgeOkFn('mandate'))} strokeWidth="2" strokeLinecap="round" className={cls(edgeOkFn('mandate'))} />

      <path d="M 380 500 L 380 357" fill="none" stroke={g(edgeOkFn('other'))} strokeWidth="10" strokeLinecap="round" />
      <path d="M 380 500 L 380 357" fill="none" stroke={s(edgeOkFn('other'))} strokeWidth="2" strokeLinecap="round" className={cls(edgeOkFn('other'))} />
    </svg>
  )
}

export function ConnectivityGraph({ nodes, edges, fetchedAt, staleThresholdMs = 120_000 }: ConnectivityGraphProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  const stale = useMemo(() => {
    const age = Date.now() - new Date(fetchedAt).getTime()
    return Number.isFinite(age) && age > staleThresholdMs
  }, [fetchedAt, staleThresholdMs])

  const edgeOkFn = (id: string) => edgeOk(edges, id)
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])

  if (stale) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
        <p className="text-base font-semibold text-amber-900">Connectivity graph unavailable</p>
        <p className="mt-2 text-base text-amber-800/90">
          Snapshot is older than {Math.round(staleThresholdMs / 1000)}s (Service 2). Refresh to load a fresh topology.
        </p>
      </section>
    )
  }

  if (nodes.length > 10) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center text-base text-red-900">
        Too many nodes ({nodes.length}). Max supported is 10 for ops readability.
      </section>
    )
  }

  const hoverNode = hoverId ? byId[hoverId] : null

  return (
    <section className="relative overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm" aria-label="Connectivity graph">
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-2 sm:px-5">
        <h2 className="text-[14px] font-semibold uppercase tracking-wide text-[#6b7280]">Connectivity graph</h2>
        <span className="text-[12px] tabular-nums text-[#9ca3af]">Service 2 · as of {new Date(fetchedAt).toLocaleTimeString('en-IN')}</span>
      </div>

      <div className="relative isolate mx-auto w-full" style={{ height: 'min(720px, 70vh)', minHeight: 480 }}>
        <EdgeLayer edgeOkFn={edgeOkFn} />

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[15] -translate-x-1/2 -translate-y-1/2 scale-[1.05] sm:scale-110">
          <div
            className="skg-center-glow absolute left-1/2 top-1/2 h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.18)_0%,transparent_70%)]"
            aria-hidden
          />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[172px] w-[172px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-dashed border-[rgba(99,102,241,0.2)]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[148px] w-[148px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(99,102,241,0.12)]" />
          <div
            className="relative flex h-32 w-32 flex-col items-center justify-center gap-0.5 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_12px_48px_rgba(55,48,163,0.45)]"
            style={{ background: 'linear-gradient(150deg, #5B54E8 0%, #3730A3 50%, #2D27A0 100%)' }}
          >
            <span className="text-[12px] font-extrabold tracking-[0.18em] text-white">ZORD</span>
            <span className="text-[9px] font-medium tracking-[0.18em] text-white/50">CONSOLE</span>
            <span className="mt-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
              Hub
            </span>
          </div>
        </div>

        {nodes.map((n) => {
          if (!LAYOUT[n.id]) return null
          const acc = nodeAccent(n.status)
          return (
            <div
              key={n.id}
              className={`skg-sys-card absolute z-20 cursor-default rounded-2xl border border-black/10 bg-white p-3 shadow-md ring-2 transition ${acc.ring}`}
              style={cardStyle(n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId((id) => (id === n.id ? null : id))}
              role="group"
              aria-label={n.label}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold text-[#111827]">{n.label}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${acc.dot}`} title={acc.label} />
              </div>
              <p className="mt-1 text-[12px] text-[#6b7280]">
                {acc.label} · edge {edgeOkFn(n.id) ? 'normal' : 'delayed'}
              </p>

              {hoverId === n.id ? (
                <div className="pointer-events-none absolute left-1/2 top-full z-[40] mt-2 w-[min(100%,240px)] -translate-x-1/2 rounded-xl border border-black/10 bg-[#111827] px-3 py-2.5 text-left text-[12px] leading-snug text-white shadow-xl">
                  <div>Volume: {formatINRCompact(n.volume)}</div>
                  <div>Signal health: {n.signalHealthScore}</div>
                  <div>Ambiguity: {n.ambiguityRate.toFixed(1)}%</div>
                  <div className="opacity-80">
                    Last update:{' '}
                    {Number.isNaN(Date.parse(n.lastUpdated))
                      ? n.lastUpdated
                      : new Date(n.lastUpdated).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'short' })}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
