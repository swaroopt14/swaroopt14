'use client'

import type { CSSProperties } from 'react'
import { DM_Sans } from 'next/font/google'
import { useCallback, useEffect, useMemo, useState } from 'react'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

/** Design “virtual” canvas — wide + tall so cards sit near corners and link labels fit in the middle. */
const VB = { w: 960, h: 800 }

type EdgeKey = 'loan' | 'banks' | 'payment' | 'mandate' | 'other'

type SystemKey = EdgeKey

type Health = 'ok' | 'warn'

/** Card width in design coordinates — inset from edges so cards stay inside the diagram */
const CARD_W = 208
const CARD_W_PCT = (CARD_W / VB.w) * 100

const SYSTEM_LAYOUT: Record<
  SystemKey,
  { top?: number; left?: number; right?: number; bottom?: number; centerX?: boolean }
> = {
  /** Tight to top-left / top-right corners */
  loan: { top: 10, left: 2 },
  payment: { top: 10, right: 2 },
  /** Lower row clears the hub; wires arc through open space for status pills */
  banks: { top: 532, left: 2 },
  mandate: { top: 532, right: 2 },
  /** Bottom-center; `bottom` inset keeps the card below the lower spokes */
  other: { bottom: 22, centerX: true },
}

const SYSTEM_DETAILS: Record<
  SystemKey,
  {
    title: string
    subtitle: string
    connectionSummary: string
    protocol: string
    latencyMs: number
    endpoint: string
    whatsHappening: string
    history: { t: string; msg: string }[]
  }
> = {
  loan: {
    title: 'Loan System',
    subtitle: 'SAP / LMS',
    connectionSummary: 'Primary LMS feed into Zord for disbursement batches, tranche state, and borrower obligations.',
    protocol: 'HTTPS + mTLS · OData-style entity sync',
    latencyMs: 120,
    endpoint: 'lms.prod.internal:443 /v2/disbursements/stream',
    whatsHappening:
      'Incremental sync is pulling the latest tranche updates for today’s payout window. No schema drift detected; watermark advancing normally.',
    history: [
      { t: '2 min ago', msg: 'Full delta sync completed — 1.2k rows' },
      { t: '14 min ago', msg: 'Heartbeat OK; SLA within bounds' },
      { t: '1 hr ago', msg: 'Schema contract v2.4 acknowledged' },
    ],
  },
  banks: {
    title: 'Banks',
    subtitle: 'Multiple banks',
    connectionSummary: 'Bank confirmation webhooks and polling for NEFT/RTGS/UPI final statuses tied to disbursement IDs.',
    protocol: 'REST webhooks + signed callbacks',
    latencyMs: 890,
    endpoint: 'bank-gateway.zord.internal /callbacks/*',
    whatsHappening:
      'A subset of partner banks is slower to ACK confirmations today. Retries are spaced with exponential backoff; no hard failures in the last hour.',
    history: [
      { t: '4 min ago', msg: 'Webhook burst — 3 banks > p95 latency' },
      { t: '22 min ago', msg: 'Manual reconcile job queued' },
      { t: '48 min ago', msg: 'SBI path recovered after 6m delay' },
    ],
  },
  payment: {
    title: 'Payment Partner',
    subtitle: 'Razorpay',
    connectionSummary: 'Settlement and payout status from the payment processor, including UTR mapping and reversals.',
    protocol: 'REST + HMAC-signed payloads',
    latencyMs: 410,
    endpoint: 'api.razorpay.com /v1/settlements',
    whatsHappening:
      'Settlement file ingestion is running behind schedule. Zord is holding downstream notifications until settlement IDs reconcile.',
    history: [
      { t: '1 min ago', msg: 'Settlement poll returned partial page' },
      { t: '9 min ago', msg: 'Retry #2 succeeded — 180 events' },
      { t: '31 min ago', msg: 'Rate limit backoff applied (60s)' },
    ],
  },
  mandate: {
    title: 'Mandate System',
    subtitle: 'NACH (NPCI)',
    connectionSummary: 'Debit mandate registration, presentation, and bounce signals for EMI collections.',
    protocol: 'NPCI ISO XML over SFTP bridge',
    latencyMs: 210,
    endpoint: 'nach-bridge.zord.internal /presentations/out',
    whatsHappening:
      'Presentation file for the afternoon slot was accepted. Some mandates remain in “pending authorization” until sponsor bank ACK.',
    history: [
      { t: '6 min ago', msg: 'ACK file ingested — 94 mandates' },
      { t: '35 min ago', msg: 'Bounce file empty (expected)' },
      { t: '3 hr ago', msg: 'Registration batch closed' },
    ],
  },
  other: {
    title: 'Other Platforms',
    subtitle: 'Analytics, KYC, Credit Bureau',
    connectionSummary: 'Supporting enrichment: bureau pulls, KYC vault checks, and analytics feature store for risk scoring.',
    protocol: 'gRPC + JSON fallbacks',
    latencyMs: 95,
    endpoint: 'enrichment.zord.internal /batch',
    whatsHappening:
      'Low-volume async jobs are draining normally. Feature store lag is under 2 minutes for all consumers.',
    history: [
      { t: '3 min ago', msg: 'Bureau cache warm — hit ratio 0.94' },
      { t: '18 min ago', msg: 'KYC vault diff sync — 40 docs' },
      { t: '2 hr ago', msg: 'Analytics rollup job OK' },
    ],
  },
}

