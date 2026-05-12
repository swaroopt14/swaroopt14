'use client'

export function HeroHeader() {
  return (
    <section className="relative overflow-hidden rounded-[24px] border border-white/15 bg-[linear-gradient(135deg,#171c2a_0%,#1f2740_45%,#2a3050_100%)] px-7 py-7 text-white shadow-[0_24px_48px_rgba(15,23,42,0.34)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(99,102,241,0.42),transparent_40%),radial-gradient(circle_at_84%_70%,rgba(139,92,246,0.32),transparent_38%)]" />
      <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-0 h-64 w-64 rounded-full bg-indigo-300/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/20 to-transparent" />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-slate-200">Monday, 31 Mar 2026</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
            Good Morning,
            <br />
            Swaroop.
          </h1>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur">
              🟢 System Healthy
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur">
              🟡 3 Pending Signals
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur">
              🟣 Evidence Ready
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-4 lg:items-end">
          <button className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:bg-slate-100">
            Create Test Intent
          </button>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-200">Monitored by</p>
            <p className="mt-1 font-medium text-white">Zord Observability</p>
          </div>
        </div>
      </div>
    </section>
  )
}
