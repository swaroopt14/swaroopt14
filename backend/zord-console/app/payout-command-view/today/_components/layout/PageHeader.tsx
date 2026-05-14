'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import type { GlyphName } from '@/services/payout-command/model'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { ApiKeysPopoverButton } from './ApiKeysPopoverButton'
import { Glyph } from '../shared'

const ICON_BUTTONS: GlyphName[] = ['refresh', 'eye', 'menu-dots']

const TEAM_AVATARS = [
  { initial: 'A', bg: '#d8e6ff' },
  { initial: 'F', bg: '#dbf7dd' },
  { initial: 'E', bg: '#edd8f4' },
] as const

type PageHeaderProps = {
  /** Dock label (e.g. Today, Ask) — small eyebrow above the title; omit when same as title */
  pageEyebrow?: string
  /** Full surface name (e.g. Command center, Ask Zord workspace) */
  pageTitle?: string
  /** Optional second line under title (e.g. Ask workspace tab) */
  pageSubtitle?: string
  onAskZordToggle: () => void
  /** When false, hides refresh / eye / menu on Disbursement Command Center only. */
  showUtilityIconButtons?: boolean
  /** Command center (home): filter toggle + expandable panel below the header row */
  homeCommandFilters?: {
    open: boolean
    onToggle: () => void
    panel: ReactNode
  }
  /** Home: toggle command center vs connected-systems (knowledge flow) view */
  homeSystemKnowledgeFlow?: {
    enabled: boolean
    onChange: (enabled: boolean) => void
  }
}

export function PageHeader({
  pageEyebrow,
  pageTitle,
  pageSubtitle,
  onAskZordToggle,
  showUtilityIconButtons = true,
  homeCommandFilters,
  homeSystemKnowledgeFlow,
}: PageHeaderProps) {
  const { mode } = useEnvironment()
  const batchCenterHref = payoutBatchCommandCenterHref(mode === 'sandbox')
  const showPageHeading = Boolean(pageTitle)
  const showEyebrow = Boolean(pageEyebrow && pageEyebrow !== pageTitle)

  return (
    <div className="mb-6 flex flex-col gap-0">
    <div
      className={`flex flex-col gap-2 xl:flex-row xl:items-center ${
        showPageHeading || homeSystemKnowledgeFlow ? 'xl:justify-between' : 'xl:justify-end'
      }`}
    >
      <div className="min-w-0 space-y-3">
        {showPageHeading ? (
          <div>
            {showEyebrow ? (
              <p className="pc-section-label">{pageEyebrow}</p>
            ) : null}
            <h1
              className={`font-bold tracking-[-0.03em] text-neutral-950 sm:text-[1.85rem] ${
                showEyebrow ? 'mt-1 text-[1.6rem]' : 'text-[1.65rem]'
              }`}
            >
              {pageTitle}
            </h1>
            {pageSubtitle ? (
              <p className="mt-1.5 text-[14px] font-medium text-neutral-600">{pageSubtitle}</p>
            ) : null}
          </div>
        ) : null}
        {homeSystemKnowledgeFlow ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-[#111111]">System knowledge flow</span>
            <button
              type="button"
              role="switch"
              aria-checked={homeSystemKnowledgeFlow.enabled}
              onClick={() => homeSystemKnowledgeFlow.onChange(!homeSystemKnowledgeFlow.enabled)}
              className={`relative flex h-7 w-[3rem] shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ADE80] ${
                homeSystemKnowledgeFlow.enabled
                  ? 'justify-end bg-[#4ADE80] shadow-[0_0_18px_rgba(74,222,128,0.4)]'
                  : 'justify-start bg-[#d4d4d0]'
              }`}
            >
              <span className="pointer-events-none block h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]" />
            </button>
            <span className="text-[13px] text-[#52525b]">
              {homeSystemKnowledgeFlow.enabled ? 'Showing connected systems' : 'Command center metrics'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 xl:shrink-0">
        {showUtilityIconButtons
          ? ICON_BUTTONS.map((icon) => (
              <button
                key={icon}
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-black/10 bg-white text-[#111111] hover:bg-[#fafafa]"
                aria-label={icon}
              >
                <Glyph name={icon} className="h-4 w-4" />
              </button>
            ))
          : null}

        {homeCommandFilters ? (
          <button
            type="button"
            onClick={homeCommandFilters.onToggle}
            aria-expanded={homeCommandFilters.open}
            className={`flex h-9 items-center gap-1.5 rounded-[8px] border px-2.5 text-[14px] font-medium transition ${
              homeCommandFilters.open
                ? 'border-[#111111] bg-[#f4f4f2] text-[#111111]'
                : 'border-black/10 bg-white text-[#111111] hover:bg-[#fafafa]'
            }`}
          >
            <Glyph name="search" className="h-4 w-4 opacity-80" />
            Filters
          </button>
        ) : null}

        <button
          type="button"
          onClick={onAskZordToggle}
          className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[#111111] bg-[#111111] px-2.5 text-[14px] font-semibold text-white"
        >
          <span className="h-2 w-2 rounded-full bg-[#4ADE80]" />
          Ask Zord
        </button>

        <Link
          href={batchCenterHref}
          className="inline-flex h-9 items-center rounded-[8px] border border-[#111111] bg-white px-2.5 text-[14px] font-semibold text-[#111111] hover:bg-[#fafafa]"
        >
          Batch Center
        </Link>

        <ApiKeysPopoverButton />

        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-[8px] bg-[#111111] px-2.5 text-[14px] font-semibold text-white shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
        >
          <div className="flex -space-x-1.5">
            {TEAM_AVATARS.map(({ initial, bg }) => (
              <span
                key={initial}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/60 text-[11px] font-semibold text-[#111111]"
                style={{ background: bg }}
              >
                {initial}
              </span>
            ))}
          </div>
          <span>Share</span>
        </button>
      </div>
    </div>

    {homeCommandFilters?.open ? (
      <div className="mt-3 border-t border-black/8 bg-[#fafaf8] pt-3">{homeCommandFilters.panel}</div>
    ) : null}
    </div>
  )
}
