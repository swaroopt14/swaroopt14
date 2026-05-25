'use client'

import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import { intentJournalCopy } from '../../intent-journal/copy/intentJournalCopy'

type HealthCardProps = {
  label: string
  value: string
  sub: string
  wired: boolean
}

function HealthCard({ label, value, sub, wired }: HealthCardProps) {
  return (
    <article className={`relative ${COMMAND_CENTER_KPI_CARD} !p-3`}>
      <CommandCenterCardGlow />
      <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{label}</p>
      <p className={`relative mt-1 text-[18px] font-bold tabular-nums ${HOME_TITLE_BLACK}`}>{value}</p>
      <p className={`relative mt-0.5 text-[12px] ${HOME_BODY_IMPERIAL_SM}`}>
        {wired ? sub : intentJournalCopy.health.notConnected}
      </p>
    </article>
  )
}

/** Service 2 health cards — decoupled shells until governance fields exist on list API. */
export function IntentJournalHealthCards() {
  const cards: HealthCardProps[] = [
    { label: intentJournalCopy.health.fileMapping, value: '—', sub: intentJournalCopy.health.awaitingData, wired: false },
    { label: intentJournalCopy.health.requiredFields, value: '—', sub: 'Per-intent validation not in list API', wired: false },
    { label: intentJournalCopy.health.duplicateRisk, value: '—', sub: 'Duplicate detection not in list API', wired: false },
    { label: intentJournalCopy.health.beneficiaryValidation, value: '—', sub: 'Beneficiary fields not in list API', wired: false },
    { label: intentJournalCopy.health.tokenization, value: '—', sub: 'Tokenization status not in list API', wired: false },
  ]

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <HealthCard key={card.label} {...card} />
      ))}
    </div>
  )
}
