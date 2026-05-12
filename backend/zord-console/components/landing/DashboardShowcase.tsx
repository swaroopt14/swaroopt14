'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'

type HttpMethod = 'GET' | 'POST' | 'PUT'

type BarDatum = {
  label: string
  value: number
  amount: string
}

type LogRecord = {
  id: number
  time: string
  method: HttpMethod
  route: string
  status: number
  ms: number
}

const INITIAL_BARS: BarDatum[] = [
  { label: '06', value: 0.34, amount: '2.8 Cr' },
  { label: '08', value: 0.48, amount: '3.9 Cr' },
  { label: '10', value: 0.62, amount: '5.1 Cr' },
  { label: '12', value: 0.57, amount: '4.7 Cr' },
  { label: '14', value: 0.86, amount: '7.2 Cr' },
  { label: '16', value: 0.68, amount: '5.8 Cr' },
  { label: '18', value: 0.74, amount: '6.1 Cr' },
  { label: '20', value: 0.51, amount: '4.2 Cr' },
]

const LOG_TEMPLATES = [
  { method: 'POST' as const, route: '/v2/payouts/intent', status: 201, ms: [38, 42, 46, 51] },
  { method: 'POST' as const, route: '/v2/reconcile/batch', status: 200, ms: [112, 118, 124, 129] },
  { method: 'POST' as const, route: '/v2/routing/engine', status: 200, ms: [11, 14, 16, 19] },
  { method: 'GET' as const, route: '/v2/providers/health', status: 200, ms: [4, 6, 7, 9] },
  { method: 'GET' as const, route: '/v2/payouts/status', status: 200, ms: [8, 10, 11, 14] },
  { method: 'PUT' as const, route: '/v2/proof/export', status: 202, ms: [27, 33, 38, 44] },
]

const PROVIDER_ROWS = [
  { name: 'Cashfree (Primary)', status: '99.9%', tone: 'green', meta: 'Fastest IMPS path' },
  { name: 'Razorpay (Failover)', status: '99.2%', tone: 'green', meta: 'Healthy failover' },
  { name: 'Yes Bank UPI', status: '91.4%', tone: 'yellow', meta: 'Slow confirmations' },
  { name: 'HDFC NEFT', status: '97.8%', tone: 'green', meta: 'Stable batch window' },
]

const ROUTING_ROWS = [
  { label: 'IMPS < 50K', value: '64%', width: '64%' },
  { label: 'UPI Merchant Payouts', value: '21%', width: '21%' },
  { label: 'NEFT Batch Fallback', value: '15%', width: '15%' },
]

const INITIAL_LOGS: LogRecord[] = [
  { id: 1, time: '12:04:21', method: 'POST', route: '/v2/payouts/intent', status: 201, ms: 42 },
  { id: 2, time: '12:04:22', method: 'POST', route: '/v2/reconcile/batch', status: 200, ms: 120 },
  { id: 3, time: '12:04:23', method: 'POST', route: '/v2/routing/engine', status: 200, ms: 12 },
  { id: 4, time: '12:04:24', method: 'GET', route: '/v2/providers/health', status: 200, ms: 5 },
  { id: 5, time: '12:04:25', method: 'PUT', route: '/v2/proof/export', status: 202, ms: 31 },
  { id: 6, time: '12:04:26', method: 'GET', route: '/v2/payouts/status', status: 200, ms: 9 },
]

const STATIC_ACTIVE_NODES = new Set([2, 5, 7, 9, 10, 14, 15, 17, 19, 21, 23])

