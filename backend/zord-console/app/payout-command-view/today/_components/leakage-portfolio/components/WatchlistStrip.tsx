'use client'

import { WATCHLIST_ITEMS } from '../constants/watchlistMock'
import { Sparkline } from './Sparkline'
import { HdfcIcon, IciciIcon, RazorpayIcon, StripeIcon } from './WatchlistIcons'

const ICONS = {
  hdfc: HdfcIcon,
  icici: IciciIcon,
  stripe: StripeIcon,
  razorpay: RazorpayIcon,
} as const

export function WatchlistStrip() {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-slate-900">Watchlist</h2>
        <button type="button" className="text-slate-400 hover:text-slate-600" aria-label="Next items">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m7 5 6 5-6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex gap-4 overflow-x-auto pb-1">
        {WATCHLIST_ITEMS.map((item) => {
          const Icon = ICONS[item.id as keyof typeof ICONS]
          const trendColor = item.trendUp ? 'text-emerald-600' : 'text-red-600'
          const sparkStroke = item.trendUp ? '#10b981' : '#ef4444'

          return (
            <article
              key={item.id}
              className="flex min-w-[200px] shrink-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
            >
              {Icon ? <Icon /> : null}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold tracking-wide text-slate-800">{item.name}</p>
                <p className="text-[14px] font-semibold tabular-nums text-slate-900">{item.valueLabel}</p>
                <p className={`text-[12px] font-medium tabular-nums ${trendColor}`}>{item.trendLabel}</p>
              </div>
              <Sparkline path={item.sparkPath} className="h-10 w-14" stroke={sparkStroke} />
            </article>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Illustrative watchlist — live PSP/bank attribution API pending.</p>
    </section>
  )
}
