'use client'

const PALETTE = {
  indigoPrimary: '#6366F1',
  indigoSecondary: '#A5B4FC',
  tealPrimary: '#0D9488',
  tealSecondary: '#2DD4BF',
  slateDeep: '#0F172A',
  amber: '#F59E0B',
} as const

const proofCards = [
  {
    title: 'Payment Status',
    value: 'SUCCESS',
    subtitle: 'Confirmed',
  },
  {
    title: 'Reference',
    value: 'UTR: SBIN123456789',
  },
  {
    title: 'Amount',
    value: '₹1,500',
  },
  {
    title: 'Completed',
    value: '9 Mar 2026 · 12:02 PM',
  },
]

const workflowCheckpoints = [
  { title: 'Raw envelope stored (immutable)', desc: 'env_abc123 persisted before 202 ACK', severity: 'success' as const },
  { title: 'Dispatch created + AttemptSent', desc: 'disp_789xyz on RazorpayX IMPS corridor', severity: 'success' as const },
  { title: 'Webhook S2 received', desc: 'SUCCESS + UTR with confidence 1.0 at 10:20', severity: 'success' as const },
  { title: 'Poll S3 corroborated', desc: 'Second-source confirmation, confidence 0.8', severity: 'warning' as const },
  { title: 'Statement S4 matched', desc: 'Highest authority confirms same UTR', severity: 'success' as const },
  { title: 'Certificate signed', desc: 'cert_123 generated with deterministic proof', severity: 'success' as const },
]

const signalAuthority = [
  { label: 'S4 Statement', value: 100 },
  { label: 'S2 Webhook', value: 82 },
  { label: 'S3 Poll', value: 64 },
  { label: 'L1/L2 Carrier Match', value: 92 },
  { label: 'Fallback Fingerprint (L3)', value: 35 },
]

const phaseLabels = ['Ingest', 'Dispatch', 'Webhook S2', 'Poll S3', 'Statement S4', 'Certificate']
const currentFlowConfidence = [20, 34, 100, 80, 100, 100]
const replayFlowConfidence = [20, 34, 100, 92, 100, 100]

