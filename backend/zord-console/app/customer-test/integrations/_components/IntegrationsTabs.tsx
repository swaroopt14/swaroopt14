'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { label: 'API Logs', href: '/customer-test/integrations/api-logs' },
  { label: 'Webhooks', href: '/customer-test/integrations/webhooks' },
  { label: 'Adapter Status', href: '/customer-test/integrations/adapters' },
]

export function IntegrationsTabs() {
  const pathname = usePathname()

  return (
    <div className="ct-clear-glass rounded-xl p-2.5 shadow-[0_16px_34px_rgba(15,23,42,0.12),0_4px_10px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-3 py-2 text-sm transition duration-200 ease-out active:translate-y-[1px] ${
                active
                  ? 'border border-slate-300 bg-slate-900 text-white shadow-[0_12px_24px_rgba(15,23,42,0.28),0_3px_8px_rgba(15,23,42,0.18)] hover:-translate-y-[1px]'
                  : 'border border-slate-200/70 bg-white/80 text-slate-700 shadow-[0_6px_14px_rgba(15,23,42,0.08)] hover:-translate-y-[1px] hover:border-slate-300 hover:bg-white hover:shadow-[0_10px_22px_rgba(15,23,42,0.14)]'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
