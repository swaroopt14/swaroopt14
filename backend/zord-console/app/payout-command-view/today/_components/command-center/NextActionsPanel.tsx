'use client'

import Link from 'next/link'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import {
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from './homeCommandCenterTokens'

export type NextActionItem = {
  title: string
  description: string
  href?: string
  emphasis?: boolean
}

export type NextActionsPanelProps = {
  actions: NextActionItem[]
  completionHint?: string | null
}

export function NextActionsPanel({ actions, completionHint }: NextActionsPanelProps) {
  const { mode } = useEnvironment()
  const batchHref = payoutBatchCommandCenterHref(mode === 'sandbox')

  return (
    <aside className="flex h-full min-h-[280px] flex-col rounded-2xl border border-slate-200 bg-[#fafaf8] p-5 shadow-sm">
      <h3 className={`text-[16px] font-semibold ${HOME_TITLE_BLACK}`}>Next Actions</h3>
      {completionHint ? (
        <p className={`mt-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 ${HOME_BODY_IMPERIAL_SM}`}>
          {completionHint}
        </p>
      ) : null}
      <ul className="mt-4 flex flex-1 flex-col gap-3">
        {actions.map((action) => (
          <li
            key={action.title}
            className={`rounded-xl border bg-white px-3 py-3 ${
              action.emphasis ? 'border-neutral-300 shadow-sm' : 'border-slate-200/90'
            }`}
          >
            {action.href ? (
              <Link href={action.href} className="block hover:opacity-90">
                <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>{action.title}</p>
                <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>{action.description}</p>
              </Link>
            ) : (
              <>
                <p className={`text-[14px] font-semibold ${HOME_TITLE_BLACK}`}>{action.title}</p>
                <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>{action.description}</p>
              </>
            )}
          </li>
        ))}
      </ul>
      <Link
        href={batchHref}
        className="mt-4 inline-flex text-[14px] font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4"
      >
        Open Batch Center →
      </Link>
    </aside>
  )
}