const DASHBOARD_SHOWCASE_CSS = `
  .zdb-shell {
    contain: layout style;
  }

  .zdb-grid-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse at top, rgba(102, 51, 238, 0.28), transparent 56%),
      radial-gradient(circle at 85% 16%, rgba(59, 130, 246, 0.16), transparent 22%),
      radial-gradient(circle at 18% 82%, rgba(168, 85, 247, 0.14), transparent 28%);
  }

  .zdb-grid-mesh {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(ellipse 82% 76% at 50% 48%, black, transparent 84%);
    -webkit-mask-image: radial-gradient(ellipse 82% 76% at 50% 48%, black, transparent 84%);
  }

  .zdb-bento-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 18px;
  }

  .zdb-card {
    position: relative;
    min-height: 280px;
    padding: 28px;
    border-radius: 22px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%),
      rgba(9, 10, 18, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 18px 44px rgba(0, 0, 0, 0.34),
      inset 0 1px 0 rgba(255,255,255,0.06),
      inset 0 -20px 60px rgba(102, 51, 238, 0.04);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    overflow: hidden;
    isolation: isolate;
  }

  .zdb-card::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(140deg, rgba(255,255,255,0.08), transparent 35%, transparent 70%, rgba(168,85,247,0.08));
    opacity: 0.7;
  }

  .zdb-card:hover {
    border-color: rgba(168, 85, 247, 0.25);
    transform: translateY(-4px);
    box-shadow:
      0 28px 68px rgba(0, 0, 0, 0.42),
      0 0 0 1px rgba(168,85,247,0.08),
      inset 0 1px 0 rgba(255,255,255,0.08),
      inset 0 -24px 80px rgba(102, 51, 238, 0.06);
  }

  .zdb-card-wide {
    grid-column: span 2;
    min-height: 340px;
  }

  .zdb-kicker {
    margin-bottom: 12px;
    color: rgba(196, 181, 253, 0.92);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .zdb-card h3 {
    color: #fff;
    font-size: 28px;
    line-height: 1.08;
    letter-spacing: -0.04em;
    font-weight: 600;
    margin: 0;
  }

  .zdb-card p {
    color: rgba(255,255,255,0.58);
    font-size: 15px;
    line-height: 1.7;
    margin: 12px 0 0;
    max-width: 44ch;
  }

  .zdb-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
  }

  .zdb-pill,
  .zdb-log-summary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    border-radius: 999px;
    padding: 9px 12px;
    color: rgba(255,255,255,0.72);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .zdb-log-summary span + span::before {
    content: '•';
    margin-right: 8px;
    color: rgba(255,255,255,0.28);
  }

  .zdb-bars-widget {
    margin-top: 28px;
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 12px;
    align-items: end;
    min-height: 220px;
  }

  .zdb-bar-group {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 220px;
  }

  .zdb-bar-tooltip {
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translate(-50%, -12px);
    border-radius: 12px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.12);
    padding: 6px 9px;
    font-size: 10px;
    color: #fff;
    letter-spacing: 0.04em;
    opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s ease;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .zdb-bar-group:hover .zdb-bar-tooltip {
    opacity: 1;
    transform: translate(-50%, -18px);
  }

  .zdb-bar-rail {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    width: 100%;
    flex: 1;
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
    border: 1px solid rgba(255,255,255,0.05);
    overflow: hidden;
  }

  .zdb-bar-fill {
    width: 100%;
    height: 60%;
    border-radius: 14px 14px 0 0;
    background:
      linear-gradient(180deg, rgba(216, 180, 254, 0.95) 0%, rgba(168, 85, 247, 0.92) 42%, rgba(102, 51, 238, 0.88) 100%);
    box-shadow: 0 16px 36px rgba(102, 51, 238, 0.28);
    position: relative;
    overflow: hidden;
    transform-origin: bottom;
  }

  .zdb-bar-fill::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);
    transform: translateX(-130%);
    animation: zdb-line-shimmer 4.4s linear infinite;
  }

  .zdb-bar-fill.is-hot {
    background: linear-gradient(180deg, rgba(253, 230, 138, 0.95) 0%, rgba(245, 158, 11, 0.92) 45%, rgba(168, 85, 247, 0.88) 100%);
    box-shadow: 0 18px 42px rgba(245, 158, 11, 0.22);
  }

  .zdb-bar-meta {
    margin-top: 12px;
    color: rgba(255,255,255,0.5);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .zdb-logs-widget {
    margin-top: 22px;
    display: grid;
    gap: 10px;
  }

  .zdb-log-line {
    display: grid;
    grid-template-columns: 72px 64px 1fr auto;
    gap: 12px;
    align-items: center;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.03);
    border-radius: 14px;
    padding: 12px 14px;
    font-family: var(--font-zord-mono, 'IBM Plex Mono', monospace);
    font-size: 11px;
    color: rgba(255,255,255,0.72);
  }

  .zdb-log-time {
    color: rgba(255,255,255,0.36);
  }

  .zdb-log-method {
    display: inline-flex;
    justify-content: center;
    border-radius: 999px;
    padding: 5px 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .zdb-log-method.method-post {
    background: rgba(102, 51, 238, 0.18);
    color: #d8b4fe;
  }

  .zdb-log-method.method-get {
    background: rgba(59, 130, 246, 0.16);
    color: #93c5fd;
  }

  .zdb-log-method.method-put {
    background: rgba(16, 185, 129, 0.14);
    color: #6ee7b7;
  }

  .zdb-log-route {
    color: rgba(255,255,255,0.78);
  }

  .zdb-log-latency {
    color: rgba(255,255,255,0.42);
    white-space: nowrap;
  }

  .zdb-status-widget,
  .zdb-progress-widget {
    margin-top: 20px;
    display: grid;
    gap: 14px;
  }

  .zdb-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.03);
    border-radius: 16px;
    padding: 14px 14px 13px;
  }

  .zdb-status-label {
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .zdb-status-meta {
    margin-top: 4px;
    color: rgba(255,255,255,0.42);
    font-size: 12px;
  }

  .zdb-status-value {
    font-family: var(--font-zord-mono, 'IBM Plex Mono', monospace);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }

  .zdb-status-value.green {
    color: #86efac;
  }

  .zdb-status-value.yellow {
    color: #fcd34d;
  }

  .zdb-progress-item {
    display: grid;
    gap: 8px;
  }

  .zdb-progress-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: rgba(255,255,255,0.72);
    font-size: 13px;
  }

  .zdb-progress-track {
    height: 11px;
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.04);
  }

  .zdb-progress-fill {
    height: 100%;
    width: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(102,51,238,0.95), rgba(168,85,247,0.95));
    box-shadow: 0 0 24px rgba(168,85,247,0.28);
  }

  .zdb-node-grid {
    margin-top: 20px;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
  }

  .zdb-node {
    height: 36px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.03);
    position: relative;
    overflow: hidden;
  }

  .zdb-node::after {
    content: '';
    position: absolute;
    inset: 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.08);
    transition: transform 0.28s ease, background 0.28s ease, box-shadow 0.28s ease;
  }

  .zdb-node.active::after {
    background: linear-gradient(135deg, rgba(167,139,250,1), rgba(59,130,246,0.95));
    box-shadow: 0 0 20px rgba(102,51,238,0.45);
    transform: scale(1.06);
  }

  .zdb-metrics-widget {
    margin-top: 22px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .zdb-mini-metric {
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.03);
    padding: 18px 14px;
    text-align: center;
  }

  .zdb-metric-value {
    color: #fff;
    font-size: 28px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: -0.04em;
    font-family: var(--font-zord-mono, 'IBM Plex Mono', monospace);
  }

  .zdb-metric-value.accent {
    color: #c4b5fd;
  }

  .zdb-metric-value.green {
    color: #86efac;
  }

  .zdb-metric-label {
    margin-top: 8px;
    color: rgba(255,255,255,0.48);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .zdb-footnote {
    margin-top: 20px;
    color: rgba(255,255,255,0.42);
    font-size: 12px;
    line-height: 1.7;
  }

  @keyframes zdb-line-shimmer {
    0% { transform: translateX(-130%); }
    100% { transform: translateX(130%); }
  }

  @media (max-width: 1180px) {
    .zdb-bento-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .zdb-card-wide {
      grid-column: span 2;
    }
  }

  @media (max-width: 760px) {
    .zdb-shell {
      padding: 72px 18px 84px;
    }

    .zdb-bento-grid {
      grid-template-columns: 1fr;
    }

    .zdb-card,
    .zdb-card-wide {
      grid-column: span 1;
      min-height: auto;
      padding: 22px;
    }

    .zdb-card-head {
      flex-direction: column;
      align-items: flex-start;
    }

    .zdb-bars-widget {
      gap: 8px;
      min-height: 180px;
    }

    .zdb-log-line {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .zdb-node-grid,
    .zdb-metrics-widget {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
`

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function formatClock(date: Date) {
  return date.toTimeString().slice(0, 8)
}

