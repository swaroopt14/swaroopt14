'use client'

import Link from 'next/link'
import type { dockItems } from '@/services/payout-command/model'
import { type GlyphName } from '@/services/payout-command/model'
import { Glyph } from '../shared'

type DockItem = (typeof dockItems)[number]

const ICON_BUTTONS: GlyphName[] = ['refresh', 'eye', 'menu-dots']

const TEAM_AVATARS = [
  { initial: 'A', bg: '#d8e6ff' },
  { initial: 'F', bg: '#dbf7dd' },
  { initial: 'E', bg: '#edd8f4' },
] as const

type PageHeaderProps = {
  activeSurface: DockItem
  onAskZordToggle: () => void
}

export function PageHeader({ activeSurface, onAskZordToggle }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      {/* Breadcrumb + title */}
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#8a8a86]">
          <span>Workspaces</span>
          <span>/</span>
          <span>Overview</span>
          <span>/</span>
          <span className="text-[#111111]">{activeSurface.title}</span>
        </div>
        <h1 className="mt-3 text-[2.25rem] font-medium tracking-[-0.05em] text-[#111111] md:text-[2.85rem]">
          {activeSurface.title}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#6f716d]">{activeSurface.summary}</p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {ICON_BUTTONS.map((icon) => (
          <button
            key={icon}
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-black/10 bg-white text-[#111111]"
            aria-label={icon}
          >
            <Glyph name={icon} className="h-4 w-4" />
          </button>
        ))}

        <button
          type="button"
          onClick={onAskZordToggle}
          className="flex items-center gap-2 rounded-[12px] border border-[#111111] bg-[#111111] px-3 py-2.5 text-[13px] font-medium text-white"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[#4ADE80]" />
          Ask Zord
        </button>

        <Link
          href="/payout-command-view/batch-command-center"
          className="inline-flex items-center rounded-[12px] border border-[#111111] bg-white px-3 py-2.5 text-[13px] font-medium text-[#111111]"
        >
          Batch Center
        </Link>

        <button
          type="button"
          className="flex items-center gap-3 rounded-[12px] bg-[#111111] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(0,0,0,0.08)]"
        >
          <div className="flex -space-x-2">
            {TEAM_AVATARS.map(({ initial, bg }) => (
              <span
                key={initial}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/60 text-[11px] font-medium text-[#111111]"
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
  )
}
