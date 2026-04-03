'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactNode } from 'react'
import { FloatingCopilotButton } from '@/app/customer/components/copilot'
import { getCustomerTestSearchEntries, rankCustomerTestSearchEntries } from './search-catalog'

export default function CustomerTestLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [globalQuery, setGlobalQuery] = useState('')
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const searchPanelRef = useRef<HTMLDivElement>(null)
  const renderIcon = (icon: string, active: boolean) => {
    const iconClass = active ? 'text-white' : 'text-slate-300'
    if (icon === 'overview') {
      return (
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${iconClass}`} fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
        </svg>
      )
    }
    if (icon === 'intent') {
      return (
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${iconClass}`} fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M6 4h12a1 1 0 0 1 1 1v14l-4-2-3 2-3-2-4 2V5a1 1 0 0 1 1-1z" />
        </svg>
      )
    }
    if (icon === 'replay') {
      return (
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${iconClass}`} fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 4v6h6M20 20v-6h-6M7.5 16A7 7 0 0 0 19 11M16.5 8A7 7 0 0 0 5 13" />
        </svg>
      )
    }
    if (icon === 'workflow') {
      return (
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${iconClass}`} fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="12" r="2" />
          <circle cx="6" cy="18" r="2" />
          <path d="M8 6h6l2 4-2 2H8M8 18h8" />
        </svg>
      )
    }
    if (icon === 'evidence') {
      return (
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${iconClass}`} fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 3l8 4v6c0 5-3.5 7.5-8 8-4.5-.5-8-3-8-8V7z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 24 24" className={`h-5 w-5 ${iconClass}`} fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 12h16M12 4v16" />
      </svg>
    )
  }
  const sideNav = useMemo(
    () => [
      {
        title: 'Ops Overview',
        items: [
          { label: 'Dashboard', href: '/customer-test', icon: 'overview' },
          { label: 'Exceptions & SLA', href: '/customer-test/exceptions-sla', icon: 'evidence', badge: 3 },
          { label: 'Work Queue', href: '/customer-test/work-queue', icon: 'workflow', badge: 12 },
        ],
      },
      {
        title: 'Intents',
        items: [
          { label: 'Intent Journal', href: '/customer-test/intent-journal', icon: 'intent' },
          { label: 'Create Payment Request', href: '/customer-test/create-payment-request', icon: 'overview' },
          { label: 'Recovery', href: '/customer-test/retry-replay', icon: 'replay', badge: 5 },
          { label: 'Workflow Timeline', href: '/customer-test/workflow-timeline', icon: 'workflow' },
        ],
      },
      {
        title: 'Evidence',
        items: [
          { label: 'Evidence Center', href: '/customer-test/evidence-center', icon: 'evidence' },
        ],
      },
      {
        title: 'Integrations',
        items: [
          { label: 'API Logs', href: '/customer-test/integrations/api-logs', icon: 'intent', badge: 2 },
          { label: 'Webhooks', href: '/customer-test/integrations/webhooks', icon: 'workflow' },
          { label: 'Adapter Status', href: '/customer-test/integrations/adapters', icon: 'overview' },
        ],
      },
      {
        title: 'Reports',
        items: [
          { label: 'Costs', href: '/customer-test/reports/cost-intelligence', icon: 'overview' },
          { label: 'Settlement & Recon', href: '/customer-test/reports/settlement-recon', icon: 'workflow' },
        ],
      },
    ],
    []
  )
  const searchEntries = useMemo(() => getCustomerTestSearchEntries(), [])
  const rankedSearchEntries = useMemo(
    () => rankCustomerTestSearchEntries(globalQuery, searchEntries, 8),
    [globalQuery, searchEntries]
  )

  useEffect(() => {
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark'
    setIsDark(isDarkMode)
  }, [])

  useEffect(() => {
    setShowSearchPanel(false)
  }, [pathname])

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!searchPanelRef.current) return
      if (!searchPanelRef.current.contains(event.target as Node)) {
        setShowSearchPanel(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const toggleTheme = (nextDark: boolean) => {
    setIsDark(nextDark)
    if (nextDark) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('cx-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('cx-theme', 'light')
    }
  }

  const openSearchResult = (href: string) => {
    setShowSearchPanel(false)
    router.push(href)
  }

  const submitGlobalSearch = () => {
    const normalized = globalQuery.trim()
    if (!normalized) return
    const first = rankedSearchEntries[0]
    if (first) {
      openSearchResult(first.href)
      return
    }
    router.push(`/customer-test/search?q=${encodeURIComponent(normalized)}`)
  }

  return (
    <>
      <style jsx global>{`
        :root {
          --glass-panel: rgba(255, 255, 255, 0.86);
          --glass-border: rgba(31, 41, 55, 0.1);
          --glass-blur: 14px;
          --glass-saturation: 130%;
          --glass-shadow-sm: 0 6px 20px rgba(31, 41, 55, 0.08);
          --glass-shadow: 0 14px 34px rgba(31, 41, 55, 0.1);
          --glass-item-active: #1f2937;
          --glass-item-text: rgba(31, 41, 55, 0.7);
        }

        html[data-theme='dark'] {
          --glass-panel: rgba(17, 24, 39, 0.86);
          --glass-border: rgba(229, 231, 235, 0.1);
          --glass-shadow-sm: 0 10px 24px rgba(0, 0, 0, 0.35);
          --glass-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
          --glass-item-active: #e5e7eb;
          --glass-item-text: rgba(229, 231, 235, 0.72);
        }

        .customer-test-root {
          min-height: 100vh;
          font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(180deg, #e6e7e9 0%, #f3f4f6 45%, #d1d6dd 100%);
          color: #1f2937;
        }

        .ct-header-glass {
          background: linear-gradient(180deg, rgba(44, 49, 57, 0.94), rgba(35, 39, 46, 0.96));
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .ct-main-panel {
          background: #f7f8fa;
          border-radius: 28px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08), 0 5px 20px rgba(0, 0, 0, 0.04);
        }

        .ct-wallet-card {
          position: relative;
          background: linear-gradient(145deg, #8e9ca6, #7d8b96);
          border-radius: 20px;
          padding: 24px;
          color: #fff;
          box-shadow: 0 15px 30px rgba(0, 0, 0, 0.12), inset 0 1px 1px rgba(255, 255, 255, 0.25);
          transition: transform 220ms ease, box-shadow 220ms ease;
        }

        .ct-wallet-card::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.2), transparent 50%);
          pointer-events: none;
        }

        .ct-wallet-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 34px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.25);
        }

        .ct-coin-card {
          background: #fff;
          border-radius: 16px;
          border: 1px solid #e6e8ec;
          box-shadow: 0 5px 10px rgba(0, 0, 0, 0.04);
          padding: 16px;
          transition: box-shadow 220ms ease, transform 220ms ease;
        }

        .ct-coin-card:hover {
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08);
          transform: translateY(-2px);
        }

        .ct-frost-card {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.36));
          border: 1px solid rgba(255, 255, 255, 0.72);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }

        .ct-frost-chip {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(248, 250, 252, 0.46));
          border: 1px solid rgba(255, 255, 255, 0.85);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 4px 12px rgba(15, 23, 42, 0.06);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .ct-clear-glass {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.16));
          border: 1px solid rgba(255, 255, 255, 0.55);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.78);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .ct-clear-glass-pill {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.34));
          border: 1px solid rgba(255, 255, 255, 0.78);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .ct-sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(226, 232, 240, 0.45) transparent;
        }

        .ct-sidebar-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .ct-sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .ct-sidebar-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(226, 232, 240, 0.55), rgba(148, 163, 184, 0.45));
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
        }
      `}</style>
      <div className="customer-test-root">
        <div className="flex min-h-screen">
          <aside
            className={`ct-sidebar-scroll sticky top-3 hidden h-[calc(100vh-24px)] rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(44,49,57,0.94)_0%,rgba(35,39,46,0.96)_100%)] px-3 py-4 shadow-[0_24px_50px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-all duration-300 lg:ml-3 lg:flex lg:flex-col ${
              collapsed ? 'w-[84px]' : 'w-[264px]'
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <button
                onClick={() => setCollapsed((value) => !value)}
                className="rounded-lg border border-slate-500/60 bg-slate-700/70 px-2 py-1 text-xs font-medium text-slate-100 hover:bg-slate-600/80"
              >
                {collapsed ? '>>' : '<<'}
              </button>
              {!collapsed && <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Navigation</span>}
            </div>
            <nav className="ct-sidebar-scroll mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
              {sideNav.map((section) => (
                <div key={section.title}>
                  {!collapsed && <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{section.title}</p>}
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href
                      const itemClass = `group relative flex h-[42px] items-center rounded-xl border px-3 transition-colors ${
                        isActive
                          ? 'border-slate-400/70 bg-[linear-gradient(180deg,rgba(90,99,113,0.88),rgba(73,82,95,0.9))] text-white shadow-[0_10px_24px_rgba(15,23,42,0.42),inset_0_1px_0_rgba(255,255,255,0.16)]'
                          : 'border-transparent text-slate-300 hover:border-slate-500/50 hover:bg-slate-700/55 hover:text-white'
                      }`
                      return (
                        <Link key={item.label} href={item.href} className={itemClass} title={item.label}>
                          {isActive && !collapsed && <span className="absolute left-1 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-slate-200/90" />}
                          {renderIcon(item.icon, isActive)}
                          {!collapsed && <span className="ml-3 flex-1 text-[13px] font-medium">{item.label}</span>}
                          {!collapsed && item.badge !== undefined && (
                            <span className="rounded-full border border-slate-300/25 bg-slate-100/10 px-2 py-0.5 text-[11px] font-semibold text-slate-100">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-1 border-t border-slate-600/50 pt-2">
              <div className="rounded-[14px] border border-slate-500/50 bg-slate-700/40 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleTheme(false)}
                    className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] text-xs font-semibold transition-colors"
                    style={
                      isDark
                        ? { color: '#cbd5e1' }
                        : {
                            background: 'rgba(255,255,255,0.12)',
                            color: '#ffffff',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                          }
                    }
                    title="Light"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                    </svg>
                    {!collapsed ? 'Light' : null}
                  </button>
                  <button
                    onClick={() => toggleTheme(true)}
                    className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] text-xs font-semibold transition-colors"
                    style={
                      !isDark
                        ? { color: '#cbd5e1' }
                        : {
                            background: 'rgba(255,255,255,0.12)',
                            color: '#ffffff',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                          }
                    }
                    title="Dark"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                    </svg>
                    {!collapsed ? 'Dark' : null}
                  </button>
                </div>
              </div>

              <button className="mt-2 flex h-10 w-full items-center rounded-xl px-3 text-[13px] font-medium text-slate-200 transition-colors hover:bg-slate-700/60 hover:text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {!collapsed && <span className="ml-3">Settings</span>}
              </button>

              {!collapsed ? (
                <div className="mt-2 rounded-xl border border-slate-500/50 bg-slate-700/35 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-400/40 bg-slate-100/10 text-sm font-semibold text-white">
                      R
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">Rahul</p>
                      <p className="truncate text-xs text-slate-300">Ops Team</p>
                      <p className="truncate text-[11px] text-slate-400">Bandhan Bank</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="rounded-lg border border-slate-400/40 bg-slate-100/10 px-2 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-100/20">
                      Login
                    </button>
                    <button className="rounded-lg border border-rose-300/35 bg-rose-400/10 px-2 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/20">
                      Logout
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <div className="sticky top-0 z-20 px-4 pt-3 lg:px-6">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(44,49,57,0.94)_0%,rgba(35,39,46,0.96)_100%)] px-4 py-3 shadow-[0_24px_50px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
                <div ref={searchPanelRef} className="relative w-full max-w-[720px]">
                  <input
                    value={globalQuery}
                    onChange={(event) => {
                      setGlobalQuery(event.target.value)
                      setShowSearchPanel(true)
                    }}
                    onFocus={() => setShowSearchPanel(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitGlobalSearch()
                      if (event.key === 'Escape') setShowSearchPanel(false)
                    }}
                    placeholder="Search intents, envelope_id, trace_id, beneficiary token..."
                    className="h-10 w-full rounded-xl border border-white/20 bg-slate-900/55 px-10 text-sm font-medium text-white outline-none shadow-[0_10px_22px_rgba(15,23,42,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] transition placeholder:text-slate-300/75 focus:border-slate-300 focus:shadow-[0_14px_28px_rgba(15,23,42,0.38),inset_0_1px_0_rgba(255,255,255,0.1)]"
                  />
                  <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-200/90"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
                  </svg>
                  {showSearchPanel && (
                    <div className="absolute left-0 right-0 top-[46px] z-40 overflow-hidden rounded-xl border border-white/20 bg-[linear-gradient(180deg,rgba(44,49,57,0.94),rgba(35,39,46,0.96))] shadow-[0_16px_32px_rgba(15,23,42,0.24)] backdrop-blur-xl">
                      {rankedSearchEntries.length ? (
                        <div className="max-h-[300px] overflow-y-auto py-1">
                          {rankedSearchEntries.map((entry) => (
                            <button
                              key={entry.id}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => openSearchResult(entry.href)}
                              className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-white/10"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-100">{entry.title}</span>
                                <span className="block truncate text-xs text-slate-300">{entry.subtitle}</span>
                              </span>
                              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] uppercase text-slate-300">{entry.type}</span>
                            </button>
                          ))}
                        </div>
                      ) : globalQuery.trim() ? (
                        <div className="px-3 py-3 text-xs text-slate-300">
                          No direct match. Press Enter to open global results.
                        </div>
                      ) : (
                        <div className="px-3 py-3 text-xs text-slate-300">
                          Search by intent ID, trace ID, beneficiary token, or page name.
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={submitGlobalSearch}
                  className="rounded-xl border border-slate-500/60 bg-slate-700/70 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-[0_10px_22px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:bg-slate-600/80"
                >
                  Global Search
                </button>
              </div>
            </div>
            {children}
          </div>
        </div>
        <FloatingCopilotButton />
      </div>
    </>
  )
}