function buildLog(id: number): LogRecord {
  const template = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)]
  const ms = template.ms[Math.floor(Math.random() * template.ms.length)]

  return {
    id,
    time: formatClock(new Date()),
    method: template.method,
    route: template.route,
    status: template.status,
    ms,
  }
}

function useCountUp(target: number, decimals = 0, duration = 1400) {
  const shouldReduceMotion = useReducedMotion()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (shouldReduceMotion) {
      setValue(target)
      return
    }

    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = target * eased
      setValue(Number(next.toFixed(decimals)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [decimals, duration, shouldReduceMotion, target])

  return value
}

function RevealCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.article
      className={className}
      initial={shouldReduceMotion ? undefined : { opacity: 0, y: 24 }}
      whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={shouldReduceMotion ? undefined : { duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.article>
  )
}

export function DashboardShowcase() {
  const shouldReduceMotion = useReducedMotion()
  const [bars, setBars] = useState(INITIAL_BARS)
  const [logs, setLogs] = useState(INITIAL_LOGS)
  const [activeNodes, setActiveNodes] = useState<number[]>(Array.from(STATIC_ACTIVE_NODES))

  const autoRouted = useCountUp(92)
  const feeSaved = useCountUp(14)
  const avgLatency = useCountUp(22)
  const verified = useCountUp(14712, 0, 1600)

  useEffect(() => {
    if (shouldReduceMotion) return

    const barTimer = setInterval(() => {
      setBars((prev) =>
        prev.map((bar, index) => {
          const drift = (Math.random() - 0.5) * (index === 4 ? 0.1 : 0.16)
          const next = clamp(bar.value + drift, 0.22, 0.96)
          return {
            ...bar,
            value: next,
            amount: `${(next * 8.4).toFixed(1)} Cr`,
          }
        }),
      )
    }, 2200)

    return () => clearInterval(barTimer)
  }, [shouldReduceMotion])

  useEffect(() => {
    const logTimer = setInterval(() => {
      setLogs((prev) => {
        const nextId = prev[prev.length - 1]?.id ? prev[prev.length - 1].id + 1 : 1
        return [...prev.slice(-5), buildLog(nextId)]
      })
    }, 2500)

    return () => clearInterval(logTimer)
  }, [])

  useEffect(() => {
    if (shouldReduceMotion) return

    const nodeTimer = setInterval(() => {
      setActiveNodes((prev) => {
        const next = new Set(prev)
        const index = Math.floor(Math.random() * 24)
        if (next.has(index)) {
          next.delete(index)
        } else {
          next.add(index)
        }
        return Array.from(next).sort((a, b) => a - b)
      })
    }, 1200)

    return () => clearInterval(nodeTimer)
  }, [shouldReduceMotion])

  const totalLogs = useMemo(
    () =>
      logs.reduce(
        (acc, item) => {
          acc.requests += 1
          acc.avgLatency += item.ms
          return acc
        },
        { requests: 0, avgLatency: 0 },
      ),
    [logs],
  )

  const averageLogLatency = totalLogs.requests ? Math.round(totalLogs.avgLatency / totalLogs.requests) : 0

  return (
    <section className="relative mx-auto mt-24 w-[min(100%-24px,1440px)] px-0 md:w-[min(100%-40px,1540px)]" id="dashboard-preview">
      <div className="zdb-shell relative overflow-hidden rounded-[36px] border border-white/8 bg-[#09090d] px-5 py-20 md:px-8 xl:px-10">
        <div className="zdb-grid-glow" />
        <div className="zdb-grid-mesh" />

        <div className="text-center mb-16 relative z-10 space-y-4">
          <div className="inline-flex items-center rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/40">
            Dashboard Preview
          </div>
          <h2 className="text-[32px] md:text-[46px] font-semibold text-white tracking-tight">
            One place to see everything.
          </h2>
          <p className="text-[16px] text-white/60 max-w-[500px] mx-auto">
            Reduce failed payments, know where your money is in real time, and be completely audit-ready.
          </p>
        </div>

        <div className="zdb-bento-grid relative z-10">
          <RevealCard className="zdb-card zdb-card-wide">
            <div className="zdb-kicker">Payout Visibility</div>
            <div className="zdb-card-head">
              <div>
                <h3>Real-Time Payout Volume</h3>
                <p>Track live throughput across RTGS, IMPS, and UPI routing pipelines.</p>
              </div>
              <div className="zdb-pill">Peak window: 14:00</div>
            </div>
            <div className="zdb-bars-widget">
              {bars.map((bar, index) => (
                <div key={bar.label} className="zdb-bar-group group">
                  <div className="zdb-bar-tooltip">{bar.amount}</div>
                  <div className="zdb-bar-rail">
                    <motion.div
                      className={`zdb-bar-fill ${index === 4 ? 'is-hot' : ''}`}
                      animate={{ height: `${Math.round(bar.value * 100)}%` }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <div className="zdb-bar-meta">
                    <span>{bar.label}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="zdb-footnote">Daily verified payouts: {verified.toLocaleString('en-IN')} with live route switching enabled.</div>
          </RevealCard>

          <RevealCard className="zdb-card zdb-card-wide">
            <div className="zdb-kicker">Intent Stream</div>
            <div className="zdb-card-head">
              <div>
                <h3>Live Intent Stream</h3>
                <p>Watch the orchestration engine receive payloads, reconcile outcomes, and publish proof records.</p>
              </div>
              <div className="zdb-log-summary">
                <span>{logs.length} live traces</span>
                <span>{averageLogLatency}ms avg</span>
              </div>
            </div>
            <div className="zdb-logs-widget">
              {logs.map((log) => (
                <motion.div
                  key={log.id}
                  className="zdb-log-line"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <span className="zdb-log-time">{log.time}</span>
                  <span className={`zdb-log-method method-${log.method.toLowerCase()}`}>{log.method}</span>
                  <span className="zdb-log-route">{log.route}</span>
                  <span className="zdb-log-latency">{log.status} · {log.ms}ms</span>
                </motion.div>
              ))}
            </div>
            <div className="zdb-footnote">Auto-refreshing orchestration trace across payouts, reconcile, routing, and proof APIs.</div>
          </RevealCard>

          <RevealCard className="zdb-card">
            <div className="zdb-kicker">Provider Health</div>
            <h3>Health by Provider</h3>
            <p>Know why routing shifts before payout failures start stacking up.</p>
            <div className="zdb-status-widget">
              {PROVIDER_ROWS.map((row) => (
                <div key={row.name} className="zdb-status-row">
                  <div>
                    <div className="zdb-status-label">{row.name}</div>
                    <div className="zdb-status-meta">{row.meta}</div>
                  </div>
                  <span className={`zdb-status-value ${row.tone}`}>{row.status}</span>
                </div>
              ))}
            </div>
          </RevealCard>

          <RevealCard className="zdb-card">
            <div className="zdb-kicker">Dynamic Routing</div>
            <h3>Routing Distribution</h3>
            <p>Shift traffic to the best provider automatically as success and latency move.</p>
            <div className="zdb-progress-widget">
              {ROUTING_ROWS.map((row) => (
                <div key={row.label} className="zdb-progress-item">
                  <div className="zdb-progress-label">
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                  <div className="zdb-progress-track">
                    <motion.div
                      className="zdb-progress-fill"
                      initial={shouldReduceMotion ? false : { width: 0 }}
                      whileInView={{ width: row.width }}
                      viewport={{ once: true, amount: 0.5 }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="zdb-footnote">Current recommendation: route IMPS payouts below 50K to Cashfree.</div>
          </RevealCard>

          <RevealCard className="zdb-card">
            <div className="zdb-kicker">Payout Visibility</div>
            <h3>Confirmation Graph</h3>
            <p>See where money is waiting across dispatch, provider ack, bank credit, and proof generation.</p>
            <div className="zdb-node-grid">
              {Array.from({ length: 24 }).map((_, index) => {
                const isActive = activeNodes.includes(index) || STATIC_ACTIVE_NODES.has(index)
                return <div key={index} className={`zdb-node ${isActive ? 'active' : ''}`} />
              })}
            </div>
            <div className="zdb-footnote">11 confirmations matched in the last 60 seconds across bank and provider signals.</div>
          </RevealCard>

          <RevealCard className="zdb-card">
            <div className="zdb-kicker">Cost Savings</div>
            <h3>Cost Intelligence</h3>
            <p>Show the direct operating leverage created by better routing and fewer manual escalations.</p>
            <div className="zdb-metrics-widget">
              <div className="zdb-mini-metric">
                <div className="zdb-metric-value accent">{Math.round(autoRouted)}%</div>
                <div className="zdb-metric-label">Auto-Routed</div>
              </div>
              <div className="zdb-mini-metric">
                <div className="zdb-metric-value green">{Math.round(feeSaved)}%</div>
                <div className="zdb-metric-label">Fees Saved</div>
              </div>
              <div className="zdb-mini-metric">
                <div className="zdb-metric-value">{Math.round(avgLatency)}ms</div>
                <div className="zdb-metric-label">Avg Latency</div>
              </div>
            </div>
            <div className="zdb-footnote">Estimated monthly impact: lower provider fees, faster confirmations, and fewer support escalations.</div>
          </RevealCard>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: DASHBOARD_SHOWCASE_CSS }} />
    </section>
  )
}
