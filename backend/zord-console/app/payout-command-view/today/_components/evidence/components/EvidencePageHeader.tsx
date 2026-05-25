'use client'

import { Glyph } from '../../shared'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { evidenceCopy, mapProofTierLabel } from '../copy/evidenceCopy'
import type { DefensibilityKpiResolved } from '@/services/payout-command/prod-api/intelligenceTypes'

type EvidencePageHeaderProps = {
  anyKpiLive: boolean
  defensibility: DefensibilityKpiResolved | null
}

export function EvidencePageHeader({ anyKpiLive, defensibility }: EvidencePageHeaderProps) {
  const tierLabel = defensibility ? mapProofTierLabel(defensibility.defensibility_tier) : null

  return (
    <header className={COMMAND_CENTER_KPI_CARD}>
      <CommandCenterCardGlow />
      <div className="relative p-5 sm:p-6">
        <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Compliance · Legal</p>
        <h2 className={`relative mt-2 text-[22px] font-semibold tracking-tight ${HOME_TITLE_BLACK}`}>
          {evidenceCopy.pageTitle}
        </h2>
        <p className={`relative mt-1 text-[15px] font-medium text-[#475569]`}>{evidenceCopy.pageSubtitle}</p>
        <p className={`relative mt-3 max-w-3xl ${HOME_BODY_IMPERIAL}`}>{evidenceCopy.mainDescription}</p>
        <p className={`relative mt-3 max-w-3xl text-[15px] font-medium text-[#111111]`}>{evidenceCopy.salesLine}</p>
      </div>
      <div className="relative border-t border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="min-w-0">
            <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>Data used</p>
            <p className={`relative mt-2 ${HOME_BODY_IMPERIAL_SM}`}>{evidenceCopy.dataUsed}</p>
            {!anyKpiLive ? (
              <p className="mt-1 text-[13px] text-[#94a3b8]">Connect intelligence and evidence services for live tiles.</p>
            ) : null}
          </div>
          <div className="min-w-0 lg:max-w-[26rem] lg:text-right">
            <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{evidenceCopy.proofTierLabel}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 lg:justify-end">
              {tierLabel ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4ADE80]/50 bg-[#f0fdf4] px-2.5 py-0.5 text-[13px] font-semibold text-[#166534]">
                  <Glyph name="shield" className="h-3 w-3 opacity-80" />
                  {tierLabel}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#f8f8f6] px-2.5 py-0.5 text-[13px] font-semibold text-[#475569]">
                  Partial
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