/** Stable reference time for SSR + first client paint (must match `MOCK_GRAPH_NOW_MS` base). */
const MOCK_GRAPH_NOW_MS = 1_748_064_000_000

function formatUpdated(lastSyncMs: number, nowMs: number) {
  const sec = Math.floor((nowMs - lastSyncMs) / 1000)
  if (sec < 10) return 'Updated just now'
  if (sec < 60) return `Updated ${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min === 1) return 'Updated 1 min ago'
  if (min < 60) return `Updated ${min} min ago`
  const hr = Math.floor(min / 60)
  return hr === 1 ? 'Updated 1 hour ago' : `Updated ${hr} hours ago`
}

function useMockKnowledgeGraph() {
  const [clockMs, setClockMs] = useState<number | null>(null)
  const [health, setHealth] = useState<Record<SystemKey, Health>>({
    loan: 'ok',
    banks: 'warn',
    payment: 'warn',
    mandate: 'ok',
    other: 'ok',
  })
  const [lastSync, setLastSync] = useState<Record<SystemKey, number>>(() => ({
    loan: MOCK_GRAPH_NOW_MS - 120_000,
    banks: MOCK_GRAPH_NOW_MS - 900_000,
    payment: MOCK_GRAPH_NOW_MS - 420_000,
    mandate: MOCK_GRAPH_NOW_MS - 300_000,
    other: MOCK_GRAPH_NOW_MS - 180_000,
  }))

  const nowMs = clockMs ?? MOCK_GRAPH_NOW_MS

  useEffect(() => {
    setClockMs(Date.now())
    const id = window.setInterval(() => setClockMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      setLastSync((prev) => {
        const keys = Object.keys(prev) as SystemKey[]
        const pick = keys[Math.floor(Math.random() * keys.length)]!
        return { ...prev, [pick]: Date.now() - Math.floor(Math.random() * 4000) }
      })
      setHealth((prev) => {
        if (Math.random() > 0.35) return prev
        const next = { ...prev }
        if (Math.random() < 0.5) next.banks = prev.banks === 'warn' ? 'ok' : 'warn'
        if (Math.random() < 0.5) next.payment = prev.payment === 'warn' ? 'ok' : 'warn'
        return next
      })
    }, 5000)
    return () => window.clearInterval(id)
  }, [])

  const edgeOk = (k: EdgeKey) => health[k] === 'ok'

  const insight = useMemo(() => {
    const delayed = (['banks', 'payment'] as const).filter((k) => health[k] === 'warn').length
    if (delayed >= 2) {
      return (
        <>
          All systems are connected. Minor delays observed in bank <strong className="font-semibold text-[#0F0F0F]">confirmations may impact pending disbursements.</strong>
        </>
      )
    }
    if (health.banks === 'warn' || health.payment === 'warn') {
      return (
        <>
          Feeds are live; <strong className="font-semibold text-[#0F0F0F]">one partner path is slower than usual.</strong> Disbursement windows remain open — watch settlement ACKs.
        </>
      )
    }
    return (
      <>
        All links are within SLA. <strong className="font-semibold text-[#0F0F0F]">Mock telemetry</strong> refreshes timestamps every second.
      </>
    )
  }, [health])

  const delayed = (Object.keys(health) as SystemKey[]).filter((k) => health[k] === 'warn').length
  const connected = (Object.keys(health) as SystemKey[]).filter((k) => health[k] === 'ok').length
  const stalest = Math.min(...Object.values(lastSync))
  const syncTitle = formatUpdated(stalest, nowMs).replace(/^Updated\s+/i, '')

  return { health, edgeOk, lastSync, insight, connected, delayed, syncTitle, nowMs }
}

function EdgePaths({
  edgeOk,
  onEdgeSelect,
}: {
  edgeOk: (k: EdgeKey) => boolean
  onEdgeSelect: (k: EdgeKey) => void
}) {
  const g = (ok: boolean) => (ok ? '#BBF7D0' : '#FDE68A')
  const s = (ok: boolean) => (ok ? '#22C55E' : '#F59E0B')
  const cls = (ok: boolean) => (ok ? 'skg-flow-green' : 'skg-flow-amber')

  const hit = (d: string, k: EdgeKey) => (
    <path
      d={d}
      fill="none"
      stroke="transparent"
      strokeWidth={28}
      strokeLinecap="round"
      className="cursor-pointer"
      onClick={() => onEdgeSelect(k)}
    />
  )

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      role="presentation"
    >
      <circle cx="480" cy="400" r="118" fill="none" stroke="#E4E4DE" strokeWidth="1" strokeDasharray="5 7" pointerEvents="none" />
      <circle cx="480" cy="400" r="98" fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="1" pointerEvents="none" />

      {hit('M 218 78 Q 308 205 405 318', 'loan')}
      <path d="M 218 78 Q 308 205 405 318" fill="none" stroke={g(edgeOk('loan'))} strokeWidth="10" strokeLinecap="round" pointerEvents="none" />
      <path
        d="M 218 78 Q 308 205 405 318"
        fill="none"
        stroke={s(edgeOk('loan'))}
        strokeWidth="2"
        strokeLinecap="round"
        className={cls(edgeOk('loan'))}
        pointerEvents="none"
      />
      <circle cx="290" cy="188" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />
      <circle cx="340" cy="248" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />

      {hit('M 218 598 Q 312 455 405 378', 'banks')}
      <path d="M 218 598 Q 312 455 405 378" fill="none" stroke={g(edgeOk('banks'))} strokeWidth="10" strokeLinecap="round" pointerEvents="none" />
      <path
        d="M 218 598 Q 312 455 405 378"
        fill="none"
        stroke={s(edgeOk('banks'))}
        strokeWidth="2"
        strokeLinecap="round"
        className={cls(edgeOk('banks'))}
        pointerEvents="none"
      />
      <circle cx="288" cy="518" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />
      <circle cx="340" cy="438" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />

      {hit('M 742 78 Q 652 205 555 318', 'payment')}
      <path d="M 742 78 Q 652 205 555 318" fill="none" stroke={g(edgeOk('payment'))} strokeWidth="10" strokeLinecap="round" pointerEvents="none" />
      <path
        d="M 742 78 Q 652 205 555 318"
        fill="none"
        stroke={s(edgeOk('payment'))}
        strokeWidth="2"
        strokeLinecap="round"
        className={cls(edgeOk('payment'))}
        pointerEvents="none"
      />
      <circle cx="670" cy="188" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />
      <circle cx="620" cy="248" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />

      {hit('M 742 598 Q 648 455 555 378', 'mandate')}
      <path d="M 742 598 Q 648 455 555 378" fill="none" stroke={g(edgeOk('mandate'))} strokeWidth="10" strokeLinecap="round" pointerEvents="none" />
      <path
        d="M 742 598 Q 648 455 555 378"
        fill="none"
        stroke={s(edgeOk('mandate'))}
        strokeWidth="2"
        strokeLinecap="round"
        className={cls(edgeOk('mandate'))}
        pointerEvents="none"
      />
      <circle cx="672" cy="518" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />
      <circle cx="620" cy="438" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />

      {hit('M 480 712 L 480 392', 'other')}
      <path d="M 480 712 L 480 392" fill="none" stroke={g(edgeOk('other'))} strokeWidth="10" strokeLinecap="round" pointerEvents="none" />
      <path
        d="M 480 712 L 480 392"
        fill="none"
        stroke={s(edgeOk('other'))}
        strokeWidth="2"
        strokeLinecap="round"
        className={cls(edgeOk('other'))}
        pointerEvents="none"
      />
      <circle cx="480" cy="628" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />
      <circle cx="480" cy="538" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />
      <circle cx="480" cy="452" r="4" fill="#6366F1" stroke="white" strokeWidth="1.5" pointerEvents="none" />
    </svg>
  )
}

function ClIconCheck() {
  return (
    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" aria-hidden>
      <polyline points="20 6 9 17 4 12" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClIconWarn() {
  return (
    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" aria-hidden>
      <line x1="12" y1="8" x2="12" y2="13" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.2" fill="#D97706" />
    </svg>
  )
}

function ConnLabel({
  ok,
  line1,
  line2,
  style,
  label,
  systemId,
  onSelect,
}: {
  ok: boolean
  line1: string
  line2: string
  style: CSSProperties
  label: string
  systemId: SystemKey
  onSelect: (k: SystemKey) => void
}) {
  const border = ok ? '1.5px solid #BBF7D0' : '1.5px solid #FDE68A'
  const bg = ok ? '#F0FDF4' : '#FFFBEB'
  const color = ok ? '#16A34A' : '#D97706'

  return (
    <button
      type="button"
      className="absolute z-[13] flex max-w-[min(132px,38vw)] cursor-pointer items-center gap-2 rounded-lg border border-black/[0.07] bg-white px-2 py-1.5 text-left shadow-[0_2px_14px_rgba(15,23,42,0.08)] outline-none ring-indigo-500/0 transition hover:border-indigo-200/80 hover:shadow-[0_4px_18px_rgba(15,23,42,0.1)] hover:ring-2 hover:ring-indigo-400/35 focus-visible:ring-2 focus-visible:ring-indigo-400/45 sm:max-w-[150px]"
      style={style}
      title={`${line1} · ${line2}`}
      aria-label={`${label}: ${line1} ${line2}. Open connection details.`}
      onClick={() => onSelect(systemId)}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.05)]" style={{ background: bg, border }}>
        {ok ? <ClIconCheck /> : <ClIconWarn />}
      </div>
      <span className="min-w-0 leading-[1.2]">
        <span className="block text-[10.5px] font-semibold tracking-[-0.02em] sm:text-[11.5px]" style={{ color }}>
          {line1}
        </span>
        <span className="mt-0.5 block text-[10.5px] font-semibold tracking-[-0.02em] sm:text-[11.5px]" style={{ color }}>
          {line2}
        </span>
      </span>
    </button>
  )
}

function InfoIco() {
  return (
    <span className="inline-flex text-[#9A9A95]">
      <svg width="13" height="13" fill="none" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function ClockIco() {
  return (
    <svg width="11" height="11" fill="none" viewBox="0 0 24 24" className="shrink-0 text-[#9A9A95]" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SystemDetailDrawer({
  systemId,
  health,
  lastSyncMs,
  nowMs,
  onClose,
}: {
  systemId: SystemKey
  health: Health
  lastSyncMs: number
  nowMs: number
  onClose: () => void
}) {
  const d = SYSTEM_DETAILS[systemId]
  const ok = health === 'ok'

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] cursor-default bg-black/25 backdrop-blur-[2px]"
        aria-label="Close details"
        onClick={onClose}
      />
      <aside
        className="fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-lg flex-col border-l border-[rgba(0,0,0,0.08)] bg-white shadow-[-8px_0_40px_rgba(0,0,0,0.12)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skg-detail-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.07)] px-5 py-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6366F1]">Connection details</p>
            <h2 id="skg-detail-title" className="mt-1 text-xl font-bold tracking-[-0.03em] text-[#0F0F0F]">
              {d.title}
            </h2>
            <p className="mt-0.5 text-base text-[#9A9A95]">{d.subtitle}</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F8F8F5] px-3 py-1.5 text-base font-semibold text-[#0F0F0F] transition hover:bg-[#F2F2EF]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section className="rounded-xl border border-[rgba(0,0,0,0.07)] bg-[#F8F8F5] p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-[#555550]">Health</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-base font-semibold ${
                  ok ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]' : 'border-[#FDE68A] bg-[#FFFBEB] text-[#D97706]'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${ok ? 'skg-badge-dot-pulse bg-[#22C55E]' : 'bg-[#F59E0B]'}`} />
                {ok ? 'Connected' : 'Delayed'}
              </span>
              <span className="text-base text-[#555550]">Last sync · {formatUpdated(lastSyncMs, nowMs)}</span>
            </div>
            <p className="mt-3 text-base leading-relaxed text-[#555550]">{d.connectionSummary}</p>
          </section>

          <section className="mt-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-[#555550]">Connection</h3>
            <dl className="mt-2 space-y-2 text-base">
              <div className="flex justify-between gap-4 border-b border-[rgba(0,0,0,0.06)] py-2">
                <dt className="text-[#9A9A95]">Protocol</dt>
                <dd className="max-w-[60%] text-right font-medium text-[#0F0F0F]">{d.protocol}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[rgba(0,0,0,0.06)] py-2">
                <dt className="text-[#9A9A95]">p95 latency (mock)</dt>
                <dd className="font-mono text-[#0F0F0F]">{d.latencyMs} ms</dd>
              </div>
              <div className="flex flex-col gap-1 py-2">
                <dt className="text-[#9A9A95]">Endpoint</dt>
                <dd className="break-all rounded-md bg-[#F8F8F5] px-2 py-1.5 font-mono text-sm text-[#312E81]">{d.endpoint}</dd>
              </div>
            </dl>
          </section>

          <section className="mt-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-[#555550]">What&apos;s happening</h3>
            <p className="mt-2 text-base leading-relaxed text-[#0F0F0F]">{d.whatsHappening}</p>
          </section>

          <section className="mt-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-[#555550]">History</h3>
            <ul className="mt-2 space-y-2">
              {d.history.map((row) => (
                <li key={row.t + row.msg} className="flex gap-3 rounded-lg border border-[rgba(0,0,0,0.06)] bg-white px-3 py-2.5">
                  <span className="shrink-0 font-mono text-sm text-[#9A9A95]">{row.t}</span>
                  <span className="text-base text-[#555550]">{row.msg}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </>
  )
}

function cardPositionStyle(layout: (typeof SYSTEM_LAYOUT)[SystemKey]): CSSProperties {
  const s: CSSProperties = { width: `${CARD_W_PCT}%` }
  if (layout.centerX) {
    s.left = '50%'
    s.transform = 'translateX(-50%)'
    if (layout.bottom != null) s.bottom = `${(layout.bottom / VB.h) * 100}%`
    return s
  }
  if (layout.top != null) s.top = `${(layout.top / VB.h) * 100}%`
  if (layout.bottom != null) s.bottom = `${(layout.bottom / VB.h) * 100}%`
  if (layout.left != null) s.left = `${(layout.left / VB.w) * 100}%`
  if (layout.right != null) s.right = `${(layout.right / VB.w) * 100}%`
  return s
}

export function LiveSyncSurface() {
  const { health, edgeOk, lastSync, insight, connected, delayed, syncTitle, nowMs } = useMockKnowledgeGraph()
  const [selected, setSelected] = useState<SystemKey | null>(null)

  const open = useCallback((k: SystemKey) => setSelected(k), [])
  const close = useCallback(() => setSelected(null), [])

  useEffect(() => {
    if (selected == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, close])

  const loanOk = edgeOk('loan')
  const banksOk = edgeOk('banks')
  const payOk = edgeOk('payment')
  const manOk = edgeOk('mandate')
  const othOk = edgeOk('other')

  const healthPct = Math.min(99, 92 + connected * 2 - delayed)

  return (
    <div
      className={`${dmSans.className} relative -mx-4 min-h-[calc(100dvh-7rem)] w-[calc(100%+2rem)] bg-[#F2F2EF] pb-6 sm:-mx-6 sm:w-[calc(100%+3rem)] lg:min-h-[calc(100dvh-8.5rem)]`}
    >
      <div className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* AI Insight strip + inline legend chips — replaces duplicate header */}
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-2.5 rounded-[12px] border border-[#E5E5E5] bg-white px-3.5 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0" aria-hidden>
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" fill="#4F46E5" />
            </svg>
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#4F46E5]">AI Insight · </span>
              <span className="text-[13px] leading-[1.55] text-[#475569]">{insight}</span>
            </div>
          </div>

          {/* Legend chips — replaces the right sidebar */}
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#64748b]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />Connected
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />Delayed
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />Needs attention
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#fafafa] px-2 py-0.5 font-medium text-[#475569]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D1D5DB]" aria-hidden />Disconnected
            </span>
          </div>
      </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-5">
          <div className="relative isolate z-0 min-h-0 w-full min-w-0 flex-1 overflow-hidden rounded-[18px] border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]">
            <div className="flex min-h-[min(620px,calc(100dvh-18rem))] items-center justify-center bg-[radial-gradient(ellipse_85%_65%_at_50%_42%,#fafaf8_0%,#ffffff_55%,#f6f6f3_100%)] px-3 py-5 sm:px-5 sm:py-6">
              <div
                className="relative w-full max-w-[min(100%,1080px)] shrink-0"
                style={{ aspectRatio: `${VB.w} / ${VB.h}` }}
              >
            <EdgePaths edgeOk={edgeOk} onEdgeSelect={open} />

            <ConnLabel
              systemId="loan"
              onSelect={open}
              ok={loanOk}
              line1="Syncing"
              line2="Normally"
              label="Loan → Zord link"
              style={{ left: `${(318 / VB.w) * 100}%`, top: `${(198 / VB.h) * 100}%`, transform: 'translate(-50%, -50%)' }}
            />
            <ConnLabel
              systemId="banks"
              onSelect={open}
              ok={banksOk}
              line1="Confirmation"
              line2="Delays"
              label="Banks → Zord link"
              style={{ left: `${(312 / VB.w) * 100}%`, top: `${(472 / VB.h) * 100}%`, transform: 'translate(-50%, -50%)' }}
            />
            <ConnLabel
              systemId="payment"
              onSelect={open}
              ok={payOk}
              line1="Delayed"
              line2="Updates"
              label="Payment → Zord link"
              style={{ right: `${(318 / VB.w) * 100}%`, top: `${(198 / VB.h) * 100}%`, transform: 'translate(50%, -50%)' }}
            />
            <ConnLabel
              systemId="mandate"
              onSelect={open}
              ok={manOk}
              line1="Syncing"
              line2="Normally"
              label="Mandate → Zord link"
              style={{ right: `${(318 / VB.w) * 100}%`, top: `${(472 / VB.h) * 100}%`, transform: 'translate(50%, -50%)' }}
            />
            <ConnLabel
              systemId="other"
              onSelect={open}
              ok={othOk}
              line1="Syncing"
              line2="Normally"
              label="Other platforms → Zord link"
              style={{ left: '50%', top: `${(548 / VB.h) * 100}%`, transform: 'translate(calc(-50% + 26px), -50%)' }}
            />

            <div className="pointer-events-none absolute left-1/2 top-1/2 z-[15] -translate-x-1/2 -translate-y-1/2 scale-[0.98] sm:scale-[1.02]">
              <div
                className="skg-center-glow absolute left-1/2 top-1/2 h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.2)_0%,transparent_70%)]"
                aria-hidden
              />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[188px] w-[188px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-dashed border-[rgba(99,102,241,0.22)]" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[160px] w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(99,102,241,0.14)]" />
              <div
                className="relative flex h-36 w-36 flex-col items-center justify-center gap-0.5 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_12px_48px_rgba(55,48,163,0.5),0_4px_16px_rgba(55,48,163,0.3)]"
                style={{
                  background: 'linear-gradient(150deg, #5B54E8 0%, #3730A3 50%, #2D27A0 100%)',
                }}
              >
                <svg width="40" height="40" viewBox="0 0 44 44" fill="none" aria-hidden>
                  <path d="M9 11h18L14 22h16L9 33h18" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="text-[13px] font-extrabold tracking-[0.18em] text-white">ZORD</div>
                <div className="mt-px text-[9px] font-medium tracking-[0.18em] text-white/50">CONSOLE</div>
                <div className="mt-2 flex items-center gap-1.5 rounded-full border border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.18)] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#4ADE80]">
                  <span className="skg-badge-dot-pulse h-[5px] w-[5px] rounded-full bg-[#4ADE80]" aria-hidden />
                  Healthy
                </div>
              </div>
            </div>

            <button
              type="button"
              className="skg-sys-card absolute z-20 cursor-pointer rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-4 pb-3.5 pt-4 text-left shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_8px_28px_-6px_rgba(15,23,42,0.12)] outline-none ring-1 ring-black/[0.03] transition hover:ring-2 hover:ring-indigo-400/25 focus-visible:ring-2"
              style={cardPositionStyle(SYSTEM_LAYOUT.loan)}
              onClick={() => open('loan')}
              aria-label="Open Loan System connection details"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#EEF2FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <rect x="3" y="10" width="18" height="11" rx="2" stroke="#4F46E5" strokeWidth="1.8" />
                  <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div className="mb-0.5 flex items-center gap-1 text-[16px] font-bold tracking-[-0.015em] text-[#0F0F0F]">
                Loan System
                <InfoIco />
          </div>
              <div className="mb-2.5 text-sm tracking-[-0.005em] text-[#9A9A95] sm:text-[14px]">SAP / LMS</div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold tracking-[0.01em] sm:text-[14px] ${
                  health.loan === 'ok'
                    ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]'
                    : 'border-[#FDE68A] bg-[#FFFBEB] text-[#D97706]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${health.loan === 'ok' ? 'skg-badge-dot-pulse bg-[#22C55E]' : 'bg-[#F59E0B]'}`}
                  aria-hidden
                />
                {health.loan === 'ok' ? 'Connected' : 'Delayed'}
              </span>
              <div className="mb-2 mt-2 text-[14px] leading-[1.55] tracking-[-0.005em] text-[#555550]">Data syncing normally</div>
              <div className="mt-1 flex items-center gap-1.5 border-t border-[rgba(0,0,0,0.07)] pt-2 text-[12px] tracking-[-0.005em] text-[#9A9A95]">
                <ClockIco />
                <span className="tabular-nums">{formatUpdated(lastSync.loan, nowMs)}</span>
            </div>
            </button>

            <button
              type="button"
              className="skg-sys-card absolute z-20 cursor-pointer rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-4 pb-3.5 pt-4 text-left shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_8px_28px_-6px_rgba(15,23,42,0.12)] outline-none ring-1 ring-black/[0.03] transition hover:ring-2 hover:ring-indigo-400/25 focus-visible:ring-2"
              style={cardPositionStyle(SYSTEM_LAYOUT.banks)}
              onClick={() => open('banks')}
              aria-label="Open Banks connection details"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#F0FDF4] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <rect x="3" y="10" width="18" height="11" rx="2" stroke="#16A34A" strokeWidth="1.8" />
                  <path d="M12 3L3 9h18L12 3z" stroke="#16A34A" strokeWidth="1.8" strokeLinejoin="round" />
                  <line x1="7" y1="14" x2="7" y2="17" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="12" y1="14" x2="12" y2="17" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="17" y1="14" x2="17" y2="17" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
          </div>
              <div className="mb-0.5 flex items-center gap-1 text-[16px] font-bold tracking-[-0.015em] text-[#0F0F0F]">
                Banks
                <InfoIco />
                </div>
              <div className="mb-2.5 text-sm tracking-[-0.005em] text-[#9A9A95] sm:text-[14px]">Multiple banks</div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold tracking-[0.01em] sm:text-[14px] ${
                  health.banks === 'ok'
                    ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]'
                    : 'border-[#FDE68A] bg-[#FFFBEB] text-[#D97706]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${health.banks === 'ok' ? 'skg-badge-dot-pulse bg-[#22C55E]' : 'bg-[#F59E0B]'}`}
                  aria-hidden
                />
                {health.banks === 'ok' ? 'Connected' : 'Delayed'}
              </span>
              <div className="mb-2 mt-2 text-[14px] leading-[1.55] tracking-[-0.005em] text-[#555550]">
                {health.banks === 'warn' ? 'Confirmation delays observed' : 'Confirmations flowing normally'}
              </div>
              <div className="mt-1 flex items-center gap-1.5 border-t border-[rgba(0,0,0,0.07)] pt-2 text-[12px] tracking-[-0.005em] text-[#9A9A95]">
                <ClockIco />
                <span className="tabular-nums">{formatUpdated(lastSync.banks, nowMs)}</span>
          </div>
            </button>

            <button
              type="button"
              className="skg-sys-card absolute z-20 cursor-pointer rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-4 pb-3.5 pt-4 text-left shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_8px_28px_-6px_rgba(15,23,42,0.12)] outline-none ring-1 ring-black/[0.03] transition hover:ring-2 hover:ring-indigo-400/25 focus-visible:ring-2"
              style={cardPositionStyle(SYSTEM_LAYOUT.payment)}
              onClick={() => open('payment')}
              aria-label="Open Payment Partner connection details"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#EFF6FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <rect x="2" y="5" width="20" height="14" rx="3" stroke="#2563EB" strokeWidth="1.8" />
                  <line x1="2" y1="10" x2="22" y2="10" stroke="#2563EB" strokeWidth="1.8" />
                  <rect x="5" y="14" width="4" height="2" rx="1" fill="#2563EB" />
                </svg>
              </div>
              <div className="mb-0.5 flex items-center gap-1 text-[16px] font-bold tracking-[-0.015em] text-[#0F0F0F]">
                Payment Partner
                <InfoIco />
          </div>
              <div className="mb-2.5 text-sm tracking-[-0.005em] text-[#9A9A95] sm:text-[14px]">Razorpay</div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold tracking-[0.01em] sm:text-[14px] ${
                  health.payment === 'ok'
                    ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]'
                    : 'border-[#FDE68A] bg-[#FFFBEB] text-[#D97706]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${health.payment === 'ok' ? 'skg-badge-dot-pulse bg-[#22C55E]' : 'bg-[#F59E0B]'}`}
                  aria-hidden
                />
                {health.payment === 'ok' ? 'Connected' : 'Delayed'}
              </span>
              <div className="mb-2 mt-2 text-[14px] leading-[1.55] tracking-[-0.005em] text-[#555550]">
                {health.payment === 'warn' ? 'Minor delay in settlement updates' : 'Settlement feed within SLA'}
              </div>
              <div className="mt-1 flex items-center gap-1.5 border-t border-[rgba(0,0,0,0.07)] pt-2 text-[12px] tracking-[-0.005em] text-[#9A9A95]">
                <ClockIco />
                <span className="tabular-nums">{formatUpdated(lastSync.payment, nowMs)}</span>
              </div>
            </button>

            <button
              type="button"
              className="skg-sys-card absolute z-20 cursor-pointer rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-4 pb-3.5 pt-4 text-left shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_8px_28px_-6px_rgba(15,23,42,0.12)] outline-none ring-1 ring-black/[0.03] transition hover:ring-2 hover:ring-indigo-400/25 focus-visible:ring-2"
              style={cardPositionStyle(SYSTEM_LAYOUT.mandate)}
              onClick={() => open('mandate')}
              aria-label="Open Mandate System connection details"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#F0FDFA] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <rect x="4" y="3" width="16" height="18" rx="3" stroke="#0D9488" strokeWidth="1.8" />
                  <line x1="8" y1="8" x2="16" y2="8" stroke="#0D9488" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="8" y1="12" x2="14" y2="12" stroke="#0D9488" strokeWidth="1.5" strokeLinecap="round" />
                  <polyline points="8,16 10,18 14,14" stroke="#0D9488" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </div>
              <div className="mb-0.5 flex items-center gap-1 text-[16px] font-bold tracking-[-0.015em] text-[#0F0F0F]">
                Mandate System
                <InfoIco />
            </div>
              <div className="mb-2.5 text-sm tracking-[-0.005em] text-[#9A9A95] sm:text-[14px]">NACH (NPCI)</div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold tracking-[0.01em] sm:text-[14px] ${
                  health.mandate === 'ok'
                    ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]'
                    : 'border-[#FDE68A] bg-[#FFFBEB] text-[#D97706]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${health.mandate === 'ok' ? 'skg-badge-dot-pulse bg-[#22C55E]' : 'bg-[#F59E0B]'}`}
                  aria-hidden
                />
                {health.mandate === 'ok' ? 'Connected' : 'Delayed'}
              </span>
              <div className="mb-2 mt-2 text-[14px] leading-[1.55] tracking-[-0.005em] text-[#555550]">Some mandates pending authorization</div>
              <div className="mt-1 flex items-center gap-1.5 border-t border-[rgba(0,0,0,0.07)] pt-2 text-[12px] tracking-[-0.005em] text-[#9A9A95]">
                <ClockIco />
                <span className="tabular-nums">{formatUpdated(lastSync.mandate, nowMs)}</span>
          </div>
            </button>

            <button
              type="button"
              className="skg-sys-card absolute z-20 cursor-pointer rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-4 pb-3.5 pt-4 text-left shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_8px_28px_-6px_rgba(15,23,42,0.12)] outline-none ring-1 ring-black/[0.03] transition hover:ring-2 hover:ring-indigo-400/25 focus-visible:ring-2"
              style={cardPositionStyle(SYSTEM_LAYOUT.other)}
              onClick={() => open('other')}
              aria-label="Open Other Platforms connection details"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#F5F3FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="3" stroke="#7C3AED" strokeWidth="1.8" />
                  <path
                    d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"
                    stroke="#7C3AED"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
            </svg>
          </div>
              <div className="mb-0.5 flex items-center gap-1 text-[16px] font-bold tracking-[-0.015em] text-[#0F0F0F]">
                Other Platforms
                <InfoIco />
      </div>
              <div className="mb-2.5 text-sm tracking-[-0.005em] text-[#9A9A95] sm:text-[14px]">Analytics, KYC, Credit Bureau</div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold tracking-[0.01em] sm:text-[14px] ${
                  health.other === 'ok'
                    ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]'
                    : 'border-[#FDE68A] bg-[#FFFBEB] text-[#D97706]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${health.other === 'ok' ? 'skg-badge-dot-pulse bg-[#22C55E]' : 'bg-[#F59E0B]'}`}
                  aria-hidden
                />
                {health.other === 'ok' ? 'Connected' : 'Delayed'}
              </span>
              <div className="mb-2 mt-2 text-[14px] leading-[1.55] tracking-[-0.005em] text-[#555550]">Data syncing normally</div>
              <div className="mt-1 flex items-center gap-1.5 border-t border-[rgba(0,0,0,0.07)] pt-2 text-[12px] tracking-[-0.005em] text-[#9A9A95]">
                <ClockIco />
                <span className="tabular-nums">{formatUpdated(lastSync.other, nowMs)}</span>
            </div>
            </button>
          </div>
            </div>
          </div>

            </div>

        {/* Bottom KPI strip — unified card system (matches Connector Intelligence + Outcomes) */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              eyebrow: 'Systems connected',
              value: String(connected),
              sub: 'All internal systems integrated',
              accent: 'border-l-emerald-500',
              eyebrowTone: 'text-emerald-700',
              dot: 'bg-emerald-500',
            },
            {
              eyebrow: 'Overall last sync',
              value: syncTitle,
              sub: 'Most recent successful update',
              accent: 'border-l-sky-500',
              eyebrowTone: 'text-sky-700',
              dot: 'bg-sky-500',
              isText: true,
            },
            {
              eyebrow: 'Systems delayed',
              value: String(delayed),
              sub: delayed > 0 ? 'Bank & Payment Partner' : 'No delays detected',
              accent: 'border-l-amber-500',
              eyebrowTone: 'text-amber-700',
              dot: 'bg-amber-500',
            },
            {
              eyebrow: 'Connectivity health',
              value: `${healthPct}%`,
              sub: 'Overall system health score',
              accent: 'border-l-emerald-500',
              eyebrowTone: 'text-emerald-700',
              dot: 'bg-emerald-500',
            },
          ].map((row) => (
            <article
              key={row.eyebrow}
              className={`rounded-[16px] border border-[#E5E5E5] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border-l-[3px] ${row.accent}`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${row.dot}`} aria-hidden />
                <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${row.eyebrowTone}`}>
                  {row.eyebrow}
                </p>
              </div>
              <p
                className={`mt-3 font-light leading-none tracking-[-0.02em] tabular-nums text-[#0f172a] ${
                  row.isText ? 'text-[19px]' : 'text-[29px]'
                }`}
              >
                {row.value}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-[#64748b]">{row.sub}</p>
            </article>
          ))}
        </div>
      </div>

      {selected != null && (
        <SystemDetailDrawer
          systemId={selected}
          health={health[selected]}
          lastSyncMs={lastSync[selected]}
          nowMs={nowMs}
          onClose={close}
        />
      )}
    </div>
  )
}
