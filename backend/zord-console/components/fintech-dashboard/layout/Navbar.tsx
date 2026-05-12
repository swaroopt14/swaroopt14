'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type NavPage = 'OVERVIEW' | 'CORE' | 'EXECUTION' | 'TRACE' | 'RISK' | 'PROOF' | 'DATA' | 'SYSTEM' | 'SETTINGS'

const NAV_ITEMS: NavPage[] = ['OVERVIEW', 'CORE', 'EXECUTION', 'TRACE', 'RISK', 'PROOF', 'DATA', 'SYSTEM', 'SETTINGS']
const TENANT_NAME = process.env.NEXT_PUBLIC_ZORD_TENANT_NAME ?? 'Arealis Fintech'
const ENVIRONMENT: 'LIVE' | 'SANDBOX' =
  process.env.NEXT_PUBLIC_ZORD_ENV?.toUpperCase() === 'SANDBOX' ? 'SANDBOX' : 'LIVE'
const NAV_ROUTE_MAP: Partial<Record<NavPage, string>> = {
  OVERVIEW: '/app-final',
  CORE: '/app-final/core',
  EXECUTION: '/app-final/execution',
  TRACE: '/app-final/trace',
  RISK: '/app-final/risk',
  PROOF: '/app-final/proof',
  DATA: '/app-final/data',
  SYSTEM: '/app-final/system',
  SETTINGS: '/app-final/settings',
}
const NEO_BASE = '#1C1F2E'
const NEO_CREAM = '#21253A'
const NEO_TEXT = '#F0F2F5'
const NEO_MUTED = 'rgba(240,242,245,0.66)'
const NEO_ACTIVE = '#6366F1'
const SIGNAL_GREEN = '#22C55E'
const SIGNAL_AMBER = '#EAB308'
const NAV_BORDER = '1px solid rgba(255,255,255,0.07)'
const NAV_BORDER_STRONG = '1px solid rgba(255,255,255,0.12)'
const SHELL_SHADOW =
  '0 22px 52px rgba(20,22,38,0.30), 0 2px 8px rgba(20,22,38,0.22), inset 0 0.5px 0 rgba(255,255,255,0.10)'
const POP_SHADOW =
  '0 10px 26px rgba(20,22,38,0.26), inset 0 0.5px 0 rgba(255,255,255,0.10), inset -3px -3px 8px rgba(0,0,0,0.16)'
const INSET_SHADOW = 'inset 7px 7px 14px rgba(20,22,38,0.34), inset -5px -5px 10px rgba(255,255,255,0.04)'

interface NavbarProps {
  activePage?: NavPage
  onPageChange?: (page: NavPage) => void
}

