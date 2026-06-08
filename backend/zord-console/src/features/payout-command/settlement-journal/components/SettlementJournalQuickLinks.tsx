'use client'

import Link from 'next/link'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'

type SettlementJournalQuickLinksProps = {
  batchCommandCenterHref: string
  fillHeight?: boolean
}

export function SettlementJournalQuickLinks({
  batchCommandCenterHref,
  fillHeight = false,
}: SettlementJournalQuickLinksProps) {
  const rootClass = fillHeight
    ? `relative h-full min-h-0 flex flex-col ${COMMAND_CENTER_KPI_CARD}`
    : `relative ${COMMAND_CENTER_KPI_CARD}`

  return (
    <article className={rootClass}>
      <CommandCenterCardGlow />
      <div className="relative px-4 pt-4">
        <p className={COMMAND_CENTER_LABEL_GREEN}>Quick links</p>
        <p className={`mt-1 ${HOME_BODY_IMPERIAL_SM}`}>Upload and manage settlement batches</p>
      </div>
      <div className={`relative flex flex-col gap-2 px-4 ${fillHeight ? 'flex-1 justify-center pb-3 pt-1' : 'py-4'}`}>
        <Link
          href={batchCommandCenterHref}
          className={`inline-flex h-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white px-4 text-[14px] font-semibold text-[#0f172a] shadow-sm transition hover:bg-slate-50 ${HOME_TITLE_BLACK}`}
        >
          Batch Command Center
        </Link>
        <Link
          href={batchCommandCenterHref}
          className={`inline-flex h-10 items-center justify-center rounded-xl bg-[#052e16] px-4 text-[14px] font-semibold text-white shadow-sm transition hover:bg-[#031508] ${HOME_TITLE_BLACK}`}
        >
          Upload settlement
        </Link>
      </div>
    </article>
  )
}
