'use client'

import { useMemo, useRef, useState } from 'react'

import { Glyph } from '../shared'
import { AlertsDropdownPanel } from './AlertsDropdownPanel'
import { InsightAlertListRow } from './InsightAlertListRow'
import type { OpsInsightAlert } from './types'

export function AlertsInbox({ alerts }: { alerts: OpsInsightAlert[] }) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const rootRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => alerts.filter((a) => !dismissed.has(a.id)), [alerts, dismissed])
  const count = visible.length

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl border bg-white text-[#111111] shadow-sm transition hover:bg-[#f5f5f3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6366f1] ${
          open ? 'border-[#6366f1]/50 ring-2 ring-[#6366f1]/20' : 'border-black/10'
        }`}
        aria-label={`Alerts inbox, ${count} unread`}
        aria-expanded={open}
      >
        <Glyph name="bell" className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#dc2626] px-1 text-[12px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[55] cursor-default bg-black/[0.12] backdrop-blur-[2px]"
            aria-label="Close inbox"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-[60] mt-2 w-[min(calc(100vw-1.5rem),24rem)] origin-top-right animate-[alerts-pop_0.18s_ease-out]">
            <AlertsDropdownPanel
              title="Inbox"
              subtitle="Service 7 and 5C nudges — dismiss after you've read them."
              activeCount={count}
            >
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/12 bg-white/90 py-12 px-5 text-center">
                  <Glyph name="eye" className="h-8 w-8 text-[#cbd5e1]" aria-hidden />
                  <p className="text-[15px] font-medium text-[#475569]">You&apos;re caught up</p>
                  <p className="max-w-[16rem] text-[13px] leading-relaxed text-[#94a3b8]">Nothing new right now.</p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {visible.map((a) => (
                    <InsightAlertListRow
                      key={a.id}
                      alert={a}
                      onDismiss={() => setDismissed((s) => new Set(s).add(a.id))}
                    />
                  ))}
                </ul>
              )}
            </AlertsDropdownPanel>
          </div>
        </>
      ) : null}
    </div>
  )
}
