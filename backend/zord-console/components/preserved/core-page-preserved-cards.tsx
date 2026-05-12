export {}

/*
Preserved from /Users/swaroopthakare/hackthon/Arealis-Zord/backend/zord-console/app/app-final/core/page.tsx
Date: 2026-03-25
Reason: User requested every removed/merged Core page component be saved before deletion.

──────────────────────────────────────────────────────────────────────────────
Preserved block: Money Movement Control Tower (removed from Command Center UI)
──────────────────────────────────────────────────────────────────────────────
<Card className="xl:col-span-8 p-8 border-white/50 bg-[#F8FBFF]/70 backdrop-blur-[20px] ring-1 ring-[#9CC4FF]/20 shadow-[0_26px_80px_rgba(15,23,42,0.22)]">
  <div className="flex items-center justify-between">
    <div>
      <div className="text-lg font-semibold text-black">Money Movement Control Tower</div>
      <div className="mt-1 text-sm text-black/55">Throughput view of payout execution, recovery opportunity, and routing drift</div>
    </div>
    <div className="flex items-center gap-4 text-base text-black">
      <span className="inline-flex items-center gap-2 text-sm text-[#6B7280]">
        Savings delta
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#E5E7EB] text-[10px] text-[#4F46E5]">
          ◌
        </span>
        <span className="font-semibold text-[#4F46E5]">+3.8%</span>
      </span>
    </div>
  </div>
  ...
</Card>

──────────────────────────────────────────────────────────────────────────────
Preserved component: CommandStatusOverview
──────────────────────────────────────────────────────────────────────────────
function CommandStatusOverview() {
  return (
    <section className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-7 p-6 border-white/50 bg-[#F8FBFF]/70 backdrop-blur-[20px] ring-1 ring-[#9CC4FF]/20 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-[#0F172A]">PSP Status Pills</div>
            <div className="mt-1 text-sm text-[#64748B]">Fastest read on provider health before SLA moves against you</div>
          </div>
          <div className="rounded-full border border-black/5 bg-white/80 px-3 py-1 text-xs font-semibold text-black/60">30s refresh</div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {PSP_STATUS_PILLS.map((pill) => {
            const tone =
              pill.tone === 'emerald'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : pill.tone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : pill.tone === 'rose'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            const dot =
              pill.tone === 'emerald'
                ? 'bg-emerald-600'
                : pill.tone === 'amber'
                ? 'bg-amber-600'
                : pill.tone === 'rose'
                ? 'bg-rose-600'
                : 'bg-slate-500'
            return (
              <div key={pill.name} className={`min-w-[172px] rounded-2xl border px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] ${tone}`}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                  {pill.name}
                </div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-[0.08em]">{pill.state}</div>
                <div className="mt-1 text-xs opacity-80">{pill.metric}</div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="xl:col-span-5 p-6 border-white/50 bg-[#F5F9FF]/70 backdrop-blur-[20px] ring-1 ring-[#9CC4FF]/20 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-[#0F172A]">Rail Status Indicators</div>
            <div className="mt-1 text-sm text-[#64748B]">Rail readiness for planning batches and avoiding cutoff misses</div>
          </div>
          <div className="rounded-full border border-black/5 bg-white/80 px-3 py-1 text-xs font-semibold text-black/60">Ops view</div>
        </div>
        <div className="mt-5 space-y-3">
          {RAIL_STATUS.map((rail) => {
            const tone =
              rail.tone === 'emerald'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : rail.tone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-[#D8E4FF] bg-[#EEF4FF] text-[#2563EB]'
            return (
              <div key={rail.rail} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white/88 px-4 py-4">
                <div>
                  <div className="text-sm font-semibold text-black">{rail.rail}</div>
                  <div className="mt-1 text-xs text-black/55">{rail.note}</div>
                </div>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{rail.status}</span>
              </div>
            )
          })}
        </div>
      </Card>
    </section>
  )
}

──────────────────────────────────────────────────────────────────────────────
Preserved component: MoneyAtRiskCard
──────────────────────────────────────────────────────────────────────────────
function MoneyAtRiskCard() {
  return (
    <Card className="xl:col-span-5 p-6 border-white/50 bg-[#F8FBFF]/70 backdrop-blur-[20px] ring-1 ring-[#9CC4FF]/20 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-[#0F172A]">Money at Risk Summary</div>
          <div className="mt-1 text-sm text-[#64748B]">One number for uncertain payout value, with immediate breakdown</div>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">₹1.04 Cr exposed</div>
      </div>
      <div className="mt-5 rounded-2xl border border-black/5 bg-white/88 p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-black/45">Total uncertain payout value</div>
        <div className="mt-2 text-4xl font-extrabold text-[#0F172A]">₹1.04 Cr</div>
        <div className="mt-2 text-sm text-black/60">Pending finality, SLA-breach clusters, and reversal / ambiguity buckets consolidated for ops and finance.</div>
        <div className="mt-5 space-y-3">
          {MONEY_AT_RISK_BUCKETS.map((bucket) => (
            <div key={bucket.label}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-black">{bucket.label}</span>
                <span className="font-semibold text-black">{bucket.amount}</span>
              </div>
              <div className="mt-2 h-2.5 rounded-full bg-[#E8EEF8]">
                <div className={`h-2.5 rounded-full ${bucket.tone}`} style={{ width: `${bucket.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

──────────────────────────────────────────────────────────────────────────────
Preserved component: FailureReasonsCard
──────────────────────────────────────────────────────────────────────────────
function FailureReasonsCard() {
  const max = Math.max(...FAILURE_REASON_ROWS.map((item) => item.count))
  return (
    <Card className="xl:col-span-5 p-6 border-white/50 bg-[#F5F9FF]/70 backdrop-blur-[20px] ring-1 ring-[#9CC4FF]/20 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-[#0F172A]">Top Failure Reasons (Today)</div>
          <div className="mt-1 text-sm text-[#64748B]">Fast pattern recognition for routing issues versus beneficiary data problems</div>
        </div>
        <div className="rounded-full border border-black/5 bg-white/80 px-3 py-1 text-xs font-semibold text-black/60">173 failures</div>
      </div>
      <div className="mt-5 space-y-4 rounded-2xl border border-white/40 bg-white/88 p-5">
        {FAILURE_REASON_ROWS.map((row) => (
          <div key={row.code}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-black">{row.code}</span>
              <span className="text-black/60">{row.count} · {row.share}</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-[#E8EEF8]">
              <div className={`h-3 rounded-full ${row.tone}`} style={{ width: `${(row.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
*/
/*
──────────────────────────────────────────────────────────────────────────────
Preserved block: Cost-Adjusted Provider Health (removed from Command Center UI)
──────────────────────────────────────────────────────────────────────────────
<Card className="xl:col-span-4 p-8 border-white/50 bg-[#F5F9FF]/70 backdrop-blur-[20px] ring-1 ring-[#9CC4FF]/20 shadow-[0_26px_80px_rgba(15,23,42,0.22)]">
  <div className="flex items-center justify-between">
    <div>
      <div className="text-lg font-semibold text-black">Cost-Adjusted Provider Health</div>
      <div className="mt-1 text-xs text-black/60">Execution plus severity, tuned for routing cost and payout risk</div>
    </div>
    <button className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-xs font-semibold text-black/70">Live</button>
  </div>
  <div className="mt-4 overflow-hidden rounded-xl border border-black/10 bg-white/60">...</div>
</Card>

──────────────────────────────────────────────────────────────────────────────
Preserved block: Bank Failure Exposure (removed from Command Center UI)
──────────────────────────────────────────────────────────────────────────────
<Card className="p-8 border-white/50 bg-[#F7FAFF]/70 backdrop-blur-[20px] ring-1 ring-[#9CC4FF]/20 shadow-[0_26px_80px_rgba(15,23,42,0.22)]">
  <div className="flex items-center justify-between">
    <div>
      <div className="text-lg font-semibold text-black">Bank Failure Exposure</div>
      <div className="mt-1 text-sm text-black/55">Where avoidable payout leakage and seller friction are most concentrated</div>
    </div>
    <span className="text-base text-black/70">Last 7 days</span>
  </div>
  <div className="mt-6 flex gap-5 overflow-x-auto pb-3">...</div>
</Card>
*/
