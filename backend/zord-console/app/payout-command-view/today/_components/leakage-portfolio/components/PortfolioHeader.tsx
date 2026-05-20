'use client'

type PortfolioHeaderProps = {
  onRefresh?: () => void
  refreshing?: boolean
}

export function PortfolioHeader({ onRefresh, refreshing }: PortfolioHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-slate-900 sm:text-[1.5rem]">
        Portfolio Intelligence &amp; Risk Analysis
      </h1>

      <div className="flex flex-wrap items-center gap-3">
        <HealthScorePill />
        <HeaderActions onRefresh={onRefresh} refreshing={refreshing} />
      </div>
    </header>
  )
}

function HealthScorePill() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
      <div className="flex h-2 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-[76%] rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
      </div>
      <span className="text-[13px] font-semibold tabular-nums text-slate-800">76</span>
      <span className="text-[12px] text-slate-500">Health Score</span>
    </div>
  )
}

function HeaderActions({ onRefresh, refreshing }: { onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        aria-label="Filters"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 5h14M5 10h10M8 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Filters
        <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        aria-label="Refresh data"
      >
        <svg
          className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M16 6.5V3.8l-2.6 2.3A6.2 6.2 0 1 0 16 10"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
        aria-label="Expand view"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M6 14 14 6M8 6h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
