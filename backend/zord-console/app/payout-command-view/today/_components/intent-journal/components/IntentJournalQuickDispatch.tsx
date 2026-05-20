'use client'

import Link from 'next/link'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
} from '../../command-center/homeCommandCenterTokens'

const PSP_TARGETS = ['Razorpay', 'Cashfree', 'PayU', 'Stripe'] as const
const BANK_TARGETS = ['ICICI Bank', 'HDFC Bank', 'SBI', 'Axis Bank', 'Kotak'] as const

const dispatchBtnClass =
  'inline-flex h-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white px-3.5 text-[13px] font-medium text-[#0f172a] shadow-sm transition hover:bg-slate-50'

type IntentJournalQuickDispatchProps = {
  onDispatch: () => void
  batchCommandCenterHref: string
  /** Stretch card to fill pagination row height in the journal rail grid. */
  fillHeight?: boolean
}

export function IntentJournalQuickDispatch({
  onDispatch,
  batchCommandCenterHref,
  fillHeight = false,
}: IntentJournalQuickDispatchProps) {
  const rootClass = fillHeight
    ? `relative h-full min-h-0 flex flex-col overflow-hidden ${COMMAND_CENTER_KPI_CARD}`
    : `relative ${COMMAND_CENTER_KPI_CARD}`

  return (
    <article className={rootClass}>
      <CommandCenterCardGlow />
      <div className="relative flex items-center justify-between gap-2 px-4 pt-4">
        <p className={COMMAND_CENTER_LABEL_GREEN}>Quick dispatch</p>
        <Link
          href={batchCommandCenterHref}
          className={`text-[13px] font-semibold text-[#00239C] underline decoration-sky-300 underline-offset-2 ${HOME_BODY_IMPERIAL_SM}`}
        >
          See all
        </Link>
      </div>
      <p className={`relative px-4 pb-2 ${HOME_BODY_IMPERIAL_SM}`}>PSPs and bank rails for this batch</p>
      <div className={`relative flex flex-wrap gap-2 px-4 ${fillHeight ? 'min-h-0 flex-1 overflow-y-auto pb-2' : 'pb-3'}`}>
        <button type="button" onClick={onDispatch} className={`${dispatchBtnClass} font-semibold`} title="Dispatch batch">
          + Dispatch
        </button>
        {PSP_TARGETS.map((name) => (
          <button key={name} type="button" onClick={onDispatch} className={dispatchBtnClass} title={`Dispatch via ${name}`}>
            {name}
          </button>
        ))}
      </div>
      <div className={`relative border-t border-slate-100 px-4 ${fillHeight ? 'flex flex-1 flex-col py-2.5' : 'py-3'}`}>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888888]">Bank rails</p>
        <div className="flex flex-wrap gap-2">
          {BANK_TARGETS.map((name) => (
            <button key={name} type="button" onClick={onDispatch} className={dispatchBtnClass} title={`Dispatch via ${name}`}>
              {name}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}