export function Navbar({ activePage, onPageChange }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [active, setActive] = useState<NavPage>(
    activePage ??
      (pathname.startsWith('/app-final/core')
        ? 'CORE'
        : pathname.startsWith('/app-final/execution')
        ? 'EXECUTION'
        : pathname.startsWith('/app-final/trace')
        ? 'TRACE'
        : pathname.startsWith('/app-final/risk')
        ? 'RISK'
        : pathname.startsWith('/app-final/proof')
        ? 'PROOF'
        : pathname.startsWith('/app-final/data')
        ? 'DATA'
        : pathname.startsWith('/app-final/system')
        ? 'SYSTEM'
        : pathname.startsWith('/app-final/settings')
        ? 'SETTINGS'
        : 'OVERVIEW'),
  )
  const [searchValue, setSearchValue] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const handleNav = (page: NavPage) => {
    setActive(page)
    onPageChange?.(page)
    const targetRoute = NAV_ROUTE_MAP[page]
    if (targetRoute && pathname !== targetRoute) {
      router.push(targetRoute)
    }
  }

  const openGlobalSearch = () => setSearchOpen(true)
  const closeGlobalSearch = () => setSearchOpen(false)

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
  }

  useEffect(() => {
    let newActive: NavPage = 'OVERVIEW'
    if (pathname.startsWith('/app-final/core')) newActive = 'CORE'
    else if (pathname.startsWith('/app-final/trace')) newActive = 'TRACE'
    else if (pathname.startsWith('/app-final/execution')) newActive = 'EXECUTION'
    else if (pathname.startsWith('/app-final/risk')) newActive = 'RISK'
    else if (pathname.startsWith('/app-final/proof')) newActive = 'PROOF'
    else if (pathname.startsWith('/app-final/data')) newActive = 'DATA'
    else if (pathname.startsWith('/app-final/system')) newActive = 'SYSTEM'
    else if (pathname.startsWith('/app-final/settings')) newActive = 'SETTINGS'

    setActive(newActive)
  }, [pathname])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isGlobalSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (isGlobalSearchShortcut) {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!searchOpen) return
    const focusTimer = window.setTimeout(() => {
      searchRef.current?.focus()
    }, 120)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
    }
  }, [searchOpen])

  return (
    <nav className="sticky top-0 z-30 w-full px-5 py-4 font-sans md:px-8">
      <div className="mx-auto max-w-[1600px]">
        <div
          className="relative overflow-hidden rounded-[34px] p-3 md:p-4"
          style={{
            background: 'linear-gradient(180deg, rgba(33,37,58,0.98) 0%, rgba(28,31,46,0.98) 100%)',
            border: NAV_BORDER,
            boxShadow: SHELL_SHADOW,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 10% 0%, rgba(99,102,241,0.14), transparent 28%), radial-gradient(circle at 84% 12%, rgba(34,197,94,0.08), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.05), transparent 42%)',
            }}
          />
          <div className="relative space-y-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(260px,1.05fr)_minmax(360px,1.5fr)_minmax(360px,1fr)]">
              <Link
                href="/app-final"
                className="group flex min-h-[74px] items-center gap-3 rounded-[26px] px-4 py-3 transition-transform duration-200 hover:-translate-y-[1px]"
                style={{
                  background: NEO_CREAM,
                  border: NAV_BORDER_STRONG,
                  boxShadow: POP_SHADOW,
                }}
                aria-label="Go to Zord dashboard"
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-[15px]"
                  style={{
                    background: `linear-gradient(180deg, ${NEO_ACTIVE} 0%, #4F46E5 100%)`,
                    boxShadow: '0 12px 26px rgba(99,102,241,0.24), inset 0 1px 0 rgba(255,255,255,0.20)',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M3 3h10v2L5.5 11H13v2H3v-2l7.5-6H3V3z" fill={NEO_TEXT} fillRule="evenodd" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[24px] font-black tracking-[-0.05em]" style={{ color: NEO_TEXT }}>
                      ZORD
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] leading-none"
                      style={{
                        color: ENVIRONMENT === 'LIVE' ? '#BBF7D0' : '#FEF3C7',
                        background: ENVIRONMENT === 'LIVE' ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                        border: ENVIRONMENT === 'LIVE' ? '1px solid rgba(34,197,94,0.22)' : '1px solid rgba(234,179,8,0.24)',
                        boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.10)',
                      }}
                    >
                      {ENVIRONMENT}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold tracking-[0.08em]" style={{ color: NEO_MUTED }}>
                    <span className="truncate">{TENANT_NAME}</span>
                    <span className="hidden h-1.5 w-1.5 rounded-full sm:inline-block" style={{ background: ENVIRONMENT === 'LIVE' ? SIGNAL_GREEN : SIGNAL_AMBER, opacity: 0.85 }} />
                    <span className="uppercase tracking-[0.16em]">Control Layer</span>
                  </div>
                </div>
              </Link>

              <button
                type="button"
                onClick={openGlobalSearch}
                className="group flex min-h-[74px] min-w-0 items-center gap-3 rounded-[26px] px-4 text-left"
                style={{
                  background: NEO_BASE,
                  border: NAV_BORDER,
                  boxShadow: INSET_SHADOW,
                }}
                aria-label="Open global search"
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-colors"
                  style={{
                    background: NEO_CREAM,
                    color: NEO_MUTED,
                    border: NAV_BORDER_STRONG,
                    boxShadow: POP_SHADOW,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: NEO_ACTIVE }}>
                    Quick Search
                  </div>
                  <div className="mt-1 truncate text-[15px] font-semibold" style={{ color: NEO_TEXT }}>
                    Search intent, UTR, seller...
                  </div>
                </div>
                <kbd
                  className="hidden shrink-0 rounded-[12px] px-2.5 py-1.5 text-[11px] font-black tracking-[0.16em] md:inline-flex"
                  style={{
                    color: NEO_ACTIVE,
                    background: NEO_CREAM,
                    border: NAV_BORDER_STRONG,
                    boxShadow: POP_SHADOW,
                  }}
                >
                  ⌘K
                </kbd>
              </button>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[56px_minmax(0,1fr)_minmax(180px,auto)]">
                <button
                  type="button"
                  className="group relative inline-flex h-[74px] items-center justify-center rounded-[24px]"
                  style={{
                    background: NEO_CREAM,
                    border: NAV_BORDER_STRONG,
                    boxShadow: POP_SHADOW,
                  }}
                  title="Alerts"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: NEO_MUTED }}>
                    <path d="M8 2.2a3.7 3.7 0 0 0-3.7 3.7v1.8c0 .7-.24 1.38-.68 1.92l-.76.93c-.27.33-.04.83.39.83h9.5c.43 0 .66-.5.39-.83l-.76-.93a3.06 3.06 0 0 1-.68-1.92V5.9A3.7 3.7 0 0 0 8 2.2Z" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M6.3 12.9a1.7 1.7 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span
                    className="absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold"
                    style={{
                      color: '#FECACA',
                      background: 'rgba(239,68,68,0.13)',
                      border: '1px solid rgba(239,68,68,0.26)',
                      boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.10)',
                    }}
                  >
                    6
                  </span>
                </button>

                <button
                  type="button"
                  className="group flex min-h-[74px] min-w-0 items-center gap-3 rounded-[24px] px-4 text-left"
                  style={{
                    background: NEO_CREAM,
                    border: NAV_BORDER_STRONG,
                    boxShadow: POP_SHADOW,
                  }}
                  title="Evidence export queue"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
                    style={{
                      background: NEO_BASE,
                      border: NAV_BORDER,
                      boxShadow: INSET_SHADOW,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: NEO_MUTED }}>
                      <path d="M3.2 4.2a1.2 1.2 0 0 1 1.2-1.2h2.3l1 1.3h3a1.2 1.2 0 0 1 1.2 1.2v5.3a1.2 1.2 0 0 1-1.2 1.2H4.4a1.2 1.2 0 0 1-1.2-1.2V4.2Z" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="text-[9.5px] font-black uppercase tracking-[0.16em]" style={{ color: NEO_MUTED }}>
                      Evidence Queue
                    </div>
                    <div className="mt-1 truncate text-[13px] font-bold" style={{ color: NEO_TEXT }}>
                      Exports Ready
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      color: '#C7D2FE',
                      background: 'rgba(99,102,241,0.14)',
                      border: '1px solid rgba(99,102,241,0.24)',
                      boxShadow: INSET_SHADOW,
                    }}
                  >
                    3
                  </span>
                </button>

                <button
                  type="button"
                  className="inline-flex min-h-[74px] items-center gap-3 rounded-[24px] pl-2 pr-3"
                  style={{
                    background: NEO_CREAM,
                    border: NAV_BORDER_STRONG,
                    boxShadow: POP_SHADOW,
                  }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full p-[1.5px]"
                    style={{
                      background: `linear-gradient(180deg, ${NEO_ACTIVE} 0%, #4F46E5 100%)`,
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 12px 26px rgba(99,102,241,0.24)',
                    }}
                  >
                    <div
                      className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
                      style={{ background: NEO_CREAM }}
                    >
                      <span className="text-[10px] font-bold" style={{ color: NEO_TEXT }}>
                        JD
                      </span>
                    </div>
                  </div>
                  <span className="min-w-0 flex-1 text-left leading-tight">
                    <span className="block truncate text-[13px] font-black tracking-wide" style={{ color: NEO_TEXT }}>
                      John D.
                    </span>
                    <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: NEO_MUTED }}>
                      {TENANT_NAME}
                    </span>
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden style={{ color: NEO_MUTED }}>
                    <path d="M3 4.5L6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              className="rounded-[28px] px-2 py-2.5"
              style={{
                background: NEO_BASE,
                border: NAV_BORDER,
                boxShadow: INSET_SHADOW,
              }}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
                {NAV_ITEMS.map((item) => {
                  const isActive = item === active
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleNav(item)}
                      className="relative flex h-11 w-full items-center justify-center rounded-[18px] px-3 text-center text-[11px] font-bold tracking-[0.14em] transition-all duration-300"
                      style={{
                        color: isActive ? NEO_TEXT : NEO_MUTED,
                        background: isActive
                          ? 'linear-gradient(180deg, rgba(99,102,241,0.22) 0%, rgba(42,47,69,0.96) 100%)'
                          : 'transparent',
                        border: isActive ? '1px solid rgba(99,102,241,0.24)' : '1px solid transparent',
                        boxShadow: isActive
                          ? '0 10px 26px rgba(99,102,241,0.18), inset 0 0.5px 0 rgba(255,255,255,0.12)'
                          : 'none',
                        textShadow: isActive ? '0 1px 12px rgba(255,255,255,0.10)' : 'none',
                      }}
                    >
                      <span className="relative z-10">{item}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
