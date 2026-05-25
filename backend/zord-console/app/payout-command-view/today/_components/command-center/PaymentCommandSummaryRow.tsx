'use client'

import Link from 'next/link'
import type { CommandCenterPeriod } from './commandCenterPeriod'
import { COMMAND_CENTER_PERIOD_OPTIONS } from './commandCenterPeriod'
import {
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from './homeCommandCenterTokens'

export type PaymentCommandSummaryRowProps = {
  period: CommandCenterPeriod
  onPeriodChange: (p: CommandCenterPeriod) => void
  intendedDisplay: string
  intendedSub: string
  bankConfirmedDisplay: string
  bankConfirmedSub: string
  reviewDisplay: string
  reviewSub: string
  matchConfidenceDisplay: string
  matchConfidenceSub: string
  proofReadinessDisplay: string
  proofReadinessSub: string
  reviewHref?: string
  proofHref?: string
}

const TILE =
  'flex min-h-[120px] flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)]'

function SummaryTile({
  title,
  value,
  sub,
  href,
}: {
  title: string
  value: string
  sub: string
  href?: string
}) {
  const inner = (
    <>
      <p className="text-[12px] font-medium uppercase tracking-wide text-neutral-500">{title}</p>
      <p className={`mt-2 text-[28px] font-extrabold leading-none tabular-nums tracking-tight ${HOME_TITLE_BLACK}`}>
        {value}
      </p>
      <p className={`mt-2 ${HOME_BODY_IMPERIAL_SM}`}>{sub}</p>
    </>
  )
  if (href) {
    return (
      <Link
        href={href}
        className={`${TILE} transition hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400`}
      >
        {inner}
      </Link>
    )
  }
  return <article className={TILE}>{inner}</article>
}

export function PaymentCommandSummaryRow({
  period,
  onPeriodChange,
  intendedDisplay,
  intendedSub,
  bankConfirmedDisplay,
  bankConfirmedSub,
  reviewDisplay,
  reviewSub,
  matchConfidenceDisplay,
  matchConfidenceSub,
  proofReadinessDisplay,
  proofReadinessSub,
  reviewHref = '/payout-command-view/today?dock=leakage',
  proofHref = '/payout-command-view/today?dock=proof',
}: PaymentCommandSummaryRowProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>Summary for selected period</p>
        <div className="flex flex-wrap gap-2">
          {COMMAND_CENTER_PERIOD_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPeriodChange(f.id)}
              className={`rounded-full px-3 py-1 text-[13px] font-medium transition ${
                period === f.id
                  ? 'bg-[#39E07E] text-[#000000] shadow-sm ring-1 ring-[#39E07E]/40'
                  : 'border border-[#e5e5e5] bg-white text-neutral-800 hover:bg-[#fafafa]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryTile title="Intended Payment Value" value={intendedDisplay} sub={intendedSub} />
        <SummaryTile title="Bank-Confirmed Value" value={bankConfirmedDisplay} sub={bankConfirmedSub} />
        <SummaryTile
          title="Value Needing Review"
          value={reviewDisplay}
          sub={reviewSub}
          href={reviewHref}
        />
        <SummaryTile title="Match Confidence" value={matchConfidenceDisplay} sub={matchConfidenceSub} />
        <SummaryTile
          title="Proof Readiness"
          value={proofReadinessDisplay}
          sub={proofReadinessSub}
          href={proofHref}
        />
      </div>
    </div>
  )
}
