'use client'

import { dockItems, type DockId } from '@/services/payout-command/model'
import { Glyph } from '../shared'

type DockNavProps = {
  activeDock: DockId
  activeSurfaceTitle: string
  onDockChange: (id: DockId) => void
}

export function DockNav({ activeDock, activeSurfaceTitle, onDockChange }: DockNavProps) {
  return (
    <div className="flex min-h-[56px] flex-col gap-4 border-b border-[#E5E5E5] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      {/* Left: logo + dock buttons */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-white">
            Z
          </span>
          <div>
            <div className="text-[12px] uppercase tracking-[0.18em] text-[#8a8a86]">Workspace</div>
            <div className="text-[15px] font-medium text-[#111111]">{activeSurfaceTitle}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dockItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onDockChange(item.id)}
              className={`flex h-9 w-9 items-center justify-center rounded-[8px] border transition ${
                activeDock === item.id
                  ? 'border-[#111111] bg-[#111111] text-white'
                  : 'border-[#E5E5E5] bg-white text-[#111111]'
              }`}
              aria-label={item.label}
              aria-pressed={activeDock === item.id}
              title={item.label}
            >
              <Glyph name={item.icon} className="h-[18px] w-[18px]" />
            </button>
          ))}
        </div>
      </div>

      {/* Right: search + user pill */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex h-11 min-w-[18rem] items-center gap-3 rounded-[10px] border border-[#E5E5E5] bg-[#F5F5F5] px-3.5 text-[#7a7a76] shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <Glyph name="search" className="h-4 w-4 text-[#111111]" />
          <span className="text-sm">Type client name or payout ID...</span>
        </div>
        <div className="flex items-center gap-3 rounded-[10px] border border-[#E5E5E5] bg-white px-2.5 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#111111] text-sm font-medium text-white">
            OS
          </div>
          <div className="pr-1">
            <div className="text-sm font-medium text-[#111111]">Ops supervisor</div>
            <div className="text-xs text-[#7a7a76]">Payout desk</div>
          </div>
        </div>
      </div>
    </div>
  )
}
