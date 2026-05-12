'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ZordLogo } from '@/components/ZordLogo'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { dockItems, SANDBOX_DOCK_IDS, type DockId } from '@/services/payout-command/model'
import { AlertsDropdownPanel } from '../command-center/AlertsDropdownPanel'
import { InsightAlertListRow } from '../command-center/InsightAlertListRow'
import type { OpsInsightAlert } from '../command-center/types'
import { ModeTogglePill } from '../sandbox/ModeTogglePill'
import { Glyph } from '../shared'

const DESK_ROLES = ['Ops supervisor', 'Payout desk'] as const

type DockNavProps = {
  activeDock: DockId
  onDockChange: (id: DockId) => void
  alerts?: readonly OpsInsightAlert[]
  onActivateClick: () => void
}

export function DockNav({ activeDock, onDockChange, alerts, onActivateClick }: DockNavProps) {
  const { mode } = useEnvironment()
  const searchRef = useRef<HTMLInputElement>(null)

  const visibleDockItems = useMemo(() => {
    if (mode === 'sandbox') {
      return SANDBOX_DOCK_IDS.map((id) => dockItems.find((d) => d.id === id)).filter(
        (d): d is (typeof dockItems)[number] => Boolean(d),
      )
    }
    // Live: full rail minus sandbox-only + billing (plan page).
    return dockItems.filter((d) => d.id !== 'sandbox' && d.id !== 'billing')
  }, [mode])

  const [search, setSearch] = useState('')
  const [desk, setDesk] = useState<(typeof DESK_ROLES)[number]>(DESK_ROLES[0])
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

  const visibleAlerts = useMemo(
    () => (alerts ?? []).filter((a) => !dismissed.has(a.id)),
    [alerts, dismissed],
  )
  const alertCount = visibleAlerts.length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-3">
        {/* Left: brand + mode + dock rail */}
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-3.5">
            <Link
              href="/final-landing"
              className="flex h-14 shrink-0 items-center justify-start rounded-md pl-1 pr-2 transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30"
              aria-label="Arealis Zord home"
            >
              <ZordLogo fitToHeight variant="light" />
            </Link>
            <span className="hidden h-8 w-px shrink-0 bg-black/10 sm:block" aria-hidden />
            <ModeTogglePill onActivateClick={onActivateClick} />
          </div>

          <nav
            className="flex w-fit max-w-full items-center gap-0.5 rounded-lg bg-[#f5f5f5] p-1 ring-1 ring-black/5"
            aria-label="Primary navigation"
          >
            {visibleDockItems.map((item) => {
              const active = activeDock === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onDockChange(item.id)}
                  className={`group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition ${
                    active
                      ? 'bg-white text-[#0f172a] shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-slate-300/90'
                      : 'text-slate-600 shadow-none hover:bg-white/85 hover:text-[#0f172a]'
                  }`}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  title={item.title}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      active
                        ? 'bg-[#111111] text-white shadow-[0_2px_4px_rgba(0,0,0,0.22)]'
                        : 'bg-white text-[#334155] ring-1 ring-slate-300/80'
                    }`}
                  >
                    <Glyph name={item.icon} className="h-4 w-4" />
                  </span>
                  <span className="hidden min-w-0 pr-1 lg:block">
                    <span className="block truncate text-[13px] font-semibold leading-tight tracking-[-0.01em] text-[#0f172a]">
                      {item.label}
                    </span>
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Right: alerts, command search, desk */}
        <div className="flex w-full flex-col gap-2.5 sm:ml-auto sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setAlertsOpen((o) => !o)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg border bg-white text-[#111111] transition hover:bg-[#f5f5f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30 ${
                alertsOpen ? 'border-black/20 bg-[#f5f5f5]' : 'border-black/10'
              }`}
              aria-label={`Alerts, ${alertCount} in inbox`}
              aria-expanded={alertsOpen}
            >
              <Glyph name="bell" className="h-5 w-5" />
              {alertCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#dc2626] px-1 text-[12px] font-bold leading-none text-white shadow-[0_2px_6px_rgba(220,38,38,0.45)] ring-2 ring-white">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              ) : null}
            </button>

            {alertsOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-[55] cursor-default bg-black/[0.12] backdrop-blur-[2px] transition-opacity"
                  aria-label="Close alerts"
                  onClick={() => setAlertsOpen(false)}
                />
                <div className="absolute right-0 top-full z-[60] mt-2 w-[min(calc(100vw-1.5rem),24rem)] origin-top-right animate-[alerts-pop_0.18s_ease-out]">
                  <AlertsDropdownPanel
                    title="Alerts"
                    subtitle="Highest priority first — dismiss when triaged."
                    activeCount={alertCount}
                  >
                    {visibleAlerts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/12 bg-white/90 py-12 px-5 text-center">
                        <p className="text-[15px] font-medium text-[#475569]">You&apos;re caught up</p>
                        <p className="max-w-[16rem] text-[13px] leading-relaxed text-[#94a3b8]">
                          New payout and ambiguity signals will show up here.
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-2.5">
                        {visibleAlerts.map((a) => (
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

          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 transition focus-within:border-black/30 sm:min-w-[15rem] sm:max-w-[22rem]">
            <Glyph name="search" className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <label htmlFor="dock-nav-search" className="sr-only">
              Search client or payout ID
            </label>
            <input
              ref={searchRef}
              id="dock-nav-search"
              type="search"
              name="dock-nav-search"
              autoComplete="off"
              placeholder="Search clients, batches, intent IDs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-medium leading-normal text-[#0f172a] outline-none placeholder:text-slate-400 placeholder:font-normal"
            />
            <kbd
              className="hidden shrink-0 rounded border border-black/10 bg-[#fafafa] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-500 sm:inline-block"
              title="Focus search"
            >
              ⌘K
            </kbd>
          </div>

          <label htmlFor="dock-nav-desk" className="sr-only">
            Desk role
          </label>
          <select
            id="dock-nav-desk"
            value={desk}
            onChange={(e) => setDesk(e.target.value as (typeof DESK_ROLES)[number])}
            className="h-9 w-full cursor-pointer rounded-lg border border-black/10 bg-white px-3 text-[14px] font-semibold text-[#0f172a] outline-none transition hover:bg-[#fafafa] focus-visible:border-black/30 sm:w-auto sm:min-w-[10rem]"
          >
            {DESK_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  )
}
