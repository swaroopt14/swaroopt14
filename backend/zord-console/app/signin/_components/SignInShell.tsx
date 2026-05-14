import type { ReactNode } from 'react'

export function SignInShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f7f4] grid lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute -top-20 -left-16 h-80 w-80 rounded-full bg-emerald-400/30 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-violet-500/40 blur-3xl" />
          <div className="absolute top-1/3 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-sky-400/20 blur-3xl" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
              <span className="text-[18px] font-black tracking-tight">Z</span>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Zord Console</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Defensibility-first payments
          </p>
          <h2 className="mt-5 text-[34px] font-semibold leading-[1.1] tracking-[-0.02em]">
            Prove every rupee moved.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            One platform that tells you exactly how defensible your payments are — and closes the gap with
            cryptographic evidence packs, real-time signal fusion, and intelligent recovery.
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">Avg score</dt>
              <dd className="mt-1 text-[24px] font-semibold tabular-nums">94.3%</dd>
              <dd className="text-[11px] text-white/55">defensibility</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">Closed</dt>
              <dd className="mt-1 text-[24px] font-semibold tabular-nums">₹34 L</dd>
              <dd className="text-[11px] text-white/55">last 6 months</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">Disputes</dt>
              <dd className="mt-1 text-[24px] font-semibold tabular-nums">11/11</dd>
              <dd className="text-[11px] text-white/55">won this quarter</dd>
            </div>
          </dl>
        </div>

        <div className="relative text-[12px] text-white/40">© {new Date().getFullYear()} Zord · arealis.network</div>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">{children}</main>
    </div>
  )
}
