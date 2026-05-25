'use client'

import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { evidenceCopy } from '../copy/evidenceCopy'
import type { EvidenceKpiCard } from '../types/evidenceViewModels'

type EvidenceKpiStripProps = {
  cards: EvidenceKpiCard[]
}

export function EvidenceKpiStrip({ cards }: EvidenceKpiStripProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <article key={card.id} className={COMMAND_CENTER_KPI_CARD}>
          <CommandCenterCardGlow />
          <div className="relative flex items-center gap-2">
            {card.accent ? <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80]" aria-hidden /> : null}
            <p className={COMMAND_CENTER_LABEL_GREEN}>{card.label}</p>
          </div>
          <p
            className={`relative mt-3 text-[2rem] font-extrabold tabular-nums tracking-[-0.03em] leading-none xl:text-[1.75rem] ${HOME_TITLE_BLACK}`}
          >
            {card.value}
          </p>
          <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>{card.sub}</p>
          {card.id === 'readiness' ? (
            <p className={`relative mt-1 text-[12px] ${HOME_BODY_IMPERIAL_SM}`}>{evidenceCopy.proofReadinessHelper}</p>
          ) : null}
          {card.explanation ? (
            <p className="relative mt-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-[12px] font-medium text-amber-900">
              {card.explanation}
            </p>
          ) : null}
        </article>
      ))}
    </section>
  )
}