function ConfidenceTraceChart() {
  const width = 960
  const height = 260
  const padding = { top: 22, right: 54, bottom: 44, left: 18 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const min = 0
  const max = 100

  const x = (index: number) => padding.left + (index / (phaseLabels.length - 1)) * chartWidth
  const y = (value: number) => padding.top + chartHeight - ((value - min) / (max - min)) * chartHeight
  const yTicks = [20, 40, 60, 80, 100]

  const linePoints = (values: number[]) => values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const areaPoints = (values: number[]) =>
    `${linePoints(values)} ${x(values.length - 1).toFixed(1)},${y(min).toFixed(1)} ${x(0).toFixed(1)},${y(min).toFixed(1)}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[250px] w-full">
      <defs>
        <linearGradient id="ctConfidenceArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PALETTE.indigoPrimary} stopOpacity="0.2" />
          <stop offset="100%" stopColor={PALETTE.indigoPrimary} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={width - padding.right + 8} y={y(tick) + 4} fill="#64748b" fontSize="11">
            {tick}%
          </text>
        </g>
      ))}

      <polygon points={areaPoints(currentFlowConfidence)} fill="url(#ctConfidenceArea)" />
      <polyline points={linePoints(replayFlowConfidence)} fill="none" stroke={PALETTE.tealPrimary} strokeWidth="2.2" strokeDasharray="5 4" />
      <polyline points={linePoints(currentFlowConfidence)} fill="none" stroke={PALETTE.indigoPrimary} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(currentFlowConfidence.length - 1)} cy={y(currentFlowConfidence[currentFlowConfidence.length - 1])} r="4.5" fill={PALETTE.indigoPrimary} />

      {phaseLabels.map((label, index) => (
        <text
          key={label}
          x={x(index)}
          y={height - 10}
          fill="#6b7280"
          fontSize="11"
          textAnchor={index === 0 ? 'start' : index === phaseLabels.length - 1 ? 'end' : 'middle'}
        >
          {label}
        </text>
      ))}
    </svg>
  )
}

export default function CustomerTestPage() {
  return (
    <div className="w-full p-6 lg:p-8">
      <section className="relative z-10 mt-1 w-full overflow-hidden rounded-3xl border border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.94)_0%,rgba(35,39,46,0.96)_100%)] px-7 py-[30px] text-white shadow-[0_20px_48px_rgba(0,0,0,0.28)] transition-all duration-300 ease-out hover:z-30 hover:translate-y-1 hover:scale-[1.005] active:scale-[1.003]">
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/12 via-white/0 to-transparent" />
        <div className="pointer-events-none absolute -left-10 -top-14 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-10 h-64 w-64 rounded-full bg-slate-300/25 blur-3xl" />

        <div className="relative z-[1] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="inline-flex size-12 items-center justify-center rounded-xl bg-black text-white">Z</div>
            <div>
              <h1 className="text-[30px] font-semibold tracking-tight">Zord Vault Console</h1>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs backdrop-blur-sm">Tenant: megamart_prod</span>
                <span className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs backdrop-blur-sm">Doc: Complete Walkthrough Traceability</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-[1] mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {proofCards.map((card) => (
            <article
              key={card.title}
              className="relative rounded-2xl border border-white/70 bg-[#f0f2f5]/95 p-4 backdrop-blur-xl shadow-[0_16px_32px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.75)]"
            >
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/55 to-transparent" />
              <p className="relative z-[1] text-sm text-slate-600">{card.title}</p>
              <p className="relative z-[1] mt-2 text-2xl font-semibold leading-tight text-slate-900">{card.value}</p>
              {'subtitle' in card ? <p className="relative z-[1] mt-2 text-xs text-slate-600">{card.subtitle}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <main className="ct-main-panel relative z-20 -mt-10 w-full px-6 pb-7 pt-6">
        <div className="ct-clear-glass rounded-[20px] p-4">
          <div className="flex items-center justify-between border-b border-gray-200/80 pb-5">
            <h2 className="text-lg font-semibold text-gray-900">Your overview</h2>
            <div className="flex items-center gap-2">
              <button className="ct-clear-glass-pill rounded-full px-3 py-1.5 text-xs text-gray-700">Date range ▼</button>
              <button className="ct-clear-glass-pill rounded-full px-3 py-1.5 text-xs text-gray-700">Daily ▼</button>
              <button className="ct-clear-glass-pill rounded-full px-3 py-1.5 text-xs text-gray-700">Compare ▼</button>
              <button className="ct-clear-glass-pill rounded-full px-3 py-1.5 text-xs font-medium text-gray-800">+ Add</button>
              <button className="ct-clear-glass-pill rounded-full px-3 py-1.5 text-xs text-gray-700">Edit</button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <article className="ct-coin-card overflow-hidden border-slate-200/80 bg-white/[0.92] xl:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Workflow Confidence Trace</h3>
                  <p className="text-sm text-gray-500">Phase 1→6 mapped from Complete Walkthrough Traceability document</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-gray-700">
                    <span className="h-1.5 w-3 rounded-full bg-[#6366F1]" />
                    v2.1 Current
                  </span>
                  <span className="flex items-center gap-1 text-gray-500">
                    <span className="h-1.5 w-3 rounded-full bg-[#0D9488]" />
                    v2.2 Replay
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <ConfidenceTraceChart />
              </div>
            </article>

            <article className="ct-coin-card border-slate-200/80 bg-white/[0.92]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Workflow Checkpoints</h3>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {workflowCheckpoints.length} steps
                </span>
              </div>
              <div className="mt-3 space-y-5">
                {workflowCheckpoints.map((item) => (
                  <div key={item.title} className="group flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-2 h-2.5 w-2.5 rounded-full ${
                          item.severity === 'success'
                            ? 'bg-[#0D9488]'
                            : item.severity === 'critical'
                              ? 'bg-[#0F172A]'
                              : 'bg-[#F59E0B]'
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                    <span className="mt-1 text-slate-400 transition-transform group-hover:translate-x-1">›</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t border-gray-100 pt-3 text-center">
                <button className="text-sm font-semibold text-slate-700">View full timeline mapping →</button>
              </div>
            </article>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <article className="ct-coin-card border-slate-200/80 bg-white/[0.92]">
              <h3 className="text-lg font-semibold text-gray-900">Signal Authority Map</h3>
              <div className="mt-4 space-y-3">
                {signalAuthority.map((item, index) => (
                  <div key={item.label} className="grid grid-cols-[170px_1fr_40px] items-center gap-3">
                    <span className="text-sm text-gray-700">{item.label}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-[#E0E7FF]">
                      <div
                        className="h-full rounded-full bg-[#4F46E5] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                        style={{
                          width: `${item.value}%`,
                        }}
                      />
                    </div>
                    <span className="text-right text-sm text-[#3730A3]">{item.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm text-gray-500">
                Fusion hierarchy: <span className="font-semibold text-slate-700">S4 &gt; S2 &gt; S3</span> with explicit conflict guards.
              </p>
            </article>

            <article className="ct-coin-card border-slate-200/80 bg-white/[0.92]">
              <h3 className="text-lg font-semibold text-gray-900">Dispatch & Backfill</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-gray-500">Attempt count</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">1</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-gray-500">Payout amount</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">₹5,000</p>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm text-gray-700">
                <div className="flex items-center justify-between">
                  <span>Webhook S2 arrival</span>
                  <span>
                    +5m <span className="ml-1 text-[#0D9488]">●</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Poll S3 corroboration</span>
                  <span>
                    +10m <span className="ml-1 text-[#F59E0B]">●</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Finality certificate</span>
                  <span>2026-03-03 09:00:01Z</span>
                </div>
              </div>
            </article>

            <article className="ct-coin-card ct-frost-card border-slate-200/80 bg-white/[0.92]">
              <h3 className="text-lg font-semibold text-gray-900">Evidence & Certificate</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="ct-frost-chip rounded-xl p-3">
                  <p className="text-xs text-gray-500">Pack completeness</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">
                    7/7 <span className="text-xs text-slate-600">all artifacts</span>
                  </p>
                </div>
                <div className="ct-frost-chip rounded-xl p-3">
                  <p className="text-xs text-gray-500">Signature verify</p>
                  <p className="mt-1 text-xl font-semibold text-gray-900">
                    VALID <span className="text-xs text-slate-600">cert_123</span>
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm text-gray-700">
                <div className="flex items-center justify-between">
                  <span>Raw envelope</span>
                  <span className="font-mono text-xs">env_abc123</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Canonical intent</span>
                  <span className="font-mono text-xs">int_xyz789</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Outcome events</span>
                  <span className="font-mono text-xs">evt_888 · evt_889 · evt_890</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Finality certificate</span>
                  <span className="font-mono text-xs">cert_123</span>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full border border-white/70 bg-white/65">
                <div className="h-full w-full rounded-full bg-gradient-to-r from-[#6366F1] via-[#A5B4FC] to-[#2DD4BF]" />
              </div>
            </article>
          </div>
        </div>
      </main>

      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-white/60 bg-white/70 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.08)] lg:hidden">
        <p className="text-base font-semibold text-gray-800">Desktop View Recommended</p>
        <p className="mt-2 text-sm text-gray-600">
          This test page is desktop-first. Open it on a larger screen (≥1024px) for the intended layout.
        </p>
      </div>
    </div>
  )
}
